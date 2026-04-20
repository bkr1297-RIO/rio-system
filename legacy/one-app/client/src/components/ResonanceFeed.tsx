/**
 * Resonance Feed — Live System Activity Stream
 *
 * The system's heartbeat. Lights up whenever a node (Manny, Bondi, Claude,
 * Gemini, Brian) drops a new insight, receipt, or governance artifact.
 *
 * Data source: Google Drive activity stream (primary) or GitHub commits (fallback)
 * Pattern tags inferred from folder path + file name.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  RefreshCw,
  Clock,
  ExternalLink,
  Hash,
  FileText,
  GitCommit,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Zap,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ─── Time formatting ────────────────────────────────────── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ─── Tag colors ─────────────────────────────────────────── */

const TAG_COLORS: Record<string, string> = {
  "#SurgicalHit": "bg-red-500/20 text-red-300 border-red-500/30",
  "#GovernanceAudit": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "#IntegritySweep": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "#Receipt": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "#Proof": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "#Resonance": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "#MasterSeed": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "#Policy": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "#Directive": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "#WitnessChain": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "#GitCommit": "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "#Protocol": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "#Manny": "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "#Bondi": "bg-pink-500/20 text-pink-300 border-pink-500/30",
  "#Claude": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "#Gemini": "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "#Brian": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
};

function TagBadge({ tag }: { tag: string }) {
  const color = TAG_COLORS[tag] || "bg-muted/30 text-muted-foreground border-border/30";
  return (
    <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded border", color)}>
      {tag}
    </span>
  );
}

/* ─── MIME type icon ─────────────────────────────────────── */

function MimeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/git-commit") {
    return <GitCommit className="h-3.5 w-3.5 text-violet-400" />;
  }
  if (mimeType.includes("json")) {
    return <FileText className="h-3.5 w-3.5 text-amber-400" />;
  }
  if (mimeType.includes("markdown") || mimeType.includes("text")) {
    return <FileText className="h-3.5 w-3.5 text-blue-400" />;
  }
  if (mimeType.includes("document")) {
    return <FileText className="h-3.5 w-3.5 text-sky-400" />;
  }
  return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
}

/* ─── Source badge ───────────────────────────────────────── */

function SourceBadge({ source }: { source: string }) {
  if (source === "drive") {
    return (
      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
        Google Drive
      </span>
    );
  }
  if (source === "github") {
    return (
      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
        GitHub
      </span>
    );
  }
  return null;
}

/* ─── Main Component ─────────────────────────────────────── */

export default function ResonanceFeed() {
  const [expanded, setExpanded] = useState(true);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, refetch, isFetching } = trpc.resonance.feed.useQuery(
    { hoursBack: 72, maxEvents: 50 },
    {
      staleTime: 120_000, // Cache for 2 minutes
      refetchInterval: 300_000, // Auto-refresh every 5 minutes
    }
  );

  // Collect all unique tags for filter
  const allTags = new Map<string, number>();
  if (data?.data?.events) {
    for (const event of data.data.events) {
      for (const tag of event.tags) {
        allTags.set(tag, (allTags.get(tag) || 0) + 1);
      }
    }
  }
  const sortedTags = Array.from(allTags.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  // Filter events
  const events = (data?.data?.events || []).filter(
    (e) => !filterTag || e.tags.includes(filterTag)
  );
  const displayEvents = showAll ? events : events.slice(0, 15);

  return (
    <div className="space-y-4">
      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/40 bg-card/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-purple-500/10 flex items-center justify-center">
              <Activity className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground/80">
                Resonance Feed
              </h2>
              <p className="text-[10px] text-muted-foreground">
                System heartbeat — live activity stream
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data?.source && <SourceBadge source={data.source} />}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-7 w-7 p-0"
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Summary bar */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-purple-400" />
            <span className="text-xs font-bold text-foreground">
              {data?.data?.totalEvents ?? 0}
            </span>
            <span className="text-[10px] text-muted-foreground">events</span>
          </div>
          <span className="text-muted-foreground/30">|</span>
          <span className="text-[10px] text-muted-foreground">
            Last 72h
          </span>
          {data?.data?.fetchedAt && (
            <>
              <span className="text-muted-foreground/30">|</span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {timeAgo(new Date(data.data.fetchedAt).toISOString())}
              </span>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <>
          {/* Loading state */}
          {isLoading && (
            <div className="rounded-xl border border-border/40 bg-card/50 p-6 flex items-center justify-center">
              <div className="animate-spin h-5 w-5 border-2 border-purple-400 border-t-transparent rounded-full" />
              <span className="text-xs text-muted-foreground ml-2">Loading activity stream...</span>
            </div>
          )}

          {/* Error state */}
          {!isLoading && data && !data.ok && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="text-xs text-amber-400 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                {data.error || "Could not load activity stream"}
              </div>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                <RefreshCw className="h-3 w-3 mr-1" /> Retry
              </Button>
            </div>
          )}

          {/* Tag filter */}
          {sortedTags.length > 0 && (
            <div className="rounded-xl border border-border/40 bg-card/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Filter by pattern
                </span>
                {filterTag && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[9px]"
                    onClick={() => setFilterTag(null)}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sortedTags.map(([tag, count]) => (
                  <button
                    key={tag}
                    onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                    className={cn(
                      "text-[9px] font-semibold px-1.5 py-0.5 rounded border transition-all",
                      filterTag === tag
                        ? "ring-1 ring-primary/50 scale-105"
                        : "opacity-70 hover:opacity-100",
                      TAG_COLORS[tag] || "bg-muted/30 text-muted-foreground border-border/30"
                    )}
                  >
                    {tag} ({count})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Event list */}
          {displayEvents.length > 0 && (
            <div className="rounded-xl border border-border/40 bg-card/50 divide-y divide-border/20">
              {displayEvents.map((event) => (
                <div
                  key={event.fileId}
                  className="p-3 hover:bg-muted/10 transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">
                      <MimeIcon mimeType={event.mimeType} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium truncate">
                          {event.name}
                        </span>
                        {event.webViewLink && (
                          <a
                            href={event.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0"
                          >
                            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary transition-colors" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {event.folderPath}
                        </span>
                        <span className="text-muted-foreground/30">·</span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {formatTime(event.modifiedTime)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {event.tags.map((tag) => (
                          <TagBadge key={tag} tag={tag} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Show more / less */}
          {events.length > 15 && (
            <div className="text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(!showAll)}
                className="text-xs"
              >
                {showAll ? "Show less" : `Show all ${events.length} events`}
              </Button>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && displayEvents.length === 0 && (
            <div className="rounded-xl border border-border/40 bg-card/50 p-6 text-center">
              <Activity className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                {filterTag
                  ? `No events matching ${filterTag} in the last 72 hours`
                  : "No activity detected in the last 72 hours"}
              </p>
            </div>
          )}

          {/* Attribution */}
          <div className="text-[9px] text-muted-foreground/40 text-center">
            Source: RIO folder tree activity stream · Pattern tags auto-inferred
            {data?.source === "github" && " · Fallback: GitHub commits (Drive API unavailable)"}
          </div>
        </>
      )}
    </div>
  );
}
