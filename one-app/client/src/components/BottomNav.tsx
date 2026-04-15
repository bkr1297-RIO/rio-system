/**
 * BottomNav — Persistent bottom navigation bar for authenticated screens.
 * Shows: New Action | Approvals | Receipts | Ledger | Status | Logout
 */
import { useLocation } from "wouter";
import { useGatewayAuth } from "@/hooks/useGatewayAuth";
import {
  PlusCircle,
  Shield,
  FileCheck,
  BookOpen,
  Activity,
  LogOut,
  Send,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Send", icon: Send, path: "/send" },
  { label: "New", icon: PlusCircle, path: "/intent/new" },
  { label: "Approvals", icon: Shield, path: "/approvals" },
  { label: "Receipts", icon: FileCheck, path: "/receipts" },
  { label: "Ledger", icon: BookOpen, path: "/ledger" },
  { label: "Status", icon: Activity, path: "/status" },
];

export default function BottomNav() {
  const [location, navigate] = useLocation();
  const { logout } = useGatewayAuth();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-card/95 backdrop-blur-sm">
      <div className="max-w-2xl mx-auto flex items-center justify-around py-1.5 px-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-0 ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              <span className="text-[9px] font-medium truncate">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => {
            logout();
            navigate("/");
          }}
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-muted-foreground hover:text-red-400 transition-colors min-w-0"
        >
          <LogOut className="h-4 w-4" />
          <span className="text-[9px] font-medium">Logout</span>
        </button>
      </div>
    </nav>
  );
}
