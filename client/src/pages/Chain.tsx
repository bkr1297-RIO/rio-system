/**
 * /chain — Receipt Chain Visualizer
 *
 * A visual timeline of the full receipt chain. Each block is rendered as a node
 * in a vertical timeline with explicit hash links between consecutive entries.
 * Chain integrity is verified visually — matching hashes glow green, breaks glow red.
 *
 * Distinct from /ledger (table-oriented explorer) — this page emphasizes the
 * visual chain structure and the cryptographic linkage that makes the ledger tamper-evident.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import NavBar from "@/components/NavBar";
import {
  Shield,
  Link2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Hash,
  Clock,
  User,
  FileText,
  RefreshCw,
  Lock,
} from "lucide-react";

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
  source?: string;
};

function truncHash(hash: string | null, len = 12): string {
  if (!hash) return "null";
  return hash.length > len ? hash.slice(0, len) + "..." : hash;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="p-0.5 rounded transition-colors hover:bg-white/10"
      title="Copy full hash"
    >
      {copied ? (
        <Check className="w-3 h-3" style={{ color: "#22c55e" }} />
      ) : (
        <Copy className="w-3 h-3" style={{ color: "#6b7280" }} />
      )}
    </button>
  );
}

function ChainLink({
  prevHash,
  currentHashOfPrev,
  index,
}: {
  prevHash: string | null;
  currentHashOfPrev: string;
  index: number;
}) {
  const linked = prevHash === currentHashOfPrev;
  return (
    <div className="flex flex-col items-center py-1 relative">
      {/* Vertical connector line */}
      <div
        className="w-0.5 h-6"
        style={{
          backgroundColor: linked
            ? "rgba(34, 197, 94, 0.4)"
            : "rgba(239, 68, 68, 0.4)",
        }}
      />

      {/* Hash comparison badge */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-mono"
        style={{
          borderColor: linked
            ? "rgba(34, 197, 94, 0.3)"
            : "rgba(239, 68, 68, 0.3)",
          backgroundColor: linked
            ? "rgba(34, 197, 94, 0.06)"
            : "rgba(239, 68, 68, 0.06)",
        }}
      >
        <Link2
          className="w-3 h-3"
          style={{ color: linked ? "#22c55e" : "#ef4444" }}
        />
        <span style={{ color: "#9ca3af" }}>Block {index - 1}</span>
        <span
          className="px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            color: "#22c55e",
          }}
        >
          {truncHash(currentHashOfPrev, 10)}
        </span>
        <span style={{ color: "#6b7280" }}>=</span>
        <span
          className="px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: linked
              ? "rgba(184, 150, 62, 0.1)"
              : "rgba(239, 68, 68, 0.1)",
            color: linked ? "#b8963e" : "#ef4444",
          }}
        >
          {truncHash(prevHash, 10)}
        </span>
        <span style={{ color: "#9ca3af" }}>Block {index}</span>
        {linked ? (
          <span
            className="font-bold px-1.5 py-0.5 rounded text-[9px]"
            style={{
              backgroundColor: "rgba(34, 197, 94, 0.15)",
              color: "#22c55e",
            }}
          >
            LINKED
          </span>
        ) : (
          <span
            className="font-bold px-1.5 py-0.5 rounded text-[9px]"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              color: "#ef4444",
            }}
          >
            BROKEN
          </span>
        )}
      </div>

      {/* Vertical connector line + arrow */}
      <div
        className="w-0.5 h-4"
        style={{
          backgroundColor: linked
            ? "rgba(34, 197, 94, 0.4)"
            : "rgba(239, 68, 68, 0.4)",
        }}
      />
      <div
        className="w-0 h-0"
        style={{
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: linked
            ? "6px solid rgba(34, 197, 94, 0.5)"
            : "6px solid rgba(239, 68, 68, 0.5)",
        }}
      />
    </div>
  );
}

