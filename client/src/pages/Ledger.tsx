import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, BookOpen, ShieldCheck, RefreshCw } from "lucide-react";
import { useState } from "react";

function EntryTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    ONBOARD: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    INTENT: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    APPROVAL: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    EXECUTION: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    KILL: "bg-red-500/15 text-red-400 border-red-500/30",
    SYNC: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${colors[type] || colors.ONBOARD}`}>{type}</span>;
}

export default function Ledger() {
  const { data: entries, isLoading } = trpc.ledger.list.useQuery();
  const { data: verification, isLoading: verifying, refetch: reverify } = trpc.ledger.verify.useQuery();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" /> Audit Ledger
            </h1>
            <p className="text-sm text-muted-foreground">{entries?.length || 0} entries in tamper-evident hash chain</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => reverify()} disabled={verifying} className="text-xs gap-1">
            <RefreshCw className={`h-3 w-3 ${verifying ? "animate-spin" : ""}`} /> Verify Chain
          </Button>
        </div>

        {/* Verification Banner */}
        {verification && (
          <Card className={`border ${verification.valid ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              {verification.valid ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  <div>
                    <div className="text-sm font-semibold text-emerald-600">Chain Valid</div>
                    <div className="text-xs text-muted-foreground">{verification.entries} entries verified. No tampering detected.</div>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-400" />
                  <div>
                    <div className="text-sm font-semibold text-red-500">Chain Broken</div>
                    <div className="text-xs text-muted-foreground">{verification.errors.length} error(s) detected.</div>
                    {verification.errors.map((e, i) => <div key={i} className="text-xs text-red-400 font-mono mt-0.5">{e}</div>)}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Ledger Entries */}
        <div className="space-y-2">
          {entries?.map((entry, idx) => (
            <Card
              key={entry.entryId}
              className="bg-card border-border cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setExpandedId(expandedId === entry.entryId ? null : entry.entryId)}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground w-6 text-right">#{idx + 1}</span>
                    <EntryTypeBadge type={entry.entryType} />
                    <span className="text-xs font-mono text-muted-foreground">{entry.entryId}</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">{new Date(Number(entry.timestamp)).toLocaleString()}</span>
                </div>

                {expandedId === entry.entryId && (
                  <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground">HASH</div>
                        <div className="text-xs font-mono text-primary break-all">{entry.hash}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground">PREV HASH</div>
                        <div className="text-xs font-mono text-muted-foreground break-all">{entry.prevHash}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground">PAYLOAD</div>
                        <pre className="text-xs font-mono bg-secondary/50 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground mt-1">{JSON.stringify(entry.payload, null, 2)}</pre>
                      </div>
                    </div>
                    {/* Chain Link Visualization */}
                    {idx > 0 && (
                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <span className="text-muted-foreground">Chain link:</span>
                        {entry.prevHash === entries[idx - 1]?.hash ? (
                          <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Valid</span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-400"><XCircle className="h-3 w-3" /> Broken</span>
                        )}
                      </div>
                    )}
                    {idx === 0 && (
                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <span className="text-muted-foreground">Genesis entry:</span>
                        <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> prevHash = GENESIS</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {(!entries || entries.length === 0) && (
          <Card className="bg-card border-border">
            <CardContent className="py-8 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-mono text-muted-foreground">Ledger is empty. Complete onboarding to create the first entry.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
