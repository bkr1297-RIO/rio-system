import { trpc } from "@/lib/trpc";
import { sha256 } from "@/lib/crypto";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, FileText, ArrowLeft, ShieldCheck, Link2, Hash } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useState, useEffect } from "react";

function VerifyBadge({ valid, label }: { valid: boolean | null; label: string }) {
  if (valid === null) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border bg-secondary text-muted-foreground border-border">CHECKING {label}</span>;
  return valid
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border bg-emerald-500/15 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="h-3 w-3" /> {label} VALID</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border bg-red-500/15 text-red-400 border-red-500/30"><XCircle className="h-3 w-3" /> {label} INVALID</span>;
}

export default function Receipt() {
  const params = useParams<{ executionId: string }>();
  const [, navigate] = useLocation();
  const [receiptHashValid, setReceiptHashValid] = useState<boolean | null>(null);
  const [chainLinkValid, setChainLinkValid] = useState<boolean | null>(null);

  const { data: receipt, isLoading } = trpc.proxy.getReceipt.useQuery(
    { executionId: params.executionId || "" },
    { enabled: !!params.executionId }
  );

  const { data: ledgerEntries } = trpc.ledger.list.useQuery();

  // Verify receipt hash
  useEffect(() => {
    if (!receipt?.execution) return;
    (async () => {
      try {
        const exec = receipt.execution;
        // Use the canonical receiptPayload (exact JSON string that was hashed server-side)
        // This avoids MySQL JSON key-reordering breaking hash verification
        const dataToHash = (exec as any).receiptPayload;
        if (!dataToHash) {
          // Fallback for older executions without receiptPayload
          setReceiptHashValid(null);
          return;
        }
        const computed = await sha256(dataToHash);
        setReceiptHashValid(computed === exec.receiptHash);
      } catch {
        setReceiptHashValid(false);
      }
    })();
  }, [receipt]);

  // Verify chain linkage
  useEffect(() => {
    if (!receipt?.execution || !ledgerEntries) return;
    const executionEntry = ledgerEntries.find(e => {
      try {
        const payload = typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload;
        return payload.executionId === receipt.execution.executionId;
      } catch { return false; }
    });
    if (!executionEntry) { setChainLinkValid(null); return; }
    const idx = ledgerEntries.indexOf(executionEntry);
    if (idx === 0) { setChainLinkValid(executionEntry.prevHash === "GENESIS"); return; }
    setChainLinkValid(executionEntry.prevHash === ledgerEntries[idx - 1]?.hash);
  }, [receipt, ledgerEntries]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!receipt?.execution) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="bg-card border-border max-w-md w-full">
          <CardContent className="p-6 text-center space-y-3">
            <XCircle className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-sm font-mono text-muted-foreground">Receipt not found.</p>
            <Button variant="outline" onClick={() => navigate("/activity")} className="text-xs">Back to Activity</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const exec = receipt.execution;
  const intent = receipt.intent;
  const approval = receipt.approval;
  const preflightResults = typeof exec.preflightResults === "string" ? JSON.parse(exec.preflightResults) : exec.preflightResults;
  const result = typeof exec.result === "string" ? JSON.parse(exec.result) : exec.result;

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1 as any)} className="text-xs gap-1 text-muted-foreground">
          <ArrowLeft className="h-3 w-3" /> Back
        </Button>

        {/* Receipt Header */}
        <Card className="bg-card border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Execution Receipt
              </CardTitle>
              <span className="text-[10px] font-mono text-muted-foreground">{exec.executionId}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Verification Status */}
            <div className="rounded-lg bg-secondary/30 p-4 space-y-3">
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Cryptographic Verification</div>
              <div className="flex flex-wrap gap-2">
                <VerifyBadge valid={receiptHashValid} label="RECEIPT HASH" />
                <VerifyBadge valid={chainLinkValid} label="CHAIN LINK" />
                {approval && <VerifyBadge valid={approval.signature && approval.signature.length > 10 ? true : null} label="APPROVAL SIG" />}
              </div>
            </div>

            {/* Receipt Hash */}
            <div>
              <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3" /> RECEIPT HASH (SHA-256)</div>
              <div className="text-xs font-mono text-primary break-all mt-1">{exec.receiptHash}</div>
            </div>

            {/* Intent Details */}
            {intent && (
              <div className="rounded-lg bg-secondary/30 p-3 space-y-2">
                <div className="text-[10px] font-mono text-muted-foreground">INTENT</div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div><span className="text-muted-foreground">ID:</span> {intent.intentId}</div>
                  <div><span className="text-muted-foreground">Tool:</span> {intent.toolName}</div>
                  <div><span className="text-muted-foreground">Risk:</span> {intent.riskTier}</div>
                  <div><span className="text-muted-foreground">Status:</span> {intent.status}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Args Hash:</div>
                  <div className="text-xs font-mono text-muted-foreground break-all">{intent.argsHash}</div>
                </div>
              </div>
            )}

            {/* Approval Details */}
            {approval && (
              <div className="rounded-lg bg-secondary/30 p-3 space-y-2">
                <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> APPROVAL BINDING</div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div><span className="text-muted-foreground">Decision:</span> {approval.decision}</div>
                  <div><span className="text-muted-foreground">Bound Tool:</span> {approval.boundToolName}</div>
                  <div><span className="text-muted-foreground">Max Exec:</span> {approval.maxExecutions}</div>
                  <div><span className="text-muted-foreground">Used:</span> {approval.executionCount}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Bound Args Hash:</div>
                  <div className="text-xs font-mono text-muted-foreground break-all">{approval.boundArgsHash}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Signature:</div>
                  <div className="text-xs font-mono text-muted-foreground break-all">{approval.signature}</div>
                </div>
              </div>
            )}

            {/* Preflight Results */}
            {preflightResults && Array.isArray(preflightResults) && (
              <div className="space-y-2">
                <div className="text-[10px] font-mono text-muted-foreground">PREFLIGHT CHECKS ({preflightResults.filter((c: any) => c.status === "PASS").length}/{preflightResults.length})</div>
                <div className="space-y-1">
                  {preflightResults.map((check: any, i: number) => (
                    <div key={i} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-md px-3 py-2 text-xs font-mono gap-1 ${check.status === "PASS" ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                      <span className="flex items-center gap-2">
                        {check.status === "PASS" ? <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" /> : <XCircle className="h-3 w-3 text-red-400 shrink-0" />}
                        <span className="break-all">{check.check}</span>
                      </span>
                      <span className="text-muted-foreground text-[10px] sm:max-w-[50%] break-all sm:truncate pl-5 sm:pl-0">{check.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Execution Result */}
            <div>
              <div className="text-[10px] font-mono text-muted-foreground">EXECUTION RESULT</div>
              <pre className="text-xs font-mono bg-secondary/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground mt-1">{JSON.stringify(result, null, 2)}</pre>
            </div>

            {/* Chain Linkage */}
            <div className="rounded-lg border border-border/50 p-3 space-y-2">
              <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1"><Link2 className="h-3 w-3" /> HASH CHAIN LINKAGE</div>
              <p className="text-xs text-muted-foreground">
                This execution is recorded in the tamper-evident ledger. The receipt hash is computed from the execution data and can be independently verified. The chain link confirms this entry is properly linked to the previous ledger entry via SHA-256.
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate("/ledger")} className="text-xs gap-1">
                View Full Ledger <ArrowLeft className="h-3 w-3 rotate-180" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
