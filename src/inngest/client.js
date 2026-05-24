// =============================================================================
// inngest/client.js — Inngest Client Instance
// =============================================================================
//
// WHY THIS FILE EXISTS:
// The Inngest client is the central object that connects our app to the
// Inngest event system. It's used in TWO places:
//
//   1. In server.js     → to send events (inngest.send()) when we receive
//                          API requests from users.
//   2. In functions     → to register Inngest functions that process events
//                          in the background.
//
// By creating the client in its own file, we avoid circular dependencies
// and ensure both the server and the functions share the same client instance.
//
// WHAT IS INNGEST?
// Inngest is an event-driven workflow engine. Instead of building your own
// message queue (Redis + BullMQ + worker processes), Inngest provides:
//   - Event ingestion (receive and route events)
//   - Function triggering (run code when specific events arrive)
//   - Durable execution (steps are memoized; retries resume, not restart)
//   - Built-in retries with exponential backoff
//   - A visual dashboard to inspect events and function runs
//
// For local development, Inngest runs a Dev Server that simulates all of this
// on your machine — no cloud account or infrastructure needed.
// =============================================================================

const { Inngest } = require("inngest");

// -----------------------------------------------------------------------------
// Create and configure the Inngest client
// -----------------------------------------------------------------------------
// The `id` parameter is a unique identifier for your application within Inngest.
// All events sent and functions registered will be associated with this app ID.
//
// In production, you'd also provide:
//   - eventKey:   An API key for authenticating event submissions.
//   - signingKey: A key for verifying that incoming function invocations
//                 actually came from Inngest (prevents spoofing).
//
// For local development with the Inngest Dev Server, these are not required.
// -----------------------------------------------------------------------------
const inngest = new Inngest({
  id: "safesnippet-analyzer",
});

// =============================================================================
// Export the client for use in server.js and function files
// =============================================================================
module.exports = { inngest };
