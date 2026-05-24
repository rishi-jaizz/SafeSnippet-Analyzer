# 🛡️ SafeSnippet Analyzer — Pre-Lab Technical Workshop
### *Building Reliable Async AI Backends with Node.js, Inngest, and Google Gemini*

> **Audience:** Intern developers with JavaScript/Node.js experience  
> **Duration:** ~45 minutes (lecture) + lab session  
> **Lab Repository:** `SafeSnippet Analyzer` — `/src` (backend) + `/frontend` (React/Vite)

---

---

## Slide 1 — The Problem: Why You Can't Just Call an LLM Synchronously

### Core Technical Challenges

- **LLM latency is non-deterministic and high:** Google Gemini `gemini-2.0-flash` takes **3–15 seconds** per request depending on prompt length, token count, and server load — with no guaranteed upper bound
- **HTTP request timeouts are hard limits:** Most serverless platforms (Vercel, AWS Lambda, Cloudflare Workers) enforce 10–30 second execution limits; API gateways like AWS API GW default to **29 seconds max**
- **Synchronous handlers block the event loop:** In Node.js, a naive `await llm.generate()` inside a route handler keeps the request open and a server thread occupied — under even moderate load, this exhausts the connection pool
- **Single point of failure:** If the AI provider returns a 429 (rate limit), 503 (overload), or a malformed response, a synchronous design has no retry strategy — the user just gets an error with no recourse

### 🎙️ Speaker Notes
> "Imagine a student posts code for analysis. With a naive synchronous design, the browser just... hangs. The HTTP connection stays open while the server waits for Gemini. If 10 students do this simultaneously, you have 10 open connections, each waiting 5–10 seconds. Now imagine this is Vercel — it kills the function at 10 seconds. Every request fails. This is why we can't think of LLMs like we think of fast database queries."

### 📊 Visual Description
**Side-by-side timing diagram:**  
Left side: A browser `POST /analyze` → Express route → `await gemini.generate()` (frozen for 8s) → Response.  
Right side: The same flow on Vercel/Lambda with a red ✗ at the 10s timeout boundary.  
Annotate with realistic numbers: Gemini p50 latency ≈ 4s, p95 ≈ 12s.

---

---

## Slide 2 — Serverless Execution Model & Timeout Constraints

### Why Serverless Makes This Worse

- **Serverless = stateless ephemeral functions:** Each function invocation is isolated; there is no persistent process, no shared memory, and no long-lived connection — making "wait and retry" logic impossible within a single invocation
- **The cold start penalty:** A Node.js Lambda/Vercel function cold-starts in ~300ms–1.5s before your code even runs; combined with a 10s Gemini call, you are already at 60–85% of the timeout budget before doing any real work
- **No mid-execution recovery:** If a serverless function crashes at second 8 of a 10s Gemini call, the entire 8s of work is lost — there is no checkpoint, no partial result, no resume
- **Concurrency limits + cost explosion:** Keeping 100 connections open waiting for LLM responses is 100 concurrently running Lambda instances — serverless costs scale with duration × concurrency, not just throughput

### 🎙️ Speaker Notes
> "This lab runs locally where timeouts aren't enforced. But every company using serverless — which is most of them — hits this wall immediately when they add AI. The instinct is to raise the timeout limit. But that's a band-aid. The right answer is to decouple the submission from the execution entirely, which is what we're building today."

### 📊 Visual Description
**Timeline comparison chart:**  
Three horizontal bars labeled "Lambda (10s)", "Vercel (30s)", "Express on EC2 (no limit)".  
Overlay a Gemini latency distribution bell curve (mean 6s, tail to 20s).  
Show the overlap area where requests succeed vs. the danger zone where they fail.

---

---

## Slide 3 — The Solution: Async Request Lifecycle & the Polling Pattern

### How SafeSnippet Analyzer Decouples Work from Response

- **HTTP 202 Accepted — not 200 OK:** The `/api/analyze` endpoint returns in `< 50ms` with a `jobId`; it does not wait for analysis — HTTP 202 semantically means "I received your request and will process it asynchronously"
- **UUID as a correlation handle:** `uuidv4()` generates a 128-bit random identifier (`a1b2c3d4-...`) with collision probability of ~1 in 5.3 × 10³⁶; this `jobId` is the only contract between the client, the API, and the background worker
- **The polling loop on the client:** React's `setInterval` in `App.jsx` calls `GET /api/results/:jobId` every 2 seconds; the response transitions through `pending → processing → completed`; the interval is cleared on terminal states
- **Four job states — a state machine:** The `resultsStore` (in-memory `Map`) tracks `{ pending, processing, completed, failed }`; each state transition is an atomic write; this shared state bridges the HTTP routes and the Inngest background function

