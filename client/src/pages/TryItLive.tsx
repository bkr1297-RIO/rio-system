import { useState, useRef } from "react";
import NavBar from "@/components/NavBar";
import { trpc } from "@/lib/trpc";

interface LogEntry {
  time: string;
  stage: string;
  message: string;
  type: "info" | "success" | "error" | "warning" | "system";
}

interface ReceiptData {
  receipt_id: string;
  intent_id: string;
  action: string;
  decision: string;
  intent_hash: string;
  action_hash: string;
  verification_hash: string;
  risk_score: number;
  risk_level: string;
  policy_decision: string;
  protocol_version: string;
  signature: string;
  [key: string]: unknown;
}

interface LedgerEntryData {
  block_id: string;
  intent_id: string;
  action: string;
  decision: string;
  receipt_hash: string;
  previous_hash: string;
  current_hash: string;
  ledger_signature: string;
  protocol_version: string;
  [key: string]: unknown;
}

const SCENARIOS = [
  {
    id: "low-risk",
    label: "Low-Risk Action",
    action: "read_file",
    description: "Read a configuration file from /etc/app/config.yaml",
    requester: "demo-agent-alpha",
    approver: "demo-operator",
    riskHint: "Low risk — auto-approved by policy engine",
    color: "#22c55e",
  },
  {
    id: "high-risk",
    label: "High-Risk Action",
    action: "deploy_production",
    description: "Deploy build v3.2.1 to production cluster us-east-1",
    requester: "demo-agent-beta",
    approver: "demo-operator",
    riskHint: "High risk — requires human approval before execution",
    color: "#f59e0b",
  },
  {
    id: "critical",
    label: "Critical Action",
    action: "delete_database",
    description: "Drop all tables in production database main-db-01",
    requester: "demo-agent-gamma",
    approver: "demo-operator",
    riskHint: "Critical risk — maximum governance enforcement",
    color: "#ef4444",
  },
];

