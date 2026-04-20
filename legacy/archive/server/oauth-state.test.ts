import { describe, it, expect } from "vitest";

/**
 * Tests for OAuth state parsing logic.
 * The client encodes state as base64(JSON({ redirectUri, returnPath })).
 * The server must:
 *   1. Parse JSON state to extract redirectUri and returnPath
 *   2. Use redirectUri for token exchange (SDK decodeState)
 *   3. Redirect to origin + returnPath after callback
 */

// Replicate the parseState function from server/_core/oauth.ts
function parseState(state: string): { redirectUri: string; returnPath: string } {
  try {
    const decoded = atob(state);
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") {
      return {
        redirectUri: parsed.redirectUri,
        returnPath:
          typeof parsed.returnPath === "string" ? parsed.returnPath : "/",
      };
    }
  } catch {
    // Not JSON
  }

  try {
    return { redirectUri: atob(state), returnPath: "/" };
  } catch {
    return { redirectUri: "", returnPath: "/" };
  }
}

// Replicate the SDK decodeState function from server/_core/sdk.ts
function sdkDecodeState(state: string): string {
  try {
    const decoded = atob(state);
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") {
      return parsed.redirectUri;
    }
    return decoded;
  } catch {
    try {
      return atob(state);
    } catch {
      return state;
    }
  }
}

describe("OAuth State Parsing", () => {
  describe("parseState (callback redirect)", () => {
    it("parses JSON state with redirectUri and returnPath", () => {
      const payload = JSON.stringify({
        redirectUri: "https://riodemo-ux2sxdqo.manus.space/api/oauth/callback",
        returnPath: "/app",
      });
      const state = btoa(payload);

      const result = parseState(state);
      expect(result.redirectUri).toBe(
        "https://riodemo-ux2sxdqo.manus.space/api/oauth/callback"
      );
      expect(result.returnPath).toBe("/app");
    });

    it("defaults returnPath to / when not provided", () => {
      const payload = JSON.stringify({
        redirectUri: "https://example.com/api/oauth/callback",
      });
      const state = btoa(payload);

      const result = parseState(state);
      expect(result.redirectUri).toBe(
        "https://example.com/api/oauth/callback"
      );
      expect(result.returnPath).toBe("/");
    });

    it("handles legacy plain base64 redirect URI", () => {
      const redirectUri = "https://example.com/api/oauth/callback";
      const state = btoa(redirectUri);

      const result = parseState(state);
      expect(result.redirectUri).toBe(redirectUri);
      expect(result.returnPath).toBe("/");
    });

    it("returns empty redirectUri for invalid state", () => {
      const result = parseState("!!!invalid!!!");
      expect(result.redirectUri).toBe("");
      expect(result.returnPath).toBe("/");
    });
  });

  describe("sdkDecodeState (token exchange)", () => {
    it("extracts redirectUri from JSON state for token exchange", () => {
      const payload = JSON.stringify({
        redirectUri: "https://riodemo-ux2sxdqo.manus.space/api/oauth/callback",
        returnPath: "/app",
      });
      const state = btoa(payload);

      const result = sdkDecodeState(state);
      expect(result).toBe(
        "https://riodemo-ux2sxdqo.manus.space/api/oauth/callback"
      );
    });

    it("handles legacy plain base64 state", () => {
      const redirectUri = "https://example.com/api/oauth/callback";
      const state = btoa(redirectUri);

      const result = sdkDecodeState(state);
      expect(result).toBe(redirectUri);
    });

    it("returns raw state for completely invalid input", () => {
      const result = sdkDecodeState("!!!invalid!!!");
      expect(result).toBe("!!!invalid!!!");
    });
  });

  describe("Origin extraction for redirect", () => {
    it("extracts correct origin from redirectUri for full redirect URL", () => {
      const payload = JSON.stringify({
        redirectUri: "https://riodemo-ux2sxdqo.manus.space/api/oauth/callback",
        returnPath: "/app",
      });
      const state = btoa(payload);

      const { redirectUri, returnPath } = parseState(state);
      const safePath = returnPath.startsWith("/") ? returnPath : "/";

      let redirectTarget = safePath;
      try {
        if (redirectUri) {
          const origin = new URL(redirectUri).origin;
          if (origin && origin !== "null") {
            redirectTarget = `${origin}${safePath}`;
          }
        }
      } catch {
        // fallback
      }

      expect(redirectTarget).toBe(
        "https://riodemo-ux2sxdqo.manus.space/app"
      );
    });

    it("falls back to relative path when redirectUri is empty", () => {
      const result = parseState("!!!invalid!!!");
      const safePath = result.returnPath.startsWith("/")
        ? result.returnPath
        : "/";

      let redirectTarget = safePath;
      try {
        if (result.redirectUri) {
          const origin = new URL(result.redirectUri).origin;
          if (origin && origin !== "null") {
            redirectTarget = `${origin}${safePath}`;
          }
        }
      } catch {
        // fallback
      }

      expect(redirectTarget).toBe("/");
    });
  });
});
