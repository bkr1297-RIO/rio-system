/**
 * Ledger Chain Explorer
 *
 * Displays the full hash-chain ledger with visual linkage between entries.
 * Shows chain integrity status and allows browsing the complete audit trail.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import NavBar from "@/components/NavBar";

type LedgerEntry = {
  block_id: string;
  intent_id: string;
  action: string;
  decision: string;
  receipt_hash: string | null;
  previous_hash: string | null;
  current_hash: string;
  ledger_signature: string | null;
  protocol_version: string | null;
  timestamp: string | null;
  recorded_by: string;
};

export default function LedgerExplorer() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data, isLoading, error, refetch } = trpc.rio.ledgerChain.useQuery(
    { limit: 100 },
    { refetchOnWindowFocus: false }
  );

  const toggleExpand = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const entries: LedgerEntry[] = data?.entries ?? [];
  const chainValid = data?.chainValid ?? true;
  const chainErrors = data?.chainErrors ?? [];

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
          LEDGER EXPLORER
        </h1>
        <p
          className="text-sm font-light tracking-[0.08em] mb-2"
          style={{ color: "#9ca3af" }}
        >
          v2 Hash-Chain Audit Trail
        </p>
        <p
          className="text-sm text-center max-w-2xl mb-8"
          style={{ color: "#d1d5db" }}
        >
          Browse the complete ledger chain. Each entry links to the previous via
          cryptographic hash, forming a tamper-evident audit trail. If any entry
          is modified, the chain breaks and integrity verification fails.
        </p>

        {/* Chain Status Banner */}
        {!isLoading && data && (
          <div
            className="w-full max-w-5xl mb-6 p-4 rounded border flex items-center justify-between"
            style={{
              borderColor: chainValid
                ? "rgba(34,197,94,0.4)"
                : "rgba(239,68,68,0.4)",
              backgroundColor: chainValid
                ? "rgba(34,197,94,0.06)"
                : "rgba(239,68,68,0.06)",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: chainValid ? "#22c55e" : "#ef4444",
                  boxShadow: chainValid
                    ? "0 0 8px rgba(34,197,94,0.5)"
                    : "0 0 8px rgba(239,68,68,0.5)",
                }}
              />
              <span
                className="text-sm font-semibold"
                style={{ color: chainValid ? "#22c55e" : "#ef4444" }}
              >
                {chainValid
                  ? "CHAIN INTEGRITY: VALID"
                  : "CHAIN INTEGRITY: BROKEN"}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs" style={{ color: "#9ca3af" }}>
              <span>{entries.length} entries</span>
              <span>Protocol v2</span>
              <button
                onClick={() => refetch()}
                className="py-1 px-3 text-xs font-medium border rounded transition-colors duration-200 hover:bg-white/5"
                style={{ borderColor: "#b8963e", color: "#b8963e" }}
              >
                Refresh
              </button>
            </div>
          </div>
        )}

        {/* Chain Errors */}
        {chainErrors.length > 0 && (
          <div
            className="w-full max-w-5xl mb-4 p-3 rounded border"
            style={{
              borderColor: "rgba(239,68,68,0.4)",
              backgroundColor: "rgba(239,68,68,0.06)",
            }}
          >
            <p className="text-xs font-semibold mb-1" style={{ color: "#ef4444" }}>
              Chain Errors Detected:
            </p>
            {chainErrors.map((err, i) => (
              <p key={i} className="text-xs font-mono" style={{ color: "#fca5a5" }}>
                {err}
              </p>
            ))}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-3 py-20">
            <div
              className="w-4 h-4 rounded-full animate-pulse"
              style={{ backgroundColor: "#b8963e" }}
            />
            <span className="text-sm" style={{ color: "#9ca3af" }}>
              Loading ledger chain...
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="w-full max-w-5xl p-4 rounded border mb-6"
            style={{
              borderColor: "rgba(239,68,68,0.4)",
              backgroundColor: "rgba(239,68,68,0.06)",
            }}
          >
            <p className="text-sm" style={{ color: "#ef4444" }}>
              Failed to load ledger: {error.message}
            </p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && entries.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm mb-2" style={{ color: "#9ca3af" }}>
              No ledger entries yet.
            </p>
            <p className="text-xs" style={{ color: "#6b7280" }}>
              Run a demo to generate entries, then return here to explore the chain.
            </p>
          </div>
        )}

        {/* Chain Visualization */}
        {entries.length > 0 && (
          <div className="w-full max-w-5xl">
            {entries.map((entry, index) => {
              const isExpanded = expanded.has(index);
              const isFirst = index === 0;
              const decisionColor =
                entry.decision === "approved"
                  ? "#22c55e"
                  : entry.decision === "denied"
                  ? "#ef4444"
                  : "#eab308";

              return (
                <div key={entry.block_id} className="relative">
                  {/* Hash Link Arrow (between entries) */}
                  {!isFirst && (
                    <div className="flex items-center justify-center py-1">
                      <div className="flex flex-col items-center">
                        <div
                          className="w-px h-4"
                          style={{ backgroundColor: "rgba(184,150,62,0.3)" }}
                        />
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[9px] font-mono px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: "rgba(184,150,62,0.1)",
                              color: "#b8963e",
                              border: "1px solid rgba(184,150,62,0.2)",
                            }}
                          >
                            prev: {entry.previous_hash?.slice(0, 16)}...
                          </span>
                          <span className="text-[10px]" style={{ color: "#6b7280" }}>
                            =
                          </span>
                          <span
                            className="text-[9px] font-mono px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: "rgba(34,197,94,0.1)",
                              color: "#22c55e",
                              border: "1px solid rgba(34,197,94,0.2)",
                            }}
                          >
                            hash: {entries[index - 1].current_hash?.slice(0, 16)}...
                          </span>
                          {entry.previous_hash === entries[index - 1].current_hash ? (
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: "rgba(34,197,94,0.15)",
                                color: "#22c55e",
                              }}
                            >
                              LINKED
                            </span>
                          ) : (
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: "rgba(239,68,68,0.15)",
                                color: "#ef4444",
                              }}
                            >
                              BROKEN
                            </span>
                          )}
                        </div>
                        <div
                          className="w-px h-4"
                          style={{ backgroundColor: "rgba(184,150,62,0.3)" }}
                        />
                        <div
                          className="w-0 h-0"
                          style={{
                            borderLeft: "5px solid transparent",
                            borderRight: "5px solid transparent",
                            borderTop: "6px solid rgba(184,150,62,0.4)",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Genesis marker */}
                  {isFirst && (
                    <div className="flex justify-center mb-2">
                      <span
                        className="text-[10px] font-semibold px-3 py-1 rounded-full"
                        style={{
                          backgroundColor: "rgba(59,130,246,0.15)",
                          color: "#3b82f6",
                          border: "1px solid rgba(59,130,246,0.3)",
                        }}
                      >
                        GENESIS BLOCK
                      </span>
                    </div>
                  )}

                  {/* Block Card */}
                  <div
                    className="rounded border transition-all duration-200 cursor-pointer hover:border-opacity-80"
                    style={{
                      borderColor: "rgba(184,150,62,0.35)",
                      backgroundColor: "rgba(184,150,62,0.04)",
                    }}
                    onClick={() => toggleExpand(index)}
                  >
                    {/* Block Header */}
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="text-[10px] font-mono font-bold px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: "rgba(184,150,62,0.15)",
                            color: "#b8963e",
                          }}
                        >
                          #{index}
                        </span>
                        <span
                          className="text-xs font-mono"
                          style={{ color: "#d1d5db" }}
                        >
                          {entry.block_id}
                        </span>
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: `${decisionColor}15`,
                            color: decisionColor,
                          }}
                        >
                          {entry.decision.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className="text-[10px] font-mono"
                          style={{ color: "#6b7280" }}
                        >
                          {entry.action}
                        </span>
                        <span
                          className="text-[10px]"
                          style={{ color: "#6b7280" }}
                        >
                          {entry.timestamp?.slice(11, 19)}
                        </span>
                        <span
                          className="text-[10px] transition-transform duration-200"
                          style={{
                            color: "#9ca3af",
                            transform: isExpanded
                              ? "rotate(180deg)"
                              : "rotate(0deg)",
                          }}
                        >
                          ▼
                        </span>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div
                        className="px-3 pb-3 border-t"
                        style={{ borderColor: "rgba(184,150,62,0.15)" }}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 mt-3 text-xs font-mono">
                          <div>
                            <span style={{ color: "#6b7280" }}>block_id: </span>
                            <span style={{ color: "#d1d5db" }}>
                              {entry.block_id}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: "#6b7280" }}>intent_id: </span>
                            <span style={{ color: "#d1d5db" }}>
                              {entry.intent_id}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: "#6b7280" }}>action: </span>
                            <span style={{ color: "#d1d5db" }}>
                              {entry.action}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: "#6b7280" }}>decision: </span>
                            <span style={{ color: decisionColor }}>
                              {entry.decision}
                            </span>
                          </div>
                          <div className="md:col-span-2 pt-1.5 mt-1.5 border-t" style={{ borderColor: "rgba(107,114,128,0.15)" }}>
                            <span style={{ color: "#6b7280" }}>
                              receipt_hash:{" "}
                            </span>
                            <span style={{ color: "#b8963e" }}>
                              {entry.receipt_hash ?? "—"}
                            </span>
                          </div>
                          <div className="md:col-span-2">
                            <span style={{ color: "#6b7280" }}>
                              previous_hash:{" "}
                            </span>
                            <span style={{ color: "#d1d5db" }}>
                              {entry.previous_hash ?? "GENESIS"}
                            </span>
                          </div>
                          <div className="md:col-span-2">
                            <span style={{ color: "#6b7280" }}>
                              current_hash:{" "}
                            </span>
                            <span style={{ color: "#22c55e" }}>
                              {entry.current_hash}
                            </span>
                          </div>
                          <div className="md:col-span-2 pt-1.5 mt-1.5 border-t" style={{ borderColor: "rgba(107,114,128,0.15)" }}>
                            <span style={{ color: "#6b7280" }}>
                              ledger_signature:{" "}
                            </span>
                            <span style={{ color: "#d1d5db" }}>
                              {entry.ledger_signature ?? "—"}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: "#6b7280" }}>protocol: </span>
                            <span style={{ color: "#3b82f6" }}>
                              {entry.protocol_version ?? "v2"}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: "#6b7280" }}>
                              recorded_by:{" "}
                            </span>
                            <span style={{ color: "#d1d5db" }}>
                              {entry.recorded_by}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: "#6b7280" }}>
                              timestamp:{" "}
                            </span>
                            <span style={{ color: "#d1d5db" }}>
                              {entry.timestamp}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Back to Home */}
        <div className="flex flex-wrap gap-3 sm:gap-4 mt-8 sm:mt-10">
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
        </div>
      </div>
    </div>
  );
}
