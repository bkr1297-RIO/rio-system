/**
 * WalkthroughStepper — Guided walkthrough overlay for /go
 *
 * Shows a compact 7-stage pipeline stepper that highlights the current stage
 * and provides narration explaining what's happening and why it matters.
 * Designed to be overlaid on the existing /go flow without changing its logic.
 */

import { useEffect, useState } from "react";

// ── Pipeline Stages ─────────────────────────────────────────────────────────

export interface WalkthroughStage {
  key: string;
  num: number;
  label: string;
  icon: string;
  narration: string;
  detail: string;
  status: "pending" | "active" | "complete" | "skipped";
}

const PIPELINE_STAGES: Omit<WalkthroughStage, "status">[] = [
  {
    key: "intake",
    num: 1,
    label: "Intent Created",
    icon: "📋",
    narration: "The AI agent has proposed an action. RIO captures it as a structured intent with a unique ID, timestamp, and requester identity.",
    detail: "Nothing can execute without first being registered as an intent. This is the entry point to governance.",
  },
  {
    key: "classify",
    num: 2,
    label: "Risk Classified",
    icon: "🏷️",
    narration: "RIO evaluates the action type, target system, and parameters to assign a risk level — Low, Medium, High, or Critical.",
    detail: "Risk classification determines whether the action can be auto-approved or requires human review.",
  },
  {
    key: "policy",
    num: 3,
    label: "Policy Evaluated",
    icon: "🛡️",
    narration: "The governance engine checks active policies. Learned rules from past decisions may auto-approve or auto-deny this action.",
    detail: "Policies are built from your approval history. The system learns which actions you trust and which you don't.",
  },
  {
    key: "authorize",
    num: 4,
    label: "Authorization",
    icon: "🔑",
    narration: "If no policy auto-decides, the action is escalated to you. Your identity is cryptographically bound to the decision.",
    detail: "This is the human-in-the-loop moment. The AI cannot proceed without your explicit approval.",
  },
  {
    key: "execute",
    num: 5,
    label: "Execution Gate",
    icon: "🚪",
    narration: "The execution gate verifies the authorization token before dispatching the action to the target connector.",
    detail: "Fail-closed: if verification fails, the gate stays shut. No receipt, no execution.",
  },
  {
    key: "receipt",
    num: 6,
    label: "Receipt Signed",
    icon: "📜",
    narration: "A cryptographic receipt is generated with three SHA-256 hashes and an Ed25519 signature. This is your proof.",
    detail: "The receipt binds the intent, the action, and the outcome together. It cannot be forged or altered.",
  },
  {
    key: "ledger",
    num: 7,
    label: "Ledger Recorded",
    icon: "📖",
    narration: "The receipt is committed to a hash-chained ledger. Each entry links to the previous one, making tampering immediately detectable.",
    detail: "This is the permanent record. Every decision — approval or denial — lives here forever.",
  },
];

// ── Map flow states to active stage ─────────────────────────────────────────

type FlowState =
  | "idle"
  | "checking_policy"
  | "auto_approved"
  | "auto_denied"
  | "reviewing"
  | "approved"
  | "denied"
  | "verifying"
  | "verified";

function getActiveStageIndex(flowState: FlowState): number {
  switch (flowState) {
    case "idle":
      return -1;
    case "checking_policy":
      return 1; // classify → policy
    case "reviewing":
      return 3; // authorize (waiting for human)
    case "auto_approved":
    case "auto_denied":
      return 6; // policy auto-decided → receipt + ledger done
    case "approved":
    case "denied":
      return 6; // human decided → receipt + ledger done
    case "verifying":
    case "verified":
      return 6; // all stages complete
    default:
      return -1;
  }
}

function getStageStatuses(flowState: FlowState): WalkthroughStage["status"][] {
  const activeIdx = getActiveStageIndex(flowState);
  if (activeIdx === -1) return PIPELINE_STAGES.map(() => "pending");

  return PIPELINE_STAGES.map((_, i) => {
    if (i < activeIdx) return "complete";
    if (i === activeIdx) {
      // For reviewing state, stage 3 (authorize) is active/waiting
      if (flowState === "reviewing" && i === 3) return "active";
      // For completed states, the last stage is also complete
      if (
        (flowState === "auto_approved" || flowState === "auto_denied" ||
         flowState === "approved" || flowState === "denied" ||
         flowState === "verifying" || flowState === "verified") &&
        i === 6
      )
        return "complete";
      return "active";
    }
    return "pending";
  });
}

// ── Component ───────────────────────────────────────────────────────────────

interface WalkthroughStepperProps {
  flowState: FlowState;
  enabled: boolean;
}

