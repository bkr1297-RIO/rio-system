import { readFileSync, existsSync } from "fs";

/**
 * RIO Librarian — Drive Sync Layer
 * ─────────────────────────────────
 * External, human-readable mirror of system state + ledger.
 * Lives in /RIO/01_PROTOCOL/ on the owner's Google Drive.
 *
 * Two files:
 *   anchor.json  — overwritten after each governed action (current state snapshot)
 *   ledger.json  — append-only (each entry is a receipt summary)
 *
 * Constraints:
 *   - Mirror only — does NOT modify Gateway/Postgres ledger
 *   - Fail silent — Drive write failures are logged, never block execution
 *   - Called post-receipt, after the core pipeline has completed
 */

// ─── Types ─────────────────────────────────────────────────────

export interface AnchorState {
  last_receipt_hash: string;
  last_receipt_id: string;
  timestamp: string; // ISO 8601
  system_state: "ACTIVE" | "PAUSED" | "ERROR";
  snapshot_hash: string;
}

export interface LedgerEntry {
  receipt_id: string;
  receipt_hash: string;
  previous_receipt_hash: string;
  proposer_id: string;
  approver_id: string;
  decision: string;
  timestamp: string; // ISO 8601
}

// ─── Configuration ─────────────────────────────────────────────

const PROTOCOL_FOLDER_ID = "11UIU99kDafFEQ5Z7nAniZyRfmU-sbBUS"; // /RIO/01_PROTOCOL/

// File IDs are cached after first lookup/creation
let anchorFileId: string | null = null;
let ledgerFileId: string | null = null;

// ─── Drive REST Helpers ────────────────────────────────────────

function getToken(): string | null {
  // 1. Check env vars (set via webdev_request_secrets or sandbox env)
  const gdt = process.env.GOOGLE_DRIVE_TOKEN;
  const gwt = process.env.GOOGLE_WORKSPACE_CLI_TOKEN;
  
  // Prefer the longer token (short ones may be truncated by secret store)
  if (gwt && gwt.length > 30) return gwt;
  if (gdt && gdt.length > 30) return gdt;

  // 2. Try reading from rclone config (sandbox-only, auto-refreshed by gws CLI)
  try {
    const configPath = "/home/ubuntu/.gdrive-rclone.ini";
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      const match = content.match(/"access_token":\s*"([^"]+)"/);
      if (match?.[1] && match[1].length > 30) {
        return match[1];
      }
    }
  } catch {
    // Fail silent — rclone config may not exist in production
  }

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

  const boundary = `rio_librarian_${Date.now()}`;
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

// ─── File ID Resolution ────────────────────────────────────────

async function getOrCreateFile(
  name: string,
  defaultContent: string,
  cachedId: string | null,
): Promise<string | null> {
  // Use cached ID if available
  if (cachedId) return cachedId;

  // Search for existing file
  const existingId = await driveSearch(name, PROTOCOL_FOLDER_ID);
  if (existingId) return existingId;

  // Create new file
  return driveCreate(name, PROTOCOL_FOLDER_ID, defaultContent);
}

// ─── Anchor Write (overwrite) ──────────────────────────────────

async function writeAnchor(anchor: AnchorState): Promise<boolean> {
  const content = JSON.stringify(anchor, null, 2);

  anchorFileId = await getOrCreateFile("anchor.json", content, anchorFileId);
  if (!anchorFileId) return false;

  return driveUpdate(anchorFileId, content);
}

// ─── Ledger Append ─────────────────────────────────────────────

async function appendLedger(entry: LedgerEntry): Promise<boolean> {
  // Resolve or create ledger file
  ledgerFileId = await getOrCreateFile(
    "ledger.json",
    JSON.stringify({ entries: [] }, null, 2),
    ledgerFileId,
  );
  if (!ledgerFileId) return false;

  // Download current ledger
  const raw = await driveDownload(ledgerFileId);
  let ledger: { entries: LedgerEntry[] };

  try {
    ledger = raw ? JSON.parse(raw) : { entries: [] };
    if (!Array.isArray(ledger.entries)) {
      ledger = { entries: [] };
    }
  } catch {
    ledger = { entries: [] };
  }

  // Append new entry
  ledger.entries.push(entry);

  // Write back
  const content = JSON.stringify(ledger, null, 2);
  return driveUpdate(ledgerFileId, content);
}

