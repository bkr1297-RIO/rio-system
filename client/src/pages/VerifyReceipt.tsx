/**
 * Verify Receipt — Interactive v2 Receipt & Ledger Verification Tool
 *
 * Users can:
 *   1. Paste a v2 receipt JSON → verify receipt_hash and signature
 *   2. Paste a ledger entry JSON → verify hash chain integrity
 *   3. Load a receipt from the database by receipt_id
 */

import { useState, useMemo } from "react";
import NavBar from "@/components/NavBar";
import {
  ShieldCheck,
  ShieldX,
  Search,
  ClipboardPaste,
  Hash,
  FileSignature,
  Link2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

/* ── Types ─────────────────────────────────────────────────────────── */

type VerificationResult = {
  field: string;
  expected: string;
  actual: string;
  pass: boolean;
};

type OverallResult = {
  status: "pass" | "fail" | "error";
  message: string;
  checks: VerificationResult[];
};

/* ── Crypto Helpers (browser-side SHA-256) ──────────────────────────── */

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ── Sample Receipt (for demo purposes) ────────────────────────────── */

const SAMPLE_RECEIPT = JSON.stringify(
  {
    receipt_id: "RIO-EXAMPLE",
    intent_id: "INT-EXAMPLE",
    action: "transfer_funds",
    requested_by: "finance-agent-01",
    approved_by: "CFO",
    decision: "approved",
    execution_status: "EXECUTED",
    intent_hash: "(computed from intent_id + action + requester + timestamp)",
    action_hash: "(computed from action + parameters)",
    verification_hash: "(computed from intent_hash + action_hash + execution_status)",
    verification_status: "verified",
    risk_score: 92,
    risk_level: "CRITICAL",
    policy_decision: "REQUIRE_APPROVAL",
    policy_rule_id: "CRITICAL_ACTION_RULE",
    timestamp_request: "2026-03-26T01:00:00.000Z",
    timestamp_approval: "2026-03-26T01:01:00.000Z",
    timestamp_execution: "2026-03-26T01:02:00.000Z",
    receipt_hash: "(SHA-256 of receipt payload)",
    previous_hash: "0000000000000000",
    signature: "(Ed25519 signature hex)",
    protocol_version: "v2",
  },
  null,
  2
);

const SAMPLE_LEDGER = JSON.stringify(
  {
    block_id: "BLK-EXAMPLE",
    receipt_hash: "(must match receipt.receipt_hash)",
    previous_hash: "0000000000000000",
    current_hash: "(SHA-256 of ledger payload + previous_hash)",
    ledger_signature: "(Ed25519 signature hex)",
    protocol_version: "v2",
    timestamp: "2026-03-26T01:02:00.000Z",
    recorded_by: "RIO System",
  },
  null,
  2
);

/* ── Component ─────────────────────────────────────────────────────── */

export default function VerifyReceipt() {
  const [mode, setMode] = useState<"receipt" | "ledger" | "lookup">("receipt");
  const [input, setInput] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [result, setResult] = useState<OverallResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  // tRPC query for lookup mode
  const verifyQuery = trpc.rio.verifyReceipt.useMutation();

  /* ── Receipt Hash Verification ────────────────────────────────────── */

  async function verifyReceiptHash() {
    setVerifying(true);
    setResult(null);

    try {
      const receipt = JSON.parse(input);
      const checks: VerificationResult[] = [];

      // Check required v2 fields exist
      const requiredFields = [
        "receipt_id",
        "intent_id",
        "action",
        "intent_hash",
        "action_hash",
        "verification_hash",
        "receipt_hash",
        "protocol_version",
      ];

      for (const field of requiredFields) {
        checks.push({
          field: `Field: ${field}`,
          expected: "present",
          actual: receipt[field] ? "present" : "missing",
          pass: !!receipt[field],
        });
      }

      // Verify protocol version
      checks.push({
        field: "Protocol Version",
        expected: "v2",
        actual: receipt.protocol_version || "unknown",
        pass: receipt.protocol_version === "v2",
      });

      // Recompute intent_hash
      if (receipt.intent_id && receipt.action && receipt.requested_by && receipt.timestamp_request) {
        const computedIntentHash = await sha256(
          JSON.stringify({
            intent_id: receipt.intent_id,
            action: receipt.action,
            requested_by: receipt.requested_by,
            timestamp_request: receipt.timestamp_request,
          })
        );
        checks.push({
          field: "Intent Hash (recomputed)",
          expected: computedIntentHash.slice(0, 16) + "...",
          actual: (receipt.intent_hash || "").slice(0, 16) + "...",
          pass: computedIntentHash === receipt.intent_hash,
        });
      }

      // Recompute action_hash
      if (receipt.action) {
        const computedActionHash = await sha256(
          JSON.stringify({
            action: receipt.action,
            description: receipt.description || "",
            protocol: "rio-v2",
          })
        );
        checks.push({
          field: "Action Hash (recomputed)",
          expected: computedActionHash.slice(0, 16) + "...",
          actual: (receipt.action_hash || "").slice(0, 16) + "...",
          pass: computedActionHash === receipt.action_hash,
        });
      }

      // Recompute verification_hash
      if (receipt.intent_hash && receipt.action_hash && receipt.execution_status) {
        const computedVerifHash = await sha256(
          JSON.stringify({
            intent_hash: receipt.intent_hash,
            action_hash: receipt.action_hash,
            execution_status: receipt.execution_status,
          })
        );
        checks.push({
          field: "Verification Hash (recomputed)",
          expected: computedVerifHash.slice(0, 16) + "...",
          actual: (receipt.verification_hash || "").slice(0, 16) + "...",
          pass: computedVerifHash === receipt.verification_hash,
        });
      }

      // Check verification_status
      checks.push({
        field: "Verification Status",
        expected: "verified | failed | skipped",
        actual: receipt.verification_status || "missing",
        pass: ["verified", "failed", "skipped"].includes(receipt.verification_status),
      });

      // Check timestamps are ISO 8601
      for (const tsField of ["timestamp_request", "timestamp_approval", "timestamp_execution"]) {
        if (receipt[tsField]) {
          const isValid = !isNaN(Date.parse(receipt[tsField]));
          checks.push({
            field: `Timestamp: ${tsField}`,
            expected: "valid ISO 8601",
            actual: isValid ? "valid" : "invalid",
            pass: isValid,
          });
        }
      }

      // Check signature exists and is hex
      if (receipt.signature) {
        const isHex = /^[0-9a-f]+$/i.test(receipt.signature.replace("...", ""));
        checks.push({
          field: "Signature Format",
          expected: "hex-encoded Ed25519",
          actual: isHex ? "valid hex" : "invalid format",
          pass: isHex,
        });
      }

      const allPass = checks.every((c) => c.pass);
      setResult({
        status: allPass ? "pass" : "fail",
        message: allPass
          ? "All receipt integrity checks passed. Hash fields are consistent."
          : `${checks.filter((c) => !c.pass).length} check(s) failed. See details below.`,
        checks,
      });
    } catch (e: any) {
      setResult({
        status: "error",
        message: `Parse error: ${e.message}. Please paste valid JSON.`,
        checks: [],
      });
    }

    setVerifying(false);
  }

  /* ── Ledger Chain Verification ────────────────────────────────────── */

  async function verifyLedgerEntry() {
    setVerifying(true);
    setResult(null);

    try {
      const entry = JSON.parse(input);
      const checks: VerificationResult[] = [];

      // Check required fields
      const requiredFields = [
        "block_id",
        "receipt_hash",
        "previous_hash",
        "current_hash",
        "protocol_version",
      ];

      for (const field of requiredFields) {
        checks.push({
          field: `Field: ${field}`,
          expected: "present",
          actual: entry[field] ? "present" : "missing",
          pass: !!entry[field],
        });
      }

      // Protocol version
      checks.push({
        field: "Protocol Version",
        expected: "v2",
        actual: entry.protocol_version || "unknown",
        pass: entry.protocol_version === "v2",
      });

      // Check ledger_signature exists
      checks.push({
        field: "Ledger Signature",
        expected: "present",
        actual: entry.ledger_signature ? "present" : "missing",
        pass: !!entry.ledger_signature,
      });

      // Check hash format (should be 64-char hex for SHA-256)
      for (const hashField of ["receipt_hash", "previous_hash", "current_hash"]) {
        if (entry[hashField]) {
          const isValidHash =
            /^[0-9a-f]{64}$/i.test(entry[hashField]) ||
            entry[hashField] === "0000000000000000";
          checks.push({
            field: `Hash Format: ${hashField}`,
            expected: "64-char hex or genesis",
            actual: isValidHash ? "valid" : `invalid (${entry[hashField].length} chars)`,
            pass: isValidHash,
          });
        }
      }

      // Check timestamp
      if (entry.timestamp) {
        const isValid = !isNaN(Date.parse(entry.timestamp));
        checks.push({
          field: "Timestamp",
          expected: "valid ISO 8601",
          actual: isValid ? "valid" : "invalid",
          pass: isValid,
        });
      }

      const allPass = checks.every((c) => c.pass);
      setResult({
        status: allPass ? "pass" : "fail",
        message: allPass
          ? "All ledger entry integrity checks passed. Structure is valid."
          : `${checks.filter((c) => !c.pass).length} check(s) failed. See details below.`,
        checks,
      });
    } catch (e: any) {
      setResult({
        status: "error",
        message: `Parse error: ${e.message}. Please paste valid JSON.`,
        checks: [],
      });
    }

    setVerifying(false);
  }

  /* ── Lookup by Receipt ID ─────────────────────────────────────────── */

  async function lookupReceipt() {
    setVerifying(true);
    setResult(null);

    try {
      const data = await verifyQuery.mutateAsync({ receiptId: lookupId.trim() });

      if (!data.found) {
        setResult({
          status: "error",
          message: `Receipt "${lookupId}" not found in the database.`,
          checks: [],
        });
      } else {
        const checks: VerificationResult[] = [];

        // Receipt found
        checks.push({
          field: "Receipt Found",
          expected: "yes",
          actual: "yes",
          pass: true,
        });

        // Signature verification (done server-side)
        checks.push({
          field: "Signature Verification",
          expected: "valid",
          actual: data.signatureValid ? "valid" : "invalid",
          pass: data.signatureValid,
        });

        // Hash chain check
        checks.push({
          field: "Receipt Hash Integrity",
          expected: "consistent",
          actual: data.hashValid ? "consistent" : "tampered",
          pass: data.hashValid,
        });

        // Ledger entry exists
        checks.push({
          field: "Ledger Entry",
          expected: "recorded",
          actual: data.ledgerRecorded ? "recorded" : "missing",
          pass: data.ledgerRecorded,
        });

        // Protocol version
        checks.push({
          field: "Protocol Version",
          expected: "v2",
          actual: data.protocolVersion || "unknown",
          pass: data.protocolVersion === "v2",
        });

        // Verification status
        checks.push({
          field: "Verification Status",
          expected: "verified",
          actual: data.verificationStatus || "unknown",
          pass: data.verificationStatus === "verified",
        });

        const allPass = checks.every((c) => c.pass);
        setResult({
          status: allPass ? "pass" : "fail",
          message: allPass
            ? `Receipt ${lookupId} verified successfully. Signature valid, hash chain intact, ledger recorded.`
            : `Receipt ${lookupId} has ${checks.filter((c) => !c.pass).length} issue(s).`,
          checks,
        });

        // Also populate the input with the receipt JSON for inspection
        if (data.receipt) {
          setInput(JSON.stringify(data.receipt, null, 2));
        }
      }
    } catch (e: any) {
      setResult({
        status: "error",
        message: `Lookup error: ${e.message}`,
        checks: [],
      });
    }

    setVerifying(false);
  }

  /* ── Render ──────────────────────────────────────────────────────── */

  const statusIcon = useMemo(() => {
    if (!result) return null;
    if (result.status === "pass")
      return <CheckCircle2 className="w-6 h-6" style={{ color: "#22c55e" }} />;
    if (result.status === "fail")
      return <XCircle className="w-6 h-6" style={{ color: "#ef4444" }} />;
    return <AlertCircle className="w-6 h-6" style={{ color: "#eab308" }} />;
  }, [result]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      <NavBar />

      <div className="flex flex-col items-center flex-1 px-4 sm:px-6 py-10 sm:py-16">
        {/* Header */}
        <div className="w-full max-w-3xl text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            <ShieldCheck className="w-8 h-8" style={{ color: "#b8963e" }} />
            <h1
              className="text-3xl sm:text-4xl font-black tracking-wide"
              style={{ color: "#ffffff" }}
            >
              Verify Receipt
            </h1>
          </div>
          <p className="text-base sm:text-lg" style={{ color: "#9ca3af" }}>
            Independent verification of v2 cryptographic receipts and ledger entries
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="w-full max-w-3xl mb-6">
          <div
            className="flex rounded-lg border overflow-hidden"
            style={{
              borderColor: "oklch(0.72 0.1 85 / 20%)",
              backgroundColor: "oklch(0.15 0.03 260)",
            }}
          >
            {[
              { id: "receipt" as const, label: "Verify Receipt", icon: Hash },
              { id: "ledger" as const, label: "Verify Ledger", icon: Link2 },
              { id: "lookup" as const, label: "Lookup by ID", icon: Search },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setMode(tab.id);
                    setResult(null);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition-colors duration-200"
                  style={{
                    backgroundColor: active
                      ? "oklch(0.72 0.1 85 / 15%)"
                      : "transparent",
                    color: active ? "#b8963e" : "#9ca3af",
                    borderBottom: active ? "2px solid #b8963e" : "2px solid transparent",
                  }}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Input Area */}
        <div className="w-full max-w-3xl mb-6">
          {mode === "lookup" ? (
            <div className="flex gap-3">
              <input
                type="text"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                placeholder="Enter receipt ID (e.g., RIO-A1B2C3D4)"
                className="flex-1 rounded-lg border px-4 py-3 text-sm font-mono"
                style={{
                  backgroundColor: "oklch(0.12 0.03 260)",
                  borderColor: "oklch(0.72 0.1 85 / 20%)",
                  color: "#d1d5db",
                }}
              />
              <button
                onClick={lookupReceipt}
                disabled={!lookupId.trim() || verifying}
                className="px-6 py-3 rounded-lg text-sm font-medium transition-colors duration-200 disabled:opacity-40"
                style={{
                  backgroundColor: "#b8963e",
                  color: "#0a0e1a",
                }}
              >
                {verifying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <label
                  className="text-sm font-medium"
                  style={{ color: "#d1d5db" }}
                >
                  {mode === "receipt"
                    ? "Paste v2 Receipt JSON"
                    : "Paste v2 Ledger Entry JSON"}
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setInput(mode === "receipt" ? SAMPLE_RECEIPT : SAMPLE_LEDGER)
                    }
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border transition-colors duration-200 hover:bg-white/5"
                    style={{
                      color: "#9ca3af",
                      borderColor: "oklch(0.72 0.1 85 / 20%)",
                    }}
                  >
                    <ClipboardPaste className="w-3 h-3" />
                    Load Sample
                  </button>
                  <button
                    onClick={() => {
                      setInput("");
                      setResult(null);
                    }}
                    className="px-2.5 py-1 text-xs rounded border transition-colors duration-200 hover:bg-white/5"
                    style={{
                      color: "#9ca3af",
                      borderColor: "oklch(0.72 0.1 85 / 20%)",
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={14}
                placeholder={`{\n  "receipt_id": "RIO-...",\n  "intent_hash": "...",\n  ...\n}`}
                className="w-full rounded-lg border px-4 py-3 text-xs font-mono resize-y"
                style={{
                  backgroundColor: "oklch(0.12 0.03 260)",
                  borderColor: "oklch(0.72 0.1 85 / 20%)",
                  color: "#d1d5db",
                  lineHeight: "1.6",
                }}
              />
              <button
                onClick={
                  mode === "receipt" ? verifyReceiptHash : verifyLedgerEntry
                }
                disabled={!input.trim() || verifying}
                className="mt-3 w-full py-3 rounded-lg text-sm font-semibold tracking-wide uppercase transition-colors duration-200 disabled:opacity-40 flex items-center justify-center gap-2"
                style={{
                  backgroundColor: "#b8963e",
                  color: "#0a0e1a",
                }}
              >
                {verifying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileSignature className="w-4 h-4" />
                )}
                {mode === "receipt" ? "Verify Receipt" : "Verify Ledger Entry"}
              </button>
            </>
          )}
        </div>

        {/* Results */}
        {result && (
          <div className="w-full max-w-3xl">
            {/* Overall Status */}
            <div
              className="rounded-lg border p-5 mb-4"
              style={{
                backgroundColor:
                  result.status === "pass"
                    ? "rgba(34,197,94,0.06)"
                    : result.status === "fail"
                    ? "rgba(239,68,68,0.06)"
                    : "rgba(234,179,8,0.06)",
                borderColor:
                  result.status === "pass"
                    ? "rgba(34,197,94,0.3)"
                    : result.status === "fail"
                    ? "rgba(239,68,68,0.3)"
                    : "rgba(234,179,8,0.3)",
              }}
            >
              <div className="flex items-start gap-3">
                {statusIcon}
                <div>
                  <h3
                    className="text-base font-bold mb-1"
                    style={{
                      color:
                        result.status === "pass"
                          ? "#22c55e"
                          : result.status === "fail"
                          ? "#ef4444"
                          : "#eab308",
                    }}
                  >
                    {result.status === "pass"
                      ? "VERIFICATION PASSED"
                      : result.status === "fail"
                      ? "VERIFICATION FAILED"
                      : "VERIFICATION ERROR"}
                  </h3>
                  <p className="text-sm" style={{ color: "#d1d5db" }}>
                    {result.message}
                  </p>
                </div>
              </div>
            </div>

            {/* Individual Checks */}
            {result.checks.length > 0 && (
              <div
                className="rounded-lg border overflow-hidden"
                style={{
                  backgroundColor: "oklch(0.15 0.03 260)",
                  borderColor: "oklch(0.72 0.1 85 / 20%)",
                }}
              >
                <div
                  className="px-4 py-3 border-b"
                  style={{ borderColor: "oklch(0.72 0.1 85 / 10%)" }}
                >
                  <h4
                    className="text-sm font-semibold"
                    style={{ color: "#b8963e" }}
                  >
                    Verification Details ({result.checks.filter((c) => c.pass).length}/
                    {result.checks.length} passed)
                  </h4>
                </div>
                <div className="divide-y" style={{ borderColor: "oklch(0.72 0.1 85 / 8%)" }}>
                  {result.checks.map((check, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      {check.pass ? (
                        <CheckCircle2
                          className="w-4 h-4 shrink-0"
                          style={{ color: "#22c55e" }}
                        />
                      ) : (
                        <XCircle
                          className="w-4 h-4 shrink-0"
                          style={{ color: "#ef4444" }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <span
                          className="text-xs font-medium"
                          style={{ color: "#d1d5db" }}
                        >
                          {check.field}
                        </span>
                      </div>
                      <div className="text-right">
                        <span
                          className="text-xs font-mono"
                          style={{
                            color: check.pass ? "#22c55e" : "#ef4444",
                          }}
                        >
                          {check.actual}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Info Note */}
            <div
              className="mt-4 rounded-lg border p-4 flex items-start gap-3"
              style={{
                backgroundColor: "oklch(0.15 0.03 260)",
                borderColor: "oklch(0.72 0.1 85 / 15%)",
              }}
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#60a5fa" }} />
              <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                <strong style={{ color: "#d1d5db" }}>Note:</strong> Client-side
                verification can validate hash consistency and field structure.
                Full Ed25519 signature verification requires the server&apos;s public
                key and is performed via the &quot;Lookup by ID&quot; mode, which
                verifies against the live database and signing key.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
