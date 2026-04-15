/**
 * ThreePowerSigil — Sacred Geometry Visualization of the Three Powers
 * ═══════════════════════════════════════════════════════════════
 * Visual representation of the Rio/Governor/Gate architecture (locked naming).
 * Connected to real system state — not decorative.
 *
 * States:
 *   IDLE        → Dim geometry, waiting for input
 *   OBSERVING   → Rio Interceptor ring pulses (cool blue)
 *   ASSESSING   → Risk color radiates from center
 *   WAITING     → Governor rays pulse (amber/gold)
 *   APPROVED    → Governor geometry solidifies (emerald)
 *   EXECUTING   → Execution Gate energy flows (blue-white)
 *   LOGGED      → Chain link illuminates (gold)
 *   VIOLATED    → Visual break/dimming (red flash)
 *   EXPIRED     → Fade to dim (gray)
 */

import React, { useMemo } from "react";

export type SigilStage =
  | "IDLE"
  | "OBSERVING"
  | "ASSESSING"
  | "WAITING_APPROVAL"
  | "APPROVED"
  | "EXECUTING"
  | "LOGGED"
  | "VIOLATED"
  | "EXPIRED"
  | "REJECTED";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

interface ThreePowerSigilProps {
  stage: SigilStage;
  riskLevel?: RiskLevel;
  className?: string;
}

// Risk-based colors
const RISK_COLORS: Record<RiskLevel, { primary: string; glow: string; bg: string }> = {
  LOW:    { primary: "#34d399", glow: "#34d39960", bg: "#34d39915" },  // emerald
  MEDIUM: { primary: "#fbbf24", glow: "#fbbf2460", bg: "#fbbf2415" },  // amber
  HIGH:   { primary: "#f87171", glow: "#f8717160", bg: "#f8717115" },  // red
};

// Power colors
const OBSERVER_COLOR  = "#60a5fa"; // blue
const GOVERNOR_COLOR  = "#fbbf24"; // gold/amber
const EXECUTOR_COLOR  = "#818cf8"; // indigo
const LEDGER_COLOR    = "#f59e0b"; // gold
const VIOLATED_COLOR  = "#ef4444"; // red
const DIM_COLOR       = "#374151"; // gray-700

