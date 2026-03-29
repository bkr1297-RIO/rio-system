/**
 * RIO Governance Gateway — Server
 *
 * The RIO Gateway sits between AI systems and execution tools.
 * It enforces governance before any action is executed.
 *
 * Pipeline: Intent → Governance → Risk → Authorization → Execution → Receipt → Ledger → Verification
 *
 * Fail mode: CLOSED. If authorization is missing, execution is denied.
 */
import express from "express";
import cors from "cors";
import { loadConfig } from "./governance/config.mjs";
import { initLedger } from "./ledger/ledger.mjs";
import routes from "./routes/index.mjs";

const app = express();
const PORT = process.env.RIO_GATEWAY_PORT || process.env.PORT || 4400;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[RIO Gateway] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`
    );
  });
  next();
});

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------
console.log("=".repeat(60));
console.log("  RIO GOVERNANCE GATEWAY");
console.log("  Governed AI Execution Runtime");
console.log("=".repeat(60));
console.log();

// Load governance configuration — fail closed if missing
try {
  loadConfig();
  console.log("[RIO Gateway] Governance configuration loaded.");
} catch (err) {
  console.error(`[RIO Gateway] FATAL: ${err.message}`);
  console.error("[RIO Gateway] Gateway cannot start without governance configuration.");
  process.exit(1);
}

// Initialize ledger
initLedger();
console.log("[RIO Gateway] Ledger initialized.");

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/", routes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "RIO Governance Gateway",
    version: "1.0.0",
    description: "Governed AI Execution Runtime — No Authorization, No Execution.",
    endpoints: {
      "POST /intent": "Submit an intent from any AI agent",
      "POST /govern": "Run policy + risk evaluation on an intent",
      "POST /authorize": "Record human approval or denial",
      "POST /execute": "Execute an authorized action",
      "POST /receipt": "Generate cryptographic receipt",
      "GET /ledger": "View ledger entries",
      "GET /verify": "Verify receipt hash chain integrity",
      "GET /health": "System health check",
      "GET /intents": "List all intents",
      "GET /intent/:id": "Get a specific intent with full pipeline state",
    },
    fail_mode: "closed",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(`[RIO Gateway] Unhandled error: ${err.message}`);
  res.status(500).json({ error: "Internal server error." });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log();
  console.log(`[RIO Gateway] Listening on port ${PORT}`);
  console.log(`[RIO Gateway] Health: http://localhost:${PORT}/health`);
  console.log(`[RIO Gateway] Fail mode: CLOSED`);
  console.log();
});
