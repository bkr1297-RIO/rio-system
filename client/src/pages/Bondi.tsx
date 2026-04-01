import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";
import {
  Send, Loader2, User, Sparkles, Clock,
  ChevronRight, MessageSquare, X, History,
  Mail, Search, FileText, Zap, Shield,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  metadata?: {
    nodeUsed?: string;
    mode?: string;
    intentsProposed?: number;
    tokensUsed?: number;
  };
};

type ProposedIntent = {
  intentId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  riskTier: string;
  reasoning: string;
  breakAnalysis?: string;
  confidence: number;
  status: string;
};

// ─── Tool Labels ──────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  send_email: "Send Email",
  send_sms: "Send Text",
  search_web: "Web Search",
  read_file: "Read File",
  write_file: "Write File",
  delete_file: "Delete File",
  execute_code: "Run Code",
  transfer_funds: "Transfer Funds",
  echo: "Test Action",
};

const RISK_STYLES: Record<string, string> = {
  LOW: "bg-emerald-50 border-emerald-200 text-emerald-700",
  MEDIUM: "bg-amber-50 border-amber-200 text-amber-700",
  HIGH: "bg-red-50 border-red-200 text-red-700",
};

// ─── Intent Proposal Card (clean version) ─────────────────────

function IntentCard({ intent }: { intent: ProposedIntent }) {
  const toolLabel = TOOL_LABELS[intent.toolName] ?? intent.toolName;
  const riskStyle = RISK_STYLES[intent.riskTier] ?? "";
  const isPending = intent.status === "PENDING_APPROVAL";

  return (
    <div className={cn(
      "rounded-xl border p-4 my-3 shadow-sm",
      isPending ? "bg-amber-50/50 border-amber-200" : "bg-card border-border"
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">{toolLabel}</span>
          <Badge variant="outline" className={cn("text-[10px] px-1.5 border", riskStyle)}>
            {intent.riskTier}
          </Badge>
        </div>
      </div>
      {intent.reasoning && (
        <p className="text-sm text-muted-foreground mb-3">{intent.reasoning}</p>
      )}
      <Link href={`/intent/${intent.intentId}`}>
        <Button
          variant={isPending ? "default" : "outline"}
          size="sm"
          className="gap-1.5 text-xs"
        >
          {isPending ? "Review & Approve" : "View Details"}
          <ChevronRight className="h-3 w-3" />
        </Button>
      </Link>
    </div>
  );
}

// ─── Conversation History Drawer ──────────────────────────────

function ConversationDrawer({ conversations, activeId, onSelect, onNew, isOpen, onClose }: {
  conversations: Array<{ conversationId: string; title: string | null; mode: string; nodeId: string; createdAt: Date | null; status: string }>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed left-0 top-0 bottom-0 w-72 bg-background border-r border-border shadow-xl z-50 flex flex-col animate-in slide-in-from-left duration-200">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-sm">Conversations</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-3">
          <Button onClick={() => { onNew(); onClose(); }} variant="outline" size="sm" className="w-full gap-1.5 text-xs">
            <MessageSquare className="h-3.5 w-3.5" />
            New Conversation
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-3 pb-3 space-y-1">
            {conversations.map(conv => (
              <button
                key={conv.conversationId}
                onClick={() => { onSelect(conv.conversationId); onClose(); }}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors",
                  conv.conversationId === activeId
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <p className="truncate font-medium text-xs">{conv.title ?? "Untitled"}</p>
                {conv.createdAt && (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {new Date(conv.createdAt).toLocaleDateString()}
                  </p>
                )}
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground/50 text-center py-8">
                No conversations yet
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}

// ─── Main Bondi Page ──────────────────────────────────────────

export default function Bondi() {
  const { user, isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [selectedNodeId] = useState("gemini-flash");
  const [currentMode] = useState<"REFLECT" | "COMPUTE" | "DRAFT" | "VERIFY" | "EXECUTE" | "ROBOT">("REFLECT");
  const [pendingIntents, setPendingIntents] = useState<ProposedIntent[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Queries
  const nodesQuery = trpc.nodes.active.useQuery(undefined, { enabled: isAuthenticated });
  const conversationsQuery = trpc.bondi.listConversations.useQuery(undefined, { enabled: isAuthenticated });

  // Chat mutation
  const chatMutation = trpc.bondi.chat.useMutation({
    onSuccess: (data) => {
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.message,
        timestamp: Date.now(),
        metadata: {
          nodeUsed: data.nodeUsed,
          mode: data.mode,
          intentsProposed: data.intents.length,
          tokensUsed: data.tokensUsed,
        },
      };
      setMessages(prev => [...prev, assistantMsg]);
      setActiveConversationId(data.conversationId);

      if (data.intents.length > 0) {
        setPendingIntents(prev => [...prev, ...data.intents]);
      }

      conversationsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Something went wrong: ${error.message}`);
      setMessages(prev => prev.slice(0, -1));
    },
  });

  // Feedback mutation
  const feedbackMutation = trpc.learning.feedback.useMutation();

  // Load conversation when selected
  const activeConvQuery = trpc.bondi.getConversation.useQuery(
    { conversationId: activeConversationId! },
    { enabled: !!activeConversationId },
  );

  useEffect(() => {
    if (activeConvQuery.data) {
      const convMessages = (activeConvQuery.data.messages as ChatMessage[]) ?? [];
      setMessages(convMessages.filter(m => m.role === "user" || m.role === "assistant"));
    }
  }, [activeConvQuery.data]);

  // Auto-scroll
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement;
    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      });
    }
  }, [messages, chatMutation.isPending]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    chatMutation.mutate({
      message: trimmed,
      conversationId: activeConversationId ?? undefined,
      nodeId: selectedNodeId,
      mode: currentMode,
    });

    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setPendingIntents([]);
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setPendingIntents([]);
  };

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const greeting = getGreeting();

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <p className="text-muted-foreground text-sm">Sign in to talk to Bondi</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-3.5rem)]">
      {/* Conversation drawer */}
      <ConversationDrawer
        conversations={(conversationsQuery.data ?? []).map(c => ({
          conversationId: c.conversationId,
          title: c.title,
          mode: c.mode,
          nodeId: c.nodeId,
          createdAt: c.createdAt,
          status: c.status,
        }))}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Subtle top bar with history toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted/50"
        >
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">History</span>
        </button>
        {activeConversationId && (
          <button
            onClick={handleNewConversation}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted/50"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            New
          </button>
        )}
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-hidden">
        {messages.length === 0 ? (
          /* ─── Empty state: warm greeting ─── */
          <div className="flex h-full flex-col items-center justify-center gap-8 p-6">
            <div className="flex flex-col items-center gap-4 text-center max-w-md">
              {/* Avatar */}
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10 flex items-center justify-center shadow-sm">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>

              {/* Greeting */}
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  {greeting}, {firstName}
                </h2>
                <p className="text-muted-foreground text-sm mt-1.5 leading-relaxed">
                  I'm Bondi, your personal assistant. Tell me what you need
                  and I'll take care of it — with your approval every step of the way.
                </p>
              </div>
            </div>

            {/* Capability suggestions */}
            <div className="grid grid-cols-2 gap-3 max-w-sm w-full">
              {[
                { icon: Mail, label: "Send an email", prompt: "Help me send an email" },
                { icon: Search, label: "Research something", prompt: "Search the web for" },
                { icon: FileText, label: "Draft a document", prompt: "Help me draft a" },
                { icon: MessageSquare, label: "Just chat", prompt: "What can you help me with?" },
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(item.prompt);
                    textareaRef.current?.focus();
                  }}
                  className="flex items-center gap-3 p-3.5 rounded-xl border border-border/60 bg-card hover:bg-muted/50 hover:border-border transition-all text-left group shadow-sm"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{item.label}</span>
                </button>
              ))}
            </div>

            {/* Trust signal */}
            <p className="text-[11px] text-muted-foreground/50 flex items-center gap-1.5">
              <Shield className="h-3 w-3" />
              Every action is governed and recorded
            </p>
          </div>
        ) : (
          /* ─── Chat messages ─── */
          <ScrollArea className="h-full">
            <div className="flex flex-col space-y-4 p-4 max-w-2xl mx-auto">
              {messages.map((msg, idx) => (
                <div key={idx}>
                  <div className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}>
                    {msg.role === "assistant" && (
                      <div className="h-8 w-8 shrink-0 mt-1 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted/60 text-foreground rounded-bl-md"
                    )}>
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none text-foreground">
                          <Streamdown>{msg.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="h-8 w-8 shrink-0 mt-1 rounded-full bg-secondary flex items-center justify-center">
                        <User className="h-4 w-4 text-secondary-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Timestamp for assistant messages */}
                  {msg.role === "assistant" && (
                    <div className="ml-11 mt-1 flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground/50">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {/* Pending intent cards inline */}
              {pendingIntents.map((intent, idx) => (
                <IntentCard key={intent.intentId ?? idx} intent={intent} />
              ))}

              {/* Loading indicator */}
              {chatMutation.isPending && (
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 shrink-0 mt-1 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="rounded-2xl rounded-bl-md bg-muted/60 px-4 py-3 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border/40 bg-background p-4">
        <div className="max-w-2xl mx-auto flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Bondi anything..."
            className="flex-1 max-h-32 resize-none min-h-10 rounded-xl bg-muted/30 border-border/60 focus:border-primary/40 text-sm"
            rows={1}
          />
          <Button
            onClick={handleSend}
            size="icon"
            disabled={!input.trim() || chatMutation.isPending}
            className="shrink-0 h-10 w-10 rounded-xl"
          >
            {chatMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
