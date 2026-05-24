// =============================================================================
// test/testAnalysis.js — Manual Test Script for SafeSnippet Analyzer
// =============================================================================
//
// PURPOSE:
// This script simulates a real user workflow by sending a deliberately
// vulnerable code snippet to the API and polling for results. Students
// can run this to verify their implementation is working end-to-end.
//
// HOW TO RUN:
//   1. Make sure the Express server is running:  npm run dev
//   2. Make sure Inngest Dev Server is running:  npm run inngest:dev
//   3. Run this test script:                     node test/testAnalysis.js
//
// EXPECTED RESULT:
//   - The script submits vulnerable JavaScript code.
//   - It polls every 2 seconds for results.
//   - Once completed, it prints the full vulnerability report.
//   - The report should show riskLevel: "CRITICAL" with SQL Injection findings.
// =============================================================================

const BASE_URL = "http://localhost:3000";

// =============================================================================
// SAMPLE VULNERABLE CODE SNIPPETS
// =============================================================================
// These are intentionally insecure code samples for testing purposes.
// Each one contains real-world vulnerabilities that the AI should detect.
// =============================================================================

const VULNERABLE_SAMPLES = {
  // ---------------------------------------------------------------------------
  // Sample 1: JavaScript with SQL Injection + eval() + hardcoded credentials
  // ---------------------------------------------------------------------------
  javascript: `
const express = require('express');
const mysql = require('mysql');
const app = express();

// Database connection with hardcoded credentials
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'admin123',
  database: 'production_db'
});

// Login endpoint — vulnerable to SQL injection
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const query = "SELECT * FROM users WHERE username='" + username + "' AND password='" + password + "'";
  db.query(query, (err, results) => {
    if (results.length > 0) {
      res.json({ token: 'authenticated' });
    }
  });
});

// Dangerous: executes arbitrary user input as JavaScript code
app.get('/compute', (req, res) => {
  const result = eval(req.query.expression);
  res.json({ result });
});

// Reflects user input directly — XSS vulnerability
app.get('/search', (req, res) => {
  res.send('<h1>Results for: ' + req.query.q + '</h1>');
});

app.listen(3000);
  `,

  // ---------------------------------------------------------------------------
  // Sample 2: Python with command injection + insecure deserialization
  // ---------------------------------------------------------------------------
  python: `
import os
import pickle
import subprocess
from flask import Flask, request

app = Flask(__name__)

@app.route('/run', methods=['POST'])
def run_command():
    # Dangerous: executes user-supplied shell commands directly
    cmd = request.form.get('command')
    output = os.system(cmd)
    return str(output)

@app.route('/load', methods=['POST'])
def load_data():
    # Insecure deserialization — attacker can execute arbitrary code
    data = request.get_data()
    obj = pickle.loads(data)
    return str(obj)

@app.route('/ping', methods=['GET'])
def ping_host():
    # Command injection via string formatting
    host = request.args.get('host')
    result = subprocess.check_output(f'ping -c 1 {host}', shell=True)
    return result

if __name__ == '__main__':
    app.run(debug=True)  # Debug mode exposes debugger in production
  `,
};

// =============================================================================
// TEST RUNNER
// =============================================================================

async function runTest() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║     SafeSnippet Analyzer — Integration Test                 ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Select which sample to test (change this to test different languages)
  const testLanguage = "javascript";
  const testCode = VULNERABLE_SAMPLES[testLanguage];

  // ---------------------------------------------------------------------------
  // STEP 1: Health Check
  // ---------------------------------------------------------------------------
  console.log("🏥 Step 1: Checking server health...");
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthData = await healthRes.json();
    console.log(`   Status: ${healthData.status}`);
    console.log(`   Gemini configured: ${healthData.geminiConfigured}`);

    if (!healthData.geminiConfigured) {
      console.error("\n❌ ERROR: Gemini API key is not configured!");
      console.error("   Please add your API key to the .env file.");
      process.exit(1);
    }
  } catch (err) {
    console.error("\n❌ ERROR: Cannot reach the server at", BASE_URL);
    console.error("   Make sure the server is running: npm run dev");
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // STEP 2: Submit code for analysis
  // ---------------------------------------------------------------------------
  console.log(`\n📤 Step 2: Submitting ${testLanguage} code for analysis...`);
  console.log(`   Code length: ${testCode.length} characters\n`);

  const submitRes = await fetch(`${BASE_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: testCode,
      language: testLanguage,
    }),
  });

  const submitData = await submitRes.json();

  if (!submitData.success) {
    console.error("❌ Submission failed:", submitData.error);
    process.exit(1);
  }

  console.log(`   ✅ Job accepted! ID: ${submitData.jobId}`);
  console.log(`   HTTP Status: ${submitRes.status} (202 Accepted)\n`);

  // ---------------------------------------------------------------------------
  // STEP 3: Poll for results
  // ---------------------------------------------------------------------------
  console.log("⏳ Step 3: Polling for results (checking every 2 seconds)...\n");

  const jobId = submitData.jobId;
  let attempts = 0;
  const maxAttempts = 30; // 60 seconds maximum wait time

  while (attempts < maxAttempts) {
    attempts++;
    await sleep(2000);

    const pollRes = await fetch(`${BASE_URL}/api/results/${jobId}`);
    const pollData = await pollRes.json();

    process.stdout.write(`   Attempt ${attempts}: status = ${pollData.status}`);

    if (pollData.status === "completed") {
      console.log(" ✅\n");
      printResults(pollData.result);
      return;
    } else if (pollData.status === "failed") {
      console.log(" ❌\n");
      console.error("   Analysis failed:", pollData.error);
      process.exit(1);
    } else {
      console.log(" ⏳");
    }
  }

  console.error("\n❌ Timed out waiting for results after 60 seconds.");
  process.exit(1);
}

// =============================================================================
// RESULT PRINTER
// =============================================================================

function printResults(result) {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║     📋 VULNERABILITY ANALYSIS REPORT                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Risk Level
  const riskEmoji = {
    CRITICAL: "🔴",
    HIGH: "🟠",
    MEDIUM: "🟡",
    LOW: "🔵",
    SAFE: "🟢",
  };
  console.log(
    `   Risk Level: ${riskEmoji[result.riskLevel] || "⚪"} ${result.riskLevel}\n`
  );

  // Summary
  console.log(`   Summary: ${result.summary}\n`);

  // Vulnerabilities
  if (result.vulnerabilities && result.vulnerabilities.length > 0) {
    console.log(`   Found ${result.vulnerabilities.length} vulnerabilities:\n`);

    result.vulnerabilities.forEach((vuln, index) => {
      console.log(`   ── Vulnerability ${index + 1} ──────────────────────────`);
      console.log(`   Type:           ${vuln.type}`);
      console.log(`   Severity:       ${vuln.severity}`);
      console.log(`   Line:           ${vuln.line}`);
      console.log(`   Description:    ${vuln.description}`);
      console.log(`   Recommendation: ${vuln.recommendation}`);
      console.log();
    });
  } else {
    console.log("   ✅ No vulnerabilities found.\n");
  }

  // Full JSON
  console.log("─".repeat(60));
  console.log("Full JSON Response:\n");
  console.log(JSON.stringify(result, null, 2));
  console.log("\n" + "─".repeat(60));
  console.log("\n✅ Test completed successfully!");
}

// =============================================================================
// UTILITY
// =============================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// RUN
// =============================================================================
runTest().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
