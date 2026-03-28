import { describe, expect, it } from "vitest";

/**
 * Guided Demo (/demo) — Integration tests
 *
 * The guided demo is a purely client-side page with no backend procedures.
 * These tests verify:
 *   1. The /demo route is registered in the app router
 *   2. The landing page (Home.tsx) contains a link to /demo
 *   3. The GuidedDemo component exports a default function
 *   4. The demo page has all 8 steps defined
 */

describe("Guided Demo — Route and page structure", () => {
  it("App.tsx registers the /demo route", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const appTsx = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/App.tsx"),
      "utf-8"
    );
    expect(appTsx).toContain('"/demo"');
    expect(appTsx).toContain("GuidedDemo");
  });

  it("App.tsx imports GuidedDemo from the correct path", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const appTsx = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/App.tsx"),
      "utf-8"
    );
    expect(appTsx).toContain('import GuidedDemo from "./pages/GuidedDemo"');
  });

  it("GuidedDemo.tsx exists and exports a default component", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      import.meta.dirname,
      "../client/src/pages/GuidedDemo.tsx"
    );
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export default function GuidedDemo");
  });

  it("GuidedDemo.tsx contains all 8 step components", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    // All step components must be defined
    expect(content).toContain("function StepIntro");
    expect(content).toContain("function StepApprovalRequest");
    expect(content).toContain("function StepDecision");
    expect(content).toContain("function StepResult");
    expect(content).toContain("function StepReceipt");
    expect(content).toContain("function StepLedger");
    expect(content).toContain("function StepVerification");
    expect(content).toContain("function StepBridge");
  });

  it("GuidedDemo.tsx has all 8 step labels in the progress bar", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    const expectedLabels = [
      "Intro",
      "Alert",
      "Decide",
      "Result",
      "Receipt",
      "Ledger",
      "Verify",
      "Next",
    ];
    for (const label of expectedLabels) {
      expect(content).toContain(`"${label}"`);
    }
  });

  it("GuidedDemo.tsx uses simulated data (no real API calls)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    // Must have simulated receipt data
    expect(content).toContain("SIMULATED_RECEIPT");
    expect(content).toContain("SIMULATED_LEDGER");
    // Must NOT import trpc (no backend calls)
    expect(content).not.toContain("from \"@/lib/trpc\"");
    expect(content).not.toContain("trpc.");
  });

  it("GuidedDemo.tsx does not require authentication", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    // Must NOT import useAuth
    expect(content).not.toContain("useAuth");
    // Must NOT reference login or authentication
    expect(content).not.toContain("getLoginUrl");
  });

  it("GuidedDemo.tsx includes the Google Drive ledger messaging", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    // Must mention Google Drive as permanent record storage
    expect(content).toContain("Google Drive");
    expect(content).toContain("receipts are logged and filed for you");
  });

  it("GuidedDemo.tsx bridge screen has Connect Google, Enter App, and Watch Again buttons", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    expect(content).toContain("Connect Google Account");
    expect(content).toContain("Enter App");
    expect(content).toContain("Watch Demo Again");
    // Connect Google links to /connect
    expect(content).toContain('href="/connect"');
    // Enter App links to /app
    expect(content).toContain('href="/app"');
  });
});

describe("Landing Page — Demo link", () => {
  it("Home.tsx contains a prominent link to /demo", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const homeTsx = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/Home.tsx"),
      "utf-8"
    );
    expect(homeTsx).toContain('href="/demo"');
    expect(homeTsx).toContain("See How It Works");
  });

  it("Home.tsx still has the Launch Bondi App link", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const homeTsx = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/Home.tsx"),
      "utf-8"
    );
    expect(homeTsx).toContain('href="/app"');
    expect(homeTsx).toContain("Launch Bondi App");
  });
});

describe("Guided Demo — Verification checks", () => {
  it("GuidedDemo.tsx defines all 5 verification checks", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    const checks = [
      "Signature Valid",
      "Hash Format Valid",
      "Ledger Recorded",
      "Protocol Version",
      "Verification Status",
    ];
    for (const check of checks) {
      expect(content).toContain(check);
    }
  });
});

describe("Guided Demo — Trust-building and evolving governance messaging", () => {
  it("StepIntro includes trust-building messaging about evolving governance", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    expect(content).toContain("evolves over time as trust builds");
    expect(content).toContain("which actions need your explicit approval");
  });

  it("StepResult approved path includes trust-building messaging", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    expect(content).toContain("This governance adapts to you");
    expect(content).toContain("recipient, the context, the content, and the stakes");
  });

  it("StepResult denied path includes detailed deny narration", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    expect(content).toContain("cannot override you");
    expect(content).toContain("your denial is permanently recorded");
    expect(content).toContain("adapts to your comfort level");
    expect(content).toContain("safety net is always there");
  });
});

describe("Navigation Bar — Demo link accessible from every page", () => {
  it("NavBar.tsx includes a 'See How It Works' link to /demo", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/components/NavBar.tsx"),
      "utf-8"
    );
    expect(content).toContain('"See How It Works"');
    expect(content).toContain('"/demo"');
  });
});

describe("Guided Demo — Receipt structure", () => {
  it("GuidedDemo.tsx receipt shows all three hash types", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    expect(content).toContain("Intent Hash");
    expect(content).toContain("Action Hash");
    expect(content).toContain("Verification Hash");
  });

  it("GuidedDemo.tsx receipt shows metadata fields", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    const fields = ["Receipt ID", "Decision", "Risk", "Timestamp", "Signature", "Protocol"];
    for (const field of fields) {
      expect(content).toContain(field);
    }
  });
});
