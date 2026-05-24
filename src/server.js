// =============================================================================
// server.js — Express API Server + Inngest Integration
// =============================================================================
//
// This is the ENTRY POINT of the SafeSnippet Analyzer application.
// It starts an Express HTTP server with three key responsibilities:
//
//   1. API Endpoints:
//      - POST /api/analyze       → Accept code for analysis, return a jobId
//      - GET  /api/results/:id   → Poll for completed analysis results
//      - GET  /api/health        → Health check endpoint
//
//   2. Inngest Integration:
//      - Serves the Inngest endpoint at /api/inngest so the Inngest Dev Server
//        can discover and invoke our registered functions.
//
//   3. Static Files:
//      - Serves the web UI from the /public directory (bonus feature).
//
// HOW TO RUN:
//   Terminal 1: npm run dev          (starts this Express server on port 3000)
//   Terminal 2: npm run inngest:dev  (starts the Inngest Dev Server)
//
// The two processes communicate via HTTP — Express sends events to Inngest,
// and Inngest calls back to Express to invoke registered functions.
// =============================================================================

// =============================================================================
// STEP 1: Load environment variables
// =============================================================================
// dotenv reads the .env file and populates process.env with its contents.
// This MUST be the very first thing that runs, before any other module tries
// to read process.env.GOOGLE_API_KEY or other variables.
//
// In production, you'd use your platform's secret management (Vercel env vars,
// AWS Secrets Manager, etc.) instead of a .env file.
// =============================================================================
require("dotenv").config();

// =============================================================================
// STEP 2: Import dependencies
// =============================================================================
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { serve } = require("inngest/express");
const path = require("path");

// Import our application modules
const { inngest } = require("./inngest/client");
const { analyzeCodeFunction } = require("./inngest/analyzeCode");
const resultsStore = require("./store/resultsStore");

// =============================================================================
// STEP 3: Initialize Express
// =============================================================================
const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------------------------------------------------------
// Middleware: Parse JSON request bodies
// -----------------------------------------------------------------------------
// express.json() automatically parses incoming request bodies that have
// Content-Type: application/json. Without this, req.body would be undefined.
//
// The { limit: "1mb" } option prevents users from sending excessively large
// code snippets that could overwhelm our server or the LLM.
// -----------------------------------------------------------------------------
app.use(express.json({ limit: "1mb" }));

// -----------------------------------------------------------------------------
// Middleware: Serve static files for the web UI
// -----------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, "public")));

// =============================================================================
// STEP 4: Register the Inngest serve endpoint
// =============================================================================
// This is the bridge between Express and Inngest. The serve() middleware:
//
//   1. Exposes a registration endpoint that the Inngest Dev Server calls
//      to discover which functions our app has registered.
//   2. Provides an invocation endpoint that Inngest calls when it needs to
//      execute one of our functions (e.g., when a matching event arrives).
//
// We pass:
//   - client:    Our Inngest client instance (identifies our app).
//   - functions: An array of all Inngest functions we've defined.
//                Currently just one (analyzeCodeFunction), but you can add more.
//
// The endpoint is mounted at /api/inngest by convention.
// =============================================================================
app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: [analyzeCodeFunction],
  })
);

