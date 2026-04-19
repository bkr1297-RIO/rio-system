/**
 * Public Verification API
 *
 * Exposes a REST endpoint at /api/verify/:identifier that anyone can call
 * to verify a RIO receipt against the persistent ledger.
 *
 * This is a public, read-only endpoint — no authentication required.
 * It is intentionally separate from the tRPC router so that external
 * systems (including the protocol site) can call it cross-origin.
 *
 * Supports lookup by:
 *   - Receipt ID (e.g., RIO-ABCD1234)
 *   - Receipt Hash (64-char hex SHA-256)
 *   - Intent ID (e.g., INT-ABCD1234)
 *
 * Also exposes:
 *   GET /api/verify/ledger/chain — full ledger chain with integrity check
 *   GET /api/verify/ledger/stats — ledger statistics
 *   GET /api/verify/public-key  — Ed25519 public key for independent verification
 */

import { Express, Request, Response } from "express";
import { eq, desc, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { getDb } from "./db";
import { receipts, ledger, intents, approvals, executions } from "../drizzle/schema";

// ── Ed25519 Key Pair (same derivation as rio.ts) ─────────────────────────

function deriveEd25519PublicKey(): crypto.KeyObject {
  const secret = process.env.JWT_SECRET || "rio-default-dev-secret";
  const seed = crypto.createHash("sha256").update(secret).digest();
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed,
    ]),
    format: "der",
    type: "pkcs8",
  });
  return crypto.createPublicKey(privateKey);
}

function verifySignature(data: string, sig: string, pubKey: crypto.KeyObject): boolean {
  try {
    return crypto.verify(null, Buffer.from(data), pubKey, Buffer.from(sig, "hex"));
  } catch {
    return false;
  }
}

// ── Route Registration ───────────────────────────────────────────────────

