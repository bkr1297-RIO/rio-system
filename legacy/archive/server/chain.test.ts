/**
 * Tests for the /chain Receipt Chain Visualizer page
 */
import { describe, it, expect } from "vitest";

// Test the Chain page component exists and exports properly
describe("Chain page", () => {
  it("should export a default component", async () => {
    const mod = await import("../client/src/pages/Chain");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});

// Test that the route is registered in App.tsx
describe("Chain route registration", () => {
  it("should have /chain route in App.tsx", async () => {
    const fs = await import("fs");
    const appContent = fs.readFileSync("client/src/App.tsx", "utf-8");
    expect(appContent).toContain('"/chain"');
    expect(appContent).toContain("Chain");
  });

  it("should have Chain in NavBar navigation", async () => {
    const fs = await import("fs");
    const navContent = fs.readFileSync("client/src/components/NavBar.tsx", "utf-8");
    expect(navContent).toContain("Receipt Chain");
    expect(navContent).toContain("/chain");
  });
});

// Test that the existing ledgerChain endpoint is compatible
describe("ledgerChain endpoint compatibility", () => {
  it("should have ledgerChain procedure in rio router", async () => {
    const fs = await import("fs");
    const routerContent = fs.readFileSync("server/routers/rio.ts", "utf-8");
    expect(routerContent).toContain("ledgerChain:");
    expect(routerContent).toContain("getLedgerChain");
  });

  it("should accept limit parameter", async () => {
    const fs = await import("fs");
    const routerContent = fs.readFileSync("server/routers/rio.ts", "utf-8");
    expect(routerContent).toContain("limit:");
    expect(routerContent).toContain(".min(1).max(200)");
  });
});

// Test INVARIANT-002 document exists
describe("INVARIANT-002", () => {
  it("should exist in docs directory", async () => {
    const fs = await import("fs");
    const exists = fs.existsSync("docs/INVARIANT-002.md");
    expect(exists).toBe(true);
  });

  it("should contain the correct title", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("docs/INVARIANT-002.md", "utf-8");
    expect(content).toContain("No Modification Without a Governance Receipt");
  });

  it("should reference INVARIANT-001 as a dependency", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("docs/INVARIANT-002.md", "utf-8");
    expect(content).toContain("INVARIANT-001");
    expect(content).toContain("Depends On");
  });

  it("should define the six formal properties", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("docs/INVARIANT-002.md", "utf-8");
    expect(content).toContain("No Mutation");
    expect(content).toContain("No Deletion");
    expect(content).toContain("Chain Preservation");
    expect(content).toContain("Amendment by Append");
    expect(content).toContain("Signature Continuity");
    expect(content).toContain("Schema Enforcement");
  });
});
