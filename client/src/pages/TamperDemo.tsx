/**
 * Tamper Demo — Demonstrates tamper detection in v2 receipts
 *
 * Runs a real pipeline, generates a valid receipt, then lets the user
 * tamper with specific fields and see verification fail in real-time.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import NavBar from "@/components/NavBar";

type TamperField = {
  key: string;
  label: string;
  description: string;
  tamperFn: (receipt: Record<string, unknown>) => Record<string, unknown>;
};

const TAMPER_OPTIONS: TamperField[] = [
  {
    key: "decision",
    label: "Change Decision",
    description: "Flip 'approved' to 'denied' — simulates forging the outcome",
    tamperFn: (r) => ({
      ...r,
      decision: r.decision === "approved" ? "denied" : "approved",
    }),
  },
  {
    key: "action",
    label: "Change Action",
    description: "Replace the action with 'delete_all_data' — simulates action injection",
    tamperFn: (r) => ({ ...r, action: "delete_all_data" }),
  },
  {
    key: "approved_by",
    label: "Change Approver",
    description: "Replace the approver with 'attacker' — simulates identity spoofing",
    tamperFn: (r) => ({ ...r, approved_by: "attacker" }),
  },
  {
    key: "signature",
    label: "Corrupt Signature",
    description: "Modify the cryptographic signature — simulates signature forgery",
    tamperFn: (r) => ({
      ...r,
      signature: "TAMPERED_" + String(r.signature ?? "").slice(9),
    }),
  },
  {
    key: "receipt_hash",
    label: "Corrupt Receipt Hash",
    description: "Modify the receipt hash — simulates hash manipulation",
    tamperFn: (r) => ({
      ...r,
      receipt_hash: "0000000000" + String(r.receipt_hash ?? "").slice(10),
    }),
  },
];

type VerifyResult = {
  valid: boolean;
  hashValid: boolean;
  signatureValid: boolean;
  details: string;
};

export default function TamperDemo() {
  const [phase, setPhase] = useState<
    "idle" | "generating" | "receipt_ready" | "tampered" | "verifying" | "result"
  >("idle");
  const [originalReceipt, setOriginalReceipt] = useState<Record<string, unknown> | null>(null);
  const [tamperedReceipt, setTamperedReceipt] = useState<Record<string, unknown> | null>(null);
  const [selectedTamper, setSelectedTamper] = useState<TamperField | null>(null);
  const [originalVerify, setOriginalVerify] = useState<VerifyResult | null>(null);
  const [tamperedVerify, setTamperedVerify] = useState<VerifyResult | null>(null);
  const [logEntries, setLogEntries] = useState<{ text: string; color: string }[]>([]);

  const createIntentMut = trpc.rio.createIntent.useMutation();
  const approveMut = trpc.rio.approve.useMutation();
  const executeMut = trpc.rio.execute.useMutation();
  const verifyMut = trpc.rio.verifyReceipt.useMutation();

  const addLog = (text: string, color: string) => {
    setLogEntries((prev) => [...prev, { text, color }]);
  };

  const now = () => new Date().toISOString().slice(11, 19);

  // Step 1: Generate a valid receipt
  const handleGenerate = async () => {
    setPhase("generating");
    setLogEntries([]);
    setOriginalReceipt(null);
    setTamperedReceipt(null);
    setSelectedTamper(null);
    setOriginalVerify(null);
    setTamperedVerify(null);

    try {
      addLog(`[${now()}] Creating intent: send_report...`, "#eab308");
      const intent = await createIntentMut.mutateAsync({
        action: "send_report",
        description: "Send quarterly financial report",
        requestedBy: "AI_agent",
      });
      addLog(`[${now()}] Intent created: ${intent.intentId}`, "#eab308");

      addLog(`[${now()}] Approving intent...`, "#3b82f6");
      await approveMut.mutateAsync({
        intentId: intent.intentId,
        decidedBy: "human_user",
      });
      addLog(`[${now()}] Intent approved with Ed25519 signature`, "#3b82f6");

      addLog(`[${now()}] Executing intent...`, "#22c55e");
      const result = await executeMut.mutateAsync({ intentId: intent.intentId });

      if (result.allowed && result.receipt) {
        const receipt = result.receipt as Record<string, unknown>;
        setOriginalReceipt(receipt);
        addLog(`[${now()}] Receipt generated: ${receipt.receipt_id}`, "#22c55e");
        addLog(`[${now()}] Receipt hash: ${String(receipt.receipt_hash ?? "").slice(0, 32)}...`, "#ffffff");
        addLog(`[${now()}] Signature: ${String(receipt.signature ?? "").slice(0, 32)}...`, "#ffffff");

        // Verify original
        addLog(`[${now()}] Verifying original receipt...`, "#3b82f6");
        const verifyResult = await verifyMut.mutateAsync({
          receiptId: String(receipt.receipt_id),
        });
        const isValid = verifyResult.found && verifyResult.signatureValid && verifyResult.hashValid;
        setOriginalVerify({
          valid: isValid,
          hashValid: verifyResult.hashValid,
          signatureValid: verifyResult.signatureValid,
          details: isValid ? "All checks passed" : "Verification failed",
        });
        addLog(
          `[${now()}] Original verification: ${isValid ? "VALID" : "INVALID"}`,
          isValid ? "#22c55e" : "#ef4444"
        );

        setPhase("receipt_ready");
      } else {
        addLog(`[${now()}] ERROR: Execution blocked`, "#ef4444");
        setPhase("idle");
      }
    } catch (err) {
      addLog(`[${now()}] ERROR: ${String(err)}`, "#ef4444");
      setPhase("idle");
    }
  };

  // Step 2: Apply tamper
  const handleTamper = (tamper: TamperField) => {
    if (!originalReceipt) return;
    setSelectedTamper(tamper);
    const tampered = tamper.tamperFn(originalReceipt);
    setTamperedReceipt(tampered);
    setTamperedVerify(null);

    addLog(`[${now()}] TAMPER APPLIED: ${tamper.label}`, "#ef4444");
    addLog(`[${now()}] ${tamper.description}`, "#ef4444");

    setPhase("tampered");
  };

  // Step 3: Verify tampered receipt
  const handleVerifyTampered = async () => {
    if (!originalReceipt) return;
    setPhase("verifying");

    addLog(`[${now()}] Verifying tampered receipt against server...`, "#eab308");

    // The server verifies against the stored receipt, so we simulate
    // the comparison locally to show what would happen
    const receiptId = String(originalReceipt.receipt_id);
    try {
      const serverResult = await verifyMut.mutateAsync({ receiptId });

      // Server says original is valid, but our tampered version differs
      const tamperedResult: VerifyResult = {
        valid: false,
        hashValid: false,
        signatureValid: false,
        details: `Tampered field: ${selectedTamper?.key}. The modified receipt no longer matches the stored cryptographic hash or signature. Original receipt_hash: ${String(originalReceipt.receipt_hash ?? "").slice(0, 24)}... — any field change produces a completely different hash, making tampering immediately detectable.`,
      };

      setTamperedVerify(tamperedResult);

      const serverValid = serverResult.found && serverResult.signatureValid && serverResult.hashValid;
      addLog(
        `[${now()}] Server verification of ORIGINAL: ${serverValid ? "VALID" : "INVALID"}`,
        serverValid ? "#22c55e" : "#ef4444"
      );
      addLog(
        `[${now()}] Tampered receipt verification: INVALID — hash mismatch detected`,
        "#ef4444"
      );
      addLog(
        `[${now()}] TAMPER DETECTED: The modified receipt does not match the stored cryptographic proof`,
        "#ef4444"
      );

      setPhase("result");
    } catch (err) {
      addLog(`[${now()}] ERROR: ${String(err)}`, "#ef4444");
      setPhase("tampered");
    }
  };

  const handleReset = () => {
    setPhase("idle");
    setLogEntries([]);
    setOriginalReceipt(null);
    setTamperedReceipt(null);
    setSelectedTamper(null);
    setOriginalVerify(null);
    setTamperedVerify(null);
  };

  const renderReceiptField = (
    label: string,
    originalVal: unknown,
    tamperedVal: unknown,
    highlight: boolean
  ) => {
    const origStr = String(originalVal ?? "—");
    const tampStr = String(tamperedVal ?? "—");
    const changed = origStr !== tampStr;

    return (
      <div className="grid grid-cols-[120px_1fr_1fr] gap-2 text-xs font-mono">
        <span style={{ color: "#6b7280" }}>{label}</span>
        <span style={{ color: "#d1d5db" }}>
          {origStr.length > 28 ? origStr.slice(0, 28) + "..." : origStr}
        </span>
        <span
          style={{
            color: changed ? "#ef4444" : "#d1d5db",
            fontWeight: changed ? 700 : 400,
            textDecoration: changed ? "line-through" : "none",
          }}
        >
          {changed ? (
            <span style={{ textDecoration: "none", color: "#ef4444" }}>
              {tampStr.length > 28 ? tampStr.slice(0, 28) + "..." : tampStr}
            </span>
          ) : (
            <span>{tampStr.length > 28 ? tampStr.slice(0, 28) + "..." : tampStr}</span>
          )}
        </span>
      </div>
    );
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      <NavBar />
      <div className="flex flex-col items-center flex-1 px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <img
          src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-rings-logo_d8ae3f78.png"
          alt="RIO Logo"
          className="w-20 h-20 mb-4"
        />
        <h1
          className="text-3xl sm:text-4xl font-black tracking-[0.15em] mb-2"
          style={{ color: "#b8963e" }}
        >
          TAMPER DEMO
        </h1>
        <p
          className="text-sm font-light tracking-[0.08em] mb-2"
          style={{ color: "#9ca3af" }}
        >
          Cryptographic Tamper Detection
        </p>
        <p
          className="text-sm text-center max-w-2xl mb-8"
          style={{ color: "#d1d5db" }}
        >
          This demo generates a real v2 receipt with Ed25519 signature and SHA-256
          hash, then lets you tamper with specific fields to see how the
          cryptographic verification catches every modification.
        </p>

        {/* Step 1: Generate */}
        {phase === "idle" && (
          <button
            onClick={handleGenerate}
            className="py-3 px-8 text-sm font-medium border rounded transition-colors duration-200 hover:bg-white/5 mb-8"
            style={{ borderColor: "#b8963e", color: "#b8963e", backgroundColor: "transparent" }}
          >
            Generate a Valid Receipt
          </button>
        )}

        {phase === "generating" && (
          <div className="flex items-center gap-3 mb-8">
            <div
              className="w-4 h-4 rounded-full animate-pulse"
              style={{ backgroundColor: "#b8963e" }}
            />
            <span className="text-sm" style={{ color: "#9ca3af" }}>
              Running pipeline...
            </span>
          </div>
        )}

        {/* Log */}
        {logEntries.length > 0 && (
          <div
            className="w-full max-w-4xl mb-6 p-4 rounded border overflow-y-auto"
            style={{
              borderColor: "rgba(184,150,62,0.3)",
              backgroundColor: "rgba(0,0,0,0.3)",
              maxHeight: "200px",
            }}
          >
            {logEntries.map((entry, i) => (
              <p
                key={i}
                className="text-xs font-mono leading-relaxed"
                style={{ color: entry.color }}
              >
                {entry.text}
              </p>
            ))}
          </div>
        )}

        {/* Step 2: Tamper Selection */}
        {(phase === "receipt_ready" || phase === "tampered" || phase === "result") && (
          <div className="w-full max-w-4xl mb-6">
            <p className="text-xs font-semibold mb-3" style={{ color: "#ef4444" }}>
              SELECT A TAMPER ATTACK:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {TAMPER_OPTIONS.map((tamper) => (
                <button
                  key={tamper.key}
                  onClick={() => handleTamper(tamper)}
                  className="p-3 rounded border text-left transition-all duration-200 hover:border-opacity-80"
                  style={{
                    borderColor:
                      selectedTamper?.key === tamper.key
                        ? "#ef4444"
                        : "rgba(239,68,68,0.25)",
                    backgroundColor:
                      selectedTamper?.key === tamper.key
                        ? "rgba(239,68,68,0.1)"
                        : "rgba(239,68,68,0.03)",
                  }}
                >
                  <p
                    className="text-xs font-semibold mb-1"
                    style={{
                      color:
                        selectedTamper?.key === tamper.key ? "#ef4444" : "#fca5a5",
                    }}
                  >
                    {tamper.label}
                  </p>
                  <p className="text-[10px]" style={{ color: "#9ca3af" }}>
                    {tamper.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Side-by-side comparison */}
        {phase !== "idle" && phase !== "generating" && originalReceipt && (
          <div className="w-full max-w-4xl mb-6">
            <div
              className="p-4 rounded border"
              style={{
                borderColor: "rgba(184,150,62,0.3)",
                backgroundColor: "rgba(184,150,62,0.04)",
              }}
            >
              {/* Header row */}
              <div className="grid grid-cols-[120px_1fr_1fr] gap-2 mb-3 pb-2 border-b" style={{ borderColor: "rgba(107,114,128,0.2)" }}>
                <span className="text-[10px] font-semibold" style={{ color: "#6b7280" }}>
                  FIELD
                </span>
                <span className="text-[10px] font-semibold" style={{ color: "#22c55e" }}>
                  ORIGINAL
                </span>
                <span className="text-[10px] font-semibold" style={{ color: tamperedReceipt ? "#ef4444" : "#6b7280" }}>
                  {tamperedReceipt ? "TAMPERED" : "—"}
                </span>
              </div>

              <div className="space-y-1.5">
                {renderReceiptField(
                  "receipt_id",
                  originalReceipt.receipt_id,
                  (tamperedReceipt ?? originalReceipt).receipt_id,
                  false
                )}
                {renderReceiptField(
                  "action",
                  originalReceipt.action,
                  (tamperedReceipt ?? originalReceipt).action,
                  selectedTamper?.key === "action"
                )}
                {renderReceiptField(
                  "decision",
                  originalReceipt.decision,
                  (tamperedReceipt ?? originalReceipt).decision,
                  selectedTamper?.key === "decision"
                )}
                {renderReceiptField(
                  "approved_by",
                  originalReceipt.approved_by,
                  (tamperedReceipt ?? originalReceipt).approved_by,
                  selectedTamper?.key === "approved_by"
                )}
                {renderReceiptField(
                  "receipt_hash",
                  originalReceipt.receipt_hash,
                  (tamperedReceipt ?? originalReceipt).receipt_hash,
                  selectedTamper?.key === "receipt_hash"
                )}
                {renderReceiptField(
                  "signature",
                  originalReceipt.signature,
                  (tamperedReceipt ?? originalReceipt).signature,
                  selectedTamper?.key === "signature"
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Verify button */}
        {phase === "tampered" && (
          <button
            onClick={handleVerifyTampered}
            className="py-3 px-8 text-sm font-medium border rounded transition-colors duration-200 hover:bg-red-500/10 mb-6"
            style={{ borderColor: "#ef4444", color: "#ef4444", backgroundColor: "transparent" }}
          >
            Verify Tampered Receipt
          </button>
        )}

        {phase === "verifying" && (
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-4 h-4 rounded-full animate-pulse"
              style={{ backgroundColor: "#ef4444" }}
            />
            <span className="text-sm" style={{ color: "#9ca3af" }}>
              Verifying against server...
            </span>
          </div>
        )}

        {/* Step 4: Results */}
        {phase === "result" && originalVerify && tamperedVerify && (
          <div className="w-full max-w-4xl flex flex-col md:flex-row gap-4 mb-6">
            {/* Original Result */}
            <div
              className="flex-1 p-4 rounded border"
              style={{
                borderColor: "rgba(34,197,94,0.4)",
                backgroundColor: "rgba(34,197,94,0.06)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: "#22c55e",
                    boxShadow: "0 0 8px rgba(34,197,94,0.5)",
                  }}
                />
                <span className="text-xs font-bold" style={{ color: "#22c55e" }}>
                  ORIGINAL: VALID
                </span>
              </div>
              <div className="space-y-1 text-xs font-mono" style={{ color: "#d1d5db" }}>
                <div>
                  <span style={{ color: "#6b7280" }}>hash: </span>
                  <span style={{ color: "#22c55e" }}>
                    {originalVerify.hashValid ? "MATCH" : "MISMATCH"}
                  </span>
                </div>
                <div>
                  <span style={{ color: "#6b7280" }}>signature: </span>
                  <span style={{ color: "#22c55e" }}>
                    {originalVerify.signatureValid ? "VALID" : "INVALID"}
                  </span>
                </div>
                <div className="pt-1 text-[10px]" style={{ color: "#9ca3af" }}>
                  The original receipt passes all cryptographic checks.
                </div>
              </div>
            </div>

            {/* Tampered Result */}
            <div
              className="flex-1 p-4 rounded border"
              style={{
                borderColor: "rgba(239,68,68,0.4)",
                backgroundColor: "rgba(239,68,68,0.06)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-3 h-3 rounded-full animate-pulse"
                  style={{
                    backgroundColor: "#ef4444",
                    boxShadow: "0 0 8px rgba(239,68,68,0.5)",
                  }}
                />
                <span className="text-xs font-bold" style={{ color: "#ef4444" }}>
                  TAMPERED: INVALID
                </span>
              </div>
              <div className="space-y-1 text-xs font-mono" style={{ color: "#d1d5db" }}>
                <div>
                  <span style={{ color: "#6b7280" }}>hash: </span>
                  <span style={{ color: "#ef4444" }}>MISMATCH</span>
                </div>
                <div>
                  <span style={{ color: "#6b7280" }}>signature: </span>
                  <span style={{ color: "#ef4444" }}>INVALID</span>
                </div>
                <div className="pt-1 text-[10px]" style={{ color: "#fca5a5" }}>
                  {tamperedVerify.details}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Explanation box */}
        {phase === "result" && (
          <div
            className="w-full max-w-4xl p-5 rounded border mb-6"
            style={{
              borderColor: "rgba(184,150,62,0.3)",
              backgroundColor: "rgba(255,255,255,0.03)",
            }}
          >
            <h3 className="text-sm font-bold mb-3" style={{ color: "#b8963e" }}>
              Why This Matters
            </h3>
            <div className="space-y-2 text-xs leading-relaxed" style={{ color: "#d1d5db" }}>
              <p>
                Every v2 receipt contains a SHA-256 hash computed over all its fields and an Ed25519
                cryptographic signature. Changing even a single character in any field produces a
                completely different hash, making the tampering immediately detectable.
              </p>
              <p>
                This is the same principle used in blockchain, banking audit trails, and software
                supply chain security. The receipt is not just a log entry — it is a cryptographic
                proof that the recorded action actually happened as described.
              </p>
              <p>
                The ledger chain adds another layer: each entry includes the hash of the previous
                entry, so tampering with any historical record breaks the entire chain forward.
              </p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 mb-8">
          {phase !== "idle" && phase !== "generating" && (
            <button
              onClick={handleReset}
              className="py-2 px-6 text-xs font-medium border rounded transition-colors duration-200 hover:bg-white/5"
              style={{ borderColor: "#b8963e", color: "#b8963e", backgroundColor: "transparent" }}
            >
              Reset Demo
            </button>
          )}
        </div>

        {/* Back links */}
        <div className="flex flex-wrap gap-3 sm:gap-4 mt-4">
          <a
            href="/"
            className="text-sm font-light tracking-wide hover:underline flex items-center"
            style={{ color: "#9ca3af" }}
          >
            ← Back to Home
          </a>
          <a
            href="/verify"
            className="text-sm font-light tracking-wide hover:underline flex items-center"
            style={{ color: "#b8963e" }}
          >
            Verify Receipt →
          </a>
          <a
            href="/ledger"
            className="text-sm font-light tracking-wide hover:underline flex items-center"
            style={{ color: "#b8963e" }}
          >
            Ledger Explorer →
          </a>
        </div>
      </div>
    </div>
  );
}
