/**
 * usePushNotifications — Push Notification Registration Hook
 *
 * Handles:
 *   - Checking if push notifications are supported
 *   - Requesting notification permission
 *   - Subscribing to push notifications via the service worker
 *   - Providing the PushSubscription object to send to the backend
 *
 * The backend endpoint to store subscriptions is scaffolded but not yet wired.
 * When Romney's gateway is live, we'll POST the subscription there.
 */
import { useState, useCallback } from "react";

// VAPID public key placeholder — will be set via env var when push backend is ready
const VAPID_PUBLIC_KEY = "";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

export type PushState = "unsupported" | "default" | "granted" | "denied";

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushState>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    return Notification.permission as PushState;
  });
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [loading, setLoading] = useState(false);

  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const requestPermission = useCallback(async () => {
    if (!isSupported) return "unsupported" as PushState;
    setLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushState);
      return result as PushState;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !VAPID_PUBLIC_KEY) return null;
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      setSubscription(sub);
      // TODO: POST subscription to backend when push endpoint is ready
      // await fetch("/api/push/subscribe", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(sub.toJSON()),
      // });
      return sub;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (subscription) {
      await subscription.unsubscribe();
      setSubscription(null);
      // TODO: DELETE subscription from backend
    }
  }, [subscription]);

  return {
    isSupported,
    permission,
    subscription,
    loading,
    requestPermission,
    subscribe,
    unsubscribe,
  };
}
