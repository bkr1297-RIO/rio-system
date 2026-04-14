/**
 * Tests that Login page has COS-adopted UI elements:
 * - Principal selector cards (I-1 / I-2 clickable buttons with role labels)
 * - Gateway Connected badge (green dot from /health check)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const loginContent = readFileSync(
  resolve(__dirname, "../client/src/pages/Login.tsx"),
  "utf-8"
);

describe("Login page principal selector cards", () => {
  it("should define PRINCIPALS array with I-1 and I-2", () => {
    expect(loginContent).toContain('id: "I-1"');
    expect(loginContent).toContain('id: "I-2"');
  });

  it("should show role labels for each principal", () => {
    expect(loginContent).toContain("Proposer + Root");
    expect(loginContent).toContain("Approver");
  });

  it("should use selectedPrincipal state instead of text input for userId", () => {
    expect(loginContent).toContain("selectedPrincipal");
    // Should NOT have a text input for Principal ID anymore
    expect(loginContent).not.toContain('placeholder="Principal ID');
  });

  it("should render clickable cards with selection state", () => {
    expect(loginContent).toContain("setSelectedPrincipal");
    expect(loginContent).toContain("isSelected");
  });

  it("should show dynamic button text based on selected principal", () => {
    expect(loginContent).toContain("Authenticate as ${selectedPrincipal}");
  });

  it("should use icons for each principal card", () => {
    expect(loginContent).toContain("User");
    expect(loginContent).toContain("ShieldCheck");
  });
});

describe("Login page Gateway Connected badge", () => {
  it("should display 'Gateway Connected' text when reachable", () => {
    expect(loginContent).toContain("Gateway Connected");
  });

  it("should show animated ping dot for connected state", () => {
    expect(loginContent).toContain("animate-ping");
    expect(loginContent).toContain("bg-emerald-500");
  });

  it("should show connecting state when not yet reachable", () => {
    expect(loginContent).toContain("Connecting to Gateway");
    expect(loginContent).toContain("bg-amber-500");
  });

  it("should display version badge when available", () => {
    expect(loginContent).toContain("gatewayStatus.version");
  });
});

describe("Login page preserves governance principles", () => {
  it("should still use useGatewayAuth hook", () => {
    expect(loginContent).toContain("useGatewayAuth");
  });

  it("should still call gatewayAuthStatus on mount", () => {
    expect(loginContent).toContain("gatewayAuthStatus");
  });

  it("should preserve Decision 2 footer", () => {
    expect(loginContent).toContain("Interface Is Not Authority");
  });

  it("should route approvers to /approvals and proposers to /intent/new", () => {
    expect(loginContent).toContain('navigate("/approvals")');
    expect(loginContent).toContain('navigate("/intent/new")');
  });
});
