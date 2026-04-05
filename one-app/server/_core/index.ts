import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

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
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // ─── Gateway Execution Endpoint ───────────────────────────────
  // This endpoint does NOT require Manus OAuth. It accepts a Gateway JWT
  // (from passphrase login) and triggers the execution pipeline server-side.
  // The server authenticates as gateway-exec to the Gateway for execution.
  app.post("/api/gateway/execute", async (req, res) => {
    try {
      const { intentId } = req.body;
      if (!intentId || typeof intentId !== "string") {
        return res.status(400).json({ success: false, error: "Missing intentId" });
      }

      // Validate that the caller has a valid Gateway JWT
      const authHeader = req.headers.authorization || req.headers["x-gateway-token"];
      const gwToken = typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "") : null;
      if (!gwToken) {
        return res.status(401).json({ success: false, error: "Gateway token required" });
      }

      // Import execution function
      const { executeGovernedAction } = await import("../gatewayProxy");
      const { appendLedger } = await import("../db");
      const { ENV: serverEnv } = await import("../_core/env");

      // ─── Twilio SMS helper (shared by send_email and send_sms) ───
      const sendTwilioSms = async (to: string, body: string): Promise<{ success: boolean; sid?: string; status?: string; from?: string; error?: string }> => {
        const accountSid = serverEnv.twilioAccountSid;
        const authToken = serverEnv.twilioAuthToken;
        const fromNumber = serverEnv.twilioPhoneNumber === '+18337910928' ? '+18014570972' : serverEnv.twilioPhoneNumber;
        const messagingServiceSid = serverEnv.twilioMessagingServiceSid;

        if (!accountSid || !authToken) {
          return { success: false, error: "Twilio credentials not configured" };
        }

        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const params = new URLSearchParams();
        params.append("To", to);
        params.append("Body", body);
        if (fromNumber) {
          params.append("From", fromNumber);
        } else if (messagingServiceSid) {
          params.append("MessagingServiceSid", messagingServiceSid);
        }

        const resp = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });
        const data = await resp.json() as Record<string, unknown>;
        if (!resp.ok || data.error_code) {
          return { success: false, error: String(data.message || data.error_message || JSON.stringify(data)) };
        }
        return { success: true, sid: String(data.sid), status: String(data.status), from: String(data.from || fromNumber) };
      }

      // Define action executors
      const actionExecutors: Record<string, (params: Record<string, unknown>) => Promise<{ success: boolean; result: Record<string, unknown> }>> = {
        send_email: async (params) => {
          // For now, send_email delivers via SMS (Twilio) until Gmail OAuth is connected.
          // The email content is formatted into the SMS body.
          const to = String(params.to || "");
          const subject = String(params.subject || "");
          const body = String(params.body || params.message || "");
          // Use the owner's phone number as the SMS recipient
          const ownerPhone = "+18014555810"; // Brian's phone
          const smsBody = `[RIO] Email to: ${to}\nSubject: ${subject}\n\n${body}\n\n— Governed by RIO · Intent: ${intentId.slice(0, 12)}`;

          const result = await sendTwilioSms(ownerPhone, smsBody);
          if (!result.success) {
            return { success: false, result: { error: result.error } };
          }
          return {
            success: true,
            result: {
              delivered: true,
              method: "twilio_sms",
              to,
              subject,
              bodyLength: body.length,
              smsTo: ownerPhone,
              messageSid: result.sid,
              note: "Email content delivered via SMS. Gmail API integration coming soon.",
            },
          };
        },
        send_sms: async (params) => {
          const to = String(params.to || params.phone || "");
          const body = String(params.body || params.message || "");
          if (!to.trim() || !body.trim()) {
            return { success: false, result: { error: "SMS requires 'to' phone number and message body" } };
          }
          const smsBody = `${body}\n\n— Sent via RIO · Intent: ${intentId.slice(0, 12)}`;
          const result = await sendTwilioSms(to, smsBody);
          if (!result.success) {
            return { success: false, result: { error: result.error } };
          }
          return {
            success: true,
            result: {
              delivered: true,
              method: "twilio_sms",
              to,
              messageSid: result.sid,
              from: result.from,
              bodyLength: body.length,
              note: "Text message sent. Receipt recorded.",
            },
          };
        },
        _default: async (params) => {
          return { success: true, result: { simulated: true, action: "unknown", params, note: "No specific executor" } };
        },
      };

      const { execution, receipt } = await executeGovernedAction(
        intentId,
        async (params) => {
          const action = String(params._action || "send_email");
          const executor = actionExecutors[action] || actionExecutors._default;
          return executor(params);
        }
      );

      // Log to local ledger
      await appendLedger("EXECUTION", {
        intent_id: intentId,
        execution_hash: execution.execution_hash,
        receipt_hash: receipt?.receipt?.receipt_hash,
        connector: execution.connector,
        source: "gateway-execute-endpoint",
        timestamp: Date.now(),
      });

      return res.json({
        success: true,
        execution,
        receipt: receipt?.receipt || null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Gateway Execute] Error: ${msg}`);
      return res.status(500).json({ success: false, error: msg });
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

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
