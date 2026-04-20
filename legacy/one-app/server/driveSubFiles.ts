/**
 * RIO Drive Sub-Files — CBS Section 5
 * ─────────────────────────────────────
 * Additional Drive persistence beyond anchor.json + ledger.json.
 *
 * Paths under /RIO/:
 *   02_ENVELOPES/envelopes.json  — every ActionEnvelope
 *   03_DECISIONS/decisions.json  — every GatewayDecision
 *   04_ERRORS/errors.json        — every error
 *   05_APPROVALS/approvals.json  — every approval request + resolution
 *
 * All writes are fail-silent (same as Librarian).
 * Called post-receipt, after the core pipeline has completed.
 */

import type { ActionEnvelope, GatewayDecision } from "./standardReceipt";

// ─── Types ────────────────────────────────────────────────────

export interface EnvelopeLogEntry {
  action_id: string;
  envelope_hash: string;
  actor_id: string;
  actor_type: string;
  intent_type: string;
  resource_id: string;
  risk_level: string;
  timestamp: string;
}

export interface DecisionLogEntry {
  action_id: string;
  result: string;
  message: string;
  cooldown_ms: number;
  requires_confirmation: boolean;
  timestamp: string;
}

export interface ErrorLogEntry {
  action_id: string;
  error_type: string;
  error_message: string;
  context: Record<string, unknown>;
  timestamp: string;
}

export interface ApprovalLogEntry {
  action_id: string;
  proposer_id: string;
  approver_id: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  requested_at: string;
  resolved_at: string | null;
  receipt_id: string | null;
}

// ─── Drive REST Helpers (reuse Librarian pattern) ─────────────

// Parent folder IDs — will be created/cached on first use
const RIO_ROOT_FOLDER_ID = "11UIU99kDafFEQ5Z7nAniZyRfmU-sbBUS"; // /RIO/01_PROTOCOL/

// File ID cache
const fileIdCache: Record<string, string | null> = {
  envelopes: null,
  decisions: null,
  errors: null,
  approvals: null,
};

function getToken(): string | null {
  const gdt = process.env.GOOGLE_DRIVE_TOKEN;
  const gwt = process.env.GOOGLE_WORKSPACE_CLI_TOKEN;
  if (gwt && gwt.length > 30) return gwt;
  if (gdt && gdt.length > 30) return gdt;
  return null;
}

async function driveSearch(name: string, parentId: string): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  const q = encodeURIComponent(`name = '${name}' and '${parentId}' in parents and trashed = false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id ?? null;
}

async function driveCreate(name: string, parentId: string, content: string): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  const boundary = `rio_subfiles_${Date.now()}`;
  const metadata = JSON.stringify({ name, parents: [parentId] });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n` +
    `--${boundary}--`;
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

async function driveUpdate(fileId: string, content: string): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: content,
    },
  );
  return res.ok;
}

async function driveDownload(fileId: string): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  return res.text();
}

async function getOrCreateFile(
  name: string,
  defaultContent: string,
  cacheKey: keyof typeof fileIdCache,
): Promise<string | null> {
  if (fileIdCache[cacheKey]) return fileIdCache[cacheKey];
  const existingId = await driveSearch(name, RIO_ROOT_FOLDER_ID);
  if (existingId) {
    fileIdCache[cacheKey] = existingId;
    return existingId;
  }
  const newId = await driveCreate(name, RIO_ROOT_FOLDER_ID, defaultContent);
  fileIdCache[cacheKey] = newId;
  return newId;
}

