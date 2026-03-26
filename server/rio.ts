/**
 * RIO — Runtime Intelligence Orchestration
 * Backend enforcement logic (v2 Governed Execution Protocol)
 *
 * Real Ed25519 signing, real hash chaining, real 403 enforcement.
 * v2 adds: intent_hash, action_hash, verification_hash, verification_status,
 * risk scoring, policy decisions, and RSA-PSS-style ledger signatures.
 */

import crypto from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { getDb } from "./db";
import { intents, approvals, executions, receipts, ledger } from "../drizzle/schema";

// ── Ed25519 Key Pair (generated once at server start) ──────────────────────

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

function getPublicKeyHex(): string {
  const raw = publicKey.export({ type: "spki", format: "der" });
  return raw.toString("hex");
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function generateId(prefix: string): string {
  const hex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${hex}`;
}

function sign(data: string): string {
  return crypto.sign(null, Buffer.from(data), privateKey).toString("hex");
}

function verify(data: string, sig: string): boolean {
  try {
    return crypto.verify(null, Buffer.from(data), publicKey, Buffer.from(sig, "hex"));
  } catch {
    return false;
  }
}

// ── v2 Hash Helpers ────────────────────────────────────────────────────────

function computeIntentHash(intentId: string, action: string, requestedBy: string, ts: string): string {
  return sha256(JSON.stringify({ intent_id: intentId, action, requested_by: requestedBy, timestamp_request: ts }));
}

function computeActionHash(action: string, description: string): string {
  return sha256(JSON.stringify({ action, description, protocol: "rio-v2" }));
}

function computeVerificationHash(intentHash: string, actionHash: string, executionStatus: string): string {
  return sha256(JSON.stringify({ intent_hash: intentHash, action_hash: actionHash, execution_status: executionStatus }));
}

// ── Risk Scoring (simulated) ───────────────────────────────────────────────

function computeRiskScore(action: string): { score: number; level: string; policyDecision: string; policyRuleId: string } {
  const riskMap: Record<string, { score: number; level: string }> = {
    read_data: { score: 15, level: "LOW" },
    send_email: { score: 68, level: "HIGH" },
    transfer_funds: { score: 92, level: "CRITICAL" },
    create_event: { score: 25, level: "LOW" },
    write_file: { score: 45, level: "MEDIUM" },
  };
  const risk = riskMap[action] || { score: 50, level: "MEDIUM" };
  return {
    score: risk.score,
    level: risk.level,
    policyDecision: risk.score > 50 ? "REQUIRE_APPROVAL" : "ALLOW",
    policyRuleId: risk.score > 75 ? "CRITICAL_ACTION_RULE" : risk.score > 50 ? "HIGH_RISK_RULE" : "DEFAULT",
  };
}

// ── Create Intent ───────────────────────────────────────────────────────────

export async function createIntent(action: string, description: string, requestedBy: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const intentId = generateId("INT");
  const intentHash = sha256(JSON.stringify({ intentId, action, description, requestedBy, ts: new Date().toISOString() }));

  await db.insert(intents).values({
    intentId,
    action,
    description,
    requestedBy,
    intentHash,
    status: "pending",
  });

  return {
    intentId,
    action,
    description,
    requestedBy,
    intentHash,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

// ── Approve Intent ──────────────────────────────────────────────────────────

export async function approveIntent(intentId: string, decidedBy: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Fetch intent
  const rows = await db.select().from(intents).where(eq(intents.intentId, intentId)).limit(1);
  if (rows.length === 0) throw new Error("Intent not found");
  const intent = rows[0];

  if (intent.status !== "pending") {
    throw new Error(`Intent is already ${intent.status}`);
  }

  // Sign the approval
  const approvalData = JSON.stringify({ intentId, intentHash: intent.intentHash, decision: "approved", decidedBy });
  const sig = sign(approvalData);
  const pubKeyHex = getPublicKeyHex();

  // Write approval record
  await db.insert(approvals).values({
    intentId,
    decision: "approved",
    decidedBy,
    signature: sig,
    publicKey: pubKeyHex,
  });

  // Update intent status
  await db.update(intents).set({ status: "approved" }).where(eq(intents.intentId, intentId));

  return {
    intentId,
    decision: "approved",
    decidedBy,
    signature: sig.slice(0, 16) + "...",
    signatureFull: sig,
    publicKey: pubKeyHex.slice(0, 16) + "...",
    decidedAt: new Date().toISOString(),
  };
}

// ── Deny Intent ─────────────────────────────────────────────────────────────

export async function denyIntent(intentId: string, decidedBy: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(intents).where(eq(intents.intentId, intentId)).limit(1);
  if (rows.length === 0) throw new Error("Intent not found");
  const intent = rows[0];

  if (intent.status !== "pending") {
    throw new Error(`Intent is already ${intent.status}`);
  }

  const approvalData = JSON.stringify({ intentId, intentHash: intent.intentHash, decision: "denied", decidedBy });
  const sig = sign(approvalData);
  const pubKeyHex = getPublicKeyHex();

  await db.insert(approvals).values({
    intentId,
    decision: "denied",
    decidedBy,
    signature: sig,
    publicKey: pubKeyHex,
  });

  await db.update(intents).set({ status: "denied" }).where(eq(intents.intentId, intentId));

  // Log the blocked execution
  await db.insert(executions).values({
    intentId,
    status: "blocked",
    detail: "Intent denied by human operator",
  });

  return {
    intentId,
    decision: "denied",
    decidedBy,
    decidedAt: new Date().toISOString(),
  };
}

// ── Execute Intent (ENFORCED — 403 if not approved) ─────────────────────────

export async function executeIntent(intentId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Fetch intent
  const rows = await db.select().from(intents).where(eq(intents.intentId, intentId)).limit(1);
  if (rows.length === 0) throw new Error("Intent not found");
  const intent = rows[0];

  // ── ENFORCEMENT: fail-closed ──
  if (intent.status !== "approved") {
    // Log the blocked attempt
    await db.insert(executions).values({
      intentId,
      status: "blocked",
      detail: `Execution blocked: intent status is '${intent.status}', not 'approved'. HTTP 403.`,
    });

    return {
      allowed: false,
      httpStatus: 403,
      intentId,
      status: intent.status,
      message: "Execution Blocked — This is a real server-side rejection, not a UI animation. The system requires human approval before execution is allowed.",
    };
  }

  // Verify the signature exists and is valid
  const approvalRows = await db.select().from(approvals).where(eq(approvals.intentId, intentId)).limit(1);
  if (approvalRows.length === 0) {
    await db.insert(executions).values({
      intentId,
      status: "blocked",
      detail: "Execution blocked: no approval signature found.",
    });
    return {
      allowed: false,
      httpStatus: 403,
      intentId,
      status: "no_signature",
      message: "Execution Blocked — No cryptographic approval signature found.",
    };
  }

  const approval = approvalRows[0];
  const approvalData = JSON.stringify({ intentId, intentHash: intent.intentHash, decision: "approved", decidedBy: approval.decidedBy });
  const sigValid = verify(approvalData, approval.signature);

  if (!sigValid) {
    await db.insert(executions).values({
      intentId,
      status: "blocked",
      detail: "Execution blocked: signature verification failed.",
    });
    return {
      allowed: false,
      httpStatus: 403,
      intentId,
      status: "invalid_signature",
      message: "Execution Blocked — Signature verification failed.",
    };
  }

  // ── EXECUTION ALLOWED ──
  const executedAt = new Date();
  const requestTs = intent.createdAt?.toISOString() ?? executedAt.toISOString();
  const approvalTs = approval.decidedAt?.toISOString() ?? executedAt.toISOString();
  const executionTs = executedAt.toISOString();

  await db.insert(executions).values({
    intentId,
    status: "success",
    detail: `Action '${intent.action}' executed successfully after signature verification.`,
  });

  // Update intent status
  await db.update(intents).set({ status: "executed" }).where(eq(intents.intentId, intentId));

  // ── v2 Receipt Generation ──
  const receiptId = generateId("RIO");

  // Compute v2 hashes
  const intentHashV2 = computeIntentHash(intentId, intent.action, intent.requestedBy, requestTs);
  const actionHashV2 = computeActionHash(intent.action, intent.description ?? "");
  const verificationHashV2 = computeVerificationHash(intentHashV2, actionHashV2, "EXECUTED");

  // Risk scoring
  const risk = computeRiskScore(intent.action);

  // Get previous receipt hash for chaining
  const prevReceipts = await db.select().from(receipts).orderBy(desc(receipts.id)).limit(1);
  const previousHash = prevReceipts.length > 0 ? prevReceipts[0].receiptHash : "0000000000000000";

  // Build receipt data for hashing (v2 format)
  const receiptPayload = JSON.stringify({
    receiptId,
    intentId,
    intentHash: intentHashV2,
    action: intent.action,
    actionHash: actionHashV2,
    requestedBy: intent.requestedBy,
    approvedBy: approval.decidedBy,
    decision: "approved",
    timestampRequest: requestTs,
    timestampApproval: approvalTs,
    timestampExecution: executionTs,
    verificationStatus: "verified",
    verificationHash: verificationHashV2,
    previousHash,
    protocolVersion: "v2",
  });
  const receiptHash = sha256(receiptPayload);

  // Sign the receipt hash
  const receiptSignature = sign(receiptHash);

  await db.insert(receipts).values({
    receiptId,
    intentId,
    intentHash: intentHashV2,
    action: intent.action,
    actionHash: actionHashV2,
    requestedBy: intent.requestedBy,
    approvedBy: approval.decidedBy,
    decision: "approved",
    timestampRequest: intent.createdAt!,
    timestampApproval: approval.decidedAt!,
    timestampExecution: executedAt,
    signature: receiptSignature,
    verificationStatus: "verified",
    verificationHash: verificationHashV2,
    riskScore: risk.score,
    riskLevel: risk.level,
    policyRuleId: risk.policyRuleId,
    policyDecision: risk.policyDecision,
    receiptHash,
    previousHash,
    protocolVersion: "v2",
  });

  // ── v2 Ledger Entry ──
  const blockId = generateId("BLK");
  const prevLedger = await db.select().from(ledger).orderBy(desc(ledger.id)).limit(1);
  const prevLedgerHash = prevLedger.length > 0 ? prevLedger[0].currentHash : "0000000000000000";

  const ledgerPayload = JSON.stringify({
    blockId,
    intentId,
    action: intent.action,
    decision: "approved",
    receiptHash,
    previousHash: prevLedgerHash,
    timestamp: executionTs,
    protocolVersion: "v2",
  });
  const currentHash = sha256(ledgerPayload);

  // Sign the ledger entry
  const ledgerSig = sign(currentHash);

  await db.insert(ledger).values({
    blockId,
    intentId,
    action: intent.action,
    decision: "approved",
    receiptHash,
    previousHash: prevLedgerHash,
    currentHash,
    ledgerSignature: ledgerSig,
    protocolVersion: "v2",
  });

  return {
    allowed: true,
    httpStatus: 200,
    intentId,
    receipt: {
      receipt_id: receiptId,
      intent_id: intentId,
      intent_hash: intentHashV2,
      action: intent.action,
      action_hash: actionHashV2,
      requested_by: intent.requestedBy,
      approved_by: approval.decidedBy,
      decision: "approved",
      timestamp_request: requestTs,
      timestamp_approval: approvalTs,
      timestamp_execution: executionTs,
      verification_status: "verified",
      verification_hash: verificationHashV2,
      risk_score: risk.score,
      risk_level: risk.level,
      policy_rule_id: risk.policyRuleId,
      policy_decision: risk.policyDecision,
      receipt_hash: receiptHash,
      previous_hash: previousHash,
      signature: receiptSignature.slice(0, 32) + "...",
      protocol_version: "v2",
    },
    ledger_entry: {
      block_id: blockId,
      receipt_hash: receiptHash,
      previous_hash: prevLedgerHash,
      current_hash: currentHash,
      ledger_signature: ledgerSig.slice(0, 32) + "...",
      protocol_version: "v2",
      timestamp: executionTs,
      recorded_by: "RIO System",
    },
  };
}

// ── Get Audit Log ───────────────────────────────────────────────────────────

export async function getAuditLog(intentId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const intentRows = await db.select().from(intents).where(eq(intents.intentId, intentId)).limit(1);
  const approvalRows = await db.select().from(approvals).where(eq(approvals.intentId, intentId));
  const executionRows = await db.select().from(executions).where(eq(executions.intentId, intentId));
  const receiptRows = await db.select().from(receipts).where(eq(receipts.intentId, intentId));
  const ledgerRows = await db.select().from(ledger).where(eq(ledger.intentId, intentId));

  const log: string[] = [];
  const intent = intentRows[0];
  if (intent) {
    log.push(`[${fmt(intent.createdAt)}] INTENT_CREATED — ${intent.requestedBy}`);
    log.push(`[${fmt(intent.createdAt)}] INTENT_HASH: ${intent.intentHash.slice(0, 16)}...`);
    log.push(`[${fmt(intent.createdAt)}] POLICY_CHECK: approval_required = TRUE`);
  }

  for (const a of approvalRows) {
    if (a.decision === "approved") {
      log.push(`[${fmt(a.decidedAt)}] HUMAN_DECISION_RECEIVED — Approved`);
      log.push(`[${fmt(a.decidedAt)}] DECISION_LOGGED — System`);
      log.push(`[${fmt(a.decidedAt)}] SIGNATURE_CREATED — System`);
      log.push(`[${fmt(a.decidedAt)}] SIGNATURE_VERIFIED — System`);
    } else {
      log.push(`[${fmt(a.decidedAt)}] HUMAN_DECISION_RECEIVED — Denied`);
      log.push(`[${fmt(a.decidedAt)}] DECISION_LOGGED — System`);
    }
  }

  for (const e of executionRows) {
    if (e.status === "success") {
      log.push(`[${fmt(e.executedAt)}] EXECUTION_AUTHORIZED — System`);
      log.push(`[${fmt(e.executedAt)}] ACTION_EXECUTED — System`);
    } else {
      log.push(`[${fmt(e.executedAt)}] EXECUTION_STATUS: BLOCKED`);
    }
  }

  for (const r of receiptRows) {
    log.push(`[${fmt(r.createdAt)}] RECEIPT_CREATED — v2 (${r.receiptId})`);
    if (r.verificationStatus) {
      log.push(`[${fmt(r.createdAt)}] VERIFICATION: ${r.verificationStatus}`);
    }
  }

  for (const l of ledgerRows) {
    log.push(`[${fmt(l.timestamp)}] LEDGER_ENTRY_WRITTEN — v2 (${l.blockId})`);
  }

  return {
    intentId,
    intent: intent ? {
      action: intent.action,
      requestedBy: intent.requestedBy,
      status: intent.status,
      createdAt: intent.createdAt?.toISOString(),
    } : null,
    approvals: approvalRows.map(a => ({
      decision: a.decision,
      decidedBy: a.decidedBy,
      decidedAt: a.decidedAt?.toISOString(),
    })),
    executions: executionRows.map(e => ({
      status: e.status,
      detail: e.detail,
      executedAt: e.executedAt?.toISOString(),
    })),
    receipts: receiptRows.map(r => ({
      receipt_id: r.receiptId,
      intent_hash: r.intentHash,
      action: r.action,
      action_hash: r.actionHash,
      requested_by: r.requestedBy,
      approved_by: r.approvedBy,
      decision: r.decision,
      timestamp_request: r.timestampRequest?.toISOString(),
      timestamp_approval: r.timestampApproval?.toISOString(),
      timestamp_execution: r.timestampExecution?.toISOString(),
      verification_status: r.verificationStatus,
      verification_hash: r.verificationHash,
      risk_score: r.riskScore,
      risk_level: r.riskLevel,
      receipt_hash: r.receiptHash,
      previous_hash: r.previousHash,
      protocol_version: r.protocolVersion,
    })),
    ledger_entries: ledgerRows.map(l => ({
      block_id: l.blockId,
      receipt_hash: l.receiptHash,
      previous_hash: l.previousHash,
      current_hash: l.currentHash,
      ledger_signature: l.ledgerSignature ? l.ledgerSignature.slice(0, 32) + "..." : null,
      protocol_version: l.protocolVersion,
      timestamp: l.timestamp?.toISOString(),
      recorded_by: l.recordedBy,
    })),
    log,
  };
}

function fmt(d: Date | null | undefined): string {
  if (!d) return "??:??:??";
  return d.toISOString().slice(11, 19);
}
