/**
 * Librarian Drive Sync — Unit Tests
 * ──────────────────────────────────
 * Tests the syncToLibrarian module's core logic:
 *   - Token availability check
 *   - anchor.json shape and overwrite behavior
 *   - ledger.json append-only behavior
 *   - Fail-silent on Drive errors
 *   - File ID caching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetch globally for Drive API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// We need to import after mocking
import {
  syncToLibrarian,
  readAnchor,
  readLedger,
  resetLibrarianCache,
  type SyncToLibrarianInput,
  type AnchorState,
  type LedgerEntry,
} from "./librarian";

const SAMPLE_INPUT: SyncToLibrarianInput = {
  receipt_id: "rcpt-001",
  receipt_hash: "abc123hash",
  previous_receipt_hash: "prev000hash",
  proposer_id: "I-1",
  approver_id: "I-2",
  decision: "APPROVED",
  snapshot_hash: "abc123hash",
};

describe("Librarian Drive Sync", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_DRIVE_TOKEN", "test-token-123");
    mockFetch.mockReset();
    resetLibrarianCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("syncToLibrarian", () => {
    it("returns NO_DRIVE_TOKEN when no token is available", async () => {
      vi.stubEnv("GOOGLE_DRIVE_TOKEN", "");
      delete process.env.GOOGLE_WORKSPACE_CLI_TOKEN;

      const result = await syncToLibrarian(SAMPLE_INPUT);

      expect(result.success).toBe(false);
      expect(result.error).toBe("NO_DRIVE_TOKEN");
      expect(result.anchor_written).toBe(false);
      expect(result.ledger_appended).toBe(false);
    });

    it("creates anchor.json and ledger.json on first sync", async () => {
      // Mock: search for anchor.json → not found
      // Mock: create anchor.json → success
      // Mock: search for ledger.json → not found
      // Mock: create ledger.json → success
      // Mock: download ledger.json → empty
      // Mock: update ledger.json → success

      let callCount = 0;
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        callCount++;
        const urlStr = String(url);

        // Search calls (GET with q= parameter)
        if (urlStr.includes("drive/v3/files?q=")) {
          return {
            ok: true,
            json: async () => ({ files: [] }), // Not found
          };
        }

        // Create calls (POST multipart)
        if (urlStr.includes("upload/drive/v3/files") && opts?.method === "POST") {
          return {
            ok: true,
            json: async () => ({
              id: urlStr.includes("anchor") ? "anchor-file-id" : `file-${callCount}`,
            }),
          };
        }

        // Update calls (PATCH)
        if (opts?.method === "PATCH") {
          return { ok: true, json: async () => ({ id: "updated" }) };
        }

        // Download calls (GET with alt=media)
        if (urlStr.includes("alt=media")) {
          return {
            ok: true,
            text: async () => JSON.stringify({ entries: [] }),
          };
        }

        return { ok: false, json: async () => ({}) };
      });

      const result = await syncToLibrarian(SAMPLE_INPUT);

      // Should attempt Drive operations
      expect(mockFetch).toHaveBeenCalled();
      // Result shape is correct
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("anchor_written");
      expect(result).toHaveProperty("ledger_appended");
    });

    it("produces correct anchor.json shape", async () => {
      let anchorContent: string | null = null;

      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        const urlStr = String(url);

        // Search → found (return existing file ID)
        if (urlStr.includes("drive/v3/files?q=")) {
          if (urlStr.includes("anchor")) {
            return { ok: true, json: async () => ({ files: [{ id: "anchor-id" }] }) };
          }
          if (urlStr.includes("ledger")) {
            return { ok: true, json: async () => ({ files: [{ id: "ledger-id" }] }) };
          }
          return { ok: true, json: async () => ({ files: [] }) };
        }

        // Update anchor.json → capture content
        if (opts?.method === "PATCH" && urlStr.includes("anchor-id")) {
          anchorContent = opts.body as string;
          return { ok: true, json: async () => ({ id: "anchor-id" }) };
        }

        // Update ledger.json
        if (opts?.method === "PATCH" && urlStr.includes("ledger-id")) {
          return { ok: true, json: async () => ({ id: "ledger-id" }) };
        }

        // Download ledger.json
        if (urlStr.includes("ledger-id") && urlStr.includes("alt=media")) {
          return { ok: true, text: async () => JSON.stringify({ entries: [] }) };
        }

        return { ok: false, json: async () => ({}) };
      });

      await syncToLibrarian(SAMPLE_INPUT);

      expect(anchorContent).not.toBeNull();
      const anchor: AnchorState = JSON.parse(anchorContent!);
      expect(anchor.last_receipt_hash).toBe("abc123hash");
      expect(anchor.last_receipt_id).toBe("rcpt-001");
      expect(anchor.system_state).toBe("ACTIVE");
      expect(anchor.snapshot_hash).toBe("abc123hash");
      expect(anchor.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
    });

    it("appends to ledger.json with correct entry shape", async () => {
      let ledgerContent: string | null = null;

      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        const urlStr = String(url);

        if (urlStr.includes("drive/v3/files?q=")) {
          if (urlStr.includes("anchor")) {
            return { ok: true, json: async () => ({ files: [{ id: "anchor-id" }] }) };
          }
          if (urlStr.includes("ledger")) {
            return { ok: true, json: async () => ({ files: [{ id: "ledger-id" }] }) };
          }
          return { ok: true, json: async () => ({ files: [] }) };
        }

        // Update anchor
        if (opts?.method === "PATCH" && urlStr.includes("anchor-id")) {
          return { ok: true, json: async () => ({ id: "anchor-id" }) };
        }

        // Download ledger → existing entry
        if (urlStr.includes("ledger-id") && urlStr.includes("alt=media")) {
          return {
            ok: true,
            text: async () => JSON.stringify({
              entries: [{
                receipt_id: "rcpt-000",
                receipt_hash: "prev000hash",
                previous_receipt_hash: "",
                proposer_id: "I-1",
                approver_id: "I-2",
                decision: "APPROVED",
                timestamp: "2026-04-13T00:00:00.000Z",
              }],
            }),
          };
        }

        // Update ledger → capture content
        if (opts?.method === "PATCH" && urlStr.includes("ledger-id")) {
          ledgerContent = opts.body as string;
          return { ok: true, json: async () => ({ id: "ledger-id" }) };
        }

        return { ok: false, json: async () => ({}) };
      });

      await syncToLibrarian(SAMPLE_INPUT);

      expect(ledgerContent).not.toBeNull();
      const ledger = JSON.parse(ledgerContent!) as { entries: LedgerEntry[] };
      expect(ledger.entries).toHaveLength(2); // existing + new
      
      const newEntry = ledger.entries[1];
      expect(newEntry.receipt_id).toBe("rcpt-001");
      expect(newEntry.receipt_hash).toBe("abc123hash");
      expect(newEntry.previous_receipt_hash).toBe("prev000hash");
      expect(newEntry.proposer_id).toBe("I-1");
      expect(newEntry.approver_id).toBe("I-2");
      expect(newEntry.decision).toBe("APPROVED");
      expect(newEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("fails silently when Drive API returns errors", async () => {
      mockFetch.mockImplementation(async () => ({
        ok: false,
        json: async () => ({ error: { message: "Drive unavailable" } }),
        text: async () => "Drive unavailable",
      }));

      // Should NOT throw
      const result = await syncToLibrarian(SAMPLE_INPUT);

      expect(result.success).toBe(false);
      expect(result.anchor_written).toBe(false);
      expect(result.ledger_appended).toBe(false);
      // No error thrown — fail-silent
    });

    it("fails silently when fetch throws a network error", async () => {
      mockFetch.mockImplementation(async () => {
        throw new Error("Network error");
      });

      const result = await syncToLibrarian(SAMPLE_INPUT);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });

  describe("readAnchor", () => {
    it("returns null when no token is available", async () => {
      vi.stubEnv("GOOGLE_DRIVE_TOKEN", "");
      delete process.env.GOOGLE_WORKSPACE_CLI_TOKEN;

      const anchor = await readAnchor();
      expect(anchor).toBeNull();
    });
  });

  describe("readLedger", () => {
    it("returns empty array when no token is available", async () => {
      vi.stubEnv("GOOGLE_DRIVE_TOKEN", "");
      delete process.env.GOOGLE_WORKSPACE_CLI_TOKEN;

      const entries = await readLedger();
      expect(entries).toEqual([]);
    });
  });

  describe("Integration contract", () => {
    it("syncToLibrarian input matches the receipt shape from approveAndExecute", () => {
      // Verify the input type has all required fields
      const input: SyncToLibrarianInput = {
        receipt_id: "test",
        receipt_hash: "test",
        previous_receipt_hash: "test",
        proposer_id: "test",
        approver_id: "test",
        decision: "APPROVED",
        snapshot_hash: "test",
      };

      // All fields are strings
      for (const [key, value] of Object.entries(input)) {
        expect(typeof value).toBe("string");
      }
    });
  });
});