// =============================================================================
// ENDPOINT: POST /api/analyze
// =============================================================================
// PURPOSE: Accept a code snippet for security analysis.
//
// REQUEST BODY:
//   {
//     "code":     "const query = 'SELECT * FROM users WHERE id=' + userId;",
//     "language": "javascript"
//   }
//
// RESPONSE (202 Accepted):
//   {
//     "success": true,
//     "jobId":   "a1b2c3d4-...",
//     "message": "Analysis job queued. Poll GET /api/results/a1b2c3d4-... for results."
//   }
//
// WHY 202 (Accepted) AND NOT 200 (OK)?
// HTTP 202 means "I received your request and will process it, but it's not
// done yet." This is the correct status code for async operations. HTTP 200
// would imply the work is already complete, which it isn't — the AI analysis
// happens in the background via Inngest.
// =============================================================================
app.post("/api/analyze", async (req, res) => {
  try {
    // -------------------------------------------------------------------------
    // Input validation
    // -------------------------------------------------------------------------
    // Always validate user input before processing. Here we check that:
    //   1. The "code" field exists and is a non-empty string.
    //   2. The "language" field exists and is a non-empty string.
    //
    // In production, you'd also sanitize inputs, check for maximum length,
    // and validate the language against a whitelist of supported languages.
    // -------------------------------------------------------------------------
    const { code, language } = req.body;

    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or empty "code" field. Please provide a code snippet to analyze.',
      });
    }

    if (!language || typeof language !== "string" || language.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error:
          'Missing or empty "language" field. Please specify the programming language (e.g., "javascript", "python").',
      });
    }

    // -------------------------------------------------------------------------
    // Generate a unique job ID
    // -------------------------------------------------------------------------
    // UUID v4 generates a random 128-bit identifier, formatted as a string like
    // "a1b2c3d4-e5f6-7890-abcd-ef1234567890". The probability of collision is
    // astronomically low — roughly 1 in 5.3 × 10^36.
    //
    // This ID is returned to the client so they can poll for results later.
    // -------------------------------------------------------------------------
    const jobId = uuidv4();

    // -------------------------------------------------------------------------
    // Create the job in our results store
    // -------------------------------------------------------------------------
    // We immediately record the job with "pending" status. This way, if the
    // user polls GET /api/results/:jobId before Inngest processes the event,
    // they'll see { status: "pending" } instead of a 404.
    // -------------------------------------------------------------------------
    resultsStore.createJob(jobId, code.trim(), language.trim().toLowerCase());

    // -------------------------------------------------------------------------
    // Send the event to Inngest
    // -------------------------------------------------------------------------
    // inngest.send() publishes an event to the Inngest event bus. The event has:
    //   - name: "code/analyze.requested" — matches the trigger in our function.
    //   - data: The payload containing everything the function needs to do its job.
    //
    // This call returns immediately (typically <50ms). The actual AI analysis
    // happens later when Inngest invokes our analyzeCodeFunction.
    //
    // If Inngest Dev Server is not running, this will throw an error (caught below).
    // -------------------------------------------------------------------------
    await inngest.send({
      name: "code/analyze.requested",
      data: {
        jobId,
        code: code.trim(),
        language: language.trim().toLowerCase(),
      },
    });

    console.log(`[Server] Job ${jobId} queued for ${language} code analysis`);

    // -------------------------------------------------------------------------
    // Return 202 Accepted with the job ID
    // -------------------------------------------------------------------------
    return res.status(202).json({
      success: true,
      jobId,
      message: `Analysis job queued. Poll GET /api/results/${jobId} for results.`,
    });
  } catch (error) {
    console.error("[Server] Error queuing analysis job:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to queue analysis job. Is the Inngest Dev Server running?",
      details: error.message,
    });
  }
});

// =============================================================================
// ENDPOINT: GET /api/results/:jobId
// =============================================================================
// PURPOSE: Retrieve the status and results of an analysis job.
//
// This endpoint implements the "polling" pattern:
//   1. Client submits code via POST /api/analyze → receives jobId.
//   2. Client polls GET /api/results/:jobId every few seconds.
//   3. Eventually, the response contains status: "completed" with the results.
//
// RESPONSE EXAMPLES:
//
//   Pending:     { "status": "pending",    "result": null }
//   Processing:  { "status": "processing", "result": null }
//   Completed:   { "status": "completed",  "result": { "riskLevel": "HIGH", ... } }
//   Failed:      { "status": "failed",     "error": "Max retries exhausted" }
//   Not Found:   { "error": "Job not found" } (404)
//
// ALTERNATIVE PATTERNS (not implemented in this lab):
//   - WebSockets: Push results to the client when ready (real-time).
//   - Webhooks: Call back to a client-provided URL when done.
//   - Server-Sent Events (SSE): One-way push stream from server to client.
// =============================================================================
app.get("/api/results/:jobId", (req, res) => {
  const { jobId } = req.params;

  // ---------------------------------------------------------------------------
  // Look up the job in our results store
  // ---------------------------------------------------------------------------
  const job = resultsStore.getJob(jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: `Job "${jobId}" not found. It may have expired or the ID is incorrect.`,
    });
  }

  // ---------------------------------------------------------------------------
  // Return the current state of the job
  // ---------------------------------------------------------------------------
  // We return different fields depending on the status:
  //   - pending/processing: No result yet, include timestamps for debugging.
  //   - completed: Include the full analysis result.
  //   - failed: Include the error message.
  // ---------------------------------------------------------------------------
  return res.status(200).json({
    success: true,
    jobId,
    status: job.status,
    language: job.language,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});

// =============================================================================
// ENDPOINT: GET /api/health
// =============================================================================
// PURPOSE: Simple health check for monitoring and debugging.
// Returns 200 OK if the server is running. Used by:
//   - Students to verify their server started correctly.
//   - Load balancers to check if the server is alive.
//   - Inngest Dev Server to verify connectivity.
// =============================================================================
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "SafeSnippet Analyzer",
    timestamp: new Date().toISOString(),
    geminiConfigured: !!process.env.GOOGLE_API_KEY,
  });
});

// =============================================================================
// STEP 5: Start the server
// =============================================================================
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🛡️  SafeSnippet Analyzer — Server Running                  ║
║                                                              ║
║   Local:    http://localhost:${PORT}                           ║
║   Health:   http://localhost:${PORT}/api/health                ║
║   Inngest:  http://localhost:${PORT}/api/inngest               ║
║                                                              ║
║   Gemini API Key: ${process.env.GOOGLE_API_KEY ? "✅ Configured" : "❌ MISSING — check .env"}              ║
║                                                              ║
║   NEXT STEP: Open a new terminal and run:                    ║
║   npx inngest-cli@latest dev -u http://localhost:${PORT}/api/inngest ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});
