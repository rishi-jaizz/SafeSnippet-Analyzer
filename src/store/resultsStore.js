// =============================================================================
// store/resultsStore.js — In-Memory Results Storage
// =============================================================================
//
// WHY THIS FILE EXISTS:
// Our API has two endpoints: one to SUBMIT code for analysis (POST /api/analyze)
// and one to RETRIEVE results (GET /api/results/:jobId). Because the AI
// processing happens asynchronously in an Inngest background function, we need
// a shared place to store completed results so the GET endpoint can find them.
//
// In this lab, we use a simple in-memory JavaScript Map for simplicity.
// In production, you would replace this with Redis, PostgreSQL, or another
// persistent data store so results survive server restarts.
//
// TRADE-OFF:
// - Pros: Zero setup, zero dependencies, instant read/write, perfect for labs.
// - Cons: Data is lost on server restart, doesn't scale across multiple server
//         instances. That's acceptable for a learning exercise.
// =============================================================================

/**
 * In-memory store using a Map.
 *
 * Structure of each entry:
 *   key:   jobId (string, UUID)
 *   value: {
 *     status:    "pending" | "processing" | "completed" | "failed",
 *     code:      string  (the original code submitted),
 *     language:  string  (e.g., "javascript", "python"),
 *     result:    object  (the AI analysis result, null until completed),
 *     error:     string  (error message if failed, null otherwise),
 *     createdAt: string  (ISO 8601 timestamp),
 *     updatedAt: string  (ISO 8601 timestamp)
 *   }
 */
const results = new Map();

// =============================================================================
// CREATE: Initialize a new job in the store
// =============================================================================
/**
 * Creates a new job entry with "pending" status.
 * Called by the POST /api/analyze endpoint immediately after generating a jobId.
 *
 * @param {string} jobId    - Unique identifier for this analysis job.
 * @param {string} code     - The source code to be analyzed.
 * @param {string} language - The programming language of the code.
 */
function createJob(jobId, code, language) {
  results.set(jobId, {
    status: "pending",
    code,
    language,
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

// =============================================================================
// READ: Retrieve a job by its ID
// =============================================================================
/**
 * Fetches the current state of a job.
 * Called by the GET /api/results/:jobId endpoint for polling.
 *
 * @param   {string}      jobId - The job ID to look up.
 * @returns {object|null}       - The job object, or null if not found.
 */
function getJob(jobId) {
  return results.get(jobId) || null;
}

// =============================================================================
// UPDATE: Mark a job as actively processing
// =============================================================================
/**
 * Transitions a job to "processing" status.
 * Called by the Inngest function when it starts working on the job.
 *
 * @param {string} jobId - The job ID to update.
 */
function markProcessing(jobId) {
  const job = results.get(jobId);
  if (job) {
    job.status = "processing";
    job.updatedAt = new Date().toISOString();
  }
}

// =============================================================================
// UPDATE: Store the completed analysis result
// =============================================================================
/**
 * Saves the AI analysis result and marks the job as "completed."
 * Called by the Inngest function after successfully parsing the LLM response.
 *
 * @param {string} jobId  - The job ID to update.
 * @param {object} result - The parsed vulnerability analysis JSON.
 */
function markCompleted(jobId, result) {
  const job = results.get(jobId);
  if (job) {
    job.status = "completed";
    job.result = result;
    job.updatedAt = new Date().toISOString();
  }
}

// =============================================================================
// UPDATE: Record a failure
// =============================================================================
/**
 * Marks a job as "failed" with an error message.
 * Called when the Inngest function exhausts all retries or encounters
 * an unrecoverable error.
 *
 * @param {string} jobId        - The job ID to update.
 * @param {string} errorMessage - A description of what went wrong.
 */
function markFailed(jobId, errorMessage) {
  const job = results.get(jobId);
  if (job) {
    job.status = "failed";
    job.error = errorMessage;
    job.updatedAt = new Date().toISOString();
  }
}

// =============================================================================
// Export all functions for use in other modules
// =============================================================================
module.exports = {
  createJob,
  getJob,
  markProcessing,
  markCompleted,
  markFailed,
};