export function ThreePowerSigil({ stage, riskLevel = "LOW", className = "" }: ThreePowerSigilProps) {
  const risk = RISK_COLORS[riskLevel];

  // Compute opacities and animation classes for each power based on stage
  const powers = useMemo(() => {
    const base = {
      observer:  { opacity: 0.2, color: DIM_COLOR, animate: false, pulse: false },
      governor:  { opacity: 0.2, color: DIM_COLOR, animate: false, pulse: false },
      executor:  { opacity: 0.2, color: DIM_COLOR, animate: false, pulse: false },
      center:    { opacity: 0.15, color: DIM_COLOR },
      chain:     { opacity: 0.1, color: DIM_COLOR },
    };

    switch (stage) {
      case "OBSERVING":
        base.observer = { opacity: 1, color: OBSERVER_COLOR, animate: true, pulse: true };
        break;
      case "ASSESSING":
        base.observer = { opacity: 1, color: OBSERVER_COLOR, animate: true, pulse: false };
        base.center = { opacity: 0.8, color: risk.primary };
        break;
      case "WAITING_APPROVAL":
        base.observer = { opacity: 0.6, color: OBSERVER_COLOR, animate: false, pulse: false };
        base.governor = { opacity: 1, color: GOVERNOR_COLOR, animate: true, pulse: true };
        base.center = { opacity: 0.5, color: risk.primary };
        break;
      case "APPROVED":
        base.observer = { opacity: 0.5, color: OBSERVER_COLOR, animate: false, pulse: false };
        base.governor = { opacity: 1, color: "#34d399", animate: false, pulse: false }; // solidified emerald
        base.center = { opacity: 0.6, color: "#34d399" };
        break;
      case "EXECUTING":
        base.observer = { opacity: 0.4, color: OBSERVER_COLOR, animate: false, pulse: false };
        base.governor = { opacity: 0.6, color: "#34d399", animate: false, pulse: false };
        base.executor = { opacity: 1, color: EXECUTOR_COLOR, animate: true, pulse: true };
        base.center = { opacity: 0.7, color: EXECUTOR_COLOR };
        break;
      case "LOGGED":
        base.observer = { opacity: 0.7, color: OBSERVER_COLOR, animate: false, pulse: false };
        base.governor = { opacity: 0.7, color: "#34d399", animate: false, pulse: false };
        base.executor = { opacity: 0.7, color: EXECUTOR_COLOR, animate: false, pulse: false };
        base.chain = { opacity: 1, color: LEDGER_COLOR };
        base.center = { opacity: 1, color: LEDGER_COLOR };
        break;
      case "VIOLATED":
        base.observer = { opacity: 0.3, color: VIOLATED_COLOR, animate: false, pulse: false };
        base.governor = { opacity: 0.3, color: VIOLATED_COLOR, animate: false, pulse: false };
        base.executor = { opacity: 0.3, color: VIOLATED_COLOR, animate: false, pulse: false };
        base.center = { opacity: 1, color: VIOLATED_COLOR };
        break;
      case "REJECTED":
        base.observer = { opacity: 0.5, color: OBSERVER_COLOR, animate: false, pulse: false };
        base.governor = { opacity: 1, color: VIOLATED_COLOR, animate: false, pulse: false };
        base.center = { opacity: 0.5, color: VIOLATED_COLOR };
        break;
      case "EXPIRED":
        // Everything dims
        break;
      case "IDLE":
      default:
        base.observer = { opacity: 0.3, color: OBSERVER_COLOR, animate: false, pulse: false };
        base.governor = { opacity: 0.3, color: GOVERNOR_COLOR, animate: false, pulse: false };
        base.executor = { opacity: 0.3, color: EXECUTOR_COLOR, animate: false, pulse: false };
        base.center = { opacity: 0.2, color: DIM_COLOR };
        break;
    }
    return base;
  }, [stage, risk.primary]);

  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 200 200" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Glow filters */}
          <filter id="glow-observer" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-governor" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-executor" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-center" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── OUTER RING: Rio Interceptor (top) ── */}
        <g opacity={powers.observer.opacity} filter={powers.observer.animate ? "url(#glow-observer)" : undefined}>
          <circle
            cx="100" cy="100" r="88"
            fill="none"
            stroke={powers.observer.color}
            strokeWidth="1.5"
            strokeDasharray={powers.observer.pulse ? "8 4" : "none"}
            className={powers.observer.pulse ? "animate-[spin_12s_linear_infinite]" : ""}
          />
          {/* Rio Interceptor eye symbol at top */}
          <g transform="translate(100, 12)">
            <circle cx="0" cy="0" r="6" fill="none" stroke={powers.observer.color} strokeWidth="1" />
            <circle cx="0" cy="0" r="2" fill={powers.observer.color} />
          </g>
          {/* Rio Interceptor label */}
          <text x="100" y="28" textAnchor="middle" fill={powers.observer.color} fontSize="5" fontFamily="monospace" letterSpacing="0.1em" opacity="0.8">
            RIO
          </text>
        </g>

        {/* ── TRIANGLE: Connecting the three powers ── */}
        <polygon
          points="100,35 160,155 40,155"
          fill="none"
          stroke={powers.center.color}
          strokeWidth="0.8"
          opacity={powers.center.opacity * 0.5}
        />

        {/* ── GOVERNOR: Left vertex of triangle ── */}
        <g opacity={powers.governor.opacity} filter={powers.governor.animate ? "url(#glow-governor)" : undefined}>
          {/* Hexagonal governor badge */}
          <polygon
            points="40,140 50,130 60,130 70,140 60,150 50,150"
            fill="none"
            stroke={powers.governor.color}
            strokeWidth="1.5"
            className={powers.governor.pulse ? "animate-pulse" : ""}
          />
          {/* Governor key symbol */}
          <g transform="translate(55, 140)">
            <circle cx="0" cy="-2" r="3" fill="none" stroke={powers.governor.color} strokeWidth="1" />
            <line x1="0" y1="1" x2="0" y2="6" stroke={powers.governor.color} strokeWidth="1" />
            <line x1="0" y1="4" x2="2" y2="4" stroke={powers.governor.color} strokeWidth="0.8" />
          </g>
          <text x="55" y="162" textAnchor="middle" fill={powers.governor.color} fontSize="5" fontFamily="monospace" letterSpacing="0.1em" opacity="0.8">
            GOVERNOR
          </text>
        </g>

        {/* ── EXECUTOR: Right vertex of triangle ── */}
        <g opacity={powers.executor.opacity} filter={powers.executor.animate ? "url(#glow-executor)" : undefined}>
          {/* Execution Gate gear/cog symbol */}
          <circle cx="145" cy="140" r="12" fill="none" stroke={powers.executor.color} strokeWidth="1.5"
            className={powers.executor.pulse ? "animate-[spin_3s_linear_infinite]" : ""}
          />
          {/* Gear teeth */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            const x1 = 145 + 12 * Math.cos(rad);
            const y1 = 140 + 12 * Math.sin(rad);
            const x2 = 145 + 15 * Math.cos(rad);
            const y2 = 140 + 15 * Math.sin(rad);
            return (
              <line
                key={angle}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={powers.executor.color}
                strokeWidth="1.5"
                opacity={powers.executor.opacity}
              />
            );
          })}
          <text x="145" y="162" textAnchor="middle" fill={powers.executor.color} fontSize="5" fontFamily="monospace" letterSpacing="0.1em" opacity="0.8">
            GATE
          </text>
        </g>

        {/* ── CENTER: Risk/State indicator ── */}
        <g filter="url(#glow-center)">
          <circle cx="100" cy="110" r="18" fill={powers.center.color} opacity={powers.center.opacity * 0.15} />
          <circle cx="100" cy="110" r="12" fill={powers.center.color} opacity={powers.center.opacity * 0.25} />
          <circle cx="100" cy="110" r="5" fill={powers.center.color} opacity={powers.center.opacity * 0.6} />
        </g>

        {/* ── CHAIN LINKS: Ledger connection (bottom) ── */}
        <g opacity={powers.chain.opacity}>
          {/* Chain link 1 */}
          <rect x="85" y="175" width="10" height="6" rx="3" fill="none" stroke={powers.chain.color} strokeWidth="1.2" />
          {/* Chain link 2 (overlapping) */}
          <rect x="92" y="175" width="10" height="6" rx="3" fill="none" stroke={powers.chain.color} strokeWidth="1.2" />
          {/* Chain link 3 */}
          <rect x="99" y="175" width="10" height="6" rx="3" fill="none" stroke={powers.chain.color} strokeWidth="1.2" />
          {/* Connection line from center to chain */}
          <line x1="100" y1="128" x2="100" y2="175" stroke={powers.chain.color} strokeWidth="0.6" strokeDasharray="3 3" />
          <text x="100" y="190" textAnchor="middle" fill={powers.chain.color} fontSize="5" fontFamily="monospace" letterSpacing="0.1em" opacity="0.8">
            LEDGER
          </text>
        </g>

        {/* ── FLOW ARROWS: Rio → Governor → Gate ── */}
        {/* Rio → Governor signal */}
        <line
          x1="80" y1="50" x2="55" y2="125"
          stroke={stage === "OBSERVING" || stage === "ASSESSING" || stage === "WAITING_APPROVAL" ? OBSERVER_COLOR : DIM_COLOR}
          strokeWidth="0.6"
          strokeDasharray="4 3"
          opacity={stage === "OBSERVING" || stage === "ASSESSING" ? 0.8 : 0.15}
        />
        {/* Governor → Gate approval */}
        <line
          x1="70" y1="140" x2="130" y2="140"
          stroke={stage === "APPROVED" || stage === "EXECUTING" ? "#34d399" : DIM_COLOR}
          strokeWidth="0.6"
          strokeDasharray="4 3"
          opacity={stage === "APPROVED" || stage === "EXECUTING" ? 0.8 : 0.15}
        />
        {/* Gate → Ledger receipt */}
        <line
          x1="145" y1="155" x2="110" y2="175"
          stroke={stage === "LOGGED" ? LEDGER_COLOR : DIM_COLOR}
          strokeWidth="0.6"
          strokeDasharray="4 3"
          opacity={stage === "LOGGED" ? 0.8 : 0.15}
        />
      </svg>
    </div>
  );
}

