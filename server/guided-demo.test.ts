import { describe, expect, it } from "vitest";

/**
 * Guided Demo (/demo) — Integration tests
 *
 * The guided demo is a narrated, step-by-step walkthrough of RIO governance.
 * It uses simulated data for the demo flow but calls trpc for demo tracking.
 * These tests verify:
 *   1. The /demo route is registered in the app router
 *   2. The landing page (Home.tsx) contains a link to /demo
 *   3. The GuidedDemo component exports a default function
 *   4. The demo page has all 8 steps defined
 *   5. Trust-building and evolving governance messaging
 *   6. Deny path narration
 *   7. NavBar has the renamed "See What RIO Makes Possible for You" link
 *   8. Nutshell definition of RIO
 *   9. Phone notification mockup
 *  10. Demo tracking via trpc
 *  11. Demo router exists with trackStep and stats procedures
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

  it("GuidedDemo.tsx uses simulated data for demo content", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    expect(content).toContain("SIMULATED_RECEIPT");
    expect(content).toContain("SIMULATED_LEDGER");
  });

  it("GuidedDemo.tsx does not require authentication", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    expect(content).not.toContain("useAuth");
    expect(content).not.toContain("getLoginUrl");
  });

  it("GuidedDemo.tsx includes the Google Drive ledger messaging", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
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
    expect(content).toContain('href="/connect"');
    expect(content).toContain('href="/app"');
  });
});

describe("Landing Page — Demo link", () => {
  it("Home.tsx contains a prominent link to /demo with updated text", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const homeTsx = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/Home.tsx"),
      "utf-8"
    );
    expect(homeTsx).toContain('href="/demo"');
    expect(homeTsx).toContain("See What RIO Makes Possible for You");
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
  it("NavBar.tsx includes 'See What RIO Makes Possible for You' link to /demo", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/components/NavBar.tsx"),
      "utf-8"
    );
    expect(content).toContain('"See What RIO Makes Possible for You"');
    expect(content).toContain('"/demo"');
  });

  it("NavBar.tsx has highlight styling for the demo link", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/components/NavBar.tsx"),
      "utf-8"
    );
    expect(content).toContain("highlight: true");
    expect(content).toContain("highlight?: boolean");
  });
});

describe("Guided Demo — Nutshell definition of RIO", () => {
  it("StepIntro leads with the nutshell definition", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    expect(content).toContain("What Is RIO?");
    expect(content).toContain("real-world actions");
    expect(content).toContain("only with your approval");
    expect(content).toContain("permanent record");
    expect(content).toContain("learn over time");
  });

  it("StepIntro includes the 'email is just one example' paragraph", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    expect(content).toContain("email is just one way the system");
    expect(content).toContain("cancel services like unused or unwanted subscriptions");
    expect(content).toContain("meetings, submit requests, and follow up on important things");
    expect(content).toContain("always asks before acting");
    expect(content).toContain("always keeps a record");
    expect(content).toContain("what would you want it to do for you");
  });
});

describe("Guided Demo — Phone notification mockup", () => {
  it("StepApprovalRequest includes a phone notification mockup", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    expect(content).toContain("Phone notification mockup");
    expect(content).toContain("Approval Needed: Send Email");
    expect(content).toContain("BONDI");
    expect(content).toContain("showPhone");
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

describe("Guided Demo — Demo tracking", () => {
  it("GuidedDemo.tsx imports trpc for demo tracking", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    expect(content).toContain('from "@/lib/trpc"');
    expect(content).toContain("trpc.demo.trackStep");
  });

  it("GuidedDemo.tsx generates a session ID for tracking", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/GuidedDemo.tsx"),
      "utf-8"
    );
    expect(content).toContain("rio_demo_session");
    expect(content).toContain("sessionId");
  });

  it("Demo router exists with trackStep and stats procedures", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routerPath = path.resolve(
      import.meta.dirname,
      "./routers/demo.ts"
    );
    expect(fs.existsSync(routerPath)).toBe(true);
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("trackStep");
    expect(content).toContain("stats");
    expect(content).toContain("publicProcedure");
    expect(content).toContain("adminProcedure");
  });

  it("Demo router is registered in the main appRouter", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "./routers.ts"),
      "utf-8"
    );
    expect(content).toContain("demoRouter");
    expect(content).toContain("demo: demoRouter");
  });

  it("Database schema includes demo_events table", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(import.meta.dirname, "../drizzle/schema.ts"),
      "utf-8"
    );
    expect(content).toContain("demoEvents");
    expect(content).toContain("demo_events");
    expect(content).toContain("session_id");
    expect(content).toContain("step_label");
  });
});