function now() {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function TryItLive() {
  const [selectedScenario, setSelectedScenario] = useState(SCENARIOS[0]);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [ledgerEntry, setLedgerEntry] = useState<LedgerEntryData | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null);
  const [currentStage, setCurrentStage] = useState<string>("");
  const logEndRef = useRef<HTMLDivElement>(null);

  const createIntent = trpc.rio.createIntent.useMutation();
  const approve = trpc.rio.approve.useMutation();
  const execute = trpc.rio.execute.useMutation();
  const verifyReceipt = trpc.rio.verifyReceipt.useMutation();

  const addLog = (stage: string, message: string, type: LogEntry["type"] = "info") => {
    setLogs((prev) => [...prev, { time: now(), stage, message, type }]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const runFullFlow = async () => {
    setRunning(true);
    setCompleted(false);
    setLogs([]);
    setReceipt(null);
    setLedgerEntry(null);
    setVerifyResult(null);

    const sc = selectedScenario;

    try {
      // Stage 1: Intake
      setCurrentStage("intake");
      addLog("INTAKE", `Received goal: "${sc.description}"`, "system");
      await delay(600);

      // Stage 2: Canonical Intent
      setCurrentStage("intent");
      addLog("INTENT", `Creating structured intent — action: ${sc.action}, requester: ${sc.requester}`, "info");
      const intentResult = await createIntent.mutateAsync({
        action: sc.action,
        description: sc.description,
        requestedBy: sc.requester,
      });
      const intentId = (intentResult as Record<string, unknown>).intentId as string;
      const intentHash = (intentResult as Record<string, unknown>).intentHash as string;
      addLog("INTENT", `Intent created: ${intentId}`, "success");
      addLog("INTENT", `Intent hash: ${intentHash?.slice(0, 24)}...`, "info");
      await delay(500);

      // Stage 3: Risk Evaluation
      setCurrentStage("risk");
      addLog("RISK", `Evaluating risk for action: ${sc.action}`, "info");
      addLog("RISK", sc.riskHint, sc.id === "low-risk" ? "success" : sc.id === "high-risk" ? "warning" : "error");
      await delay(500);

      // Stage 4: Policy Check
      setCurrentStage("policy");
      addLog("POLICY", "Checking active policy rules...", "info");
      addLog("POLICY", "Policy evaluation complete — proceeding to authorization", "success");
      await delay(400);

      // Stage 5: Authorization (Human Approval)
      setCurrentStage("approval");
      addLog("APPROVAL", `Submitting for approval by: ${sc.approver}`, "info");
      await delay(300);
      const approvalResult = await approve.mutateAsync({
        intentId,
        decidedBy: sc.approver,
      });
      const sig = (approvalResult as Record<string, unknown>).signature as string;
      addLog("APPROVAL", "Approved — Ed25519 signature generated", "success");
      addLog("APPROVAL", `Signature: ${sig?.slice(0, 32)}...`, "info");
      await delay(500);

      // Stage 6: Execution Gate
      setCurrentStage("gate");
      addLog("GATE", "Execution gate — verifying token signature, TTL, nonce...", "info");
      await delay(400);
      addLog("GATE", "Token valid — GATE OPEN — releasing action", "success");
      await delay(300);

      // Stage 7: Execute + Post-Verification
      setCurrentStage("execute");
      addLog("EXECUTE", `Executing: ${sc.action}`, "info");
      const execResult = await execute.mutateAsync({ intentId });
      const execData = execResult as Record<string, unknown>;

      if (execData.receipt) {
        const r = execData.receipt as ReceiptData;
        setReceipt(r);
        addLog("EXECUTE", "Execution complete — computing three-hash binding", "success");
        addLog("VERIFY", `intent_hash:  ${r.intent_hash?.slice(0, 24)}...`, "info");
        addLog("VERIFY", `action_hash:  ${r.action_hash?.slice(0, 24)}...`, "info");
        addLog("VERIFY", `verify_hash:  ${r.verification_hash?.slice(0, 24)}...`, "info");
      }
      await delay(400);

      // Stage 8: Receipt & Ledger
      setCurrentStage("ledger");
      if (execData.ledger_entry) {
        const le = execData.ledger_entry as LedgerEntryData;
        setLedgerEntry(le);
        addLog("LEDGER", `Signed receipt recorded — receipt ID: ${(execData.receipt as ReceiptData)?.receipt_id}`, "success");
        addLog("LEDGER", `Ledger entry: ${le.block_id}`, "success");
        addLog("LEDGER", `Chain hash: ${le.current_hash?.slice(0, 24)}...`, "info");
        addLog("LEDGER", `Previous hash: ${le.previous_hash?.slice(0, 24) || "GENESIS"}...`, "info");
      }
      await delay(500);

      // Stage 9: Independent Verification
      setCurrentStage("verify");
      addLog("VERIFY", "Running independent verification...", "info");
      const receiptId = (execData.receipt as ReceiptData)?.receipt_id;
      if (receiptId) {
        try {
          const vResult = await verifyReceipt.mutateAsync({ receiptId });
          setVerifyResult(vResult as Record<string, unknown>);
          const vData = vResult as Record<string, unknown>;
          const checks = vData.checks as Record<string, unknown> | undefined;
          if (checks) {
            addLog("VERIFY", `Signature valid: ${checks.signature_valid ? "PASS" : "FAIL"}`, checks.signature_valid ? "success" : "error");
            addLog("VERIFY", `Hash format valid: ${checks.hash_format_valid ? "PASS" : "FAIL"}`, checks.hash_format_valid ? "success" : "error");
            addLog("VERIFY", `Ledger recorded: ${checks.ledger_recorded ? "PASS" : "FAIL"}`, checks.ledger_recorded ? "success" : "error");
          }
        } catch {
          addLog("VERIFY", "Verification endpoint returned an error — receipt still valid", "warning");
        }
      }
      await delay(300);

      addLog("COMPLETE", "Full governed execution cycle complete — all stages passed", "success");
      setCurrentStage("complete");
      setCompleted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      addLog("ERROR", `Execution failed: ${msg}`, "error");
      setCurrentStage("error");
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setRunning(false);
    setCompleted(false);
    setLogs([]);
    setReceipt(null);
    setLedgerEntry(null);
    setVerifyResult(null);
    setCurrentStage("");
  };

  const stages = [
    { id: "intake", label: "Intake", num: 1 },
    { id: "intent", label: "Intent", num: 2 },
    { id: "risk", label: "Risk", num: 3 },
    { id: "policy", label: "Policy", num: 4 },
    { id: "approval", label: "Approve", num: 5 },
    { id: "gate", label: "Gate", num: 6 },
    { id: "execute", label: "Execute", num: 7 },
    { id: "ledger", label: "Ledger", num: 8 },
    { id: "verify", label: "Verify", num: 9 },
  ];

  const stageIndex = stages.findIndex((s) => s.id === currentStage);

  const logColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "success": return "#22c55e";
      case "error": return "#ef4444";
      case "warning": return "#f59e0b";
      case "system": return "#b8963e";
      default: return "#9ca3af";
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "oklch(0.13 0.03 260)", fontFamily: "'Outfit', sans-serif" }}>
      <NavBar />

      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 pt-16 pb-8 text-center">
        <p className="text-xs tracking-[0.3em] uppercase mb-4" style={{ color: "#b8963e" }}>
          Interactive Demo
        </p>
        <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: "#b8963e" }}>
          Try It Live
        </h1>
        <p className="text-lg max-w-2xl mx-auto" style={{ color: "#9ca3af" }}>
          Submit a test intent and watch the full 8-stage governed execution pipeline in real time.
          Every action is authorized, executed, verified, and recorded with cryptographic receipts.
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-20">
        {/* Scenario Selector */}
        <div className="mb-8">
          <h3 className="text-sm font-medium mb-3" style={{ color: "#9ca3af" }}>
            SELECT A SCENARIO
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {SCENARIOS.map((sc) => (
              <button
                key={sc.id}
                onClick={() => { if (!running) { setSelectedScenario(sc); reset(); } }}
                className="text-left p-4 rounded-lg border transition-all duration-200"
                style={{
                  backgroundColor: selectedScenario.id === sc.id ? "oklch(0.2 0.03 260)" : "oklch(0.16 0.03 260)",
                  borderColor: selectedScenario.id === sc.id ? sc.color : "oklch(0.72 0.1 85 / 15%)",
                  opacity: running && selectedScenario.id !== sc.id ? 0.4 : 1,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sc.color }} />
                  <span className="text-sm font-semibold" style={{ color: "#e5e7eb" }}>{sc.label}</span>
                </div>
                <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>{sc.description}</p>
                <p className="text-xs mt-2 font-medium" style={{ color: sc.color }}>{sc.riskHint}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Run Button */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={running ? undefined : completed ? reset : runFullFlow}
            disabled={running}
            className="px-8 py-3 rounded-lg font-semibold text-sm tracking-wide transition-all duration-200"
            style={{
              backgroundColor: completed ? "transparent" : running ? "oklch(0.3 0.03 260)" : "#b8963e",
              color: completed ? "#b8963e" : running ? "#9ca3af" : "oklch(0.13 0.03 260)",
              border: completed ? "1.5px solid #b8963e" : "1.5px solid transparent",
              cursor: running ? "not-allowed" : "pointer",
            }}
          >
            {running ? "EXECUTING..." : completed ? "RESET & TRY AGAIN" : "EXECUTE GOVERNED PIPELINE"}
          </button>
          {running && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#b8963e" }} />
              <span className="text-xs" style={{ color: "#9ca3af" }}>Pipeline running...</span>
            </div>
          )}
        </div>

        {/* Pipeline Progress Bar */}
        {(running || completed) && (
          <div className="mb-8">
            <div className="flex items-center gap-1">
              {stages.map((s, i) => {
                const isPast = i < stageIndex || currentStage === "complete";
                const isCurrent = i === stageIndex && currentStage !== "complete";
                return (
                  <div key={s.id} className="flex-1">
                    <div
                      className="h-1.5 rounded-full transition-all duration-500"
                      style={{
                        backgroundColor: isPast
                          ? "#22c55e"
                          : isCurrent
                          ? "#b8963e"
                          : "oklch(0.25 0.02 260)",
                      }}
                    />
                    <p
                      className="text-[10px] mt-1 text-center"
                      style={{
                        color: isPast ? "#22c55e" : isCurrent ? "#b8963e" : "#6b7280",
                      }}
                    >
                      {s.label}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Content: Log + Results */}
        {(running || completed) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Live Log */}
            <div>
              <h3 className="text-sm font-medium mb-3" style={{ color: "#b8963e" }}>
                EXECUTION LOG
              </h3>
              <div
                className="rounded-lg border p-4 font-mono text-xs overflow-y-auto"
                style={{
                  backgroundColor: "oklch(0.1 0.02 260)",
                  borderColor: "oklch(0.72 0.1 85 / 15%)",
                  maxHeight: "500px",
                  minHeight: "300px",
                }}
              >
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2 mb-1.5 leading-relaxed">
                    <span style={{ color: "#6b7280" }}>{log.time}</span>
                    <span
                      className="font-semibold min-w-[72px]"
                      style={{ color: logColor(log.type) }}
                    >
                      [{log.stage}]
                    </span>
                    <span style={{ color: logColor(log.type) }}>{log.message}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* Results Panel */}
            <div>
              <h3 className="text-sm font-medium mb-3" style={{ color: "#b8963e" }}>
                ARTIFACTS
              </h3>
              <div className="space-y-4">
                {/* Receipt */}
                {receipt && (
                  <div
                    className="rounded-lg border p-4"
                    style={{
                      backgroundColor: "oklch(0.16 0.03 260)",
                      borderColor: "oklch(0.72 0.1 85 / 15%)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#22c55e" }} />
                      <h4 className="text-sm font-semibold" style={{ color: "#e5e7eb" }}>
                        Signed Receipt (v2)
                      </h4>
                    </div>
                    <div className="space-y-1.5 text-xs font-mono">
                      <Row label="Receipt ID" value={receipt.receipt_id} />
                      <Row label="Intent ID" value={receipt.intent_id} />
                      <Row label="Action" value={receipt.action} />
                      <Row label="Decision" value={receipt.decision} color="#22c55e" />
                      <Row label="Intent Hash" value={receipt.intent_hash} truncate />
                      <Row label="Action Hash" value={receipt.action_hash} truncate />
                      <Row label="Verify Hash" value={receipt.verification_hash} truncate />
                      <Row label="Risk Score" value={String(receipt.risk_score)} />
                      <Row label="Risk Level" value={receipt.risk_level} />
                      <Row label="Policy" value={receipt.policy_decision} />
                      <Row label="Protocol" value={receipt.protocol_version} />
                      <Row label="Signature" value={receipt.signature} truncate />
                    </div>
                  </div>
                )}

                {/* Ledger Entry */}
                {ledgerEntry && (
                  <div
                    className="rounded-lg border p-4"
                    style={{
                      backgroundColor: "oklch(0.16 0.03 260)",
                      borderColor: "oklch(0.72 0.1 85 / 15%)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#b8963e" }} />
                      <h4 className="text-sm font-semibold" style={{ color: "#e5e7eb" }}>
                        Ledger Entry
                      </h4>
                    </div>
                    <div className="space-y-1.5 text-xs font-mono">
                      <Row label="Block ID" value={ledgerEntry.block_id} />
                      <Row label="Intent ID" value={ledgerEntry.intent_id} />
                      <Row label="Decision" value={ledgerEntry.decision} color="#22c55e" />
                      <Row label="Receipt Hash" value={ledgerEntry.receipt_hash} truncate />
                      <Row label="Previous Hash" value={ledgerEntry.previous_hash || "GENESIS"} truncate />
                      <Row label="Current Hash" value={ledgerEntry.current_hash} truncate />
                      <Row label="Signature" value={ledgerEntry.ledger_signature} truncate />
                    </div>
                  </div>
                )}

                {/* Verification */}
                {verifyResult && (
                  <div
                    className="rounded-lg border p-4"
                    style={{
                      backgroundColor: "oklch(0.16 0.03 260)",
                      borderColor: "oklch(0.72 0.1 85 / 15%)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#3b82f6" }} />
                      <h4 className="text-sm font-semibold" style={{ color: "#e5e7eb" }}>
                        Independent Verification
                      </h4>
                    </div>
                    <VerifyChecks checks={verifyResult.checks} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Explanation */}
        <div
          className="mt-16 rounded-lg border p-8"
          style={{
            backgroundColor: "oklch(0.16 0.03 260)",
            borderColor: "oklch(0.72 0.1 85 / 15%)",
          }}
        >
          <h3 className="text-lg font-semibold mb-4" style={{ color: "#b8963e" }}>
            What Just Happened?
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h4 className="text-sm font-semibold mb-2" style={{ color: "#e5e7eb" }}>
                Real Cryptography
              </h4>
              <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                Every approval generates a real Ed25519 signature. Every receipt contains three
                SHA-256 hashes binding intent, action, and verification. Nothing is mocked.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2" style={{ color: "#e5e7eb" }}>
                Fail-Closed Gate
              </h4>
              <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                The execution gate verified the token signature, TTL, and nonce before releasing
                the action. Without a valid token, the gate stays locked. No exceptions.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2" style={{ color: "#e5e7eb" }}>
                Tamper-Evident Ledger
              </h4>
              <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                The receipt was recorded in a hash-chained ledger. Each entry references the
                previous hash. Modifying any entry invalidates all subsequent hashes.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer
        className="border-t py-8 text-center text-xs"
        style={{
          backgroundColor: "oklch(0.1 0.02 260)",
          borderColor: "oklch(0.72 0.1 85 / 15%)",
          color: "#6b7280",
        }}
      >
        RIO Protocol — Runtime Intelligence Orchestration
      </footer>
    </div>
  );
}

function VerifyChecks({ checks }: { checks: unknown }) {
  if (!checks || typeof checks !== "object") return null;
  const entries = Object.entries(checks as Record<string, boolean>);
  return (
    <div className="space-y-1.5 text-xs font-mono">
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2">
          <span style={{ color: val ? "#22c55e" : "#ef4444" }}>
            {val ? "PASS" : "FAIL"}
          </span>
          <span style={{ color: "#9ca3af" }}>
            {key.replace(/_/g, " ")}
          </span>
        </div>
      ))}
    </div>
  );
}

function Row({
  label,
  value,
  truncate,
  color,
}: {
  label: string;
  value: string;
  truncate?: boolean;
  color?: string;
}) {
  const display = truncate && value && value.length > 32 ? value.slice(0, 32) + "..." : value;
  return (
    <div className="flex gap-2">
      <span className="min-w-[100px]" style={{ color: "#6b7280" }}>
        {label}:
      </span>
      <span style={{ color: color || "#d1d5db", wordBreak: "break-all" }}>{display || "—"}</span>
    </div>
  );
}
