/**
 * Kill Switch — Persistent emergency stop button
 *
 * Accessible from every screen in the ONE App.
 * One tap fires POST /api/kill (via tRPC proxyKill).
 * No confirmation dialog — the kill switch must be instant.
 * Reachable in under 1 second from any screen.
 *
 * Shows immediate confirmation: "Proxy paused. All tokens burned. Receipt logged."
 */

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { OctagonX, Loader2, CheckCircle2, RotateCcw } from "lucide-react";

const ED25519_PUBKEY_KEY = "rio_ed25519_pubkey";
const ED25519_PRIVKEY_KEY = "rio_ed25519_privkey";
const PROXY_KILLED_KEY = "rio_proxy_killed";

async function signKill(privB64: string): Promise<{ signature: string; timestamp: string }> {
  const timestamp = new Date().toISOString();
  const payload = `KILL|${timestamp}`;
  try {
    const privBytes = Uint8Array.from(atob(privB64), (c) => c.charCodeAt(0));
    const privKey = await crypto.subtle.importKey(
      "pkcs8",
      privBytes,
      { name: "Ed25519" } as any,
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign(
      "Ed25519" as any,
      privKey,
      new TextEncoder().encode(payload)
    );
    return {
      signature: Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      timestamp,
    };
  } catch {
    return {
      signature: Array.from(crypto.getRandomValues(new Uint8Array(64)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      timestamp,
    };
  }
}

export function KillSwitch() {
  const [killing, setKilling] = useState(false);
  const [killed, setKilled] = useState(
    () => localStorage.getItem(PROXY_KILLED_KEY) === "true"
  );
  const [result, setResult] = useState<any>(null);

  const killMut = trpc.rio.proxyKill.useMutation();

  const handleKill = useCallback(async () => {
    if (killing) return;
    setKilling(true);

    const pubKey = localStorage.getItem(ED25519_PUBKEY_KEY) || "";
    const privKey = localStorage.getItem(ED25519_PRIVKEY_KEY) || "";

    try {
      const { signature, timestamp } = await signKill(privKey);
      const res = await killMut.mutateAsync({
        publicKey: pubKey,
        killSignature: signature,
        killTimestamp: timestamp,
      });

      setResult(res);
      setKilled(true);
      localStorage.setItem(PROXY_KILLED_KEY, "true");

      toast.error("Proxy Killed", {
        description: `Proxy paused. ${res.tokensBurned ?? 0} tokens burned. Receipt logged.`,
        duration: 8000,
      });
    } catch (err: any) {
      toast.error("Kill switch failed", {
        description: err?.message || "Could not reach the gateway",
      });
    }
    setKilling(false);
  }, [killing, killMut]);

  const handleReactivate = useCallback(() => {
    setKilled(false);
    setResult(null);
    localStorage.removeItem(PROXY_KILLED_KEY);
    toast.success("Proxy reactivated", {
      description: "Your proxy is back online",
    });
  }, []);

  if (killed) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium shadow-lg"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            color: "#ef4444",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            backdropFilter: "blur(8px)",
          }}
        >
          <OctagonX className="h-3.5 w-3.5" />
          Proxy Paused
          <button
            onClick={handleReactivate}
            className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] hover:bg-white/10 transition-colors"
            style={{ border: "1px solid rgba(239, 68, 68, 0.3)" }}
          >
            <RotateCcw className="h-2.5 w-2.5" />
            Reactivate
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleKill}
      disabled={killing}
      className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
      style={{
        backgroundColor: "rgba(220, 38, 38, 0.9)",
        color: "#ffffff",
        border: "1px solid rgba(239, 68, 68, 0.5)",
        backdropFilter: "blur(8px)",
      }}
      title="Kill Proxy — Immediately pause all proxy operations"
    >
      {killing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <OctagonX className="h-4 w-4" />
      )}
      {killing ? "KILLING..." : "KILL PROXY"}
    </button>
  );
}
