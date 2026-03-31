/**
 * ONE App Layout — Authenticated dashboard shell for RIO
 *
 * Uses the sidebar pattern from DashboardLayout but customized for the
 * ONE App product experience: RIO branding, five main screens,
 * tagline, and user profile.
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Inbox,
  History,
  ScrollText,
  Link2,
  Settings,
  LogOut,
  PanelLeft,
  Shield,
  ExternalLink,
  LayoutDashboard,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { trpc } from "@/lib/trpc";
import { KillSwitch } from "@/components/KillSwitch";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/one/dashboard", description: "Proxy overview" },
  { icon: Inbox, label: "Approvals", path: "/one/approvals", description: "Pending intents" },
  { icon: History, label: "History", path: "/one/history", description: "Receipts & ledger" },
  { icon: ScrollText, label: "Policies", path: "/one/policies", description: "Governance rules" },
  { icon: Link2, label: "Connections", path: "/one/connections", description: "Connected apps" },
  { icon: Settings, label: "Settings", path: "/one/settings", description: "Account & keys" },
];

const SIDEBAR_WIDTH_KEY = "one-app-sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function OneAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{
          background: "linear-gradient(180deg, #0a0e1a 0%, #111827 100%)",
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/rio-rings-clean_ac8891e1.png"
            alt="RIO"
            className="w-20 h-20"
          />
          <div className="flex flex-col items-center gap-3">
            <h1
              className="text-3xl font-black tracking-[0.15em]"
              style={{ color: "#b8963e" }}
            >
              RIO
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Sign in to access the ONE App — your governed execution dashboard.
            </p>
            <p
              className="text-xs tracking-widest uppercase"
              style={{ color: "#60a5fa" }}
            >
              See what RIO makes possible for you
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full font-semibold"
            style={{ backgroundColor: "#b8963e", color: "#0a0e1a" }}
          >
            Sign In
          </Button>
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to demo site
          </Link>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <OneAppContent setSidebarWidth={setSidebarWidth}>
        {children}
      </OneAppContent>
    </SidebarProvider>
  );
}

type ContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function OneAppContent({ children, setSidebarWidth }: ContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Fetch pending approval count from live gateway (with fallback to ledger)
  const { data: gwIntents } = trpc.rio.gatewayIntents.useQuery(
    { status: "pending_authorization", limit: 50 },
    { refetchInterval: 10000, refetchOnWindowFocus: true }
  );
  const { data: ledgerData } = trpc.rio.ledgerChain.useQuery(
    { limit: 200 },
    { refetchInterval: 30000, refetchOnWindowFocus: true, enabled: !(gwIntents as any)?.intents }
  );
  // Gateway intents take priority; fall back to ledger pending count
  const gwPending = (gwIntents as any)?.intents?.length ?? 0;
  const ledgerPending = ((ledgerData as any)?.entries ?? []).filter(
    (e: any) => e.decision === "pending" || e.decision === "pending_approval"
  ).length;
  const pendingCount = gwPending > 0 ? gwPending : ledgerPending;

  const activeMenuItem = menuItems.find((item) => location.startsWith(item.path));

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft =
        sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <Shield className="h-5 w-5 shrink-0" style={{ color: "#b8963e" }} />
                  <span
                    className="font-black tracking-[0.1em] truncate text-sm"
                    style={{ color: "#b8963e" }}
                  >
                    RIO
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    ONE App
                  </span>
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map((item) => {
                const isActive = location.startsWith(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-10 transition-all font-normal"
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span className="flex items-center gap-2">
                        {item.label}
                        {item.label === "Approvals" && pendingCount > 0 && (
                          <Badge
                            className="h-5 min-w-5 px-1.5 text-[10px] font-bold rounded-full"
                            style={{
                              backgroundColor: "#b8963e",
                              color: "#0a0e1a",
                            }}
                          >
                            {pendingCount}
                          </Badge>
                        )}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            {/* Tagline and demo link */}
            {!isCollapsed && (
              <div className="mt-auto px-4 py-4 border-t border-border/30">
                <p
                  className="text-[10px] tracking-widest uppercase mb-3 leading-relaxed"
                  style={{ color: "#6b7280" }}
                >
                  See what RIO makes possible for you
                </p>
                <Link
                  href="/"
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  View demo site
                </Link>
              </div>
            )}
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback
                      className="text-xs font-medium"
                      style={{ backgroundColor: "#b8963e20", color: "#b8963e" }}
                    >
                      {user?.name?.charAt(0).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "User"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || ""}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setLocation("/one/settings")}
                  className="cursor-pointer"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" style={{ color: "#b8963e" }} />
                <span className="tracking-tight text-foreground text-sm font-medium">
                  {activeMenuItem?.label ?? "RIO"}
                </span>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
        <KillSwitch />
      </SidebarInset>
    </>
  );
}