// ─── Public API ────────────────────────────────────────────────

export interface SyncToLibrarianInput {
  receipt_id: string;
  receipt_hash: string;
  previous_receipt_hash: string;
  proposer_id: string;
  approver_id: string;
  decision: string; // "APPROVED" | "DECLINED" | etc.
  snapshot_hash: string;
}

/**
 * Sync a governed action result to the Librarian files on Drive.
 * Fail-silent: logs errors but never throws or blocks execution.
 */
export async function syncToLibrarian(input: SyncToLibrarianInput): Promise<{
  success: boolean;
  anchor_written: boolean;
  ledger_appended: boolean;
  error?: string;
}> {
  const timestamp = new Date().toISOString();

  try {
    const token = getToken();
    if (!token) {
      console.log("[Librarian] No Drive token available — skipping sync");
      return { success: false, anchor_written: false, ledger_appended: false, error: "NO_DRIVE_TOKEN" };
    }

    // 1. Write anchor.json (overwrite)
    const anchor: AnchorState = {
      last_receipt_hash: input.receipt_hash,
      last_receipt_id: input.receipt_id,
      timestamp,
      system_state: "ACTIVE",
      snapshot_hash: input.snapshot_hash,
    };

    const anchorOk = await writeAnchor(anchor);
    if (!anchorOk) {
      console.log("[Librarian] Failed to write anchor.json — continuing");
    }

    // 2. Append ledger.json
    const entry: LedgerEntry = {
      receipt_id: input.receipt_id,
      receipt_hash: input.receipt_hash,
      previous_receipt_hash: input.previous_receipt_hash,
      proposer_id: input.proposer_id,
      approver_id: input.approver_id,
      decision: input.decision,
      timestamp,
    };

    const ledgerOk = await appendLedger(entry);
    if (!ledgerOk) {
      console.log("[Librarian] Failed to append ledger.json — continuing");
    }

    const success = anchorOk && ledgerOk;
    console.log(
      `[Librarian] Sync ${success ? "SUCCESS" : "PARTIAL"}: anchor=${anchorOk}, ledger=${ledgerOk}, receipt=${input.receipt_id}`,
    );

    return { success, anchor_written: anchorOk, ledger_appended: ledgerOk };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[Librarian] Sync FAILED (silent): ${msg}`);
    return { success: false, anchor_written: false, ledger_appended: false, error: msg };
  }
}

/**
 * Read the current anchor state from Drive.
 * Returns null if not available.
 */
export async function readAnchor(): Promise<AnchorState | null> {
  try {
    anchorFileId = await getOrCreateFile("anchor.json", "{}", anchorFileId);
    if (!anchorFileId) return null;

    const raw = await driveDownload(anchorFileId);
    if (!raw) return null;

    return JSON.parse(raw) as AnchorState;
  } catch {
    return null;
  }
}

/**
 * Read the current ledger from Drive.
 * Returns empty array if not available.
 */
export async function readLedger(): Promise<LedgerEntry[]> {
  try {
    ledgerFileId = await getOrCreateFile(
      "ledger.json",
      JSON.stringify({ entries: [] }),
      ledgerFileId,
    );
    if (!ledgerFileId) return [];

    const raw = await driveDownload(ledgerFileId);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as { entries?: LedgerEntry[] };
    return parsed.entries ?? [];
  } catch {
    return [];
  }
}

/**
 * Reset cached file IDs (useful for testing).
 */
export function resetLibrarianCache(): void {
  anchorFileId = null;
  ledgerFileId = null;
}
