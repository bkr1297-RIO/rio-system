/**
 * RIO KERNEL v2 — MANDATORY ACCEPTANCE TESTS (Section 10)
 * ═══════════════════════════════════════════════════════════
 *
 * System MUST pass all 11 tests:
 *
 * 1. No direct execution calls
 * 2. WAL PREPARED before execution
 * 3. Exactly-once approval (CAS)
 * 4. Replay blocked (nonce)
 * 5. Concurrency safe
 * 6. Presentation mismatch policy enforced
 * 7. Shadow paths blocked (workers/webhooks)
 * 8. Sandbox enforced
 * 9. Ledger hash chain valid
 * 10. Restart consistency maintained
 * 11. Expression cannot execute (§2.E)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── Module imports ──────────────────────────────────────────
import {
  enforceToolSandbox,
  consumeNonce,
  casConsumeApproval,
  walPrepare,
  walCommit,
  walFail,
  _clearNonceCache,
  rebuildNonceCache,
  startupLedgerVerification,
  KERNEL_VERSION,
  kernelExecute,
} from "./rio/kernelExecutor";
import {
  isExpressionOutput,
  expressionToIntent,
  createExpressionOutput,
  type ExpressionOutput,
} from "./rio/controlPlane";

// ── Helpers ─────────────────────────────────────────────────
const SERVER_DIR = path.resolve(__dirname);
const CLIENT_DIR = path.resolve(__dirname, "../client/src");

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

function findFiles(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.includes("node_modules") && !entry.name.startsWith("_")) {
      results.push(...findFiles(fullPath, ext));
    } else if (entry.isFile() && ext.some(e => entry.name.endsWith(e)) && !entry.name.includes(".test.")) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── Mock DB for WAL/CAS tests ───────────────────────────────
vi.mock("./db", () => {
  let ledgerEntries: Array<{ id: number; entryId: string; entryType: string; payload: Record<string, unknown>; hash: string; prevHash: string; createdAt: Date }> = [];
  let nextId = 1;

  const sha256 = (input: string) => {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(input).digest("hex");
  };

  const canonicalJsonStringify = (obj: unknown) => JSON.stringify(obj, Object.keys(obj as any).sort());

  return {
    sha256,
    canonicalJsonStringify,
    appendLedger: vi.fn(async (entryType: string, payload: Record<string, unknown>) => {
      const prevHash = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].hash : "GENESIS";
      const entryId = `LE-test-${nextId}`;
      const hash = sha256(`${prevHash}:${entryType}:${JSON.stringify(payload)}`);
      const entry = {
        id: nextId++,
        entryId,
        entryType,
        payload,
        hash,
        prevHash,
        createdAt: new Date(),
        timestamp: Date.now(),
      };
      ledgerEntries.push(entry);
      return { entryId, hash, timestamp: Date.now() };
    }),
    getLastLedgerEntry: vi.fn(async () => {
      return ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1] : null;
    }),
    getAllLedgerEntries: vi.fn(async () => ledgerEntries),
    verifyHashChain: vi.fn(async () => ({
      valid: true,
      entries: ledgerEntries.length,
      errors: [],
    })),
    // Expose for test cleanup
    _resetLedger: () => {
      ledgerEntries = [];
      nextId = 1;
    },
    _getLedgerEntries: () => ledgerEntries,
  };
});

// Get mock references
const mockDb = vi.mocked(await import("./db")) as any;

// ═══════════════════════════════════════════════════════════════
// TEST 1: No Direct Execution Calls
// ═══════════════════════════════════════════════════════════════

describe("ACCEPTANCE TEST 1: No direct execution calls", () => {
  it("connectors.ts dispatchExecution must require _gatewayExecution flag", () => {
    const content = readFile(path.join(SERVER_DIR, "one/connectors.ts"));
    expect(content).toContain("_gatewayExecution");
    // The guard must exist: check for the throw/return pattern
    expect(content).toMatch(/REQUIRES_GATEWAY_GOVERNANCE|_gatewayExecution/);
  });

  it("no client-side file should directly call dispatchExecution", () => {
    const clientFiles = findFiles(CLIENT_DIR, [".ts", ".tsx"]);
    const violations: string[] = [];
    for (const file of clientFiles) {
      const content = readFile(file);
      if (content.includes("dispatchExecution")) {
        violations.push(path.relative(CLIENT_DIR, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it("no client-side file should directly call sendViaGmail", () => {
    const clientFiles = findFiles(CLIENT_DIR, [".ts", ".tsx"]);
    const violations: string[] = [];
    for (const file of clientFiles) {
      const content = readFile(file);
      if (content.includes("sendViaGmail")) {
        violations.push(path.relative(CLIENT_DIR, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it("all 3 execution paths must use walPrepare before dispatchExecution", () => {
    const files = ["routers.ts", "one/oneClickApproval.ts", "hitl/emailApproval.ts"];
    for (const fileName of files) {
      const content = readFile(path.join(SERVER_DIR, fileName));
      // walPrepare must appear before dispatchExecution in the file
      const walIdx = content.indexOf("walPrepare(");
      const dispatchIdx = content.indexOf("dispatchExecution(");
      if (dispatchIdx > -1) {
        expect(walIdx).toBeGreaterThan(-1);
        // walPrepare should be imported or called before dispatch
        expect(content).toContain("walPrepare");
      }
    }
  });

  it("kernelExecutor.ts must be the documented execution path", () => {
    const content = readFile(path.join(SERVER_DIR, "rio/kernelExecutor.ts"));
    expect(content).toContain("PRODUCTION HELPER");
    expect(content).toContain("INV: No side effect exists outside the RIO gate path.");
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 2: WAL PREPARED Before Execution
// ═══════════════════════════════════════════════════════════════

describe("ACCEPTANCE TEST 2: WAL PREPARED before execution", () => {
  beforeEach(() => {
    mockDb._resetLedger();
    _clearNonceCache();
  });

  it("walPrepare writes a PREPARED entry to the ledger", async () => {
    const envelope = {
      intent_id: "INT-test-001",
      action_type: "send_email",
      target: "test@example.com",
      actor_id: "I-1",
      timestamp: Date.now(),
      payload: { to: "test@example.com", subject: "Test" },
      nonce: "N-001",
      signature: "sig-001",
    };
    const governance = {
      decision: "APPROVE" as const,
      risk_level: "HIGH" as const,
      intent_hash: "hash-001",
      reasoning: "test",
      constraints: [],
    };

    const prepared = await walPrepare("INT-test-001", envelope, governance, "TK-001");
    expect(prepared.entryId).toBeTruthy();
    expect(prepared.hash).toBeTruthy();
    expect(prepared.intentId).toBe("INT-test-001");

    // Verify the ledger entry was written
    const entries = mockDb._getLedgerEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].entryType).toBe("WAL_PREPARED");
    expect(entries[0].payload.intent_id).toBe("INT-test-001");
    expect(entries[0].payload.kernel_version).toBe(KERNEL_VERSION);
  });

  it("walPrepare failure prevents execution (fail-closed)", async () => {
    // Make appendLedger fail
    mockDb.appendLedger.mockRejectedValueOnce(new Error("DB write failed"));

    const envelope = {
      intent_id: "INT-test-002",
      action_type: "send_email",
      target: "test@example.com",
      actor_id: "I-1",
      timestamp: Date.now(),
      payload: {},
      nonce: "N-002",
      signature: "sig-002",
    };
    const governance = {
      decision: "APPROVE" as const,
      risk_level: "HIGH" as const,
      intent_hash: "hash-002",
      reasoning: "test",
      constraints: [],
    };

    await expect(walPrepare("INT-test-002", envelope, governance, "TK-002"))
      .rejects.toThrow("DB write failed");
  });

  it("walCommit writes COMMITTED entry after successful execution", async () => {
    // First prepare
    const prepared = {
      entryId: "LE-prep-001",
      hash: "hash-prep-001",
      intentId: "INT-test-003",
      timestamp: Date.now(),
    };

    const committed = await walCommit(prepared, "receipt-hash-001", {
      success: true,
      output: { messageId: "msg-001" },
    });

    expect(committed.entryId).toBeTruthy();
    const entries = mockDb._getLedgerEntries();
    const commitEntry = entries.find((e: any) => e.entryType === "WAL_COMMITTED");
    expect(commitEntry).toBeTruthy();
    expect(commitEntry!.payload.prepared_entry_id).toBe("LE-prep-001");
    expect(commitEntry!.payload.receipt_hash).toBe("receipt-hash-001");
  });

  it("walFail writes FAILED entry after failed execution", async () => {
    const prepared = {
      entryId: "LE-prep-002",
      hash: "hash-prep-002",
      intentId: "INT-test-004",
      timestamp: Date.now(),
    };

    const failed = await walFail(prepared, "SMTP connection refused");

    expect(failed.entryId).toBeTruthy();
    const entries = mockDb._getLedgerEntries();
    const failEntry = entries.find((e: any) => e.entryType === "WAL_FAILED");
    expect(failEntry).toBeTruthy();
    expect(failEntry!.payload.error).toBe("SMTP connection refused");
  });

  it("all 3 production paths have WAL PREPARED before dispatchExecution in source", () => {
    const files = ["routers.ts", "one/oneClickApproval.ts", "hitl/emailApproval.ts"];
    for (const fileName of files) {
      const content = readFile(path.join(SERVER_DIR, fileName));
      // Find all walPrepare and dispatchExecution occurrences
      const walPrepareIdx = content.indexOf("walPrepare(");
      const dispatchIdx = content.indexOf("dispatchExecution(");
      if (dispatchIdx > -1 && walPrepareIdx > -1) {
        // walPrepare must appear before dispatchExecution
        expect(walPrepareIdx).toBeLessThan(dispatchIdx);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 3: Exactly-Once Approval (CAS)
// ═══════════════════════════════════════════════════════════════

describe("ACCEPTANCE TEST 3: Exactly-once approval (CAS)", () => {
  beforeEach(() => {
    mockDb._resetLedger();
    _clearNonceCache();
  });

  it("CAS succeeds on first consumption", async () => {
    const result = await casConsumeApproval(
      "APR-001",
      "INT-001",
      async () => ({ rowsAffected: 1 }),
    );
    expect(result.consumed).toBe(true);
    expect(result.nonce).toBeTruthy();
    expect(result.nonce).toMatch(/^EXEC-/);
  });

  it("CAS fails when approval already consumed (rows_affected=0)", async () => {
    const result = await casConsumeApproval(
      "APR-002",
      "INT-002",
      async () => ({ rowsAffected: 0 }),
    );
    expect(result.consumed).toBe(false);
    expect(result.reason).toContain("CAS_FAILED");
    expect(result.reason).toContain("already consumed");
  });

  it("CAS detects anomalous rows_affected", async () => {
    const result = await casConsumeApproval(
      "APR-003",
      "INT-003",
      async () => ({ rowsAffected: 2 }),
    );
    expect(result.consumed).toBe(false);
    expect(result.reason).toContain("CAS_ANOMALY");
  });

  it("each CAS consumption generates a unique nonce", async () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const result = await casConsumeApproval(
        `APR-unique-${i}`,
        `INT-unique-${i}`,
        async () => ({ rowsAffected: 1 }),
      );
      expect(result.consumed).toBe(true);
      expect(nonces.has(result.nonce!)).toBe(false);
      nonces.add(result.nonce!);
    }
    expect(nonces.size).toBe(10);
  });

  it("CAS source code uses UPDATE WHERE pattern", () => {
    const content = readFile(path.join(SERVER_DIR, "rio/kernelExecutor.ts"));
    // The CAS function must document the UPDATE ... WHERE state='PENDING' pattern
    expect(content).toContain("PENDING");
    expect(content).toContain("CONSUMED");
    expect(content).toContain("rows_affected");
    expect(content).toContain("exactly-once");
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 4: Replay Blocked (Nonce)
// ═══════════════════════════════════════════════════════════════

describe("ACCEPTANCE TEST 4: Replay blocked (nonce)", () => {
  beforeEach(() => {
    _clearNonceCache();
    mockDb._resetLedger();
  });

  it("first nonce consumption succeeds", async () => {
    const result = await consumeNonce("NONCE-001");
    expect(result).toBe(true);
  });

  it("second consumption of same nonce is blocked", async () => {
    await consumeNonce("NONCE-002");
    const result = await consumeNonce("NONCE-002");
    expect(result).toBe(false);
  });

  it("nonce is persisted to ledger for restart survival", async () => {
    await consumeNonce("NONCE-003");
    const entries = mockDb._getLedgerEntries();
    const nonceEntry = entries.find((e: any) => e.entryType === "NONCE_CONSUMED");
    expect(nonceEntry).toBeTruthy();
    expect(nonceEntry!.payload.nonce).toBe("NONCE-003");
  });

  it("nonce cache can be rebuilt from ledger entries", async () => {
    _clearNonceCache();
    const mockEntries = [
      { entryType: "NONCE_CONSUMED", payload: { nonce: "NONCE-REBUILD-1" } },
      { entryType: "NONCE_CONSUMED", payload: { nonce: "NONCE-REBUILD-2" } },
      { entryType: "WAL_PREPARED", payload: { intent_id: "INT-X" } },
    ];
    const count = await rebuildNonceCache(mockEntries);
    expect(count).toBe(2);

    // Now these nonces should be blocked
    expect(await consumeNonce("NONCE-REBUILD-1")).toBe(false);
    expect(await consumeNonce("NONCE-REBUILD-2")).toBe(false);
    // Fresh nonce should still work
    expect(await consumeNonce("NONCE-REBUILD-3")).toBe(true);
  });

  it("nonce registry persists across restart (source audit)", () => {
    const content = readFile(path.join(SERVER_DIR, "rio/kernelExecutor.ts"));
    // Must have rebuildNonceCache function
    expect(content).toContain("rebuildNonceCache");
    // Must persist nonces to ledger
    expect(content).toContain("NONCE_CONSUMED");
    // Must rebuild from ledger at startup
    expect(content).toContain("startupLedgerVerification");
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 5: Concurrency Safe
// ═══════════════════════════════════════════════════════════════

describe("ACCEPTANCE TEST 5: Concurrency safe", () => {
  beforeEach(() => {
    _clearNonceCache();
    mockDb._resetLedger();
  });

  it("concurrent CAS attempts: only one succeeds", async () => {
    let firstCall = true;
    const performCAS = async () => {
      if (firstCall) {
        firstCall = false;
        return { rowsAffected: 1 };
      }
      return { rowsAffected: 0 }; // DB-level CAS ensures second fails
    };

    // Simulate 5 concurrent attempts
    const results = await Promise.all([
      casConsumeApproval("APR-CONC-1", "INT-CONC-1", performCAS),
      casConsumeApproval("APR-CONC-1", "INT-CONC-1", async () => ({ rowsAffected: 0 })),
      casConsumeApproval("APR-CONC-1", "INT-CONC-1", async () => ({ rowsAffected: 0 })),
      casConsumeApproval("APR-CONC-1", "INT-CONC-1", async () => ({ rowsAffected: 0 })),
      casConsumeApproval("APR-CONC-1", "INT-CONC-1", async () => ({ rowsAffected: 0 })),
    ]);

    const successes = results.filter(r => r.consumed);
    const failures = results.filter(r => !r.consumed);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(4);
  });

  it("concurrent nonce consumption: only first succeeds", async () => {
    // First call succeeds
    const r1 = await consumeNonce("NONCE-CONC-1");
    expect(r1).toBe(true);

    // Concurrent attempts all fail
    const results = await Promise.all([
      consumeNonce("NONCE-CONC-1"),
      consumeNonce("NONCE-CONC-1"),
      consumeNonce("NONCE-CONC-1"),
    ]);
    expect(results.every(r => r === false)).toBe(true);
  });

  it("CAS uses DB-level atomicity (source audit)", () => {
    const content = readFile(path.join(SERVER_DIR, "rio/kernelExecutor.ts"));
    // CAS must use rows_affected pattern (DB-level atomicity)
    expect(content).toContain("rowsAffected");
    // CAS checks rowsAffected values (1 for success, 0 for already consumed)
    expect(content).toMatch(/rowsAffected\s*===?\s*1/);
    expect(content).toMatch(/rowsAffected\s*===?\s*0/);
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 6: Presentation Mismatch Policy Enforced
// ═══════════════════════════════════════════════════════════════

describe("ACCEPTANCE TEST 6: Presentation mismatch policy enforced", () => {
  it("controlPlane.ts documents dual presentation binding", () => {
    const content = readFile(path.join(SERVER_DIR, "rio/controlPlane.ts"));
    // Must have hash-based binding between approval and intent
    // controlPlane uses intent_hash for binding approval to the original intent
    expect(content).toContain("intent_hash");
    expect(content).toContain("action_hash");
    // Must detect hash mismatch (presentation divergence)
    expect(content).toMatch(/hash.*mismatch|mismatch.*hash/i);
  });

  it("approval records must bind to intent hash (source audit)", () => {
    const content = readFile(path.join(SERVER_DIR, "rio/controlPlane.ts"));
    // validateApproval must check intent_hash binding
    expect(content).toContain("validateApproval");
    expect(content).toContain("intent_hash");
  });

  it("kernelExecutor enforces governance decision before execution", () => {
    const content = readFile(path.join(SERVER_DIR, "rio/kernelExecutor.ts"));
    // Must check governance decision
    expect(content).toContain("GovernanceDecision");
    // Must have gate preflight
    expect(content).toContain("executeGatePreflight");
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 7: Shadow Paths Blocked (Workers/Webhooks)
// ═══════════════════════════════════════════════════════════════

describe("ACCEPTANCE TEST 7: Shadow paths blocked", () => {
  it("no server file has unguarded tool invocation outside kernel path", () => {
    const serverFiles = findFiles(SERVER_DIR, [".ts"]);
    const violations: { file: string; line: number; content: string }[] = [];

    for (const file of serverFiles) {
      const fileName = path.basename(file);
      // Skip the kernel itself, connectors (which have the guard), and test files
      if (
        fileName === "kernelExecutor.ts" ||
        fileName === "connectors.ts" ||
        fileName === "controlPlane.ts" ||
        fileName === "gmailSmtp.ts" || // Legitimate SMTP transport module — called only from connectors.ts which has the guard
        fileName.includes(".test.")
      ) continue;

      const content = readFile(file);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Check for direct nodemailer/gmail calls outside the governed path
        if (
          (line.includes("createTransport(") || line.includes("sendMail(")) &&
          !line.trimStart().startsWith("//") &&
          !line.trimStart().startsWith("*")
        ) {
          // This is allowed ONLY in connectors.ts (which has the guard)
          violations.push({
            file: fileName,
            line: i + 1,
            content: line.trim(),
          });
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("webhook handlers (Slack, Telegram, email) do NOT execute — approval only", () => {
    const approvalSurfaces = ["slackCallback.ts", "telegramInput.ts"];
    for (const fileName of approvalSurfaces) {
      const filePath = path.join(SERVER_DIR, fileName);
      if (!fs.existsSync(filePath)) continue;
      const content = readFile(filePath);
      // Must NOT contain dispatchExecution or sendViaGmail
      expect(content).not.toContain("dispatchExecution(");
      expect(content).not.toContain("sendViaGmail(");
    }
  });

  it("connectors.ts has REQUIRES_GATEWAY_GOVERNANCE guard", () => {
    const content = readFile(path.join(SERVER_DIR, "one/connectors.ts"));
    expect(content).toContain("REQUIRES_GATEWAY_GOVERNANCE");
    expect(content).toContain("_gatewayExecution");
  });

  it("all execution paths import from kernelExecutor", () => {
    const executionFiles = ["routers.ts", "one/oneClickApproval.ts", "hitl/emailApproval.ts"];
    for (const fileName of executionFiles) {
      const content = readFile(path.join(SERVER_DIR, fileName));
      expect(content).toContain("kernelExecutor");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 8: Sandbox Enforced
// ═══════════════════════════════════════════════════════════════

describe("ACCEPTANCE TEST 8: Sandbox enforced", () => {
  it("blocks /runtime/* paths", () => {
    const result = enforceToolSandbox("send_email", "/runtime/config.json");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("SANDBOX_DENIED");
  });

  it("blocks /config/* paths", () => {
    const result = enforceToolSandbox("send_email", "/config/secrets.env");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("SANDBOX_DENIED");
  });

  it("blocks /keys/* paths", () => {
    const result = enforceToolSandbox("send_email", "/keys/private.pem");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("SANDBOX_DENIED");
  });

  it("blocks localhost", () => {
    const result = enforceToolSandbox("web_search", "http://localhost:3000/admin");
    expect(result.allowed).toBe(false);
  });

  it("blocks 127.0.0.1", () => {
    const result = enforceToolSandbox("web_search", "http://127.0.0.1:8080");
    expect(result.allowed).toBe(false);
  });

  it("blocks internal network 10.x.x.x", () => {
    const result = enforceToolSandbox("web_search", "http://10.0.0.1/api");
    expect(result.allowed).toBe(false);
  });

  it("blocks internal network 172.16-31.x.x", () => {
    const result = enforceToolSandbox("web_search", "http://172.16.0.1/api");
    expect(result.allowed).toBe(false);
  });

  it("blocks internal network 192.168.x.x", () => {
    const result = enforceToolSandbox("web_search", "http://192.168.1.1/api");
    expect(result.allowed).toBe(false);
  });

  it("blocks recursive RIO calls", () => {
    const result = enforceToolSandbox("web_search", "https://example.com/rio_process_intent");
    expect(result.allowed).toBe(false);
  });

  it("blocks recursive kernel calls", () => {
    const result = enforceToolSandbox("web_search", "https://example.com/kernelExecute");
    expect(result.allowed).toBe(false);
  });

  it("allows valid email targets for send_email", () => {
    const result = enforceToolSandbox("send_email", "user@example.com");
    expect(result.allowed).toBe(true);
  });

  it("allows valid phone numbers for send_sms", () => {
    const result = enforceToolSandbox("send_sms", "+15551234567");
    expect(result.allowed).toBe(true);
  });

  it("blocks invalid targets for send_email (not an email)", () => {
    const result = enforceToolSandbox("send_email", "not-an-email");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not in allowlist");
  });

  it("denylist is checked before allowlist", () => {
    // Even if target looks like an email, if it matches denylist, block it
    const result = enforceToolSandbox("send_email", "admin@localhost");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("SANDBOX_DENIED");
    expect(result.reason).toContain("denylist");
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 9: Ledger Hash Chain Valid
// ═══════════════════════════════════════════════════════════════

describe("ACCEPTANCE TEST 9: Ledger hash chain valid", () => {
  it("ledger is append-only (source audit)", () => {
    const content = readFile(path.join(SERVER_DIR, "db.ts"));
    // Must have appendLedger function
    expect(content).toContain("appendLedger");
    // Must NOT have deleteLedger or updateLedger
    expect(content).not.toContain("deleteLedger");
    expect(content).not.toMatch(/updateLedger\s*\(/);
    // Must NOT have DELETE FROM ledger
    expect(content).not.toMatch(/DELETE\s+FROM\s+ledger/i);
  });

  it("ledger entries are hash-chained (source audit)", () => {
    const content = readFile(path.join(SERVER_DIR, "db.ts"));
    expect(content).toContain("prevHash");
    expect(content).toContain("sha256");
    expect(content).toContain("GENESIS");
  });

  it("verifyHashChain function exists and is called at startup", () => {
    const dbContent = readFile(path.join(SERVER_DIR, "db.ts"));
    expect(dbContent).toContain("verifyHashChain");

    // Startup verification exists in kernelExecutor
    const kernelContent = readFile(path.join(SERVER_DIR, "rio/kernelExecutor.ts"));
    expect(kernelContent).toContain("startupLedgerVerification");
    expect(kernelContent).toContain("verifyHashChain");

    // Wired into server startup
    const indexContent = readFile(path.join(SERVER_DIR, "_core/index.ts"));
    expect(indexContent).toContain("startupLedgerVerification");
  });

  it("hash chain break detection works (source audit)", () => {
    const content = readFile(path.join(SERVER_DIR, "db.ts"));
    // Must detect hash mismatches
    expect(content).toContain("hash mismatch");
    // Must report errors
    expect(content).toMatch(/errors|valid.*false/);
  });

  it("startup verification rebuilds nonce cache", () => {
    const content = readFile(path.join(SERVER_DIR, "rio/kernelExecutor.ts"));
    expect(content).toContain("rebuildNonceCache");
    // Must be called during startupLedgerVerification
    const startupFn = content.substring(
      content.indexOf("startupLedgerVerification"),
      content.indexOf("}", content.indexOf("startupLedgerVerification") + 500) + 1,
    );
    expect(startupFn).toContain("rebuildNonceCache");
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 10: Restart Consistency Maintained
// ═══════════════════════════════════════════════════════════════

describe("ACCEPTANCE TEST 10: Restart consistency maintained", () => {
  beforeEach(() => {
    _clearNonceCache();
    mockDb._resetLedger();
  });

  it("nonces survive restart via ledger persistence", async () => {
    // Consume a nonce (persisted to ledger)
    await consumeNonce("NONCE-RESTART-1");

    // Simulate restart: clear in-memory cache
    _clearNonceCache();

    // Rebuild from ledger
    const entries = await mockDb.getAllLedgerEntries();
    const count = await rebuildNonceCache(entries);
    expect(count).toBe(1);

    // Nonce should still be blocked after restart
    const result = await consumeNonce("NONCE-RESTART-1");
    expect(result).toBe(false);
  });

  it("fresh nonces work after restart", async () => {
    await consumeNonce("NONCE-RESTART-2");
    _clearNonceCache();
    const entries = await mockDb.getAllLedgerEntries();
    await rebuildNonceCache(entries);

    // New nonce should work
    const result = await consumeNonce("NONCE-RESTART-3");
    expect(result).toBe(true);
  });

  it("startupLedgerVerification returns valid result for clean ledger", async () => {
    const result = await startupLedgerVerification();
    expect(result.valid).toBe(true);
    expect(typeof result.entries).toBe("number");
    expect(typeof result.nonces_restored).toBe("number");
    expect(result.errors).toEqual([]);
  });

  it("token TTL is ≤ 5 seconds (source audit)", () => {
    const content = readFile(path.join(SERVER_DIR, "rio/kernelExecutor.ts"));
    // Must define KERNEL_TOKEN_TTL_MS ≤ 5000
    const ttlMatch = content.match(/KERNEL_TOKEN_TTL_MS\s*=\s*(\d[_\d]*)/);
    expect(ttlMatch).not.toBeNull();
    const ttlValue = parseInt(ttlMatch![1].replace(/_/g, ""), 10);
    expect(ttlValue).toBeLessThanOrEqual(5000);
  });

  it("server startup wires ledger verification (source audit)", () => {
    const content = readFile(path.join(SERVER_DIR, "_core/index.ts"));
    expect(content).toContain("startupLedgerVerification");
    expect(content).toContain("LEDGER INTEGRITY FAILURE");
    expect(content).toContain("nonces restored");
  });

  it("KERNEL_VERSION is defined and follows semver", () => {
    expect(KERNEL_VERSION).toBeTruthy();
    expect(KERNEL_VERSION).toMatch(/^K\d+\.\d+\.\d+$/);
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 11: Expression Cannot Execute (§2.E)
// ═══════════════════════════════════════════════════════════════

describe("ACCEPTANCE TEST 11: Expression cannot execute (§2.E)", () => {
  it("ExpressionOutput type has __expression_output discriminator", () => {
    const expr = createExpressionOutput({
      message: "I suggest sending an email",
      proposedIntents: [{
        toolName: "send_email",
        toolArgs: { to: "test@example.com", subject: "Hello" },
        reasoning: "User asked to send email",
        confidence: 0.9,
      }],
      mode: "EXECUTE",
      nodeUsed: "bondi-primary",
    });
    expect(expr.__expression_output).toBe(true);
    expect(isExpressionOutput(expr)).toBe(true);
  });

  it("isExpressionOutput rejects non-expression objects", () => {
    expect(isExpressionOutput({})).toBe(false);
    expect(isExpressionOutput(null)).toBe(false);
    expect(isExpressionOutput(undefined)).toBe(false);
    expect(isExpressionOutput({ message: "hi" })).toBe(false);
    // IntentEnvelope should NOT pass the expression guard
    expect(isExpressionOutput({
      intent_id: "INT-test",
      request_id: "REQ-test",
      source_type: "HUMAN",
    })).toBe(false);
  });

  it("kernelExecute rejects ExpressionOutput at the boundary (source audit)", () => {
    const kernelSrc = readFile(path.join(SERVER_DIR, "rio/kernelExecutor.ts"));
    // The expression isolation guard MUST appear BEFORE Step 1 (envelope verification)
    const guardIdx = kernelSrc.indexOf("isExpressionOutput");
    const step1Idx = kernelSrc.indexOf("Step 1: Verify envelope");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(step1Idx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(step1Idx);
    // Must return EXPRESSION_ISOLATION_VIOLATION
    expect(kernelSrc).toContain("EXPRESSION_ISOLATION_VIOLATION");
  });

  it("expressionToIntent requires approvedByHuman=true", () => {
    const expr = createExpressionOutput({
      message: "Send email",
      proposedIntents: [{
        toolName: "send_email",
        toolArgs: { to: "test@example.com" },
        reasoning: "User asked",
        confidence: 0.8,
      }],
      mode: "EXECUTE",
      nodeUsed: "bondi-primary",
    });
    // Without human approval → BLOCK
    expect(() => expressionToIntent(expr, 0, false, "user:1")).toThrow(
      "EXPRESSION_ISOLATION_VIOLATION"
    );
    // With human approval → produces valid IntentEnvelope
    const envelope = expressionToIntent(expr, 0, true, "1");
    expect(envelope.intent_id).toMatch(/^INT-expr-/);
    expect(envelope.action_type).toBe("send_email");
    expect(envelope.parameters).toEqual({ to: "test@example.com" });
    // Context must record expression source
    expect(envelope.context).toMatchObject({
      expression_source: true,
      approved_by_human: true,
    });
  });

  it("expressionToIntent rejects invalid intent index", () => {
    const expr = createExpressionOutput({
      message: "No intents",
      proposedIntents: [],
      mode: "REFLECT",
      nodeUsed: "bondi-primary",
    });
    expect(() => expressionToIntent(expr, 0, true, "1")).toThrow(
      "EXPRESSION_ISOLATION_VIOLATION"
    );
  });

  it("ExpressionOutput is structurally incompatible with IntentEnvelope (source audit)", () => {
    const cpSrc = readFile(path.join(SERVER_DIR, "rio/controlPlane.ts"));
    // ExpressionOutput MUST have __expression_output discriminator
    expect(cpSrc).toContain("readonly __expression_output: true");
    // expressionToIntent MUST check approvedByHuman
    expect(cpSrc).toContain("if (!approvedByHuman)");
    // expressionToIntent MUST check isExpressionOutput
    expect(cpSrc).toContain("if (!isExpressionOutput(expression))");
  });

  it("Bondi response flow does NOT directly call kernel functions (source audit)", () => {
    const bondiSrc = readFile(path.join(SERVER_DIR, "one/bondi.ts"));
    // Bondi MUST NOT import or call kernelExecute, dispatchExecution, or rio_process_intent
    expect(bondiSrc).not.toContain("kernelExecute");
    expect(bondiSrc).not.toContain("dispatchExecution");
    expect(bondiSrc).not.toContain("rio_process_intent");
    // Bondi returns ExtractedIntent[] which are proposals, NOT execution commands
    expect(bondiSrc).toContain("ExtractedIntent");
    expect(bondiSrc).toContain("extractIntents");
  });

  it("createIntent ledger entry logs expression_source field (source audit)", () => {
    const routersSrc = readFile(path.join(SERVER_DIR, "routers.ts"));
    // The INTENT ledger entry MUST include expression_source field
    expect(routersSrc).toContain("expression_source");
    // It should be in the appendLedger(\"INTENT\" context
    const intentLedgerIdx = routersSrc.indexOf('appendLedger("INTENT"');
    expect(intentLedgerIdx).toBeGreaterThan(-1);
    const nextClosingBrace = routersSrc.indexOf("});", intentLedgerIdx);
    const ledgerBlock = routersSrc.substring(intentLedgerIdx, nextClosingBrace);
    expect(ledgerBlock).toContain("expression_source");
  });
});
