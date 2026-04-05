import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Plug, MessageSquare, Mail, Calendar, FileText,
  Github, Hash, Database, Webhook, Cloud,
  CheckCircle2, Clock, ChevronRight
} from "lucide-react";

/* ─── Service definitions ─────────────────────────────────── */

type ServiceStatus = "connected" | "coming_soon" | "disconnected";

interface ServiceDef {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  status: ServiceStatus;
  category: string;
}

const SERVICES: ServiceDef[] = [
  // Connected
  {
    id: "twilio",
    name: "Twilio",
    description: "Send SMS and text messages",
    icon: MessageSquare,
    color: "text-violet-400 bg-violet-500/10",
    status: "connected",
    category: "Communication",
  },
  {
    id: "email",
    name: "Email",
    description: "Send and draft emails",
    icon: Mail,
    color: "text-blue-400 bg-blue-500/10",
    status: "connected",
    category: "Communication",
  },
  // Coming soon
  {
    id: "google",
    name: "Google",
    description: "Gmail, Drive, Calendar",
    icon: Cloud,
    color: "text-red-400 bg-red-500/10",
    status: "coming_soon",
    category: "Productivity",
  },
  {
    id: "microsoft",
    name: "Microsoft",
    description: "Outlook, OneDrive, Teams",
    icon: Cloud,
    color: "text-blue-400 bg-blue-500/10",
    status: "coming_soon",
    category: "Productivity",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Messaging and channels",
    icon: Hash,
    color: "text-purple-400 bg-purple-500/10",
    status: "coming_soon",
    category: "Communication",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Repositories, issues, PRs",
    icon: Github,
    color: "text-slate-300 bg-slate-500/10",
    status: "coming_soon",
    category: "Development",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Notes, databases, wikis",
    icon: FileText,
    color: "text-slate-300 bg-slate-500/10",
    status: "coming_soon",
    category: "Productivity",
  },
  {
    id: "database",
    name: "Database",
    description: "SQL, Postgres, MySQL",
    icon: Database,
    color: "text-emerald-400 bg-emerald-500/10",
    status: "coming_soon",
    category: "Development",
  },
  {
    id: "calendar",
    name: "Calendar",
    description: "Scheduling and events",
    icon: Calendar,
    color: "text-amber-400 bg-amber-500/10",
    status: "coming_soon",
    category: "Productivity",
  },
  {
    id: "webhook",
    name: "API / Webhook",
    description: "Custom integrations",
    icon: Webhook,
    color: "text-orange-400 bg-orange-500/10",
    status: "coming_soon",
    category: "Development",
  },
];

/* ─── Status badge ────────────────────────────────────────── */

function StatusBadge({ status }: { status: ServiceStatus }) {
  if (status === "connected") {
    return (
      <Badge variant="outline" className="text-[10px] font-semibold text-emerald-400 border-emerald-500/20 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Connected
      </Badge>
    );
  }
  if (status === "coming_soon") {
    return (
      <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground border-border/40 gap-1">
        <Clock className="h-3 w-3" />
        Coming Soon
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] font-semibold text-amber-400 border-amber-500/20">
      Disconnected
    </Badge>
  );
}

/* ─── Service Card ────────────────────────────────────────── */

function ServiceCard({ service }: { service: ServiceDef }) {
  const Icon = service.icon;
  const isActive = service.status === "connected";

  return (
    <div className={cn(
      "flex items-center gap-4 p-4 rounded-xl border transition-all",
      isActive
        ? "bg-card border-border/60 hover:border-primary/30"
        : "bg-card/50 border-border/20 opacity-60"
    )}>
      <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center shrink-0", service.color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold", !isActive && "text-muted-foreground")}>{service.name}</p>
        <p className="text-xs text-muted-foreground truncate">{service.description}</p>
      </div>
      <StatusBadge status={service.status} />
      {isActive && (
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      )}
    </div>
  );
}

/* ─── Main Connections Page ────────────────────────────────── */

export default function Connections() {
  const connected = SERVICES.filter(s => s.status === "connected");
  const comingSoon = SERVICES.filter(s => s.status === "coming_soon");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Plug className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Connections</h1>
          <p className="text-sm text-muted-foreground">Connect your digital world to ONE</p>
        </div>
      </div>

      {/* Connected services */}
      {connected.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {connected.length} Active Connection{connected.length !== 1 ? "s" : ""}
          </p>
          <div className="space-y-2">
            {connected.map(s => <ServiceCard key={s.id} service={s} />)}
          </div>
        </div>
      )}

      {/* Coming soon */}
      {comingSoon.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Available Soon</p>
          <div className="space-y-2">
            {comingSoon.map(s => <ServiceCard key={s.id} service={s} />)}
          </div>
        </div>
      )}

      {/* Bottom note */}
      <div className="rounded-xl border border-border/20 bg-secondary/30 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          ONE becomes the place where you connect your digital world.
          Every connection is governed — every action requires your approval.
        </p>
      </div>
    </div>
  );
}
