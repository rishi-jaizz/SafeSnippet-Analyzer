// =============================================================================
// prompts/securityAnalysis.js — Prompt Templates for AI Security Analysis
// =============================================================================
//
// WHY THIS FILE EXISTS:
// Prompt engineering is the most critical part of any LLM-powered application.
// The quality of the AI's output is directly determined by the quality of the
// instructions you give it. By keeping prompts in a dedicated file, we:
//
//   1. Separate concerns — business logic stays in service files, prompts here.
//   2. Enable iteration — you can tweak prompts without touching any code logic.
//   3. Improve readability — prompts are long strings; isolating them keeps
//      other files clean and focused.
//
// KEY PROMPT ENGINEERING PRINCIPLES USED:
//   - Role assignment:  "You are a senior security auditor" (sets expertise level)
//   - Output format:    Explicit JSON schema with field descriptions
//   - Constraints:      "Respond ONLY with a JSON object. No markdown, no text."
//   - Few-shot example: One input→output example to anchor behavior
//   - Temperature note: We set temperature=0.1 in the service layer for consistency
// =============================================================================

// =============================================================================
// SYSTEM PROMPT
// =============================================================================
// This is sent as the "system" message. It defines the LLM's persona, rules,
// and output format. The LLM treats system prompts as its highest-priority
// instructions. Everything here applies to every request.
// =============================================================================

const SYSTEM_PROMPT = `You are a senior application security auditor with 15 years of experience in code review and vulnerability assessment. You specialize in identifying OWASP Top 10 vulnerabilities, CWE-classified weaknesses, and insecure coding patterns across all major programming languages.

YOUR TASK:
Analyze the provided code snippet for security vulnerabilities, insecure practices, and potential risks. Produce a thorough, actionable vulnerability report.

OUTPUT FORMAT — YOU MUST RESPOND WITH A VALID JSON OBJECT MATCHING THIS EXACT SCHEMA:

{
  "riskLevel": "CRITICAL | HIGH | MEDIUM | LOW | SAFE",
  "vulnerabilities": [
    {
      "type": "string — The vulnerability category (e.g., 'SQL Injection', 'XSS', 'Hardcoded Credentials')",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "line": "number — The approximate line number in the submitted code where this issue occurs",
      "description": "string — A clear explanation of the vulnerability, why it is dangerous, and what an attacker could do with it",
      "recommendation": "string — A specific, actionable fix. Include a corrected code snippet when possible"
    }
  ],
  "summary": "string — A 2-3 sentence executive summary of the overall security posture of this code",
  "metadata": {
    "analyzedAt": "string — ISO 8601 timestamp of when the analysis was performed",
    "language": "string — The programming language of the analyzed code",
    "linesAnalyzed": "number — Count of non-empty lines in the submitted code"
  }
}

RULES:
1. The "riskLevel" MUST be the highest severity found among all vulnerabilities. If no vulnerabilities exist, use "SAFE".
2. The "vulnerabilities" array MUST contain at least one entry if riskLevel is not "SAFE". It MUST be an empty array [] if riskLevel is "SAFE".
3. Each vulnerability MUST have all five fields: type, severity, line, description, recommendation.
4. Respond ONLY with the JSON object. Do NOT include any markdown formatting, code fences, explanatory text, or commentary outside the JSON structure.
5. Do NOT wrap the response in \`\`\`json ... \`\`\` fences.`;

// =============================================================================
// FEW-SHOT EXAMPLE
// =============================================================================
// Including one example of a correct input→output pair dramatically improves
// the LLM's format compliance. Without this, models frequently add markdown
// fences, skip fields, or change the schema.
//
// We provide the example as part of the user prompt (not the system prompt)
// to keep the system prompt focused on rules.
// =============================================================================

const FEW_SHOT_EXAMPLE = `
EXAMPLE INPUT:
Language: python
Code:
\`\`\`
import sqlite3
def get_user(username):
    conn = sqlite3.connect('users.db')
    query = "SELECT * FROM users WHERE name = '" + username + "'"
    return conn.execute(query).fetchone()
\`\`\`

EXAMPLE OUTPUT:
{
  "riskLevel": "CRITICAL",
  "vulnerabilities": [
    {
      "type": "SQL Injection",
      "severity": "CRITICAL",
      "line": 4,
      "description": "User input is directly concatenated into the SQL query string without any sanitization or parameterization. An attacker can inject arbitrary SQL commands (e.g., \\\"' OR '1'='1\\\") to bypass authentication, extract sensitive data, or drop tables.",
      "recommendation": "Use parameterized queries instead of string concatenation. Replace line 4 with: query = 'SELECT * FROM users WHERE name = ?' and call conn.execute(query, (username,))"
    }
  ],
  "summary": "This code contains a critical SQL injection vulnerability due to unsanitized string concatenation in a database query. Immediate remediation is required before deployment.",
  "metadata": {
    "analyzedAt": "2025-01-15T10:30:00.000Z",
    "language": "python",
    "linesAnalyzed": 5
  }
}`;

// =============================================================================
// buildUserPrompt() — Constructs the user-facing prompt for each request
// =============================================================================
/**
 * Builds the complete user prompt by combining the few-shot example with
 * the actual code snippet to analyze.
 *
 * @param   {string} code     - The source code to analyze.
 * @param   {string} language - The programming language (e.g., "javascript").
 * @returns {string}          - The complete user prompt string.
 */
function buildUserPrompt(code, language) {
  // Count non-empty lines for the metadata field
  const lineCount = code
    .split("\n")
    .filter((line) => line.trim().length > 0).length;

  return `${FEW_SHOT_EXAMPLE}

NOW ANALYZE THIS CODE:
Language: ${language}
Lines: ${lineCount}
Code:
\`\`\`
${code}
\`\`\`

Respond ONLY with the JSON object. No other text.`;
}

// =============================================================================
// Export the system prompt and the prompt builder function
// =============================================================================
module.exports = {
  SYSTEM_PROMPT,
  buildUserPrompt,
};
