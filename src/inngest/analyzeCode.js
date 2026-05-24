// =============================================================================
// inngest/analyzeCode.js — Durable AI Analysis Function
// =============================================================================
//
// WHY THIS FILE EXISTS:
// This is the HEART of our application — the background worker function that
// actually performs the AI-powered code analysis. It runs asynchronously,
// completely decoupled from the HTTP request that triggered it.
//
// HOW IT GETS TRIGGERED:
//   1. A user sends a POST request to /api/analyze with a code snippet.
//   2. The Express route handler fires an Inngest event: "code/analyze.requested"
//   3. Inngest's event bus receives this event and checks: "Do I have any
//      functions listening for 'code/analyze.requested'?"
//   4. Yes — this function! Inngest invokes it with the event payload.
//
// DURABLE EXECUTION — THE KEY CONCEPT:
// This function uses Inngest "steps" (step.run()). Each step is a checkpoint.
// If the function crashes after completing Step 1, Inngest will:
//   - NOT re-run Step 1 (it uses the memoized/cached result)
//   - Resume execution at Step 2
// This means expensive operations (like calling the Gemini API) are never
// repeated unnecessarily — saving time, money, and API quota.
//
// RETRY BEHAVIOR:
// We configure `retries: 3`, which means:
//   - Attempt 1: Immediate execution
//   - Attempt 2: After ~5 second delay (if Attempt 1 failed)
//   - Attempt 3: After ~25 second delay
//   - Attempt 4: After ~125 second delay (final attempt)
// Inngest uses exponential backoff automatically. After all 4 attempts fail,
// the function is marked as permanently failed.
// =============================================================================

const { inngest } = require("./client");
const { analyzeCodeWithAI } = require("../services/geminiService");
const resultsStore = require("../store/resultsStore");

// =============================================================================
// Define the Inngest function
// =============================================================================
// inngest.createFunction() registers a background function with Inngest.
//
// Parameters:
//   - id:      Unique identifier for this function (used in the dashboard).
//   - retries: Number of retry attempts after the initial execution.
//
// Trigger:
//   - event: The event name this function listens for. When Inngest receives
//            an event with this name, it invokes this function.
//
// Handler:
//   - An async function that receives { event, step } where:
//     - event.data contains the payload we sent (jobId, code, language)
//     - step provides durable execution primitives (step.run, step.sleep, etc.)
// =============================================================================

const analyzeCodeFunction = inngest.createFunction(
  {
    id: "analyze-code-security",
    retries: 3,
  },
  { event: "code/analyze.requested" },

  // ---------------------------------------------------------------------------
  // The handler function — this is where the actual work happens
  // ---------------------------------------------------------------------------
  async ({ event, step }) => {
    // =========================================================================
    // Extract the event payload
    // =========================================================================
    // The event.data object contains everything we sent from the Express route.
    // We destructure it here for clarity.
    // =========================================================================
    const { jobId, code, language } = event.data;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`[AnalyzeCode] Starting analysis for job: ${jobId}`);
    console.log(`[AnalyzeCode] Language: ${language} | Code length: ${code.length} chars`);
    console.log(`${"=".repeat(60)}`);

    // =========================================================================
    // STEP 1: Mark the job as "processing"
    // =========================================================================
    // Why is this a step? Because if the function retries, we don't want to
    // re-run this state update. Inngest memoizes step results, so on a retry,
    // this step is skipped and its previous result is used.
    //
    // This updates the in-memory store so that if the user polls GET /api/results,
    // they see status: "processing" instead of "pending."
    // =========================================================================
    await step.run("update-status-processing", async () => {
      resultsStore.markProcessing(jobId);
      console.log(`[AnalyzeCode] Job ${jobId} status → processing`);
      return { status: "processing" };
    });

    // =========================================================================
    // STEP 2: Call the Gemini API for security analysis
    // =========================================================================
    // This is the most expensive and failure-prone step. It makes an HTTP
    // request to Google's Gemini API, which can:
    //   - Take 3–15 seconds to respond
    //   - Fail with a 429 (rate limit) if we exceed 15 RPM
    //   - Fail with a 503 (server overload) during peak usage
    //   - Return malformed JSON (handled by our defensive parser)
    //
    // If this step throws an error, Inngest catches it and retries the entire
    // function. But Step 1's result is memoized, so it won't be re-executed.
    // Only this step (and any steps after it) will be re-run.
    //
    // This is the power of durable execution: we don't waste resources
    // repeating successful work when a later step fails.
    // =========================================================================
    const analysisResult = await step.run("call-gemini-api", async () => {
      console.log(`[AnalyzeCode] Calling Gemini API...`);
      const result = await analyzeCodeWithAI(code, language);
      console.log(`[AnalyzeCode] Gemini API returned successfully`);
      return result;
    });

    // =========================================================================
    // STEP 3: Store the result and mark job as completed
    // =========================================================================
    // Once we have the parsed analysis result, we store it in our results store.
    // The user can then retrieve it by polling GET /api/results/:jobId.
    //
    // We also log the results for the student to see in the terminal.
    // =========================================================================
    await step.run("store-results", async () => {
      resultsStore.markCompleted(jobId, analysisResult);

      console.log(`\n${"─".repeat(60)}`);
      console.log(`[AnalyzeCode] ✅ Job ${jobId} COMPLETED`);
      console.log(`[AnalyzeCode] Risk Level: ${analysisResult.riskLevel}`);
      console.log(
        `[AnalyzeCode] Vulnerabilities: ${analysisResult.vulnerabilities.length} found`
      );
      console.log(`${"─".repeat(60)}\n`);

      return { status: "completed" };
    });

    // =========================================================================
    // Return value (optional but useful for Inngest dashboard visibility)
    // =========================================================================
    return {
      jobId,
      riskLevel: analysisResult.riskLevel,
      vulnerabilitiesFound: analysisResult.vulnerabilities.length,
    };
  }
);

// =============================================================================
// Export the function for registration in server.js
// =============================================================================
module.exports = { analyzeCodeFunction };
