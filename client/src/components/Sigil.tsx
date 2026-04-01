/**
 * RIO Sigil — Three Interlocking Rings
 *
 * The Sigil is the visual identity of the Three-Power Separation:
 *   Ring 1 (Blue)  — Observer / Mantis: sees everything, controls nothing
 *   Ring 2 (Gold)  — Governor: decides but never acts
 *   Ring 3 (Cyan)  — Executor: acts but never decides
 *
 * The rings interlock but never merge — each power is distinct.
 * The center convergence point represents the Ledger binding.
 *
 * Animated: gentle rotation, pulse on hover, labels on focus.
 */

import { useState } from "react";

interface SigilProps {
  size?: number;
  animated?: boolean;
  showLabels?: boolean;
  className?: string;
  interactive?: boolean;
}

const POWERS = [
  {
    id: "observer",
    label: "Observer",
    sublabel: "Mantis",
    color: "#60a5fa",
    description: "Sees everything, controls nothing",
  },
  {
    id: "governor",
    label: "Governor",
    sublabel: "Policy Engine",
    color: "#b8963e",
    description: "Decides but never acts",
  },
  {
    id: "executor",
    label: "Executor",
    sublabel: "Action Layer",
    color: "#22d3ee",
    description: "Acts but never decides",
  },
];