async function appendToJsonArray<T>(
  fileName: string,
  cacheKey: keyof typeof fileIdCache,
  entry: T,
): Promise<boolean> {
  try {
    const fileId = await getOrCreateFile(
      fileName,
      JSON.stringify({ entries: [] }),
      cacheKey,
    );
    if (!fileId) return false;

    const raw = await driveDownload(fileId);
    let data: { entries: T[] };
    try {
      data = raw ? JSON.parse(raw) : { entries: [] };
      if (!Array.isArray(data.entries)) data = { entries: [] };
    } catch {
      data = { entries: [] };
    }

    data.entries.push(entry);

    // Keep last 1000 entries to prevent unbounded growth
    if (data.entries.length > 1000) {
      data.entries = data.entries.slice(-1000);
    }

    return driveUpdate(fileId, JSON.stringify(data, null, 2));
  } catch {
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Log an ActionEnvelope to Drive (02_ENVELOPES/envelopes.json).
 * CBS Section 5: "log envelope" on every action.
 */
export async function logEnvelope(envelope: ActionEnvelope): Promise<boolean> {
  const entry: EnvelopeLogEntry = {
    action_id: envelope.action_id,
    envelope_hash: "", // Will be set by caller if needed
    actor_id: envelope.actor.id,
    actor_type: envelope.actor.type,
    intent_type: envelope.intent.type,
    resource_id: envelope.resource.id,
    risk_level: envelope.constraints.risk_level,
    timestamp: envelope.timestamp,
  };

  const ok = await appendToJsonArray("envelopes.json", "envelopes", entry);
  if (ok) console.log(`[DriveSubFiles] Envelope logged: ${envelope.action_id}`);
  else console.log(`[DriveSubFiles] Envelope log failed: ${envelope.action_id}`);
  return ok;
}

/**
 * Log a GatewayDecision to Drive (03_DECISIONS/decisions.json).
 * CBS Section 5: "log decision" on every action.
 */
export async function logDecision(decision: GatewayDecision): Promise<boolean> {
  const entry: DecisionLogEntry = {
    action_id: decision.action_id,
    result: decision.result,
    message: decision.message,
    cooldown_ms: decision.cooldown_ms,
    requires_confirmation: decision.requires_confirmation,
    timestamp: new Date().toISOString(),
  };

  const ok = await appendToJsonArray("decisions.json", "decisions", entry);
  if (ok) console.log(`[DriveSubFiles] Decision logged: ${decision.action_id} → ${decision.result}`);
  else console.log(`[DriveSubFiles] Decision log failed: ${decision.action_id}`);
  return ok;
}

/**
 * Log an error to Drive (04_ERRORS/errors.json).
 * CBS Section 5: "log errors (if any)".
 */
export async function logError(
  actionId: string,
  errorType: string,
  errorMessage: string,
  context: Record<string, unknown> = {},
): Promise<boolean> {
  const entry: ErrorLogEntry = {
    action_id: actionId,
    error_type: errorType,
    error_message: errorMessage,
    context,
    timestamp: new Date().toISOString(),
  };

  const ok = await appendToJsonArray("errors.json", "errors", entry);
  if (ok) console.log(`[DriveSubFiles] Error logged: ${actionId} — ${errorType}`);
  else console.log(`[DriveSubFiles] Error log failed: ${actionId}`);
  return ok;
}

/**
 * Log an approval request/resolution to Drive (05_APPROVALS/approvals.json).
 * CBS Section 5 + Section 10.
 */
export async function logApproval(entry: ApprovalLogEntry): Promise<boolean> {
  const ok = await appendToJsonArray("approvals.json", "approvals", entry);
  if (ok) console.log(`[DriveSubFiles] Approval logged: ${entry.action_id} → ${entry.status}`);
  else console.log(`[DriveSubFiles] Approval log failed: ${entry.action_id}`);
  return ok;
}

/**
 * Read approvals from Drive (for approval queue display).
 */
export async function readApprovals(): Promise<ApprovalLogEntry[]> {
  try {
    const fileId = await getOrCreateFile(
      "approvals.json",
      JSON.stringify({ entries: [] }),
      "approvals",
    );
    if (!fileId) return [];
    const raw = await driveDownload(fileId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { entries?: ApprovalLogEntry[] };
    return parsed.entries ?? [];
  } catch {
    return [];
  }
}

/**
 * Reset cached file IDs (for testing).
 */
export function resetSubFilesCache(): void {
  fileIdCache.envelopes = null;
  fileIdCache.decisions = null;
  fileIdCache.errors = null;
  fileIdCache.approvals = null;
}
