/**
 * Ask Bondi — Minimal read-only Q&A page
 *
 * No auth required. No governance. No tokens. No execution.
 * Just ask a question about implementing RIO and get a precise answer.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Send, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

// Simple markdown-ish rendering: code blocks, bold, inline code
function renderAnswer(text: string) {
  // Split on code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const lines = part.slice(3, -3).split("\n");
      const lang = lines[0]?.trim() || "";
      const code = lang ? lines.slice(1).join("\n") : lines.join("\n");
      return (
        <pre key={i} className="bg-slate-900 border border-slate-700 rounded-lg p-4 overflow-x-auto my-3 text-sm">
          {lang && <div className="text-xs text-slate-500 mb-2 font-mono">{lang}</div>}
          <code className="text-emerald-400 font-mono whitespace-pre">{code}</code>
        </pre>
      );
    }
    // Process inline formatting
    const formatted = part.split(/(\*\*.*?\*\*|`[^`]+`)/g).map((seg, j) => {
      if (seg.startsWith("**") && seg.endsWith("**")) {
        return <strong key={j} className="text-white font-semibold">{seg.slice(2, -2)}</strong>;
      }
      if (seg.startsWith("`") && seg.endsWith("`")) {
        return <code key={j} className="bg-slate-800 text-amber-400 px-1.5 py-0.5 rounded text-sm font-mono">{seg.slice(1, -1)}</code>;
      }
      return seg;
    });
    return <span key={i}>{formatted}</span>;
  });
}

export default function AskBondi() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  const askMutation = trpc.askBondi.useMutation({
    onSuccess: (data) => {
      const ans = typeof data.answer === "string" ? data.answer : JSON.stringify(data.answer);
      setAnswer(ans);
    },
    onError: (err) => {
      setAnswer(`Error: ${err.message}`);
    },
  });

  const handleSubmit = () => {
    if (!question.trim() || askMutation.isPending) return;
    setAnswer(null);
    askMutation.mutate({ question: question.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-200">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/">
            <button className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">Ask Bondi</h1>
            <p className="text-sm text-slate-400">RIO implementation assistant</p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Intro */}
        <div className="text-center space-y-2 py-4">
          <div className="text-4xl">🔷</div>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Ask any implementation question about the RIO protocol — receipts, Gateway integration, governed actions, ledger verification.
          </p>
        </div>

        {/* Input area */}
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 space-y-3">
            <Textarea
              placeholder="How do I send an email through RIO?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 resize-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              disabled={askMutation.isPending}
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">
                Press Enter to send, Shift+Enter for new line
              </span>
              <Button
                onClick={handleSubmit}
                disabled={!question.trim() || askMutation.isPending}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                {askMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Thinking...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Ask
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Answer display */}
        {askMutation.isPending && !answer && (
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-6 flex items-center gap-3 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              <span>Bondi is thinking...</span>
            </CardContent>
          </Card>
        )}

        {answer && (
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">B</div>
                <span className="text-sm font-medium text-slate-300">Bondi</span>
              </div>
              <div className="text-slate-300 leading-relaxed whitespace-pre-wrap text-sm">
                {renderAnswer(answer)}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Example questions */}
        {!answer && !askMutation.isPending && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Try asking</p>
            <div className="grid gap-2">
              {[
                "How do I verify a receipt?",
                "What's the execution flow?",
                "How do I send an email through RIO?",
                "How does the authorization token work?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setQuestion(q);
                    setAnswer(null);
                    askMutation.mutate({ question: q });
                  }}
                  className="text-left px-4 py-3 rounded-lg bg-slate-800/40 border border-slate-700/30 text-sm text-slate-400 hover:text-white hover:bg-slate-800/60 hover:border-slate-600/50 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