export function registerVerifyRoutes(app: Express) {
  const publicKey = deriveEd25519PublicKey();

  // CORS headers for cross-origin access (protocol site, external verifiers)
  app.use("/api/verify", (_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (_req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // ── GET /api/verify/public-key ─────────────────────────────────────
  app.get("/api/verify/public-key", (_req: Request, res: Response) => {
    const raw = publicKey.export({ type: "spki", format: "der" });
    const hex = (raw as Buffer).toString("hex");
    const pem = publicKey.export({ type: "spki", format: "pem" });

    res.json({
      algorithm: "Ed25519",
      format: "SPKI",
      hex,
      pem: pem.toString(),
      usage: "Verify receipt and ledger signatures. Use crypto.verify(null, data, publicKey, signature) with Node.js crypto module.",
      system: "RIO Governance Gateway v2.0",
      failMode: "CLOSED",
    });
  });

  // ── GET /api/verify/ledger/chain ───────────────────────────────────
  app.get("/api/verify/ledger/chain", async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) {
        return res.status(503).json({
          status: "SYSTEM_OFFLINE",
          message: "Ledger is offline. Fail-closed: no verification possible.",
          chainValid: false,
        });
      }

      const limit = Math.min(parseInt(_req.query.limit as string) || 50, 200);
      const entries = await db.select().from(ledger).orderBy(desc(ledger.id)).limit(limit);
      const chain = entries.reverse();

      // Verify chain integrity
      let chainValid = true;
      const chainErrors: string[] = [];
      for (let i = 1; i < chain.length; i++) {
        if (chain[i].previousHash !== chain[i - 1].currentHash) {
          chainValid = false;
          chainErrors.push(
            `Break at block ${i}: expected previous_hash=${chain[i - 1].currentHash?.slice(0, 16)}... got ${chain[i].previousHash?.slice(0, 16)}...`
          );
        }
      }

      // Verify signatures
      let signaturesValid = true;
      for (const entry of chain) {
        if (entry.ledgerSignature && entry.currentHash) {
          const valid = verifySignature(entry.currentHash, entry.ledgerSignature, publicKey);
          if (!valid) {
            signaturesValid = false;
            chainErrors.push(`Invalid signature on block ${entry.blockId}`);
          }
        }
      }

      res.json({
        status: "ONLINE",
        entries: chain.map((l) => ({
          block_id: l.blockId,
          intent_id: l.intentId,
          action: l.action,
          decision: l.decision,
          receipt_hash: l.receiptHash,
          previous_hash: l.previousHash,
          current_hash: l.currentHash,
          signature_valid: l.ledgerSignature && l.currentHash
            ? verifySignature(l.currentHash, l.ledgerSignature, publicKey)
            : null,
          protocol_version: l.protocolVersion,
          timestamp: l.timestamp?.toISOString(),
          recorded_by: l.recordedBy,
        })),
        total: chain.length,
        chainValid,
        signaturesValid,
        chainErrors,
        verifiedAt: new Date().toISOString(),
        system: "RIO Governance Gateway v2.0",
        failMode: "CLOSED",
      });
    } catch (err) {
      console.error("[Verify API] Ledger chain error:", err);
      res.status(500).json({
        status: "ERROR",
        message: "Ledger verification failed. Fail-closed.",
        chainValid: false,
      });
    }
  });

  // ── GET /api/verify/ledger/stats ───────────────────────────────────
  app.get("/api/verify/ledger/stats", async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) {
        return res.status(503).json({ status: "SYSTEM_OFFLINE" });
      }

      const ledgerCount = await db.select({ count: sql<number>`count(*)` }).from(ledger);
      const receiptCount = await db.select({ count: sql<number>`count(*)` }).from(receipts);
      const intentCount = await db.select({ count: sql<number>`count(*)` }).from(intents);

      // Get latest entry
      const latest = await db.select().from(ledger).orderBy(desc(ledger.id)).limit(1);
      const genesis = await db.select().from(ledger).orderBy(ledger.id).limit(1);

      res.json({
        status: "ONLINE",
        ledger_entries: Number(ledgerCount[0]?.count ?? 0),
        receipts: Number(receiptCount[0]?.count ?? 0),
        intents: Number(intentCount[0]?.count ?? 0),
        latest_block: latest[0] ? {
          block_id: latest[0].blockId,
          current_hash: latest[0].currentHash,
          timestamp: latest[0].timestamp?.toISOString(),
        } : null,
        genesis_block: genesis[0] ? {
          block_id: genesis[0].blockId,
          current_hash: genesis[0].currentHash,
          timestamp: genesis[0].timestamp?.toISOString(),
        } : null,
        verifiedAt: new Date().toISOString(),
        system: "RIO Governance Gateway v2.0",
        failMode: "CLOSED",
      });
    } catch (err) {
      console.error("[Verify API] Stats error:", err);
      res.status(500).json({ status: "ERROR" });
    }
  });

  // ── GET /api/verify/:identifier ────────────────────────────────────
  // Accepts receipt ID, receipt hash, or intent ID
  app.get("/api/verify/:identifier", async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) {
        return res.status(503).json({
          status: "SYSTEM_OFFLINE",
          message: "Verification system is offline. Fail-closed: cannot verify.",
          receipt_valid: false,
          ledger_valid: false,
          signature_valid: false,
        });
      }

      const { identifier } = req.params;

      // Try to find receipt by ID, hash, or intent ID
      let receiptRows = await db.select().from(receipts).where(eq(receipts.receiptId, identifier)).limit(1);

      if (receiptRows.length === 0) {
        // Try by receipt hash
        receiptRows = await db.select().from(receipts).where(eq(receipts.receiptHash, identifier)).limit(1);
      }

      if (receiptRows.length === 0) {
        // Try by intent ID — return the latest receipt for that intent
        receiptRows = await db.select().from(receipts).where(eq(receipts.intentId, identifier)).orderBy(desc(receipts.id)).limit(1);
      }

      if (receiptRows.length === 0) {
        return res.status(404).json({
          status: "NOT_FOUND",
          identifier,
          message: "No receipt found matching this identifier. The receipt may not exist or may have been issued by a different RIO instance.",
          receipt_valid: false,
          ledger_valid: false,
          signature_valid: false,
        });
      }

      const r = receiptRows[0];

      // 1. Verify receipt hash format
      const hashValid = !!r.receiptHash && r.receiptHash.length === 64 && /^[0-9a-f]{64}$/.test(r.receiptHash);

      // 2. Verify Ed25519 signature over the receipt hash
      let signatureValid = false;
      if (r.signature && r.receiptHash) {
        signatureValid = verifySignature(r.receiptHash, r.signature, publicKey);
      }

      // 3. Check ledger entry exists and verify its chain position
      const ledgerRows = await db.select().from(ledger).where(eq(ledger.receiptHash, r.receiptHash ?? "")).limit(1);
      const ledgerRecorded = ledgerRows.length > 0;

      let ledgerSignatureValid = false;
      let chainPosition: number | null = null;
      if (ledgerRecorded && ledgerRows[0].ledgerSignature && ledgerRows[0].currentHash) {
        ledgerSignatureValid = verifySignature(
          ledgerRows[0].currentHash,
          ledgerRows[0].ledgerSignature,
          publicKey
        );
        // Get chain position
        const posResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(ledger)
          .where(sql`id <= ${ledgerRows[0].id}`);
        chainPosition = Number(posResult[0]?.count ?? 0);
      }

      // 4. Get intent details
      const intentRows = await db.select().from(intents).where(eq(intents.intentId, r.intentId)).limit(1);
      const intent = intentRows[0];

      // 5. Get approval details
      const approvalRows = await db.select().from(approvals).where(eq(approvals.intentId, r.intentId)).limit(1);
      const approval = approvalRows[0];

      // Overall validity
      const receiptValid = hashValid && signatureValid;
      const fullyVerified = receiptValid && ledgerRecorded && ledgerSignatureValid;

      res.json({
        status: fullyVerified ? "VERIFIED" : receiptValid ? "PARTIALLY_VERIFIED" : "INVALID",
        identifier,

        // Verification results
        receipt_valid: receiptValid,
        hash_valid: hashValid,
        signature_valid: signatureValid,
        ledger_recorded: ledgerRecorded,
        ledger_signature_valid: ledgerSignatureValid,
        chain_position: chainPosition,
        fully_verified: fullyVerified,

        // Receipt data
        receipt: {
          receipt_id: r.receiptId,
          intent_id: r.intentId,
          intent_hash: r.intentHash,
          action: r.action,
          action_hash: r.actionHash,
          requested_by: r.requestedBy,
          approved_by: r.approvedBy,
          decision: r.decision,
          execution_status: r.decision === "approved" ? "EXECUTED" : "BLOCKED",
          timestamp_request: r.timestampRequest?.toISOString(),
          timestamp_approval: r.timestampApproval?.toISOString(),
          timestamp_execution: r.timestampExecution?.toISOString(),
          verification_status: r.verificationStatus,
          verification_hash: r.verificationHash,
          risk_score: r.riskScore,
          risk_level: r.riskLevel,
          policy_decision: r.policyDecision,
          policy_rule_id: r.policyRuleId,
          receipt_hash: r.receiptHash,
          previous_hash: r.previousHash,
          protocol_version: r.protocolVersion,
        },

        // Ledger entry (if recorded)
        ledger_entry: ledgerRecorded ? {
          block_id: ledgerRows[0].blockId,
          receipt_hash: ledgerRows[0].receiptHash,
          previous_hash: ledgerRows[0].previousHash,
          current_hash: ledgerRows[0].currentHash,
          protocol_version: ledgerRows[0].protocolVersion,
          timestamp: ledgerRows[0].timestamp?.toISOString(),
        } : null,

        // Context
        intent: intent ? {
          action: intent.action,
          description: intent.description,
          requested_by: intent.requestedBy,
          status: intent.status,
          created_at: intent.createdAt?.toISOString(),
        } : null,

        approval: approval ? {
          decision: approval.decision,
          decided_by: approval.decidedBy,
          decided_at: approval.decidedAt?.toISOString(),
        } : null,

        // Metadata
        verified_at: new Date().toISOString(),
        system: "RIO Governance Gateway v2.0",
        fail_mode: "CLOSED",
        algorithm: "Ed25519",
        note: fullyVerified
          ? "This receipt is independently verifiable. The action was governed, authorized, executed, and recorded in the tamper-evident ledger."
          : receiptValid
            ? "Receipt signature is valid but ledger entry could not be fully verified."
            : "Verification failed. The receipt may have been tampered with or issued by a different system.",
      });
    } catch (err) {
      console.error("[Verify API] Verification error:", err);
      res.status(500).json({
        status: "ERROR",
        message: "Verification failed. Fail-closed.",
        receipt_valid: false,
        ledger_valid: false,
        signature_valid: false,
      });
    }
  });

  console.log("[RIO] Public verification API registered at /api/verify/*");
}