### 🎙️ Speaker Notes
> "The key insight is: separate 'accepting work' from 'doing work'. The Express route's only job is to validate the input, generate a jobId, record the initial state as 'pending', fire an event, and return 202. That's it — under 50ms. The actual AI call happens somewhere else, in a completely different execution context. The client never waits; it polls."

### 📊 Visual Description
**Request lifecycle sequence diagram with three actors:** Browser, Express Server, Inngest.  
1. `POST /analyze` → Express validates → `resultsStore.createJob(jobId, 'pending')` → `inngest.send(event)` → `202 { jobId }`  
2. Browser starts polling: `GET /results/:jobId` → `{ status: 'pending' }`  
3. Inngest invokes function → `markProcessing()` → `GET /results/:jobId` → `{ status: 'processing' }`  
4. Gemini call completes → `markCompleted()` → `GET /results/:jobId` → `{ status: 'completed', result: {...} }`  
Show timestamps at each step (t+0ms, t+2s, t+4s, t+8s).

---

---

## Slide 4 — Event-Driven Architecture: Inngest as the Workflow Engine

### How Inngest Replaces a DIY Message Queue

- **The Inngest Client bridges Express and the event bus:** `inngest.send({ name: "code/analyze.requested", data: { jobId, code, language } })` publishes an event — this is a non-blocking HTTP call to Inngest's event ingestion endpoint; under the hood in dev mode, this talks to `http://localhost:8288`
- **Function registration via `serve()` middleware:** `app.use("/api/inngest", serve({ client: inngest, functions: [analyzeCodeFunction] }))` mounts a *dual-purpose* endpoint — a `GET` for Inngest's discovery handshake, and a `POST` for Inngest to invoke registered functions; Inngest pull-invokes (not the other way around)
- **Event name as the routing key:** `inngest.createFunction({ id: "analyze-code-security" }, { event: "code/analyze.requested" }, handler)` — the string `"code/analyze.requested"` is a semantic contract; Inngest routes any event with this name to this function; changing the name in one place without the other silently breaks the pipeline
- **Two processes, one system:** `npm run dev` (Express on port 3000) and `npm run inngest:dev` (Inngest Dev Server on port 8288) are separate OS processes; Express sends events to Inngest; Inngest POSTs back to `/api/inngest` to invoke functions — a deliberate separation that mirrors production cloud architecture

### 🎙️ Speaker Notes
> "Without Inngest, you'd build this yourself with Redis + BullMQ + a separate worker process + a dead-letter queue + retry logic + a dashboard. Inngest packages all of that. The serve() call is especially important — it's what lets Inngest discover your functions at startup. If you forget it, Inngest sees no functions registered and silently drops events."

### 📊 Visual Description
**Architecture diagram with two process boxes:**  
Box 1: "Express Process (port 3000)" containing: `POST /api/analyze` → `inngest.send()`, `GET /api/results/:id` → `resultsStore`, `POST /api/inngest` ← (Inngest invocation callback).  
Box 2: "Inngest Dev Server (port 8288)" containing: Event Bus, Function Registry, Scheduler, Retry Engine, Dashboard UI.  
Draw bidirectional arrows: Express→Inngest (events), Inngest→Express (invocations).  
Annotate the `/api/inngest` endpoint as the critical bridge.

---

---

## Slide 5 — Durable Execution: Steps, Memoization, and Retry Safety

### The Power of `step.run()` — Checkpointed Execution

- **Each `step.run()` is an atomic, memoized checkpoint:** After Step 1 (`update-status-processing`) completes, Inngest persists its return value; if the function crashes before Step 2 finishes, the retry does NOT re-execute Step 1 — it skips to Step 2 with the memoized result, avoiding duplicate database writes or double-billing
- **Exponential backoff retry schedule:** `retries: 3` means 4 total attempts; Inngest applies automatic exponential backoff: Attempt 1 immediate, Attempt 2 after ~5s, Attempt 3 after ~25s, Attempt 4 after ~125s — this handles transient 429s and 503s from Gemini without any manual timer code
- **Step isolation prevents cascading failures:** Our three steps — `update-status-processing`, `call-gemini-api`, `store-results` — are independently retryable; a 429 from Gemini only retries the API call step, not the status update that already succeeded
- **The function return value surfaces to the Inngest dashboard:** `return { jobId, riskLevel, vulnerabilitiesFound }` makes the output visible in the Inngest UI at `localhost:8288` — critical for debugging in development; in production this data is retained for 7 days

