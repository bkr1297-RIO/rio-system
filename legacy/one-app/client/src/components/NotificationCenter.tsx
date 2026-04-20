import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  Bell, Check, CheckCheck, Shield, Zap, AlertTriangle,
  ScrollText, X, Loader2,
} from "lucide-react";

const TYPE_CONFIG: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}> = {
  APPROVAL_NEEDED: { icon: Shield, color: "text-amber-400", bg: "bg-amber-500/10" },
  EXECUTION_COMPLETE: { icon: Zap, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  EXECUTION_FAILED: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  POLICY_UPDATE: { icon: ScrollText, color: "text-blue-400", bg: "bg-blue-500/10" },
  KILL_SWITCH: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  SYSTEM: { icon: Bell, color: "text-primary", bg: "bg-primary/10" },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? TYPE_CONFIG.SYSTEM;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationCenter() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 15000, // poll every 15s
  });

  const { data: notifications, isLoading } = trpc.notifications.list.useQuery(
    { limit: 30 },
    { enabled: isAuthenticated && open }
  );

  const utils = trpc.useUtils();

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!isAuthenticated) return null;

  const count = typeof unreadCount === 'number' ? unreadCount : 0;

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        className="relative p-2 rounded-lg hover:bg-accent transition-colors"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4.5 min-w-4.5 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-h-[70vh] rounded-xl border border-border/40 bg-card shadow-xl overflow-hidden z-[100]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <p className="text-sm font-semibold">Notifications</p>
            <div className="flex items-center gap-1">
              {count > 0 && (
                <button
                  className="text-[11px] text-primary hover:underline px-2 py-1 flex items-center gap-1"
                  onClick={() => markAllReadMutation.mutate()}
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark all read
                </button>
              )}
              <button
                className="p-1 rounded hover:bg-accent"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[60vh]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !notifications || notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => {
                const config = getTypeConfig(n.type);
                const Icon = config.icon;
                const intentId = n.intentId ?? undefined;
                const executionId = n.executionId ?? undefined;

                // Determine link target
                let href: string | null = null;
                if (n.type === "APPROVAL_NEEDED" && intentId) href = `/intent/${intentId}`;
                else if ((n.type === "EXECUTION_COMPLETE" || n.type === "EXECUTION_FAILED") && executionId) href = `/receipt/${executionId}`;
                else if (n.type === "POLICY_UPDATE") href = "/policies";

                const content = (
                  <div
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b border-border/20 transition-colors",
                      !n.read ? "bg-primary/[0.03]" : "",
                      href ? "hover:bg-accent/50 cursor-pointer" : ""
                    )}
                    onClick={() => {
                      if (!n.read) markReadMutation.mutate({ notificationId: n.notificationId });
                    }}
                  >
                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", config.bg)}>
                      <Icon className={cn("h-4 w-4", config.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn("text-xs font-semibold", !n.read ? "text-foreground" : "text-muted-foreground")}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(new Date(n.createdAt).getTime())}</p>
                    </div>
                    {!n.read && (
                      <button
                        className="p-1 rounded hover:bg-accent shrink-0 mt-0.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          markReadMutation.mutate({ notificationId: n.notificationId });
                        }}
                      >
                        <Check className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                );

                if (href) {
                  return (
                    <Link key={n.notificationId} href={href} onClick={() => setOpen(false)}>
                      {content}
                    </Link>
                  );
                }
                return <div key={n.notificationId}>{content}</div>;
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
