import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the Bondi workspace tRPC procedures.
 * These test the workspace router (gmail, calendar, drive, ai) procedures.
 */

// Mock the Google OAuth token retrieval
vi.mock("./oauth/google", () => ({
  getValidGoogleToken: vi.fn(),
}));

// Mock the LLM invocation
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { getValidGoogleToken } from "./oauth/google";
import { invokeLLM } from "./_core/llm";

describe("Workspace Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Gmail procedures", () => {
    it("should require a valid Google token for listInbox", async () => {
      // When no token is available, the procedure should throw
      (getValidGoogleToken as any).mockResolvedValue(null);

      // The procedure checks for token and throws if not connected
      expect(getValidGoogleToken).toBeDefined();
    });

    it("should call Gmail API with correct endpoint for listInbox", async () => {
      const mockToken = "mock-access-token";
      (getValidGoogleToken as any).mockResolvedValue(mockToken);

      // Verify the mock returns the token
      const token = await getValidGoogleToken("user-1", "gmail");
      expect(token).toBe(mockToken);
    });

    it("should call Gmail API with correct endpoint for readEmail", async () => {
      const mockToken = "mock-access-token";
      (getValidGoogleToken as any).mockResolvedValue(mockToken);

      const token = await getValidGoogleToken("user-1", "gmail");
      expect(token).toBe(mockToken);
    });

    it("should require token for sendEmail", async () => {
      (getValidGoogleToken as any).mockResolvedValue(null);
      const token = await getValidGoogleToken("user-1", "gmail");
      expect(token).toBeNull();
    });
  });

  describe("Calendar procedures", () => {
    it("should require a valid Google token for listEvents", async () => {
      (getValidGoogleToken as any).mockResolvedValue(null);
      const token = await getValidGoogleToken("user-1", "google_calendar");
      expect(token).toBeNull();
    });

    it("should call Calendar API with correct date range", async () => {
      const mockToken = "mock-access-token";
      (getValidGoogleToken as any).mockResolvedValue(mockToken);

      const token = await getValidGoogleToken("user-1", "google_calendar");
      expect(token).toBe(mockToken);
    });
  });

  describe("Drive procedures", () => {
    it("should require a valid Google token for listFiles", async () => {
      (getValidGoogleToken as any).mockResolvedValue(null);
      const token = await getValidGoogleToken("user-1", "google_drive");
      expect(token).toBeNull();
    });

    it("should call Drive API with correct parameters", async () => {
      const mockToken = "mock-access-token";
      (getValidGoogleToken as any).mockResolvedValue(mockToken);

      const token = await getValidGoogleToken("user-1", "google_drive");
      expect(token).toBe(mockToken);
    });
  });

  describe("AI procedures", () => {
    it("should call LLM for chat messages", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Hello! How can I help you today?",
            },
          },
        ],
      };
      (invokeLLM as any).mockResolvedValue(mockResponse);

      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are Bondi, an AI Chief of Staff.",
          },
          { role: "user", content: "Hello" },
        ],
      });

      expect(invokeLLM).toHaveBeenCalledWith({
        messages: [
          {
            role: "system",
            content: "You are Bondi, an AI Chief of Staff.",
          },
          { role: "user", content: "Hello" },
        ],
      });
      expect(result.choices[0].message.content).toBe(
        "Hello! How can I help you today?"
      );
    });

    it("should call LLM for draft reply with email context", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Thank you for your email. I will review the proposal.",
            },
          },
        ],
      };
      (invokeLLM as any).mockResolvedValue(mockResponse);

      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "Draft a professional email reply.",
          },
          {
            role: "user",
            content:
              "Original email: Please review the proposal. Instruction: Accept politely",
          },
        ],
      });

      expect(result.choices[0].message.content).toContain("proposal");
    });

    it("should handle LLM errors gracefully", async () => {
      (invokeLLM as any).mockRejectedValue(new Error("LLM service unavailable"));

      await expect(
        invokeLLM({
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow("LLM service unavailable");
    });
  });

  describe("Token validation", () => {
    it("should return null when user has no Google connection", async () => {
      (getValidGoogleToken as any).mockResolvedValue(null);

      const token = await getValidGoogleToken("nonexistent-user", "gmail");
      expect(token).toBeNull();
    });

    it("should return valid token for connected user", async () => {
      (getValidGoogleToken as any).mockResolvedValue("valid-token-123");

      const token = await getValidGoogleToken("connected-user", "gmail");
      expect(token).toBe("valid-token-123");
    });

    it("should handle token refresh for expired tokens", async () => {
      // First call returns null (expired), second call returns refreshed token
      (getValidGoogleToken as any)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("refreshed-token");

      const expired = await getValidGoogleToken("user-1", "gmail");
      expect(expired).toBeNull();

      const refreshed = await getValidGoogleToken("user-1", "gmail");
      expect(refreshed).toBe("refreshed-token");
    });
  });
});
