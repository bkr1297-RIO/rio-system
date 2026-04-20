import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Loader2, AlertTriangle, Shield, Zap } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

function RiskBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    LOW: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    MEDIUM: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    HIGH: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-semibold border ${colors[tier] || colors.LOW}`}>
      {tier === "HIGH" && <AlertTriangle className="h-3 w-3" />}
      {tier === "MEDIUM" && <Shield className="h-3 w-3" />}
      {tier === "LOW" && <Zap className="h-3 w-3" />}
      {tier}
    </span>
  );
}

export default function CreateIntent() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [selectedTool, setSelectedTool] = useState<string>("");
  const [args, setArgs] = useState<Record<string, string>>({});
  const [reflection, setReflection] = useState("");
  const [breakAnalysis, setBreakAnalysis] = useState("");

  const { data: tools, isLoading: toolsLoading } = trpc.tools.list.useQuery();

  const currentTool = useMemo(() => tools?.find(t => t.toolName === selectedTool), [tools, selectedTool]);

  const needsBreakAnalysis = currentTool && (currentTool.riskTier === "MEDIUM" || currentTool.riskTier === "HIGH");

  const createMutation = trpc.proxy.createIntent.useMutation({
    onSuccess: (data) => {
      if (data) {
        toast.success(`Intent ${data.intentId} created`);
        navigate(`/intent/${data.intentId}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  if (authLoading || toolsLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isAuthenticated) {
    navigate("/");
    return null;
  }

  const handleToolChange = (toolName: string) => {
    setSelectedTool(toolName);
    setArgs({});
    setBreakAnalysis("");
  };

  const requiredParams: string[] = currentTool?.requiredParams ? (currentTool.requiredParams as string[]) : [];

  const blastScore = currentTool ? Math.min(10, currentTool.blastRadiusBase + Math.floor(Object.keys(args).filter(k => args[k]).length / 2)) : 0;

  const handleSubmit = () => {
    if (!selectedTool) return;
    if (needsBreakAnalysis && !breakAnalysis.trim()) {
      toast.error("Break analysis is required for this risk tier. Describe where this could go wrong.");
      return;
    }
    const toolArgs: Record<string, unknown> = {};
    for (const p of requiredParams) {
      toolArgs[p] = args[p] || "";
    }
    createMutation.mutate({
      toolName: selectedTool,
      toolArgs,
      reflection: reflection || undefined,
      breakAnalysis: breakAnalysis || undefined,
    });
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold font-mono tracking-tight flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-primary" />
            Create Intent
          </h1>
          <p className="text-sm text-muted-foreground">Propose a governed action for execution.</p>
        </div>

        {/* Tool Selection */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono">SELECT TOOL</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedTool} onValueChange={handleToolChange}>
              <SelectTrigger className="bg-secondary/50 font-mono text-sm">
                <SelectValue placeholder="Choose a tool..." />
              </SelectTrigger>
              <SelectContent>
                {tools?.map(t => (
                  <SelectItem key={t.toolName} value={t.toolName}>
                    <span className="font-mono text-sm">{t.toolName}</span>
                    <span className="text-xs text-muted-foreground ml-2">({t.riskTier})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {currentTool && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-mono">{currentTool.description}</span>
                  <RiskBadge tier={currentTool.riskTier} />
                </div>

                {/* Blast Radius */}
                <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
                  <div className="text-xs font-mono text-muted-foreground">BLAST RADIUS</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-background overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${blastScore <= 3 ? "bg-emerald-500" : blastScore <= 6 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${blastScore * 10}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold w-8 text-right">{blastScore}/10</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {(currentTool.riskTier === "HIGH" ? ["external-api", "user-data", "audit-log"] : currentTool.riskTier === "MEDIUM" ? ["filesystem", "audit-log"] : ["audit-log"]).map(s => (
                      <span key={s} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background text-muted-foreground">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Arguments */}
        {currentTool && requiredParams.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono">ARGUMENTS</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {requiredParams.map(param => (
                <div key={param}>
                  <label className="text-xs font-mono text-muted-foreground mb-1 block">{param}</label>
                  <input
                    type="text"
                    value={args[param] || ""}
                    onChange={(e) => setArgs(prev => ({ ...prev, [param]: e.target.value }))}
                    placeholder={`Enter ${param}...`}
                    className="w-full rounded-md border border-border bg-secondary/50 p-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Break Analysis — required for MEDIUM/HIGH */}
        {needsBreakAnalysis && (
          <Card className="bg-card border-red-500/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                BREAK ANALYSIS (required for {currentTool.riskTier})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Where does this break? Describe what could go wrong, who is affected, and whether this is reversible.
              </p>
              <textarea
                value={breakAnalysis}
                onChange={(e) => setBreakAnalysis(e.target.value)}
                placeholder="Example: If the recipient address is wrong, the email cannot be recalled. The body contains no sensitive data. Worst case: wrong person receives a test notification."
                className="w-full rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none"
                rows={4}
              />
              {!breakAnalysis.trim() && (
                <p className="text-[10px] font-mono text-red-400">This field is required before submission.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Reflection */}
        {currentTool && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono">REFLECTION (optional)</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="Why is this action necessary? What is the expected outcome?"
                className="w-full rounded-md border border-border bg-secondary/50 p-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                rows={3}
              />
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        {currentTool && (
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !selectedTool || (needsBreakAnalysis && !breakAnalysis.trim())}
            className="w-full font-mono uppercase tracking-wider gap-2"
            size="lg"
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
            {currentTool.riskTier === "LOW" ? "Create & Auto-Approve" : "Create Intent (Requires Approval)"}
          </Button>
        )}
      </div>
    </div>
  );
}