function BlockNode({
  entry,
  index,
  isGenesis,
  isExpanded,
  onToggle,
}: {
  entry: LedgerEntry;
  index: number;
  isGenesis: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const decisionColor =
    entry.decision === "approved"
      ? "#22c55e"
      : entry.decision === "denied"
        ? "#ef4444"
        : "#eab308";

  const decisionIcon =
    entry.decision === "approved" ? (
      <CheckCircle2 className="w-3.5 h-3.5" style={{ color: decisionColor }} />
    ) : entry.decision === "denied" ? (
      <XCircle className="w-3.5 h-3.5" style={{ color: decisionColor }} />
    ) : (
      <AlertTriangle
        className="w-3.5 h-3.5"
        style={{ color: decisionColor }}
      />
    );

  const formattedTime = entry.timestamp
    ? new Date(entry.timestamp).toLocaleString()
    : "—";

  return (
    <div className="relative">
      {/* Genesis marker */}
      {isGenesis && (
        <div className="flex justify-center mb-3">
          <div
            className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-semibold"
            style={{
              backgroundColor: "rgba(59, 130, 246, 0.12)",
              color: "#3b82f6",
              border: "1px solid rgba(59, 130, 246, 0.25)",
            }}
          >
            <Shield className="w-3.5 h-3.5" />
            GENESIS BLOCK — Chain Origin
          </div>
        </div>
      )}

      {/* Block card */}
      <div
        className="rounded-lg border transition-all duration-200 cursor-pointer group"
        style={{
          borderColor: isGenesis
            ? "rgba(59, 130, 246, 0.3)"
            : "rgba(184, 150, 62, 0.25)",
          backgroundColor: isGenesis
            ? "rgba(59, 130, 246, 0.04)"
            : "rgba(184, 150, 62, 0.03)",
        }}
        onClick={onToggle}
      >
        {/* Header row */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            {/* Block number */}
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold"
              style={{
                backgroundColor: isGenesis
                  ? "rgba(59, 130, 246, 0.15)"
                  : "rgba(184, 150, 62, 0.12)",
                color: isGenesis ? "#3b82f6" : "#b8963e",
              }}
            >
              #{index}
            </div>

            {/* Action + Decision */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-medium"
                  style={{ color: "#e5e7eb" }}
                >
                  {entry.action}
                </span>
                <span
                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${decisionColor}15`,
                    color: decisionColor,
                  }}
                >
                  {decisionIcon}
                  {entry.decision.toUpperCase()}
                </span>
              </div>
              <span
                className="text-[11px] font-mono"
                style={{ color: "#6b7280" }}
              >
                {entry.block_id}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Timestamp */}
            <div
              className="hidden sm:flex items-center gap-1 text-[11px]"
              style={{ color: "#6b7280" }}
            >
              <Clock className="w-3 h-3" />
              {entry.timestamp?.slice(0, 10)} {entry.timestamp?.slice(11, 19)}
            </div>

            {/* Source badge */}
            {entry.source && (
              <span
                className="text-[9px] font-medium px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor:
                    entry.source === "gateway"
                      ? "rgba(168, 85, 247, 0.12)"
                      : "rgba(59, 130, 246, 0.12)",
                  color:
                    entry.source === "gateway" ? "#a855f7" : "#3b82f6",
                }}
              >
                {entry.source.toUpperCase()}
              </span>
            )}

            {/* Expand toggle */}
            {isExpanded ? (
              <ChevronDown
                className="w-4 h-4 transition-transform"
                style={{ color: "#9ca3af" }}
              />
            ) : (
              <ChevronRight
                className="w-4 h-4 transition-transform"
                style={{ color: "#9ca3af" }}
              />
            )}
          </div>
        </div>

        {/* Hash preview bar */}
        <div
          className="flex items-center gap-4 px-4 pb-3 text-[10px] font-mono"
          style={{ color: "#6b7280" }}
        >
          <div className="flex items-center gap-1">
            <Hash className="w-3 h-3" style={{ color: "#22c55e" }} />
            <span style={{ color: "#9ca3af" }}>hash:</span>
            <span style={{ color: "#22c55e" }}>
              {truncHash(entry.current_hash, 16)}
            </span>
            <CopyButton text={entry.current_hash} />
          </div>
          <div className="flex items-center gap-1">
            <Link2 className="w-3 h-3" style={{ color: "#b8963e" }} />
            <span style={{ color: "#9ca3af" }}>prev:</span>
            <span style={{ color: "#b8963e" }}>
              {entry.previous_hash ? truncHash(entry.previous_hash, 16) : "GENESIS"}
            </span>
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div
            className="border-t px-4 py-4"
            style={{ borderColor: "rgba(184, 150, 62, 0.12)" }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left column — Identity & Action */}
              <div className="space-y-3">
                <h4
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "#b8963e" }}
                >
                  Identity & Action
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <FileText
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: "#6b7280" }}
                    />
                    <div>
                      <span style={{ color: "#6b7280" }}>Block ID</span>
                      <p
                        className="font-mono text-[11px] break-all"
                        style={{ color: "#d1d5db" }}
                      >
                        {entry.block_id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: "#6b7280" }}
                    />
                    <div>
                      <span style={{ color: "#6b7280" }}>Intent ID</span>
                      <p
                        className="font-mono text-[11px] break-all"
                        style={{ color: "#d1d5db" }}
                      >
                        {entry.intent_id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <User
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: "#6b7280" }}
                    />
                    <div>
                      <span style={{ color: "#6b7280" }}>Recorded By</span>
                      <p
                        className="text-[11px]"
                        style={{ color: "#d1d5db" }}
                      >
                        {entry.recorded_by}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: "#6b7280" }}
                    />
                    <div>
                      <span style={{ color: "#6b7280" }}>Timestamp</span>
                      <p
                        className="text-[11px]"
                        style={{ color: "#d1d5db" }}
                      >
                        {formattedTime}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right column — Cryptographic Proof */}
              <div className="space-y-3">
                <h4
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "#b8963e" }}
                >
                  Cryptographic Proof
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <Hash
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: "#22c55e" }}
                    />
                    <div className="min-w-0">
                      <span style={{ color: "#6b7280" }}>Current Hash</span>
                      <div className="flex items-center gap-1">
                        <p
                          className="font-mono text-[11px] break-all"
                          style={{ color: "#22c55e" }}
                        >
                          {entry.current_hash}
                        </p>
                        <CopyButton text={entry.current_hash} />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Link2
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: "#b8963e" }}
                    />
                    <div className="min-w-0">
                      <span style={{ color: "#6b7280" }}>Previous Hash</span>
                      <p
                        className="font-mono text-[11px] break-all"
                        style={{ color: "#b8963e" }}
                      >
                        {entry.previous_hash ?? "GENESIS (no predecessor)"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Shield
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: "#6b7280" }}
                    />
                    <div className="min-w-0">
                      <span style={{ color: "#6b7280" }}>Receipt Hash</span>
                      <div className="flex items-center gap-1">
                        <p
                          className="font-mono text-[11px] break-all"
                          style={{ color: "#d1d5db" }}
                        >
                          {entry.receipt_hash ?? "—"}
                        </p>
                        {entry.receipt_hash && (
                          <CopyButton text={entry.receipt_hash} />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Lock
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: "#6b7280" }}
                    />
                    <div className="min-w-0">
                      <span style={{ color: "#6b7280" }}>
                        Ed25519 Signature
                      </span>
                      <p
                        className="font-mono text-[11px] break-all"
                        style={{ color: "#d1d5db" }}
                      >
                        {entry.ledger_signature
                          ? truncHash(entry.ledger_signature, 40)
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: "rgba(59, 130, 246, 0.1)",
                        color: "#3b82f6",
                      }}
                    >
                      Protocol {entry.protocol_version ?? "v2"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Chain() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [filterDecision, setFilterDecision] = useState<string>("all");

  const { data, isLoading, error, refetch } = trpc.rio.ledgerChain.useQuery(
    { limit: 200 },
    { refetchOnWindowFocus: false }
  );

  const entries: LedgerEntry[] = useMemo(
    () => (data?.entries ?? []) as LedgerEntry[],
    [data]
  );
  const chainValid = data?.chainValid ?? true;
  const chainErrors = data?.chainErrors ?? [];

  const filteredEntries = useMemo(() => {
    if (filterDecision === "all") return entries;
    return entries.filter((e) => e.decision === filterDecision);
  }, [entries, filterDecision]);

  const toggleExpand = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Stats
  const approvedCount = entries.filter((e) => e.decision === "approved").length;
  const deniedCount = entries.filter((e) => e.decision === "denied").length;
  const pendingCount = entries.filter(
    (e) => e.decision !== "approved" && e.decision !== "denied"
  ).length;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      <NavBar />
      <div className="flex flex-col items-center flex-1 px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <img
          src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-rings-clean_ac8891e1.png"
          alt="RIO Logo"
          className="w-16 h-16 mb-4"
        />
        <h1
          className="text-3xl sm:text-4xl font-black tracking-[0.15em] mb-2"
          style={{ color: "#b8963e" }}
        >
          RECEIPT CHAIN
        </h1>
        <p
          className="text-sm font-light tracking-[0.08em] mb-2"
          style={{ color: "#9ca3af" }}
        >
          Visual Chain Integrity Timeline
        </p>
        <p
          className="text-sm text-center max-w-2xl mb-8"
          style={{ color: "#d1d5db" }}
        >
          Every governed action produces a receipt linked to the previous by
          cryptographic hash. This timeline visualizes the unbroken chain from
          genesis to present. If any block is tampered with, the chain breaks
          visibly.
        </p>

        {/* Stats bar */}
        {!isLoading && data && (
          <div className="w-full max-w-4xl mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Chain integrity badge */}
              <div
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg border"
                style={{
                  borderColor: chainValid
                    ? "rgba(34, 197, 94, 0.3)"
                    : "rgba(239, 68, 68, 0.3)",
                  backgroundColor: chainValid
                    ? "rgba(34, 197, 94, 0.06)"
                    : "rgba(239, 68, 68, 0.06)",
                }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: chainValid ? "#22c55e" : "#ef4444",
                    boxShadow: chainValid
                      ? "0 0 8px rgba(34, 197, 94, 0.5)"
                      : "0 0 8px rgba(239, 68, 68, 0.5)",
                  }}
                />
                <span
                  className="text-xs font-semibold"
                  style={{ color: chainValid ? "#22c55e" : "#ef4444" }}
                >
                  {chainValid ? "CHAIN VALID" : "CHAIN BROKEN"}
                </span>
                <span
                  className="text-[10px] font-mono"
                  style={{ color: "#6b7280" }}
                >
                  {entries.length} blocks
                </span>
              </div>

              {/* Stats pills */}
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-medium px-2.5 py-1 rounded-full"
                  style={{
                    backgroundColor: "rgba(34, 197, 94, 0.1)",
                    color: "#22c55e",
                  }}
                >
                  {approvedCount} approved
                </span>
                <span
                  className="text-[10px] font-medium px-2.5 py-1 rounded-full"
                  style={{
                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                    color: "#ef4444",
                  }}
                >
                  {deniedCount} denied
                </span>
                {pendingCount > 0 && (
                  <span
                    className="text-[10px] font-medium px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: "rgba(234, 179, 8, 0.1)",
                      color: "#eab308",
                    }}
                  >
                    {pendingCount} pending
                  </span>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <select
                  value={filterDecision}
                  onChange={(e) => setFilterDecision(e.target.value)}
                  className="text-[11px] px-2 py-1 rounded border bg-transparent"
                  style={{
                    borderColor: "rgba(184, 150, 62, 0.3)",
                    color: "#d1d5db",
                  }}
                >
                  <option value="all" style={{ backgroundColor: "#1a1a2e" }}>
                    All decisions
                  </option>
                  <option
                    value="approved"
                    style={{ backgroundColor: "#1a1a2e" }}
                  >
                    Approved only
                  </option>
                  <option
                    value="denied"
                    style={{ backgroundColor: "#1a1a2e" }}
                  >
                    Denied only
                  </option>
                </select>
                <button
                  onClick={() => refetch()}
                  className="flex items-center gap-1 px-3 py-1 text-[11px] font-medium border rounded transition-colors hover:bg-white/5"
                  style={{ borderColor: "#b8963e", color: "#b8963e" }}
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chain errors */}
        {chainErrors.length > 0 && (
          <div
            className="w-full max-w-4xl mb-6 p-4 rounded-lg border"
            style={{
              borderColor: "rgba(239, 68, 68, 0.3)",
              backgroundColor: "rgba(239, 68, 68, 0.06)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4" style={{ color: "#ef4444" }} />
              <span
                className="text-xs font-semibold"
                style={{ color: "#ef4444" }}
              >
                Chain Integrity Errors
              </span>
            </div>
            {chainErrors.map((err: string, i: number) => (
              <p
                key={i}
                className="text-[11px] font-mono ml-6"
                style={{ color: "#fca5a5" }}
              >
                {err}
              </p>
            ))}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-20">
            <div
              className="w-5 h-5 rounded-full animate-pulse"
              style={{ backgroundColor: "#b8963e" }}
            />
            <span className="text-sm" style={{ color: "#9ca3af" }}>
              Loading receipt chain...
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="w-full max-w-4xl p-4 rounded-lg border"
            style={{
              borderColor: "rgba(239, 68, 68, 0.3)",
              backgroundColor: "rgba(239, 68, 68, 0.06)",
            }}
          >
            <p className="text-sm" style={{ color: "#ef4444" }}>
              Failed to load chain: {error.message}
            </p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && entries.length === 0 && (
          <div className="py-20 text-center">
            <Shield
              className="w-12 h-12 mx-auto mb-4"
              style={{ color: "#6b7280" }}
            />
            <p className="text-sm mb-2" style={{ color: "#9ca3af" }}>
              No receipts in the chain yet.
            </p>
            <p className="text-xs" style={{ color: "#6b7280" }}>
              Submit a governed action through{" "}
              <a href="/go" style={{ color: "#b8963e" }}>
                Try RIO
              </a>{" "}
              to create the first receipt.
            </p>
          </div>
        )}

        {/* Chain Timeline */}
        {filteredEntries.length > 0 && (
          <div className="w-full max-w-4xl">
            {filteredEntries.map((entry, index) => {
              // When filtering, we use the original index from the full entries array
              const originalIndex = entries.indexOf(entry);
              const isGenesis = originalIndex === 0;

              return (
                <div key={entry.block_id}>
                  {/* Chain link between blocks */}
                  {index > 0 && filterDecision === "all" && (
                    <ChainLink
                      prevHash={entry.previous_hash}
                      currentHashOfPrev={entries[originalIndex - 1]?.current_hash ?? ""}
                      index={originalIndex}
                    />
                  )}

                  {/* Block node */}
                  <BlockNode
                    entry={entry}
                    index={originalIndex}
                    isGenesis={isGenesis}
                    isExpanded={expanded.has(originalIndex)}
                    onToggle={() => toggleExpand(originalIndex)}
                  />
                </div>
              );
            })}

            {/* Chain end marker */}
            <div className="flex flex-col items-center mt-4">
              <div
                className="w-0.5 h-6"
                style={{ backgroundColor: "rgba(184, 150, 62, 0.2)" }}
              />
              <div
                className="flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-semibold"
                style={{
                  backgroundColor: "rgba(184, 150, 62, 0.08)",
                  color: "#b8963e",
                  border: "1px solid rgba(184, 150, 62, 0.2)",
                }}
              >
                <Lock className="w-3.5 h-3.5" />
                CHAIN HEAD — {entries.length} blocks sealed
              </div>
            </div>
          </div>
        )}

        {/* Invariant reference */}
        <div
          className="w-full max-w-4xl mt-10 p-5 rounded-lg border"
          style={{
            borderColor: "rgba(184, 150, 62, 0.15)",
            backgroundColor: "rgba(184, 150, 62, 0.03)",
          }}
        >
          <h3
            className="text-sm font-semibold mb-3"
            style={{ color: "#b8963e" }}
          >
            Constitutional Invariants
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              className="p-3 rounded border"
              style={{
                borderColor: "rgba(59, 130, 246, 0.2)",
                backgroundColor: "rgba(59, 130, 246, 0.04)",
              }}
            >
              <p
                className="text-xs font-semibold mb-1"
                style={{ color: "#3b82f6" }}
              >
                INVARIANT-001
              </p>
              <p className="text-[11px]" style={{ color: "#d1d5db" }}>
                No Action Without a Receipt — every governed action MUST produce
                a cryptographically signed, hash-chained receipt.
              </p>
            </div>
            <div
              className="p-3 rounded border"
              style={{
                borderColor: "rgba(168, 85, 247, 0.2)",
                backgroundColor: "rgba(168, 85, 247, 0.04)",
              }}
            >
              <p
                className="text-xs font-semibold mb-1"
                style={{ color: "#a855f7" }}
              >
                INVARIANT-002
              </p>
              <p className="text-[11px]" style={{ color: "#d1d5db" }}>
                No Modification Without a Governance Receipt — no receipt,
                ledger entry, or policy artifact may be modified or deleted after
                creation. The past is immutable.
              </p>
            </div>
          </div>
        </div>

        {/* Navigation links */}
        <div className="flex flex-wrap gap-4 mt-8">
          <a
            href="/ledger"
            className="text-sm font-light tracking-wide hover:underline flex items-center gap-1"
            style={{ color: "#b8963e" }}
          >
            Ledger Explorer →
          </a>
          <a
            href="/verify"
            className="text-sm font-light tracking-wide hover:underline flex items-center gap-1"
            style={{ color: "#b8963e" }}
          >
            Verify Receipt →
          </a>
          <a
            href="/tamper"
            className="text-sm font-light tracking-wide hover:underline flex items-center gap-1"
            style={{ color: "#b8963e" }}
          >
            Tamper Demo →
          </a>
          <a
            href="/"
            className="text-sm font-light tracking-wide hover:underline flex items-center gap-1"
            style={{ color: "#9ca3af" }}
          >
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
