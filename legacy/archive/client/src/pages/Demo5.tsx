/**
 * Demo 5 — Learning Loop
 *
 * Demonstrates how execution outcomes feed back into policy refinement.
 * Runs multiple intents through the pipeline, then analyzes patterns
 * and shows how the system would update policies based on outcomes.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import NavBar from "@/components/NavBar";

/* ── Scenario definitions ──────────────────────────────────────────── */

interface Scenario {
  action: string;
  description: string;
  requestedBy: string;
  shouldApprove: boolean;
  riskCategory: "LOW" | "MEDIUM" | "HIGH";
}

const SCENARIOS: Scenario[] = [
  { action: "send_email", description: "Send weekly status report to team", requestedBy: "agent-alpha", shouldApprove: true, riskCategory: "LOW" },
  { action: "transfer_funds", description: "Transfer $50,000 to vendor account", requestedBy: "agent-beta", shouldApprove: true, riskCategory: "HIGH" },
  { action: "send_email", description: "Send marketing blast to 10k contacts", requestedBy: "agent-alpha", shouldApprove: false, riskCategory: "MEDIUM" },
  { action: "delete_records", description: "Purge inactive user accounts", requestedBy: "agent-gamma", shouldApprove: false, riskCategory: "HIGH" },
  { action: "send_email", description: "Send contract to client", requestedBy: "agent-alpha", shouldApprove: true, riskCategory: "LOW" },
  { action: "transfer_funds", description: "Transfer $200 for office supplies", requestedBy: "agent-beta", shouldApprove: true, riskCategory: "MEDIUM" },
  { action: "modify_config", description: "Update production database config", requestedBy: "agent-gamma", shouldApprove: false, riskCategory: "HIGH" },
  { action: "send_email", description: "Send password reset to user", requestedBy: "agent-alpha", shouldApprove: true, riskCategory: "LOW" },
];

interface OutcomeRecord {
  intentId: string;
  action: string;
  description: string;
  requestedBy: string;
  decision: "approved" | "denied";
  executionStatus: string;
  riskCategory: string;
}

interface PolicyInsight {
  type: "pattern" | "recommendation" | "update";
  title: string;
  detail: string;
  confidence: number;
  affectedPolicy?: string;
}

/* ── Analysis engine (simulated Learning Loop logic) ───────────────── */

