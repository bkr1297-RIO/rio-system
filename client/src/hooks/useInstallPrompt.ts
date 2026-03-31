/**
 * useInstallPrompt — PWA Install Prompt Hook
 *
 * Captures the `beforeinstallprompt` event on Android/Chrome and provides
 * iOS detection for manual "Add to Home Screen" instructions.
 *
 * Returns:
 *   - canInstall: true if the browser supports install prompt
 *   - isIOS: true if running on iOS (needs manual instructions)
 *   - isStandalone: true if already running as installed PWA
 *   - promptInstall: function to trigger the native install dialog
 *   - dismissed: true if user dismissed the prompt this session
 */
import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;

  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "dismissed") {
      setDismissed(true);
    }
    return outcome === "accepted";
  }, [deferredPrompt]);

  const canInstall = !!deferredPrompt;

  return { canInstall, isIOS, isStandalone, promptInstall, dismissed };
}
