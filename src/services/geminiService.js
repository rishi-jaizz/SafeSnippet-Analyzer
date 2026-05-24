// =============================================================================
// services/geminiService.js — Google Gemini API Integration Layer
// =============================================================================
//
// WHY THIS FILE EXISTS:
// This module encapsulates ALL interaction with the Google Gemini API. By
// isolating the API logic here, we achieve:
//
//   1. Single Responsibility — If the Gemini API changes, we only update this file.
//   2. Testability — We can mock this module in unit tests without touching Inngest.
//   3. Reusability — Other parts of the app can call analyzeCodeWithAI() without
//      knowing anything about the Gemini SDK, prompts, or JSON parsing.
//
// ARCHITECTURE NOTE:
// This service is called by the Inngest function (inngest/analyzeCode.js),
// NOT by the Express routes directly. The Express route only fires an event;
// the Inngest function calls this service inside a durable step.
// =============================================================================

// -----------------------------------------------------------------------------
// Dependencies
// -----------------------------------------------------------------------------
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { SYSTEM_PROMPT, buildUserPrompt } = require("../prompts/securityAnalysis");
const { parseJsonFromLLM } = require("../utils/jsonParser");

// -----------------------------------------------------------------------------
// Initialize the Gemini SDK
// -----------------------------------------------------------------------------
// We read the API key from environment variables (loaded by dotenv in server.js).
// The GoogleGenerativeAI class is the main entry point for all API interactions.
//
// SECURITY NOTE: Never hardcode API keys in source code. Always use environment
// variables. The .env file is excluded from version control via .gitignore.
// -----------------------------------------------------------------------------
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// -----------------------------------------------------------------------------
// Configure the model
// -----------------------------------------------------------------------------
// We use "gemini-2.0-flash" because:
//   - It's Google's fastest model, optimized for structured output tasks.
//   - It's significantly cheaper than gemini-pro (~$0.10/M input tokens).
//   - It has strong JSON-mode compliance — critical for our use case.
//   - The free tier (15 RPM, 1M tokens/day) is sufficient for lab work.
//
// generationConfig:
//   - temperature: 0.1  → Near-deterministic output. Security analysis needs
//                          consistency, not creativity. Same code → same findings.
//   - maxOutputTokens: 4096 → Generous limit for detailed vulnerability reports.
//                              Most responses use 500–1500 tokens.
//
// safetySettings:
//   - We lower the DANGEROUS_CONTENT threshold because our input IS code that
//     may contain security vulnerabilities (eval, exec, SQL injection patterns).
//     Without this, Gemini's safety filters can block legitimate analysis
//     requests, thinking the malicious code in the prompt is harmful intent.
// -----------------------------------------------------------------------------
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: 4096,
  },
  safetySettings: [
    {
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold: "BLOCK_NONE",
    },
  ],
});

// =============================================================================
// analyzeCodeWithAI() — Main function to analyze code for vulnerabilities
// =============================================================================
/**
 * Sends a code snippet to Google Gemini for security vulnerability analysis
 * and returns a structured JSON report.
 *
 * Flow:
 *   1. Build the user prompt using the code and language.
 *   2. Call the Gemini API with the system prompt and user prompt.
 *   3. Extract the raw text response.
 *   4. Parse the text into a JSON object using defensive parsing.
 *   5. Validate that required fields exist.
 *   6. Return the validated result.
 *
 * @param   {string} code     - The source code to analyze.
 * @param   {string} language - The programming language (e.g., "javascript").
 * @returns {Promise<object>} - The parsed vulnerability analysis report.
 * @throws  {Error}           - If the API call fails or the response can't be parsed.
 */
async function analyzeCodeWithAI(code, language) {
  // ---------------------------------------------------------------------------
  // STEP 1: Build the prompt
  // ---------------------------------------------------------------------------
  // We combine the system prompt (persona + rules + schema) with the user
  // prompt (few-shot example + the actual code to analyze).
  // ---------------------------------------------------------------------------
  const userPrompt = buildUserPrompt(code, language);

  console.log(`[GeminiService] Sending ${language} code (${code.length} chars) to Gemini...`);

  // ---------------------------------------------------------------------------
  // STEP 2: Call the Gemini API
  // ---------------------------------------------------------------------------
  // generateContent() sends the prompt to the model and waits for a response.
  // This is an async operation that typically takes 3–15 seconds depending on
  // prompt length and model load.
  //
  // We pass the system prompt via systemInstruction and the user prompt as
  // the contents array. The Gemini SDK handles the HTTP request, authentication,
  // and response deserialization internally.
  //
  // If this call fails (network error, rate limit, server error), the error
  // will propagate up to the Inngest function, which will retry automatically.
  // ---------------------------------------------------------------------------
  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
  });

  // ---------------------------------------------------------------------------
  // STEP 3: Extract the raw text response
  // ---------------------------------------------------------------------------
  // The Gemini API returns a complex response object. The actual generated text
  // is accessed via response.text(). This is a convenience method that extracts
  // the text from the first candidate's first content part.
  // ---------------------------------------------------------------------------
  const response = result.response;
  const rawText = response.text();

  console.log(`[GeminiService] Received response (${rawText.length} chars). Parsing...`);

  // ---------------------------------------------------------------------------
  // STEP 4: Parse the raw text into JSON
  // ---------------------------------------------------------------------------
  // Even though we asked for "only JSON," the LLM might wrap it in markdown
  // fences or add conversational text. Our defensive parser handles all of that.
  // ---------------------------------------------------------------------------
  const analysisResult = parseJsonFromLLM(rawText);

  // ---------------------------------------------------------------------------
  // STEP 5: Validate the response structure
  // ---------------------------------------------------------------------------
  // We check that the critical fields exist. This catches cases where the LLM
  // returns valid JSON but with a completely wrong schema (e.g., {"answer": "yes"}).
  // If validation fails, we throw — and Inngest will retry the function.
  // ---------------------------------------------------------------------------
  if (!analysisResult.riskLevel) {
    throw new Error(
      'LLM response missing required field: "riskLevel". ' +
      "The model may have deviated from the requested schema."
    );
  }

  if (!Array.isArray(analysisResult.vulnerabilities)) {
    throw new Error(
      'LLM response missing required field: "vulnerabilities" (must be an array). ' +
      "The model may have deviated from the requested schema."
    );
  }

  // ---------------------------------------------------------------------------
  // STEP 6: Return the validated result
  // ---------------------------------------------------------------------------
  console.log(
    `[GeminiService] Analysis complete. Risk level: ${analysisResult.riskLevel}, ` +
    `Vulnerabilities found: ${analysisResult.vulnerabilities.length}`
  );

  return analysisResult;
}

// =============================================================================
// Export the main analysis function
// =============================================================================
module.exports = { analyzeCodeWithAI };
