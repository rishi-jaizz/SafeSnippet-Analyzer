# SafeSnippet Analyzer

## Project Overview

SafeSnippet Analyzer is an AI-powered code security analysis tool that accepts code snippets (JavaScript, Python, Java, PHP, Go, or TypeScript) and returns a structured vulnerability report identifying OWASP Top 10 issues, injection attacks, hardcoded credentials, and other security flaws. It is powered by Google's Gemini 2.0 Flash model.

The project demonstrates a production-grade asynchronous architecture using Inngest to create a durable, event-driven, retry-safe workflow. This ensures that long-running AI tasks do not block HTTP request handlers, and failures (like API rate limits) are automatically retried.

## Tech Stack

**Backend:**
- Node.js (v18+)
- Express (HTTP server framework)
- Inngest SDK (Workflow orchestration and durability)
- @google/generative-ai (Google Gemini API integration)
- UUID (Job ID generation)
- Dotenv (Environment variable management)

**Frontend:**
- React 19 (UI Library)
- Vite (Build tool and development server)
- lucide-react (Iconography)

## Deliverables List

The project is structured into the following key deliverables and components:
1. **The Inngest Client** (`src/inngest/client.js`): A shared singleton for Inngest event publishing and function registration.
2. **The In-Memory Results Store** (`src/store/resultsStore.js`): A state management mechanism connecting the Express API and background workers.
3. **Prompt Engineering & Gemini Service** (`src/prompts/securityAnalysis.js`, `src/services/geminiService.js`): The AI integration layer with few-shot prompt templates for structured JSON outputs.
4. **Defensive JSON Parsing** (`src/utils/jsonParser.js`): Reliable extraction of JSON from unpredictable LLM responses, overcoming markdown fences and preambles.
5. **Durable Inngest Workflow Function** (`src/inngest/analyzeCode.js`): A 3-step background job with automatic retries and step-level memoization.
6. **Express API Server** (`src/server.js`): Asynchronous HTTP endpoints for submitting code (`POST /api/analyze`) and polling results (`GET /api/results/:jobId`).
7. **React Frontend** (`frontend/src/`): A modern Vite-powered UI with a polling-based state machine for displaying results.

## How to Run

### Prerequisites
- Node.js (v18+)
- Google Gemini API Key

### 1. Backend Setup
Navigate to the `src` directory and install dependencies:
```bash
cd src
npm install
```

Configure your environment variables:
```bash
cp .env.example .env
```
Open `.env` and add your `GOOGLE_API_KEY`.

Start the backend server:
```bash
npm run dev
```
*The API will run on `http://localhost:3000`.*

### 2. Frontend Setup
Open a new terminal, navigate to the `frontend` directory, and install dependencies:
```bash
cd frontend
npm install
```

Start the frontend development server:
```bash
npm run dev
```
*The frontend will run on `http://localhost:5173`.*

### 3. Inngest Dev Server (Optional but Recommended)
To view the execution trace of your workflows, you can start the Inngest Dev Server. With the backend running, open a new terminal in the `src` directory and run:
```bash
npm run inngest:dev
```
*Access the Inngest dashboard at `http://localhost:8288`.*
