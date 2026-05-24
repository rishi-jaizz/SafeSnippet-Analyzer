// =============================================================================
// utils/jsonParser.js — Defensive JSON Parsing Utility
// =============================================================================
//
// WHY THIS FILE EXISTS:
// Large Language Models (LLMs) are unpredictable. Even when you explicitly ask
// for "only JSON," they sometimes return responses wrapped in markdown code
// fences (```json ... ```), or prepend conversational text like "Here is the
// analysis:". This utility strips all that noise and extracts clean JSON.
//
// Without this defensive parsing, our app would crash every time the LLM
// decided to be "helpful" by adding extra text around the JSON.
// =============================================================================

/**
 * Attempts to extract and parse a valid JSON object from raw LLM text output.
 *
 * This function handles three common LLM output formats:
 *   1. Clean JSON:         '{"key": "value"}'
 *   2. Markdown-fenced:    '```json\n{"key": "value"}\n```'
 *   3. Conversational:     'Here is the result:\n{"key": "value"}'
 *
 * @param   {string} rawText - The raw text response from the LLM.
 * @returns {object}         - The parsed JavaScript object.
 * @throws  {Error}          - If no valid JSON can be extracted.
 */
function parseJsonFromLLM(rawText) {
  // -------------------------------------------------------------------------
  // STEP 1: Handle empty or missing input
  // -------------------------------------------------------------------------
  // If the LLM returned nothing (empty string, null, undefined), we fail fast
  // with a clear error message rather than letting JSON.parse throw a cryptic
  // "Unexpected end of JSON input" error.
  // -------------------------------------------------------------------------
  if (!rawText || typeof rawText !== "string") {
    throw new Error(
      "LLM returned empty or non-string response. " +
        "This usually means the request was blocked by safety filters."
    );
  }

  // -------------------------------------------------------------------------
  // STEP 2: Strip markdown code fences
  // -------------------------------------------------------------------------
  // LLMs frequently wrap JSON in markdown fences like:
  //   ```json
  //   { "key": "value" }
  //   ```
  //
  // This regex matches both ```json and plain ``` fences, capturing only
  // the content between them. The 's' flag enables dotAll mode so '.' matches
  // newlines too.
  // -------------------------------------------------------------------------
  let cleanedText = rawText.trim();

  const markdownFenceRegex = /```(?:json)?\s*([\s\S]*?)```/;
  const fenceMatch = cleanedText.match(markdownFenceRegex);

  if (fenceMatch) {
    // We found fenced content — extract just the inside part
    cleanedText = fenceMatch[1].trim();
  }

  // -------------------------------------------------------------------------
  // STEP 3: Try direct JSON.parse
  // -------------------------------------------------------------------------
  // After stripping fences, the text might now be clean JSON. We try parsing
  // it directly first — this is the fastest and most common success path.
  // -------------------------------------------------------------------------
  try {
    const parsed = JSON.parse(cleanedText);
    return parsed;
  } catch (directParseError) {
    // Direct parse failed — the LLM likely added conversational text.
    // Continue to Step 4 for a more aggressive extraction.
  }

  // -------------------------------------------------------------------------
  // STEP 4: Extract JSON object using brace matching
  // -------------------------------------------------------------------------
  // If direct parsing failed, the LLM probably prepended or appended text
  // around the JSON. We search for the first '{' and the last '}' to extract
  // what we hope is the JSON object.
  //
  // Example input: "Here's my analysis:\n{\"risk\": \"HIGH\"}\nHope this helps!"
  // Extracted:     '{"risk": "HIGH"}'
  // -------------------------------------------------------------------------
  const firstBrace = cleanedText.indexOf("{");
  const lastBrace = cleanedText.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonCandidate = cleanedText.substring(firstBrace, lastBrace + 1);

    try {
      const parsed = JSON.parse(jsonCandidate);
      return parsed;
    } catch (extractParseError) {
      // Even the extracted substring isn't valid JSON.
      // Fall through to the error below.
    }
  }

  // -------------------------------------------------------------------------
  // STEP 5: All extraction attempts failed
  // -------------------------------------------------------------------------
  // If we reach here, the LLM produced something we truly can't parse.
  // We throw an error with the first 200 characters of the raw output so
  // the developer can see what went wrong when debugging.
  // -------------------------------------------------------------------------
  throw new Error(
    `Failed to extract valid JSON from LLM response. ` +
      `Raw output preview: "${rawText.substring(0, 200)}..."`
  );
}

// =============================================================================
// Export the parser function for use in other modules
// =============================================================================
module.exports = { parseJsonFromLLM };