/**
 * ThreePowerPanel — Full panel with sigil + state labels
 */
interface ThreePowerPanelProps {
  stage: SigilStage;
  riskLevel?: RiskLevel;
  intentId?: string;
  toolName?: string;
  stageLabel?: string;
}

export function ThreePowerPanel({ stage, riskLevel = "LOW", intentId, toolName, stageLabel }: ThreePowerPanelProps) {
  const stageLabels: Record<SigilStage, string> = {
    IDLE: "System Idle",
    OBSERVING: "Rio Intercepting",
    ASSESSING: "Risk Assessment",
    WAITING_APPROVAL: "Awaiting Governor Policy",
    APPROVED: "Governor Cleared",
    EXECUTING: "Gate Executing",
    LOGGED: "Logged to Ledger",
    VIOLATED: "Violation Detected",
    EXPIRED: "Expired",
    REJECTED: "Governor Blocked",
  };

  const stageColors: Record<SigilStage, string> = {
    IDLE: "text-gray-500",
    OBSERVING: "text-blue-400",
    ASSESSING: "text-amber-400",
    WAITING_APPROVAL: "text-amber-400",
    APPROVED: "text-emerald-400",
    EXECUTING: "text-indigo-400",
    LOGGED: "text-amber-400",
    VIOLATED: "text-red-400",
    EXPIRED: "text-gray-500",
    REJECTED: "text-red-400",
  };

  const riskColors: Record<RiskLevel, string> = {
    LOW: "text-emerald-400",
    MEDIUM: "text-amber-400",
    HIGH: "text-red-400",
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4">
      <div className="flex items-start gap-4">
        {/* Sigil */}
        <div className="w-32 h-32 sm:w-40 sm:h-40 shrink-0">
          <ThreePowerSigil stage={stage} riskLevel={riskLevel} />
        </div>

        {/* State info */}
        <div className="flex-1 min-w-0 space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${
              stage === "IDLE" || stage === "EXPIRED" ? "bg-gray-500" :
              stage === "VIOLATED" || stage === "REJECTED" ? "bg-red-500 animate-pulse" :
              stage === "LOGGED" ? "bg-amber-400" :
              "bg-emerald-400 animate-pulse"
            }`} />
            <span className={`text-xs font-mono font-bold uppercase tracking-wider ${stageColors[stage]}`}>
              {stageLabel || stageLabels[stage]}
            </span>
          </div>

          {riskLevel && stage !== "IDLE" && stage !== "EXPIRED" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground">RISK:</span>
              <span className={`text-[10px] font-mono font-bold ${riskColors[riskLevel]}`}>{riskLevel}</span>
            </div>
          )}

          {toolName && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground">TOOL:</span>
              <span className="text-[10px] font-mono font-semibold text-foreground">{toolName}</span>
            </div>
          )}

          {intentId && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground">INTENT:</span>
              <span className="text-[10px] font-mono text-muted-foreground/70 truncate">{intentId}</span>
            </div>
          )}

          {/* Power status indicators */}
          <div className="flex items-center gap-3 pt-1">
            <PowerIndicator
              label="OBS"
              active={["OBSERVING", "ASSESSING", "WAITING_APPROVAL", "APPROVED", "EXECUTING", "LOGGED"].includes(stage)}
              color="blue"
              pulsing={stage === "OBSERVING"}
            />
            <PowerIndicator
              label="GOV"
              active={["WAITING_APPROVAL", "APPROVED", "EXECUTING", "LOGGED"].includes(stage)}
              color={stage === "REJECTED" ? "red" : stage === "APPROVED" || stage === "EXECUTING" || stage === "LOGGED" ? "emerald" : "amber"}
              pulsing={stage === "WAITING_APPROVAL"}
            />
            <PowerIndicator
              label="EXEC"
              active={["EXECUTING", "LOGGED"].includes(stage)}
              color="indigo"
              pulsing={stage === "EXECUTING"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PowerIndicator({ label, active, color, pulsing }: {
  label: string;
  active: boolean;
  color: string;
  pulsing: boolean;
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    blue:    { bg: "bg-blue-500/15",    text: "text-blue-400",    border: "border-blue-500/30" },
    amber:   { bg: "bg-amber-500/15",   text: "text-amber-400",   border: "border-amber-500/30" },
    emerald: { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" },
    indigo:  { bg: "bg-indigo-500/15",  text: "text-indigo-400",  border: "border-indigo-500/30" },
    red:     { bg: "bg-red-500/15",     text: "text-red-400",     border: "border-red-500/30" },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border transition-all duration-300 ${
      active ? `${c.bg} ${c.text} ${c.border}` : "bg-transparent text-gray-600 border-gray-700/30"
    }`}>
      {pulsing && <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${c.bg.replace("/15", "")}`} />}
      {label}
    </span>
  );
}