export default function WalkthroughStepper({ flowState, enabled }: WalkthroughStepperProps) {
  const [expandedStage, setExpandedStage] = useState<number | null>(null);
  const [animatedStages, setAnimatedStages] = useState<Set<number>>(new Set());
  const statuses = getStageStatuses(flowState);

  // Auto-expand the active stage and animate transitions
  useEffect(() => {
    const activeIdx = statuses.findIndex((s) => s === "active");
    if (activeIdx >= 0) {
      setExpandedStage(activeIdx);
      // Animate newly completed stages
      const newAnimated = new Set(animatedStages);
      statuses.forEach((s, i) => {
        if (s === "complete") newAnimated.add(i);
      });
      setAnimatedStages(newAnimated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowState]);

  if (!enabled || flowState === "idle") return null;

  const stages: WalkthroughStage[] = PIPELINE_STAGES.map((s, i) => ({
    ...s,
    status: statuses[i],
  }));

  return (
    <div
      className="rounded-xl border p-4 sm:p-5 mb-6 transition-all duration-300"
      style={{
        backgroundColor: "oklch(0.14 0.02 260)",
        borderColor: "oklch(0.72 0.1 85 / 20%)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
          style={{ backgroundColor: "#b8963e20", color: "#b8963e" }}
        >
          ▶
        </div>
        <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: "#b8963e" }}>
          Pipeline Walkthrough
        </span>
        <span className="text-[10px] ml-auto" style={{ color: "#6b7280" }}>
          {statuses.filter((s) => s === "complete").length}/{stages.length} stages
        </span>
      </div>

      {/* Stage List */}
      <div className="space-y-1">
        {stages.map((stage, i) => {
          const isExpanded = expandedStage === i;
          const statusColor =
            stage.status === "complete"
              ? "#22c55e"
              : stage.status === "active"
                ? "#b8963e"
                : "#4b5563";
          const statusBg =
            stage.status === "complete"
              ? "#22c55e15"
              : stage.status === "active"
                ? "#b8963e15"
                : "transparent";

          return (
            <div key={stage.key}>
              {/* Stage Row */}
              <button
                onClick={() => setExpandedStage(isExpanded ? null : i)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-left"
                style={{ backgroundColor: statusBg }}
              >
                {/* Status indicator */}
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-all duration-500"
                  style={{
                    backgroundColor: statusColor + "25",
                    color: statusColor,
                    boxShadow: stage.status === "active" ? `0 0 8px ${statusColor}40` : "none",
                  }}
                >
                  {stage.status === "complete" ? "✓" : stage.num}
                </div>

                {/* Label */}
                <span
                  className="text-xs font-medium flex-1 transition-colors duration-300"
                  style={{
                    color:
                      stage.status === "complete"
                        ? "#d1d5db"
                        : stage.status === "active"
                          ? "#e5e7eb"
                          : "#6b7280",
                  }}
                >
                  {stage.icon} {stage.label}
                </span>

                {/* Expand indicator */}
                <span
                  className="text-[10px] transition-transform duration-200"
                  style={{
                    color: "#6b7280",
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  ▾
                </span>
              </button>

              {/* Expanded narration */}
              {isExpanded && (
                <div
                  className="ml-9 mr-3 mt-1 mb-2 px-3 py-3 rounded-lg text-xs leading-relaxed animate-in fade-in duration-200"
                  style={{
                    backgroundColor: "oklch(0.12 0.02 260)",
                    borderLeft: `2px solid ${statusColor}`,
                  }}
                >
                  <p style={{ color: "#d1d5db" }}>{stage.narration}</p>
                  <p className="mt-2 italic" style={{ color: "#9ca3af" }}>
                    {stage.detail}
                  </p>
                </div>
              )}

              {/* Connector line between stages */}
              {i < stages.length - 1 && (
                <div className="ml-[23px] h-1 w-px" style={{ backgroundColor: statusColor + "30" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Completion message */}
      {(flowState === "approved" || flowState === "auto_approved" ||
        flowState === "verified") && (
        <div
          className="mt-4 px-3 py-2.5 rounded-lg text-xs text-center"
          style={{ backgroundColor: "#22c55e10", border: "1px solid #22c55e25", color: "#22c55e" }}
        >
          All 7 pipeline stages complete. The action is governed, signed, and recorded.
        </div>
      )}

      {(flowState === "denied" || flowState === "auto_denied") && (
        <div
          className="mt-4 px-3 py-2.5 rounded-lg text-xs text-center"
          style={{ backgroundColor: "#ef444410", border: "1px solid #ef444425", color: "#ef4444" }}
        >
          Pipeline halted. The action was denied and a denial receipt was recorded to the ledger.
        </div>
      )}
    </div>
  );
}
