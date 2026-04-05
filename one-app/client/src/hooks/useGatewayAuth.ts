/**
 * Gateway authentication hook.
 * Manages Gateway JWT token state and user identity.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  gatewayWhoAmI,
  gatewayLogin,
  getGatewayToken,
  clearGatewayToken,
  type WhoAmI,
} from "@/lib/gateway";

interface GatewayAuthState {
  /** Whether we're still checking auth */
  loading: boolean;
  /** Whether the user has a valid Gateway token */
  isAuthenticated: boolean;
  /** Gateway user info (sub, name, role, principal_id) */
  user: WhoAmI["user"] | null;
  /** Login with user_id + passphrase */
  login: (userId: string, passphrase: string) => Promise<{ success: boolean; error?: string }>;
  /** Logout (clear token) */
  logout: () => void;
  /** Re-check auth status */
  refresh: () => Promise<void>;
}

export function useGatewayAuth(): GatewayAuthState {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<WhoAmI["user"] | null>(null);

  const checkAuth = useCallback(async () => {
    const token = getGatewayToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const whoami = await gatewayWhoAmI();
      if (whoami.authenticated && whoami.user) {
        setUser(whoami.user);
      } else {
        clearGatewayToken();
        setUser(null);
      }
    } catch {
      // Gateway unreachable — keep token but mark as unauthenticated
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (userId: string, passphrase: string) => {
    try {
      const result = await gatewayLogin(userId, passphrase);
      if (result.token) {
        await checkAuth();
        return { success: true };
      }
      return { success: false, error: result.error || "Login failed" };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }, [checkAuth]);

  const logout = useCallback(() => {
    clearGatewayToken();
    setUser(null);
  }, []);

  const isAuthenticated = !!user;

  return useMemo(() => ({
    loading,
    isAuthenticated,
    user,
    login,
    logout,
    refresh: checkAuth,
  }), [loading, isAuthenticated, user, login, logout, checkAuth]);
}
