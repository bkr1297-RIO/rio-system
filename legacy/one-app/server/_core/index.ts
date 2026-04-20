import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV } from "./env";
import { registerCheckMessageRoutes } from "../checkMessage";
import { registerTelegramWebhook, setTelegramWebhook } from "../telegramInput";
import { registerOneClickApproval } from "../oneClickApproval";
import { registerEmailApproval } from "../emailApproval";
import { restoreFromDrive } from "../driveRestore";
import { registerPolicyEndpoints } from "../policyEvaluateEndpoint";
import { loadDefaultMatrix } from "../policyMatrix";
import {
  registerRootAuthority,
  activatePolicy,
  getActivePolicy,
  DEFAULT_POLICY_RULES,
  computePolicyHash,
} from "../authorityLayer";
import { createHash } from "crypto";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);

  // ─── Multi-Channel Check Message API (Spec v1.0) ─────────────
  registerCheckMessageRoutes(app);

  // ─── Telegram Input (bidirectional) ────────────────────────────
  registerTelegramWebhook(app);

  // ─── One-Click Approval (Product Mode) ────────────────────────
  registerOneClickApproval(app);

  //  // ─── Email-Based One-Click Approval (Multi-User MVP) ──────
  registerEmailApproval(app);

  // ─── Policy Engine (Standalone API) ────────────────────
  loadDefaultMatrix();
  registerPolicyEndpoints(app);

  // ─── HITL Proxy ──────────────────────────────────────────────
  // Forwards requests to the HITL execution engine (Replit).
  // ONE → this server → HITL proxy → tool execution → receipt → ledger
  // The ONE app never calls HITL directly — this server proxies all requests.
  app.all("/api/hitl/*", async (req, res) => {
    const hitlBase = ENV.hitlProxyUrl;
    if (!hitlBase) {
      return res.status(503).json({ error: "HITL_PROXY_URL not configured" });
    }

    // Forward the full /api/hitl/* path — Replit app expects /api/hitl/* endpoints
    const hitlPath = req.originalUrl; // e.g. /api/hitl/onboard
    const targetUrl = `${hitlBase}${hitlPath}`;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      // Forward authorization header if present
      if (req.headers.authorization) {
        headers["Authorization"] = req.headers.authorization as string;
      }
      // Forward Gateway token if present
      if (req.headers["x-gateway-token"]) {
        headers["X-Gateway-Token"] = req.headers["x-gateway-token"] as string;
      }

      const fetchOpts: RequestInit = {
        method: req.method,
        headers,
      };
      if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
        fetchOpts.body = JSON.stringify(req.body);
      }

      const upstream = await fetch(targetUrl, fetchOpts);
      const contentType = upstream.headers.get("content-type") || "";

      // Forward status code
      res.status(upstream.status);

      // Forward response
      if (contentType.includes("application/json")) {
        const data = await upstream.json();
        return res.json(data);
      } else {
        const text = await upstream.text();
        res.set("Content-Type", contentType || "text/plain");
        return res.send(text);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[HITL Proxy] ${req.method} ${hitlPath} → Error: ${msg}`);
      return res.status(502).json({ error: `HITL proxy error: ${msg}` });
    }
  });

  // ─── Ask Bondi REST endpoint (cross-origin) ───────────────────
  // Standalone REST endpoint so external sites (riodemo) can call
  // via plain fetch() without tRPC client.
  const ALLOWED_ORIGINS = [
    "https://riodemo-ux2sxdqo.manus.space",
    "https://rioprotocol-q9cry3ny.manus.space",
    "https://rio-one.manus.space",
    "https://riodigital-cqy2ymbu.manus.space",
    "http://localhost:3000",
    "http://localhost:5173",
  ];

  app.options("/api/ask-bondi", (req, res) => {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
    }
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Max-Age", "86400");
    res.status(204).end();
  });

  app.post("/api/ask-bondi", async (req, res) => {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
    }

    try {
      const { question } = req.body || {};
      if (!question || typeof question !== "string" || question.length < 1 || question.length > 4000) {
        return res.status(400).json({ error: "question is required (1-4000 chars)" });
      }

      const { invokeLLM } = await import("./llm");

      const BONDI_SYSTEM_PROMPT = `You are Bondi, the implementation assistant for the RIO protocol.

You ONLY answer with concrete, developer-ready implementation guidance.

Always:
  - Explain step-by-step
  - Reference real flow: Intent → Governance → Approval → Execution → Receipt → Ledger
  - Use endpoints, payloads, and sequence
  - Be precise and technical

Never:
  - Speak philosophically
  - Be vague
  - Invent features not in the system

Assume the user is trying to implement:
  - Receipt protocol
  - Gateway integration
  - Governed action pipeline

Key system facts:
  - Gateway URL: https://rio-gateway.onrender.com
  - Principals: I-1 (proposer, root_authority), I-2 (approver, human)
  - Flow: POST /intent → POST /govern → POST /approvals/:id → POST /execute-action
  - Receipts: SHA-256 hash chain, Ed25519 signed, canonical JSON
  - Ledger: append-only, hash-linked, tamper-evident
  - Policy: proposer ≠ approver, HIGH risk requires human approval, fail-closed
  - Receipt Protocol repo: github.com/bkr1297-RIO/rio-receipt-protocol
  - Connectors: Gmail SMTP (send_email), Twilio SMS (send_sms)

If unclear, ask a clarifying question.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: BONDI_SYSTEM_PROMPT },
          { role: "user", content: question },
        ],
      });

      const answer = response.choices?.[0]?.message?.content || "I couldn't generate an answer. Please try again.";
      return res.json({ answer });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Ask Bondi] Error: ${msg}`);
      return res.status(500).json({ error: "Bondi failed", detail: msg });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // ─── Auto-Bootstrap Default Policy (ensures receipts always work) ──
  // On the published site, no user has onboarded through the UI,
  // so there's no active policy in memory. Email approval receipts
  // require an active policy. Bootstrap a default one on startup.
  if (!getActivePolicy()) {
    try {
      const BOOTSTRAP_ROOT_KEY = createHash("sha256")
        .update(`rio-bootstrap-root-${ENV.cookieSecret || "default"}`)
        .digest("hex");
      registerRootAuthority(BOOTSTRAP_ROOT_KEY);
      // Generate a deterministic signature (HMAC of policy hash with root key)
      const policyHash = computePolicyHash("POLICY-BOOTSTRAP-v1.0.0", DEFAULT_POLICY_RULES);
      const bootstrapSignature = createHash("sha256")
        .update(`${policyHash}:${BOOTSTRAP_ROOT_KEY}`)
        .digest("hex");
      activatePolicy({
        policyId: "POLICY-BOOTSTRAP-v1.0.0",
        rules: DEFAULT_POLICY_RULES,
        policySignature: bootstrapSignature,
        rootPublicKey: BOOTSTRAP_ROOT_KEY,
      });
      console.log(`[Startup] Bootstrap policy activated: POLICY-BOOTSTRAP-v1.0.0`);
    } catch (err) {
      console.error(`[Startup] Failed to bootstrap policy:`, err);
    }
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);

    // ─── Drive State Restore (non-blocking, fail-safe) ──────────
    // Runs after server is listening so it doesn't block startup.
    // Reads anchor.json + ledger.json from /RIO/01_PROTOCOL/ on Drive,
    // restores lastReceiptHash for chain continuity, verifies integrity.
    restoreFromDrive().catch((err) => {
      console.log(`[Startup] Drive restore failed (non-blocking): ${err}`);
    });

    // ─── Telegram Webhook Setup (non-blocking) ──────────────────
    // Sets the Telegram webhook URL so the bot receives messages.
    // Uses the published site URL so it works in production.
    // Always use the published HTTPS URL for Telegram webhook
    // (Telegram requires HTTPS, localhost won't work)
    const telegramBaseUrl = "https://rio-one.manus.space";
    setTelegramWebhook(telegramBaseUrl).catch((err) => {
      console.log(`[Startup] Telegram webhook setup failed (non-blocking): ${err}`);
    });
  });
}

startServer().catch(console.error);
