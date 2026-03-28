/**
 * Bondi — Your AI Chief of Staff
 *
 * This is the real app. A unified workspace where you can:
 *   - See your inbox, calendar, and files
 *   - Talk to AI (Ask mode — no approval needed)
 *   - Request actions (Do mode — RIO governs)
 *   - Approve actions and see receipts
 *
 * Layout: Left sidebar (nav) | Main window (content) | Right panel (AI assistant)
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Mail,
  Calendar,
  FolderOpen,
  Github,
  MessageSquare,
  Zap,
  Shield,
  BookOpen,
  ChevronLeft,
  Send,
  Sparkles,
  Loader2,
  RefreshCw,
  ArrowLeft,
  Reply,
  ExternalLink,
  Clock,
  FileText,
  User,
  Menu,
  X,
  Link2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { Streamdown } from "streamdown";

// ── Types ────────────────────────────────────────────────────────────────

type Tab =
  | "inbox"
  | "calendar"
  | "drive"
  | "github"
  | "ask"
  | "chief"
  | "approvals"
  | "ledger";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// ── Constants ────────────────────────────────────────────────────────────

const BONDI_LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/bondi-logo_858ccd3b.png";

const NAV_ITEMS: { id: Tab; label: string; icon: typeof Mail; section?: string }[] = [
  { id: "inbox", label: "Inbox", icon: Mail, section: "Workspace" },
  { id: "calendar", label: "Calendar", icon: Calendar, section: "Workspace" },
  { id: "drive", label: "Drive", icon: FolderOpen, section: "Workspace" },
  { id: "github", label: "GitHub", icon: Github, section: "Workspace" },
  { id: "ask", label: "Chat", icon: MessageSquare, section: "AI" },
  { id: "chief", label: "Chief of Staff", icon: Zap, section: "AI" },
  { id: "approvals", label: "Approvals", icon: Shield, section: "RIO" },
  { id: "ledger", label: "Ledger", icon: BookOpen, section: "RIO" },
];

// ── Login Screen ─────────────────────────────────────────────────────────

function BondiLogin() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <img src={BONDI_LOGO} alt="Bondi" className="w-24 h-24 rounded-2xl mb-8" />
      <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
        Bondi
      </h1>
      <p className="text-muted-foreground text-center max-w-sm mb-8">
        Your AI Chief of Staff — secured by RIO
      </p>
      <Button
        size="lg"
        className="w-full max-w-xs"
        onClick={() => {
          window.location.href = getLoginUrl("/app");
        }}
      >
        Sign in to continue
      </Button>
      <p className="text-xs text-muted-foreground mt-6">
        All actions governed by{" "}
        <a href="/" className="underline hover:text-foreground">
          RIO Protocol
        </a>
      </p>
    </div>
  );
}

// ── Connect Prompt ───────────────────────────────────────────────────────

function ConnectPrompt({ service }: { service: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-6">
      <Link2 className="w-12 h-12 text-muted-foreground/30" />
      <div>
        <h3 className="text-lg font-semibold mb-2">Connect {service}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Connect your {service} account to see your data here.
        </p>
      </div>
      <Button
        variant="outline"
        onClick={() => {
          window.location.href = `/api/oauth/google/start?returnTo=/app`;
        }}
      >
        Connect Google Apps
      </Button>
    </div>
  );
}

// ── Inbox View ───────────────────────────────────────────────────────────

function InboxView({
  onSelectEmail,
  onAskAbout,
  googleConnected,
}: {
  onSelectEmail: (email: any) => void;
  onAskAbout: (context: string) => void;
  googleConnected: boolean;
}) {
  const { data, isLoading, error, refetch } =
    trpc.workspace.gmail.listInbox.useQuery(
      { maxResults: 20 },
      { retry: false, enabled: googleConnected }
    );

  if (!googleConnected) {
    return <ConnectPrompt service="Google" />;
  }

  if (error?.message?.includes("not connected")) {
    return <ConnectPrompt service="Google" />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  const emails = data?.messages ?? [];

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Mail className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Your inbox is empty</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold">Inbox</h2>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {emails.map((email: any) => (
            <button
              key={email.id}
              className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors"
              onClick={() => onSelectEmail(email)}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      {email.from || "Unknown"}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {email.date
                        ? new Date(email.date).toLocaleDateString()
                        : ""}
                    </span>
                  </div>
                  <p className="text-sm truncate">{email.subject || "(no subject)"}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {email.snippet || ""}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Email Detail View ────────────────────────────────────────────────────

function EmailDetailView({
  emailId,
  onBack,
  onAskAbout,
}: {
  emailId: string;
  onBack: () => void;
  onAskAbout: (context: string) => void;
}) {
  const { data: email, isLoading } = trpc.workspace.gmail.readEmail.useQuery(
    { messageId: emailId },
    { retry: false }
  );

  const [showReplyDraft, setShowReplyDraft] = useState(false);
  const [replyInstruction, setReplyInstruction] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const draftReply = trpc.workspace.ai.draftReply.useMutation({
    onSuccess: (data) => {
      setDraftContent(data.draft);
    },
  });

  const sendEmail = trpc.workspace.gmail.sendEmail.useMutation({
    onSuccess: () => {
      setShowReplyDraft(false);
      setDraftContent("");
      setReplyInstruction("");
    },
  });

  if (isLoading || !email) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleDraftReply = () => {
    setShowReplyDraft(true);
    draftReply.mutate({
      originalEmail: {
        from: email.from || "",
        subject: email.subject || "",
        body: email.body || "",
        date: email.date || undefined,
      },
      instruction: replyInstruction || undefined,
    });
  };

  const handleSendReply = () => {
    if (!draftContent.trim()) return;
    sendEmail.mutate({
      to: email.from || "",
      subject: `Re: ${email.subject || ""}`,
      body: draftContent,
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold truncate">{email.subject || "(no subject)"}</h2>
          <p className="text-xs text-muted-foreground">From: {email.from}</p>
        </div>
      </div>

      {/* Email body */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {email.date ? new Date(email.date).toLocaleString() : "Unknown date"}
          </div>
          <div
            className="whitespace-pre-wrap text-sm"
            dangerouslySetInnerHTML={{
              __html: email.body || "<p>No content</p>",
            }}
          />
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="border-t px-4 py-3">
        {!showReplyDraft ? (
          <div className="flex gap-2">
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                placeholder="Reply instruction (optional, e.g. 'Accept the meeting')"
                className="flex-1 text-sm bg-muted rounded-md px-3 py-2 border-0 focus:outline-none focus:ring-1 focus:ring-ring"
                value={replyInstruction}
                onChange={(e) => setReplyInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleDraftReply();
                }}
              />
            </div>
            <Button size="sm" onClick={handleDraftReply} disabled={draftReply.isPending}>
              {draftReply.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Reply className="w-4 h-4 mr-1" />
              )}
              Reply with AI
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onAskAbout(
                  `Email from ${email.from}\nSubject: ${email.subject}\n\n${email.body}`
                )
              }
            >
              <MessageSquare className="w-4 h-4 mr-1" />
              Ask Bondi
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">AI Draft Reply</span>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs">
                  <Shield className="w-3 h-3 mr-1" />
                  RIO approval required to send
                </Badge>
              </div>
            </div>
            {draftReply.isPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Bondi is drafting a reply...
              </div>
            ) : (
              <Textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                rows={6}
                className="text-sm"
              />
            )}
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowReplyDraft(false);
                  setDraftContent("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSendReply}
                disabled={!draftContent.trim() || sendEmail.isPending}
              >
                {sendEmail.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Send className="w-4 h-4 mr-1" />
                )}
                Approve & Send
              </Button>
            </div>
            {sendEmail.isSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-500">
                <CheckCircle2 className="w-4 h-4" />
                Email sent. Receipt generated.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Calendar View ────────────────────────────────────────────────────────

function CalendarView({ googleConnected }: { googleConnected: boolean }) {
  const { data, isLoading, error, refetch } =
    trpc.workspace.calendar.listEvents.useQuery(
      { maxResults: 20 },
      { retry: false, enabled: googleConnected }
    );

  if (!googleConnected) {
    return <ConnectPrompt service="Google" />;
  }

  if (error?.message?.includes("not connected")) {
    return <ConnectPrompt service="Google" />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  const events = data?.events ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold">Calendar</h2>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Calendar className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No upcoming events</p>
          </div>
        ) : (
          <div className="divide-y">
            {events.map((event: any, i: number) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Calendar className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {event.summary || "(no title)"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {event.start?.dateTime
                        ? new Date(event.start.dateTime).toLocaleString()
                        : event.start?.date || "All day"}
                      {event.end?.dateTime &&
                        ` — ${new Date(event.end.dateTime).toLocaleTimeString()}`}
                    </p>
                    {event.location && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        📍 {event.location}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ── Drive View ───────────────────────────────────────────────────────────

function DriveView({ googleConnected }: { googleConnected: boolean }) {
  const { data, isLoading, error, refetch } =
    trpc.workspace.drive.listFiles.useQuery(
      { pageSize: 20 },
      { retry: false, enabled: googleConnected }
    );

  if (!googleConnected) {
    return <ConnectPrompt service="Google" />;
  }

  if (error?.message?.includes("not connected")) {
    return <ConnectPrompt service="Google" />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  const files = data?.files ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold">Drive</h2>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <FolderOpen className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No files found</p>
          </div>
        ) : (
          <div className="divide-y">
            {files.map((file: any, i: number) => (
              <div
                key={i}
                className="px-4 py-3 flex items-center gap-3 hover:bg-accent/50 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-green-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {file.name || "Untitled"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {file.mimeType?.split("/").pop() || "file"}
                    {file.modifiedTime &&
                      ` · ${new Date(file.modifiedTime).toLocaleDateString()}`}
                  </p>
                </div>
                {file.webViewLink && (
                  <a
                    href={file.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ── GitHub View (placeholder) ────────────────────────────────────────────

function GitHubView() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <Github className="w-12 h-12 text-muted-foreground/30" />
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">GitHub</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          GitHub integration is coming soon. You'll be able to view repos, issues,
          and PRs, and take actions governed by RIO.
        </p>
      </div>
    </div>
  );
}

// ── Ask Mode (AI Chat) ──────────────────────────────────────────────────

function AskView({ initialContext }: { initialContext?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = trpc.workspace.ai.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [...prev, data]);
    },
  });

  // If initialContext is provided, auto-send it
  useEffect(() => {
    if (initialContext && messages.length === 0) {
      const userMsg: ChatMessage = {
        role: "user",
        content: `Help me understand this:\n\n${initialContext}`,
      };
      setMessages([userMsg]);
      chatMutation.mutate({
        messages: [userMsg],
        context: initialContext,
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLDivElement;
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
        });
      }
    }
  }, [messages, chatMutation.isPending]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");

    chatMutation.mutate({ messages: newMessages });
    textareaRef.current?.focus();
  };

  const displayMessages = messages.filter((m) => m.role !== "system");

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b">
        <h2 className="font-semibold">Chat with Bondi</h2>
        <p className="text-xs text-muted-foreground">
          Ask mode — think, plan, analyze. No approval needed.
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-hidden">
        {displayMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
            <Sparkles className="w-12 h-12 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground text-center">
              Ask Bondi anything — summarize emails, analyze documents, draft
              content, or just think through a problem together.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                "What does my schedule look like?",
                "Summarize my recent emails",
                "Help me draft a proposal",
              ].map((prompt) => (
                <button
                  key={prompt}
                  className="rounded-lg border px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                  onClick={() => {
                    const userMsg: ChatMessage = { role: "user", content: prompt };
                    setMessages([userMsg]);
                    chatMutation.mutate({ messages: [userMsg] });
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col space-y-4 p-4">
              {displayMessages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user"
                      ? "justify-end items-start"
                      : "justify-start items-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-4 py-2.5",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <Streamdown>{msg.content}</Streamdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 shrink-0 mt-1 rounded-full bg-secondary flex items-center justify-center">
                      <User className="w-4 h-4 text-secondary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div className="rounded-lg bg-muted px-4 py-2.5">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex gap-2 p-4 border-t items-end"
      >
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask Bondi anything..."
          className="flex-1 max-h-32 resize-none min-h-9"
          rows={1}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || chatMutation.isPending}
          className="shrink-0 h-[38px] w-[38px]"
        >
          {chatMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </form>
    </div>
  );
}

// ── Chief of Staff (Do Mode) ─────────────────────────────────────────────

function ChiefView() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
      <Zap className="w-12 h-12 text-primary/30" />
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Chief of Staff</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Tell Bondi what you need done. Actions go through RIO for approval
          before execution.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Try: "Send Sarah the contract" or "Schedule a meeting next week"
        </p>
      </div>
      <Badge variant="outline">
        <Shield className="w-3 h-3 mr-1" />
        Coming in next release
      </Badge>
    </div>
  );
}

// ── Approvals View ───────────────────────────────────────────────────────

function ApprovalsView() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <Shield className="w-12 h-12 text-muted-foreground/30" />
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Approvals</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Pending action approvals will appear here. All actions that modify
          external systems require your approval through RIO.
        </p>
      </div>
    </div>
  );
}

// ── Ledger View ──────────────────────────────────────────────────────────

function LedgerView() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b">
        <h2 className="font-semibold">Ledger</h2>
        <p className="text-xs text-muted-foreground">
          Tamper-evident record of all governed actions
        </p>
      </div>
      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <BookOpen className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          Action receipts and ledger entries will appear here.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => (window.location.href = "/ledger")}
        >
          Open Full Ledger Explorer
        </Button>
      </div>
    </div>
  );
}

// ── Main App Component ───────────────────────────────────────────────────

export default function BondiApp() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("inbox");
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [askContext, setAskContext] = useState<string | undefined>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  // Check Google connection status
  const googleStatus = trpc.connections.googleStatus.useQuery(undefined, {
    enabled: !!user,
    retry: false,
  });

  // Group nav items by section (must be before early returns to respect hooks rules)
  const sections = useMemo(() => {
    const map = new Map<string, typeof NAV_ITEMS>();
    for (const item of NAV_ITEMS) {
      const section = item.section || "Other";
      if (!map.has(section)) map.set(section, []);
      map.get(section)!.push(item);
    }
    return map;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <BondiLogin />;
  }

  const handleSelectEmail = (email: any) => {
    setSelectedEmailId(email.id);
  };

  const handleAskAbout = (context: string) => {
    setAskContext(context);
    setActiveTab("ask");
    setRightPanelOpen(false);
  };

  const renderMainContent = () => {
    if (activeTab === "inbox" && selectedEmailId) {
      return (
        <EmailDetailView
          emailId={selectedEmailId}
          onBack={() => setSelectedEmailId(null)}
          onAskAbout={handleAskAbout}
        />
      );
    }

    switch (activeTab) {
      case "inbox":
        return (
          <InboxView
            onSelectEmail={handleSelectEmail}
            onAskAbout={handleAskAbout}
            googleConnected={!!googleStatus.data?.connected}
          />
        );
      case "calendar":
        return <CalendarView googleConnected={!!googleStatus.data?.connected} />;
      case "drive":
        return <DriveView googleConnected={!!googleStatus.data?.connected} />;
      case "github":
        return <GitHubView />;
      case "ask":
        return <AskView initialContext={askContext} />;
      case "chief":
        return <ChiefView />;
      case "approvals":
        return <ApprovalsView />;
      case "ledger":
        return <LedgerView />;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 border-b flex items-center justify-between px-4 shrink-0 bg-background/95 backdrop-blur z-50">
        <div className="flex items-center gap-3">
          {/* Mobile menu toggle */}
          <button
            className="lg:hidden p-1.5 rounded-lg hover:bg-accent transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <img src={BONDI_LOGO} alt="Bondi" className="w-8 h-8 rounded-lg" />
          <span className="font-semibold tracking-tight">Bondi</span>
          <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">
            Secured by RIO
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {googleStatus.data?.connected && (
            <Badge
              variant="outline"
              className="text-[10px] text-green-500 border-green-500/30"
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Google Connected
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
          >
            <Sparkles className="w-4 h-4" />
          </Button>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-xs font-medium text-primary">
              {user.name?.charAt(0).toUpperCase() || "U"}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside
          className={cn(
            "w-56 border-r bg-card shrink-0 flex flex-col overflow-y-auto transition-transform duration-200",
            "lg:translate-x-0 lg:static",
            sidebarOpen
              ? "translate-x-0 fixed inset-y-14 left-0 z-40"
              : "-translate-x-full fixed lg:translate-x-0"
          )}
        >
          <nav className="flex-1 py-2">
            {Array.from(sections).map(([section, items]) => (
              <div key={section} className="mb-2">
                <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section}
                </p>
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      )}
                      onClick={() => {
                        setActiveTab(item.id);
                        setSelectedEmailId(null);
                        if (item.id !== "ask") setAskContext(undefined);
                        setSidebarOpen(false);
                      }}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Connection status */}
          <div className="border-t p-3">
            {googleStatus.data?.connected ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                <span className="truncate">{googleStatus.data.email}</span>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() =>
                  (window.location.href = `/api/oauth/google/start?returnTo=/app`)
                }
              >
                <Link2 className="w-3 h-3 mr-1" />
                Connect Google
              </Button>
            )}
          </div>
        </aside>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">{renderMainContent()}</main>

        {/* Right Panel — AI Assistant (desktop always visible, mobile toggle) */}
        <aside
          className={cn(
            "w-80 border-l bg-card shrink-0 overflow-hidden transition-transform duration-200",
            "hidden lg:flex lg:flex-col",
            rightPanelOpen &&
              "flex flex-col fixed inset-y-14 right-0 z-40 w-full sm:w-80"
          )}
        >
          <AskView key={askContext || "default"} initialContext={askContext} />
        </aside>

        {/* Mobile right panel overlay */}
        {rightPanelOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setRightPanelOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