### 🎙️ Speaker Notes
> "Think of steps like database transactions with savepoints. If a transaction fails at step 3 of 5, you don't roll back and restart from step 1. You resume from the last savepoint. That's durable execution. Without it, a retry of an Inngest function would re-run ALL steps — including the ones that already succeeded — potentially creating duplicate jobs or overwriting a 'completed' status back to 'processing'."

### 📊 Visual Description
**Two-column flowchart: "Without Steps" vs "With Steps":**  
Left (Without Steps): Function crashes after Gemini call → full retry → re-runs `markProcessing()` even though job is already processing → potential race condition or state corruption.  
Right (With Steps): Same crash → Inngest rehydrates with memoized Step 1 result → resumes at Step 2 only → clean retry.  
Below: A retry timeline showing exponential backoff: 0s, 5s, 25s, 125s with attempt numbers.

---

---

## Slide 6 — AI Integration: Gemini Service Architecture & Prompt Engineering

### From Raw Code to Structured JSON — the Full Pipeline

- **Service layer isolation (`geminiService.js`):** The Gemini SDK, API key, model configuration, and prompt construction are entirely encapsulated behind `analyzeCodeWithAI(code, language)` — the Inngest function calls this as a black box; this enables mocking (replacing the function body for testability) without touching the workflow layer
- **Model configuration is a deliberate engineering decision:** `temperature: 0.1` makes output near-deterministic (same code → same vulnerabilities found, essential for reproducibility); `HARM_CATEGORY_DANGEROUS_CONTENT: BLOCK_NONE` is required because our input intentionally contains exploit patterns — SQL injection examples, `eval()` calls — that trigger Gemini's default safety filters
- **Two-layer prompting (system + user):** `systemInstruction` sets the persistent persona ("senior security auditor, 15 years experience, OWASP Top 10") and output contract (exact JSON schema with field-level descriptions); `contents` carries the few-shot example + the actual code — this separation ensures the schema rules apply universally regardless of what code is submitted
- **Defensive JSON parsing with 4 fallback strategies:** Even with explicit schema instructions, LLMs hallucinate markdown fences (` ```json`), prepend conversational text, or change field names; `parseJsonFromLLM()` tries: (1) direct `JSON.parse`, (2) strip markdown fences via regex, (3) brace-matching extraction `{ firstBrace, lastBrace }`, (4) throw with a 200-char raw output preview for debugging

### 🎙️ Speaker Notes
> "The safety settings override is one of those non-obvious production decisions. Without it, Gemini classifies SQL injection code snippets as dangerous content and refuses to analyze them — which is exactly the opposite of what we want. Setting BLOCK_NONE for DANGEROUS_CONTENT tells the model: 'I know this looks like malicious code; that's intentional; analyze it as a security auditor, not as a threat actor.'"

### 📊 Visual Description
**Layered prompt construction diagram:**  
Layer 1 (System Instruction): "Persona + Rules + JSON Schema" → sent as `systemInstruction`  
Layer 2 (Few-shot Example): Python SQL injection input→output pair → anchors model behavior  
Layer 3 (User Code): Dynamic: `Language: ${language}` + code block → sent as `contents`  
Arrow from all three layers → Gemini API → Raw text response  
Then: Raw text → `parseJsonFromLLM()` (4-step parser) → Validated JS object → Inngest step return value

---

---

## Slide 7 — State Management: The In-Memory Results Store

### `resultsStore.js` — A Shared State Bridge Between Two Worlds

- **JavaScript `Map` as an in-process state bridge:** The Express HTTP routes (`GET /api/results/:id`) and the Inngest function (which runs in the same Node.js process via the `/api/inngest` callback) share a single `Map` instance; Node.js's single-threaded event loop makes this race-condition-safe without locks or mutexes
- **Immutable job lifecycle with four terminal/transient states:** `pending` (set at job creation, before Inngest picks it up) → `processing` (set in Inngest Step 1) → `completed` (set in Inngest Step 3 with full result) OR `failed` (set if all retries exhaust); the store's `markFailed()` function is the error sink for exhausted Inngest retries
- **Why this breaks at scale and what replaces it:** Data is lost on server restart, cannot be shared across multiple Express instances (horizontal scaling is impossible), has no TTL/expiry so memory grows unboundedly; production replacement: **Redis** (for shared fast state), **PostgreSQL** (for durable structured results), or **DynamoDB** (for serverless-native persistence)
- **The `updatedAt` timestamp as a debugging tool:** Every state transition records `updatedAt: new Date().toISOString()`; the delta between `createdAt` and `updatedAt` on a `completed` job tells you the actual end-to-end AI processing time — a production metric you'd export to Datadog or CloudWatch

### 🎙️ Speaker Notes
> "The in-memory Map works perfectly for this lab because both the HTTP routes and the Inngest callback run in the SAME Node.js process. The serve() middleware mounts Inngest on Express — so when Inngest invokes our function, it's actually calling back into our own Express server, which means it shares the same memory space. In production with Redis, you'd replace the Map reads and writes with async Redis commands — the interface stays exactly the same."

### 📊 Visual Description
**Memory state diagram showing the Map evolution over time:**  
T+0ms: `Map { "abc123": { status: "pending", result: null } }` (created by POST route)  
T+200ms: `Map { "abc123": { status: "processing" } }` (updated by Inngest Step 1)  
T+6s: `Map { "abc123": { status: "completed", result: { riskLevel: "HIGH", vulnerabilities: [...] } } }`  
Alongside: the GET polling responses at 2s intervals reading from this same Map.  
Bottom: Production replacement diagram — Map → Redis (Pub/Sub + GET/SET).

---

---

## Slide 8 — Node.js Backend Architecture: Express + Inngest as a Single Process

### How Express Hosts Both the API and the Workflow Engine

- **The `serve()` call creates a dual-purpose HTTP endpoint:** `app.use("/api/inngest", serve({ client: inngest, functions: [analyzeCodeFunction] }))` mounts Inngest's Express middleware on `/api/inngest`; a `GET` to this route returns the function manifest (so Inngest Dev Server can discover registered functions); a `POST` from Inngest triggers actual function execution — all within a single Express process
- **Module dependency graph and import order matter:** `server.js` imports in strict order: `dotenv.config()` first (populates `process.env`), then `inngest/client.js` (creates `Inngest` instance using `id: "safesnippet-analyzer"`), then `inngest/analyzeCode.js` (which imports `client.js` — shared instance, no circular dependency), then `store/resultsStore.js` — the Map is initialized at module load time and shared
- **JSON body parsing with a 1MB limit:** `express.json({ limit: "1mb" })` is a security boundary; without the limit, a malicious client could POST a 100MB code file, exhausting server memory; the limit must balance real-world code snippet sizes against DoS vectors
- **Input validation as the first line of defense:** Before generating a `jobId` or touching Inngest, the route validates: `code` must be a non-empty string, `language` must be a non-empty string; this prevents empty string events from propagating into the Inngest pipeline where debugging is harder

### 🎙️ Speaker Notes
> "Notice that `dotenv.config()` is literally the first line of `server.js`, before any other require. This is intentional. If you move it even one line down — after the Inngest client import — then `process.env.GOOGLE_API_KEY` is undefined when the GoogleGenerativeAI SDK initializes, and you get a silent authentication failure that's very hard to debug. Load order is architecture."

### 📊 Visual Description
**Express route map diagram:**  
Three endpoints with their roles color-coded:  
- `POST /api/analyze` (green) — Input boundary: validates, generates UUID, fires event, returns 202  
- `GET /api/results/:id` (blue) — Output boundary: reads from Map, returns job state  
- `GET /api/health` (gray) — Observability: returns `{ status, geminiConfigured, timestamp }`  
- `ALL /api/inngest` (purple) — Inngest bridge: serves manifest + handles invocations  
- `static /public` (gray) — Serves frontend (bonus)  
Show the `express.json({ limit: "1mb" })` middleware applying before all routes.

---

---

## Slide 9 — Reliability Engineering: Retries, Error Handling, and Failure Modes

### Every Failure Mode Has a Designated Handler

- **Gemini API failures are the most likely production failure:** Rate limits (429), server overload (503), network timeouts — all manifest as thrown errors inside `step.run("call-gemini-api")`. Inngest catches these and schedules retries with exponential backoff. After 4 failed attempts, the function is marked permanently failed and `onFailure` hooks (not implemented in this lab, but available) can trigger cleanup
- **LLM schema deviation handled before retry:** `parseJsonFromLLM()` attempts 4 extraction strategies before throwing; the `geminiService.js` validation (`!analysisResult.riskLevel`, `!Array.isArray(vulnerabilities)`) throws on schema mismatch — this propagates to Inngest as a retryable error, giving the model another chance to produce a valid response
- **The frontend's polling loop is resilient by design:** `try/catch` inside `setInterval` swallows transient network errors (WiFi blips, server restarts) without clearing the interval; polling continues until a terminal state (`completed`, `failed`) or explicit user cancellation — the UI never shows a false failure from a momentary network hiccup
- **Production reliability additions not implemented in this lab:** Dead-letter queue for exhausted retries, `onFailure` handler calling `resultsStore.markFailed()`, circuit breakers for sustained Gemini outages, idempotency keys to prevent duplicate processing if `inngest.send()` is called twice with the same `jobId`

### 🎙️ Speaker Notes
> "There's a subtle reliability gap in the current lab code: if Inngest exhausts all 4 retries, `resultsStore.markFailed()` is never called. The job stays in `processing` state forever, and the frontend polls indefinitely. In production, you'd add an `onFailure` handler to `createFunction()` that explicitly marks the job as failed so the client can surface the error. This is intentional in the lab — it's a great thing for students to identify and fix."

### 📊 Visual Description
**Failure mode decision tree:**  
Root: "Inngest function invoked"  
→ Step 1 succeeds → Step 2 (Gemini call):  
  - 429/503 → Inngest retry (attempt 2, wait 5s) → (same) → (attempt 3, wait 25s) → (attempt 4, wait 125s) → Permanently Failed (gap: markFailed not called)  
  - Invalid JSON → `parseJsonFromLLM` fallback → schema validation fails → throw → same retry path  
  - Success → Step 3 → `markCompleted()` → Done  
Annotate the missing `onFailure` handler as "⚠️ Lab Gap — Production TODO"

---

---

## Slide 10 — End-to-End System Architecture & Data Flow

### The Complete Picture: All Six Layers Working Together

- **Layer 1 — Browser/Frontend (React + Vite, port 5173):** User pastes code → `startAnalysis()` POSTs to `/api/analyze` → receives `jobId` → `startPolling(jobId)` polls every 2s via `setInterval` → renders `VulnerabilityCard` components from the structured JSON result; Vite proxies all `/api/*` requests to `localhost:3000` in dev mode
- **Layer 2 — Express API (Node.js, port 3000):** Three functional roles: (a) HTTP ingress + validation + event dispatch (`POST /api/analyze`), (b) Result retrieval + state read (`GET /api/results/:id`), (c) Inngest invocation bridge (`/api/inngest` via `serve()`)
- **Layer 3 — In-Memory State (`Map`, same process):** Single source of truth for job lifecycle; written by both the Express route (initial `pending` state) and the Inngest callback (transitions to `processing`, `completed`, `failed`); read exclusively by `GET /api/results/:id`
- **Layer 4 — Inngest Dev Server (port 8288):** Event bus + function scheduler + retry engine + visual dashboard; receives events from Express, discovers functions via `GET /api/inngest`, invokes functions via `POST /api/inngest`, tracks run history; in production, replaced by Inngest Cloud (zero infrastructure change — just add `eventKey` and `signingKey`)
- **Layer 5 — Gemini Service (HTTP to Google APIs):** `GoogleGenerativeAI` SDK → `generateContent()` → `gemini-2.0-flash` model; prompt engineering via system instruction + few-shot example; defensive JSON parsing in `parseJsonFromLLM()` handles all LLM output variations
- **Layer 6 — Prompt Engineering (`securityAnalysis.js`):** `SYSTEM_PROMPT` (persona, OWASP scope, exact JSON schema, 5 hard rules) + `FEW_SHOT_EXAMPLE` (SQLi input→output pair) + `buildUserPrompt(code, language)` (dynamic code injection with line count); temperature=0.1 enforces determinism across retries

### 🎙️ Speaker Notes
> "This is a production-grade architecture running entirely on your laptop. The only thing that changes when you deploy to production is: the in-memory Map becomes Redis, the Inngest Dev Server becomes Inngest Cloud, and the Vite proxy becomes a real reverse proxy or CDN. Every design decision we made in this lab — async events, durable steps, service isolation, defensive parsing — is exactly what you'd use at Stripe, GitHub, or Google."

### 📊 Visual Description
**Full system architecture diagram with all components and data flows:**  
```
┌─────────────────────────────────────────────────────────────────┐
│                     BROWSER (React + Vite)                       │
│   CodeEditor → POST /api/analyze → startPolling(jobId) →        │
│                                    VulnerabilityCard[]           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP (Vite proxy)
┌──────────────────────────▼──────────────────────────────────────┐
│                  EXPRESS SERVER (Node.js :3000)                  │
│  POST /analyze → validate → uuid() → createJob() → send(event)  │
│  GET /results/:id → getJob() → { status, result }               │
│  /api/inngest → serve() → [discovery | function invocation]      │
│                                                                  │
│  ┌──────────────── resultsStore (Map) ──────────────────────┐   │
│  │  jobId → { status: pending|processing|completed|failed } │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────┬──────────────────────────▲───────────────────────┘
               │ inngest.send(event)       │ Inngest invokes
               │                          │ POST /api/inngest
┌──────────────▼──────────────────────────┴───────────────────────┐
│              INNGEST DEV SERVER (:8288)                          │
│  Event Bus → Route "code/analyze.requested" →                   │
│  Schedule function → Retry Engine (exp. backoff) → Dashboard    │
└─────────────────────────────────────────────────────────────────┘
               │ step.run("call-gemini-api")
┌──────────────▼──────────────────────────────────────────────────┐
│              GEMINI SERVICE (gemini-2.0-flash)                   │
│  systemInstruction (OWASP persona + JSON schema)                 │
│  + few-shot SQLi example + buildUserPrompt(code, language)       │
│  → generateContent() → parseJsonFromLLM() → { riskLevel, ... }  │
└─────────────────────────────────────────────────────────────────┘
```

---

---

## Quick Reference: Key Files and Their Roles

| File | Role | Key Concept |
|------|------|-------------|
| `src/server.js` | Express entry point + API routes + Inngest `serve()` | HTTP 202, UUID generation, event dispatch |
| `src/inngest/client.js` | Shared Inngest client singleton | App identity, avoids circular deps |
| `src/inngest/analyzeCode.js` | Durable background function (3 steps) | Memoization, retries, step isolation |
| `src/services/geminiService.js` | Gemini SDK wrapper + prompt assembly | Service layer pattern, `temperature: 0.1` |
| `src/prompts/securityAnalysis.js` | Prompt templates (system + few-shot + user) | Prompt engineering, schema enforcement |
| `src/utils/jsonParser.js` | Defensive LLM output parser | 4-strategy extraction, fail-safe error messages |
| `src/store/resultsStore.js` | In-memory `Map` job state machine | Shared state bridge, 4-state lifecycle |
| `frontend/src/App.jsx` | React UI + `setInterval` polling loop | Async UX pattern, 2s poll cadence |

---

## Pre-Lab Discussion Questions

1. **Why does `inngest.send()` in `POST /api/analyze` return almost immediately, while `model.generateContent()` in `geminiService.js` takes several seconds?**  
   *(Answer: `inngest.send()` just POSTs a JSON event to the Inngest Dev Server — a local HTTP call. `generateContent()` makes an outbound call to Google's API servers.)*

2. **If you remove the `step.run()` wrappers and put all three operations directly in the handler, what breaks and when?**  
   *(Answer: On retry, `markProcessing()` runs again — potentially overwriting a 'completed' state. The Gemini call runs again — wasting quota and time. Nothing is wrong functionally in the happy path, only in the failure/retry path.)*

3. **The `resultsStore` is a `Map` in memory. If you run two instances of Express (load balanced), what happens to a user's polling request if it hits a different instance than the one that stored the job?**  
   *(Answer: 404 — the second instance's Map has no record of the job. This is why production systems use Redis as a shared external cache.)*

4. **Why is `HARM_CATEGORY_DANGEROUS_CONTENT: BLOCK_NONE` necessary in `geminiService.js`?**  
   *(Answer: Security analysis requires submitting actual exploit code. Without this override, Gemini refuses to analyze SQL injection examples or `eval()` calls, treating them as harmful intent rather than subject matter for analysis.)*

---

*Ready to build? Open your terminals and start with `lab_doc.md`* 🚀