function analyzeOutcomes(outcomes: OutcomeRecord[]): PolicyInsight[] {
  const insights: PolicyInsight[] = [];

  // Pattern: agent-specific approval rates
  const agentStats: Record<string, { approved: number; denied: number }> = {};
  for (const o of outcomes) {
    if (!agentStats[o.requestedBy]) agentStats[o.requestedBy] = { approved: 0, denied: 0 };
    if (o.decision === "approved") agentStats[o.requestedBy].approved++;
    else agentStats[o.requestedBy].denied++;
  }

  for (const [agent, stats] of Object.entries(agentStats)) {
    const total = stats.approved + stats.denied;
    const approvalRate = Math.round((stats.approved / total) * 100);
    if (stats.denied > 0) {
      insights.push({
        type: "pattern",
        title: `${agent} Denial Pattern`,
        detail: `${agent} has a ${approvalRate}% approval rate (${stats.approved}/${total}). ${stats.denied} request(s) were denied.`,
        confidence: 0.85,
      });
    }
  }

  // Pattern: action-specific risk
  const actionStats: Record<string, { approved: number; denied: number; highRisk: number }> = {};
  for (const o of outcomes) {
    if (!actionStats[o.action]) actionStats[o.action] = { approved: 0, denied: 0, highRisk: 0 };
    if (o.decision === "approved") actionStats[o.action].approved++;
    else actionStats[o.action].denied++;
    if (o.riskCategory === "HIGH") actionStats[o.action].highRisk++;
  }

  for (const [action, stats] of Object.entries(actionStats)) {
    const total = stats.approved + stats.denied;
    if (stats.denied > 0 && stats.highRisk > 0) {
      insights.push({
        type: "recommendation",
        title: `Escalate ${action} Policy`,
        detail: `${action} has ${stats.highRisk} high-risk request(s) with a ${Math.round((stats.denied / total) * 100)}% denial rate. Recommend requiring multi-party approval for high-risk ${action} requests.`,
        confidence: 0.92,
        affectedPolicy: `POLICY-${action.toUpperCase()}-001`,
      });
    }
  }

  // Recommendation: auto-approve low-risk patterns
  const lowRiskApproved = outcomes.filter(o => o.riskCategory === "LOW" && o.decision === "approved");
  if (lowRiskApproved.length >= 3) {
    const actions = Array.from(new Set(lowRiskApproved.map(o => o.action)));
    insights.push({
      type: "recommendation",
      title: "Auto-Approve Low-Risk Pattern",
      detail: `${lowRiskApproved.length} low-risk requests for [${actions.join(", ")}] were all approved. Consider enabling auto-approval for low-risk ${actions.join("/")} requests from trusted agents.`,
      confidence: 0.78,
      affectedPolicy: "POLICY-AUTO-APPROVE-001",
    });
  }

  // Policy update: high-risk denials
  const highRiskDenied = outcomes.filter(o => o.riskCategory === "HIGH" && o.decision === "denied");
  if (highRiskDenied.length >= 2) {
    insights.push({
      type: "update",
      title: "Tighten High-Risk Controls",
      detail: `${highRiskDenied.length} high-risk requests were denied. Updating policy to require dual-approver sign-off and 24-hour cooling period for all HIGH-risk actions.`,
      confidence: 0.95,
      affectedPolicy: "POLICY-HIGH-RISK-002",
    });
  }

  // Policy update: agent trust scoring
  const deniedAgents = Object.entries(agentStats).filter(([, s]) => s.denied > 0);
  if (deniedAgents.length > 0) {
    insights.push({
      type: "update",
      title: "Agent Trust Score Adjustment",
      detail: `Adjusting trust scores: ${deniedAgents.map(([a, s]) => `${a} (−${s.denied * 10} points)`).join(", ")}. Lower trust scores trigger additional verification steps.`,
      confidence: 0.88,
      affectedPolicy: "POLICY-TRUST-001",
    });
  }

  return insights;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function Demo5() {
  const [phase, setPhase] = useState<"idle" | "running" | "analyzing" | "complete">("idle");
  const [outcomes, setOutcomes] = useState<OutcomeRecord[]>([]);
  const [insights, setInsights] = useState<PolicyInsight[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  const createMut = trpc.rio.createIntent.useMutation();
  const approveMut = trpc.rio.approve.useMutation();
  const denyMut = trpc.rio.deny.useMutation();
  const executeMut = trpc.rio.execute.useMutation();

  const addLog = (msg: string) => setLogs((prev) => [...prev, `[${new Date().toISOString()}] ${msg}`]);

  async function runScenarios() {
    setPhase("running");
    setOutcomes([]);
    setInsights([]);
    setLogs([]);
    setCurrentStep(0);

    const results: OutcomeRecord[] = [];

    for (let i = 0; i < SCENARIOS.length; i++) {
      const s = SCENARIOS[i];
      setCurrentStep(i + 1);
      addLog(`━━━ Scenario ${i + 1}/${SCENARIOS.length}: ${s.action} ━━━`);
      addLog(`  Request: "${s.description}" by ${s.requestedBy}`);
      addLog(`  Risk: ${s.riskCategory}`);

      try {
        // Create intent
        const intent = await createMut.mutateAsync({
          action: s.action,
          description: s.description,
          requestedBy: s.requestedBy,
        });
        addLog(`  ✓ Intent created: ${intent.intentId}`);

        // Approve or deny
        let decision: "approved" | "denied";
        if (s.shouldApprove) {
          await approveMut.mutateAsync({ intentId: intent.intentId });
          decision = "approved";
          addLog(`  ✓ Approved by human-reviewer`);
        } else {
          await denyMut.mutateAsync({ intentId: intent.intentId });
          decision = "denied";
          addLog(`  ✗ Denied by human-reviewer`);
        }

        // Execute
        let executionStatus = "N/A";
        if (decision === "approved") {
          const exec = await executeMut.mutateAsync({ intentId: intent.intentId });
          executionStatus = (exec as any).execution?.status || exec.status || "success";
          addLog(`  ✓ Executed: ${executionStatus}`);
        } else {
          executionStatus = "BLOCKED";
          addLog(`  ✗ Execution blocked (denied)`);
        }

        const record: OutcomeRecord = {
          intentId: intent.intentId,
          action: s.action,
          description: s.description,
          requestedBy: s.requestedBy,
          decision,
          executionStatus,
          riskCategory: s.riskCategory,
        };
        results.push(record);
        setOutcomes([...results]);

        addLog(`  → Receipt generated and recorded in ledger`);
      } catch (err: any) {
        addLog(`  ✗ Error: ${err.message}`);
      }

      // Small delay for visual effect
      await new Promise((r) => setTimeout(r, 300));
    }

    // Analysis phase
    addLog(`\n━━━ LEARNING LOOP — ANALYSIS PHASE ━━━`);
    setPhase("analyzing");
    await new Promise((r) => setTimeout(r, 1000));

    addLog(`  Scanning ${results.length} execution outcomes...`);
    await new Promise((r) => setTimeout(r, 500));

    addLog(`  Identifying agent behavior patterns...`);
    await new Promise((r) => setTimeout(r, 500));

    addLog(`  Evaluating risk distribution...`);
    await new Promise((r) => setTimeout(r, 500));

    addLog(`  Generating policy recommendations...`);
    await new Promise((r) => setTimeout(r, 500));

    const analysisResults = analyzeOutcomes(results);
    setInsights(analysisResults);

    for (const insight of analysisResults) {
      const prefix = insight.type === "pattern" ? "📊" : insight.type === "recommendation" ? "💡" : "🔄";
      addLog(`  ${prefix} ${insight.title} (confidence: ${Math.round(insight.confidence * 100)}%)`);
    }

    addLog(`\n━━━ LEARNING LOOP COMPLETE ━━━`);
    addLog(`  ${analysisResults.filter(i => i.type === "pattern").length} patterns detected`);
    addLog(`  ${analysisResults.filter(i => i.type === "recommendation").length} recommendations generated`);
    addLog(`  ${analysisResults.filter(i => i.type === "update").length} policy updates proposed`);

    setPhase("complete");
  }

  const typeColor = (type: string) => {
    if (type === "pattern") return "#60a5fa";
    if (type === "recommendation") return "#b8963e";
    return "#22d3ee";
  };

  const typeLabel = (type: string) => {
    if (type === "pattern") return "PATTERN";
    if (type === "recommendation") return "RECOMMENDATION";
    return "POLICY UPDATE";
  };

  return (
    <div className="min-h-screen" style={{ fontFamily: "'Outfit', sans-serif" }}>
      <NavBar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Header */}
        <div className="text-center mb-10">
          <p
            className="text-xs font-semibold tracking-[0.2em] uppercase mb-3"
            style={{ color: "#22d3ee" }}
          >
            Demo 5 — Learning Loop
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: "#d1d5db" }}>
            How Outcomes Improve Governance
          </h1>
          <p className="text-sm sm:text-base max-w-2xl mx-auto leading-relaxed" style={{ color: "#9ca3af" }}>
            The Learning Loop is the third loop in RIO&apos;s Three-Loop Architecture. It analyzes
            execution outcomes from the ledger, identifies patterns, and proposes policy updates
            that improve future governance decisions.
          </p>
        </div>

        {/* How it works explanation */}
        <div
          className="rounded-lg border p-5 mb-8"
          style={{
            backgroundColor: "oklch(0.18 0.03 260)",
            borderColor: "oklch(0.72 0.1 85 / 15%)",
          }}
        >
          <h2 className="text-sm font-bold tracking-[0.1em] uppercase mb-3" style={{ color: "#22d3ee" }}>
            How This Demo Works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs font-bold mb-1" style={{ color: "#b8963e" }}>1. Execute Scenarios</div>
              <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                8 real intents are processed through the full pipeline — some approved, some denied,
                across different risk levels and agents.
              </p>
            </div>
            <div>
              <div className="text-xs font-bold mb-1" style={{ color: "#b8963e" }}>2. Analyze Patterns</div>
              <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                The Learning Loop scans all outcomes, identifies agent behavior patterns,
                risk distributions, and approval/denial trends.
              </p>
            </div>
            <div>
              <div className="text-xs font-bold mb-1" style={{ color: "#b8963e" }}>3. Propose Updates</div>
              <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                Based on analysis, the system generates policy recommendations and trust score
                adjustments that would improve future governance.
              </p>
            </div>
          </div>
        </div>

        {/* Start button */}
        {phase === "idle" && (
          <div className="text-center mb-8">
            <button
              onClick={runScenarios}
              className="px-8 py-3 text-sm font-medium tracking-wide uppercase rounded border transition-colors duration-200 hover:bg-white/5"
              style={{
                color: "#ffffff",
                borderColor: "#22d3ee",
                backgroundColor: "transparent",
              }}
            >
              Run Learning Loop Demo
            </button>
          </div>
        )}

        {/* Progress indicator */}
        {(phase === "running" || phase === "analyzing") && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: "#d1d5db" }}>
                {phase === "running"
                  ? `Processing scenario ${currentStep} of ${SCENARIOS.length}...`
                  : "Analyzing outcomes..."}
              </span>
              <span className="text-xs" style={{ color: "#9ca3af" }}>
                {phase === "running"
                  ? `${Math.round((currentStep / SCENARIOS.length) * 100)}%`
                  : "Learning..."}
              </span>
            </div>
            <div
              className="w-full h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: "oklch(0.22 0.02 260)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: phase === "running"
                    ? `${(currentStep / SCENARIOS.length) * 100}%`
                    : "100%",
                  backgroundColor: phase === "running" ? "#b8963e" : "#22d3ee",
                }}
              />
            </div>
          </div>
        )}

        {/* Outcomes table */}
        {outcomes.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold tracking-[0.1em] uppercase mb-3" style={{ color: "#b8963e" }}>
              Execution Outcomes ({outcomes.length}/{SCENARIOS.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid oklch(0.72 0.1 85 / 15%)" }}>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: "#9ca3af" }}>#</th>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: "#9ca3af" }}>Action</th>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: "#9ca3af" }}>Agent</th>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: "#9ca3af" }}>Risk</th>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: "#9ca3af" }}>Decision</th>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: "#9ca3af" }}>Execution</th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((o, i) => (
                    <tr
                      key={o.intentId}
                      style={{ borderBottom: "1px solid oklch(0.72 0.1 85 / 8%)" }}
                    >
                      <td className="py-2 px-2" style={{ color: "#6b7280" }}>{i + 1}</td>
                      <td className="py-2 px-2" style={{ color: "#d1d5db" }}>{o.action}</td>
                      <td className="py-2 px-2" style={{ color: "#9ca3af" }}>{o.requestedBy}</td>
                      <td className="py-2 px-2">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                          style={{
                            color: o.riskCategory === "HIGH" ? "#ef4444" : o.riskCategory === "MEDIUM" ? "#f59e0b" : "#22c55e",
                            backgroundColor: o.riskCategory === "HIGH" ? "rgba(239,68,68,0.1)" : o.riskCategory === "MEDIUM" ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)",
                          }}
                        >
                          {o.riskCategory}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <span style={{ color: o.decision === "approved" ? "#22c55e" : "#ef4444" }}>
                          {o.decision === "approved" ? "APPROVED" : "DENIED"}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <span style={{ color: o.executionStatus === "success" ? "#22c55e" : "#ef4444" }}>
                          {o.executionStatus === "success" ? "SUCCESS" : "BLOCKED"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Insights */}
        {insights.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold tracking-[0.1em] uppercase mb-3" style={{ color: "#22d3ee" }}>
              Learning Loop Insights
            </h2>
            <div className="space-y-3">
              {insights.map((insight, i) => (
                <div
                  key={i}
                  className="rounded-lg border p-4"
                  style={{
                    backgroundColor: "oklch(0.18 0.03 260)",
                    borderColor: `${typeColor(insight.type)}33`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider"
                        style={{
                          color: typeColor(insight.type),
                          backgroundColor: `${typeColor(insight.type)}15`,
                        }}
                      >
                        {typeLabel(insight.type)}
                      </span>
                      <span className="text-sm font-medium" style={{ color: "#d1d5db" }}>
                        {insight.title}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: "#6b7280" }}>
                      {Math.round(insight.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                    {insight.detail}
                  </p>
                  {insight.affectedPolicy && (
                    <div className="mt-2">
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{
                          color: typeColor(insight.type),
                          backgroundColor: `${typeColor(insight.type)}10`,
                        }}
                      >
                        {insight.affectedPolicy}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Policy update summary */}
        {phase === "complete" && (
          <div
            className="rounded-lg border p-5 mb-8"
            style={{
              backgroundColor: "oklch(0.18 0.03 260)",
              borderColor: "oklch(0.72 0.1 85 / 15%)",
            }}
          >
            <h2 className="text-sm font-bold tracking-[0.1em] uppercase mb-4" style={{ color: "#22d3ee" }}>
              Proposed Policy Updates
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                className="rounded border p-3"
                style={{
                  backgroundColor: "oklch(0.15 0.02 260)",
                  borderColor: "oklch(0.72 0.1 85 / 10%)",
                }}
              >
                <div className="text-xs font-bold mb-1" style={{ color: "#ef4444" }}>Before (Current Policy)</div>
                <ul className="text-xs space-y-1" style={{ color: "#9ca3af" }}>
                  <li>- All HIGH-risk actions require single approver</li>
                  <li>- No auto-approval for any action type</li>
                  <li>- Flat trust model (all agents equal)</li>
                  <li>- No cooling period for sensitive actions</li>
                </ul>
              </div>
              <div
                className="rounded border p-3"
                style={{
                  backgroundColor: "oklch(0.15 0.02 260)",
                  borderColor: "#22d3ee33",
                }}
              >
                <div className="text-xs font-bold mb-1" style={{ color: "#22c55e" }}>After (Proposed Policy)</div>
                <ul className="text-xs space-y-1" style={{ color: "#9ca3af" }}>
                  <li>- HIGH-risk actions require dual-approver sign-off</li>
                  <li>- Auto-approve LOW-risk send_email from trusted agents</li>
                  <li>- Dynamic trust scores per agent (adjusted by outcomes)</li>
                  <li>- 24-hour cooling period for HIGH-risk actions</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Log panel */}
        {logs.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold tracking-[0.1em] uppercase mb-3" style={{ color: "#9ca3af" }}>
              Execution Log
            </h2>
            <div
              className="rounded-lg border p-4 max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed"
              style={{
                backgroundColor: "oklch(0.12 0.02 260)",
                borderColor: "oklch(0.72 0.1 85 / 10%)",
                color: "#6b7280",
              }}
            >
              {logs.map((log, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reset */}
        {phase === "complete" && (
          <div className="text-center mb-8">
            <button
              onClick={() => {
                setPhase("idle");
                setOutcomes([]);
                setInsights([]);
                setLogs([]);
                setCurrentStep(0);
              }}
              className="px-6 py-2 text-xs font-medium tracking-wide uppercase rounded border transition-colors duration-200 hover:bg-white/5"
              style={{
                color: "#9ca3af",
                borderColor: "oklch(0.72 0.1 85 / 20%)",
                backgroundColor: "transparent",
              }}
            >
              Reset Demo
            </button>
          </div>
        )}

        {/* Why this matters */}
        <div
          className="rounded-lg border p-5"
          style={{
            backgroundColor: "oklch(0.18 0.03 260)",
            borderColor: "oklch(0.72 0.1 85 / 15%)",
          }}
        >
          <h2 className="text-sm font-bold tracking-[0.1em] uppercase mb-3" style={{ color: "#b8963e" }}>
            Why the Learning Loop Matters
          </h2>
          <p className="text-xs leading-relaxed mb-3" style={{ color: "#9ca3af" }}>
            Traditional governance is static — policies are written once and rarely updated. The Learning Loop
            closes the feedback cycle: every execution outcome, every approval, every denial becomes data that
            improves future governance decisions. This is what makes RIO a living system rather than a static
            rulebook.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: "#22d3ee" }}>Adaptive</div>
              <p className="text-[10px]" style={{ color: "#6b7280" }}>
                Policies evolve based on real outcomes, not assumptions
              </p>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: "#22d3ee" }}>Auditable</div>
              <p className="text-[10px]" style={{ color: "#6b7280" }}>
                Every policy change is traceable to specific outcomes
              </p>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: "#22d3ee" }}>Continuous</div>
              <p className="text-[10px]" style={{ color: "#6b7280" }}>
                The system improves with every interaction
              </p>
            </div>
          </div>
        </div>

        {/* Footer nav */}
        <div className="mt-10 flex flex-wrap justify-center gap-3 text-xs">
          <a href="/" className="no-underline hover:opacity-80" style={{ color: "#b8963e" }}>Home</a>
          <span style={{ color: "#4b5563" }}>|</span>
          <a href="/demo4" className="no-underline hover:opacity-80" style={{ color: "#b8963e" }}>Demo 4 — Full Pipeline</a>
          <span style={{ color: "#4b5563" }}>|</span>
          <a href="/ledger" className="no-underline hover:opacity-80" style={{ color: "#b8963e" }}>Ledger Explorer</a>
          <span style={{ color: "#4b5563" }}>|</span>
          <a href="/how-it-works" className="no-underline hover:opacity-80" style={{ color: "#b8963e" }}>How It Works</a>
        </div>
      </div>
    </div>
  );
}
