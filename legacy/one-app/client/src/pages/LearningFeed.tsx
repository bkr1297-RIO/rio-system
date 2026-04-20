import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, Brain, ThumbsUp, ThumbsDown, Minus, CheckCircle2,
  XCircle, Zap, MessageSquare, PenLine, BarChart3,
} from "lucide-react";

const EVENT_TYPE_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  APPROVAL: { icon: CheckCircle2, color: "text-emerald-400", label: "Approved" },
  REJECTION: { icon: XCircle, color: "text-red-400", label: "Rejected" },
  EXECUTION: { icon: Zap, color: "text-blue-400", label: "Executed" },
  FEEDBACK: { icon: MessageSquare, color: "text-amber-400", label: "Feedback" },
  CORRECTION: { icon: PenLine, color: "text-purple-400", label: "Correction" },
};

const OUTCOME_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  POSITIVE: { icon: ThumbsUp, color: "text-emerald-400" },
  NEGATIVE: { icon: ThumbsDown, color: "text-red-400" },
  NEUTRAL: { icon: Minus, color: "text-muted-foreground" },
};

export default function LearningFeed() {
  const { isAuthenticated } = useAuth();
  const eventsQuery = trpc.learning.list.useQuery({ limit: 100 }, { enabled: isAuthenticated });
  const summaryQuery = trpc.learning.summary.useQuery(undefined, { enabled: isAuthenticated });

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3rem)]">
        <p className="text-muted-foreground font-mono text-sm">Sign in to view learning feed</p>
      </div>
    );
  }

  const events = eventsQuery.data ?? [];
  const summary = summaryQuery.data;

  return (
    <div className="container py-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Brain className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight">Learning Feed</h1>
        <p className="text-sm text-muted-foreground">How your proxy is adapting over time</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Card className="bg-card/50">
            <CardContent className="pt-4 pb-3 px-4 text-center">
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Events</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-4 pb-3 px-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{summary.positive}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Positive</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-4 pb-3 px-4 text-center">
              <p className="text-2xl font-bold text-red-500">{summary.negative}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Negative</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-4 pb-3 px-4 text-center">
              <p className="text-2xl font-bold text-muted-foreground">{summary.neutral}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Neutral</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="pt-4 pb-3 px-4 text-center">
              <p className="text-2xl font-bold text-primary">{Object.keys(summary.byType).length}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Event Types</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Event List */}
      {eventsQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : events.length === 0 ? (
        <Card className="bg-card/50">
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No learning events yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Events are created when you approve, reject, or provide feedback on AI proposals
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-16rem)]">
          <div className="space-y-2">
            {events.map(event => {
              const typeConfig = EVENT_TYPE_CONFIG[event.eventType] ?? EVENT_TYPE_CONFIG.FEEDBACK;
              const outcomeConfig = OUTCOME_CONFIG[event.outcome] ?? OUTCOME_CONFIG.NEUTRAL;
              const TypeIcon = typeConfig.icon;
              const OutcomeIcon = outcomeConfig.icon;
              const context = event.context as Record<string, unknown> | null;

              return (
                <Card key={event.eventId} className="bg-card/50 border-border/50">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`mt-0.5 ${typeConfig.color}`}>
                          <TypeIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {typeConfig.label}
                            </Badge>
                            <div className={`flex items-center gap-1 ${outcomeConfig.color}`}>
                              <OutcomeIcon className="h-3 w-3" />
                              <span className="text-[10px] font-mono">{event.outcome}</span>
                            </div>
                            {typeof context?.toolName === "string" ? (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {context.toolName}
                              </span>
                            ) : null}
                            {typeof context?.riskTier === "string" ? (
                              <Badge variant="outline" className="text-[9px] px-1 py-0">
                                {context.riskTier}
                              </Badge>
                            ) : null}
                          </div>
                          {event.feedback && (
                            <p className="text-xs text-foreground/80 mt-1">
                              &ldquo;{event.feedback}&rdquo;
                            </p>
                          )}
                          {event.intentId && (
                            <p className="text-[10px] text-muted-foreground/60 font-mono mt-1">
                              Intent: {event.intentId}
                            </p>
                          )}
                          {(event.tags as string[] | null)?.length ? (
                            <div className="flex gap-1 mt-1">
                              {(event.tags as string[]).map((tag, i) => (
                                <Badge key={i} variant="secondary" className="text-[9px] px-1 py-0">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground/50 font-mono shrink-0">
                        {event.createdAt ? new Date(event.createdAt).toLocaleString() : "—"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