export function Sigil({
  size = 280,
  animated = true,
  showLabels = false,
  className = "",
  interactive = true,
}: SigilProps) {
  const [hoveredRing, setHoveredRing] = useState<string | null>(null);

  const cx = size / 2;
  const cy = size / 2;
  const ringRadius = size * 0.22;
  const offset = size * 0.12;
  const strokeWidth = size * 0.012;

  // Position three rings in a triangle formation
  const positions = [
    { x: cx, y: cy - offset * 0.85 },           // top — Observer
    { x: cx - offset * 0.9, y: cy + offset * 0.55 }, // bottom-left — Governor
    { x: cx + offset * 0.9, y: cy + offset * 0.55 }, // bottom-right — Executor
  ];

  // Label positions (outside the rings)
  const labelPositions = [
    { x: cx, y: cy - offset * 0.85 - ringRadius - 14 },
    { x: cx - offset * 0.9 - ringRadius - 8, y: cy + offset * 0.55 + ringRadius + 18 },
    { x: cx + offset * 0.9 + ringRadius + 8, y: cy + offset * 0.55 + ringRadius + 18 },
  ];

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="RIO Sigil — Three-Power Separation"
      >
        <defs>
          {/* Glow filters for each ring */}
          {POWERS.map((p) => (
            <filter key={p.id} id={`glow-${p.id}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={hoveredRing === p.id ? 6 : 3} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}

          {/* Center glow */}
          <radialGradient id="center-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Subtle background pulse at center — Ledger binding point */}
        <circle
          cx={cx}
          cy={cy + offset * 0.08}
          r={size * 0.06}
          fill="url(#center-glow)"
          opacity={0.6}
        >
          {animated && (
            <animate
              attributeName="r"
              values={`${size * 0.05};${size * 0.08};${size * 0.05}`}
              dur="4s"
              repeatCount="indefinite"
            />
          )}
        </circle>

        {/* Three interlocking rings */}
        {POWERS.map((power, i) => {
          const pos = positions[i];
          const isHovered = hoveredRing === power.id;
          const opacity = hoveredRing && !isHovered ? 0.35 : 1;

          return (
            <g key={power.id}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={ringRadius}
                fill="none"
                stroke={power.color}
                strokeWidth={isHovered ? strokeWidth * 2 : strokeWidth}
                opacity={opacity}
                filter={`url(#glow-${power.id})`}
                style={{
                  transition: "all 0.4s ease",
                  cursor: interactive ? "pointer" : "default",
                }}
                onMouseEnter={() => interactive && setHoveredRing(power.id)}
                onMouseLeave={() => interactive && setHoveredRing(null)}
              >
                {animated && (
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from={`0 ${pos.x} ${pos.y}`}
                    to={`${i === 1 ? -360 : 360} ${pos.x} ${pos.y}`}
                    dur={`${20 + i * 5}s`}
                    repeatCount="indefinite"
                  />
                )}
              </circle>

              {/* Small marker dot on each ring to show rotation */}
              <circle
                cx={pos.x + ringRadius * 0.92}
                cy={pos.y}
                r={size * 0.008}
                fill={power.color}
                opacity={opacity * 0.7}
              >
                {animated && (
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from={`0 ${pos.x} ${pos.y}`}
                    to={`${i === 1 ? -360 : 360} ${pos.x} ${pos.y}`}
                    dur={`${20 + i * 5}s`}
                    repeatCount="indefinite"
                  />
                )}
              </circle>
            </g>
          );
        })}

        {/* Center dot — Ledger convergence */}
        <circle
          cx={cx}
          cy={cy + offset * 0.08}
          r={size * 0.015}
          fill="#a78bfa"
          opacity={0.9}
        >
          {animated && (
            <animate
              attributeName="opacity"
              values="0.6;1;0.6"
              dur="3s"
              repeatCount="indefinite"
            />
          )}
        </circle>

        {/* Labels (always visible or on hover) */}
        {(showLabels || hoveredRing) &&
          POWERS.map((power, i) => {
            const lp = labelPositions[i];
            const show = showLabels || hoveredRing === power.id;
            if (!show) return null;

            return (
              <g key={`label-${power.id}`}>
                <text
                  x={lp.x}
                  y={lp.y}
                  textAnchor="middle"
                  fill={power.color}
                  fontSize={size * 0.04}
                  fontWeight="700"
                  fontFamily="'Outfit', sans-serif"
                  style={{ transition: "opacity 0.3s" }}
                >
                  {power.label}
                </text>
                {hoveredRing === power.id && (
                  <text
                    x={lp.x}
                    y={lp.y + size * 0.05}
                    textAnchor="middle"
                    fill={power.color}
                    fontSize={size * 0.03}
                    fontWeight="400"
                    fontFamily="'Outfit', sans-serif"
                    opacity={0.7}
                  >
                    {power.description}
                  </text>
                )}
              </g>
            );
          })}

        {/* Ledger label at center */}
        {(showLabels || hoveredRing === null) && (
          <text
            x={cx}
            y={cy + offset * 0.08 + size * 0.045}
            textAnchor="middle"
            fill="#a78bfa"
            fontSize={size * 0.028}
            fontWeight="600"
            fontFamily="'Outfit', sans-serif"
            opacity={0.6}
          >
            Ledger
          </text>
        )}
      </svg>

      {/* Hover tooltip below */}
      {interactive && hoveredRing && (
        <div
          className="mt-2 px-4 py-2 rounded-lg text-center transition-all duration-300"
          style={{
            backgroundColor: `${POWERS.find((p) => p.id === hoveredRing)?.color}15`,
            borderLeft: `3px solid ${POWERS.find((p) => p.id === hoveredRing)?.color}`,
          }}
        >
          <span
            className="text-sm font-bold"
            style={{ color: POWERS.find((p) => p.id === hoveredRing)?.color }}
          >
            {POWERS.find((p) => p.id === hoveredRing)?.label}
          </span>
          <span className="text-xs text-gray-400 ml-2">
            {POWERS.find((p) => p.id === hoveredRing)?.sublabel}
          </span>
          <p className="text-xs text-gray-400 mt-0.5">
            {POWERS.find((p) => p.id === hoveredRing)?.description}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * SigilBadge — Small inline version for headers, badges, and icons.
 * No labels, no interaction, just the three rings.
 */
export function SigilBadge({ size = 32, className = "" }: { size?: number; className?: string }) {
  return <Sigil size={size} animated={false} showLabels={false} interactive={false} className={className} />;
}

export default Sigil;
