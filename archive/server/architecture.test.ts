import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const clientDir = path.resolve(__dirname, "..", "client", "src");

function readFile(relPath: string): string {
  return fs.readFileSync(path.resolve(clientDir, relPath), "utf-8");
}

describe("Architecture page v2", () => {
  const src = readFile("pages/Architecture.tsx");

  it("exports a default component", () => {
    expect(src).toMatch(/export default function Architecture/);
  });

  it("contains the 4 guarantee titles", () => {
    expect(src).toContain("No execution without authorization");
    expect(src).toContain("Past records cannot be altered");
    expect(src).toContain("Approvals cannot be forged");
    expect(src).toContain("Tokens cannot be replayed");
  });

  it("contains all 8 pipeline stages", () => {
    const stages = [
      "Intake",
      "Discovery & Refinement",
      "Classification",
      "Policy & Risk Evaluation",
      "Authorization",
      "Execution Gate",
      "Post-Execution Verification",
      "Receipt & Ledger",
    ];
    stages.forEach((s) => expect(src).toContain(s));
  });

  it("contains the Three-Loop Architecture section", () => {
    expect(src).toContain("Three-Loop Architecture");
    expect(src).toContain("Intake Loop");
    expect(src).toContain("Governance Loop");
    expect(src).toContain("Learning Loop");
  });

  it("contains the receipt three-hash binding section", () => {
    expect(src).toContain("intent_hash");
    expect(src).toContain("action_hash");
    expect(src).toContain("verification_hash");
    expect(src).toContain("Three-Hash Binding");
  });

  it("contains the ledger hash chain formula", () => {
    expect(src).toContain("Hn = SHA256( En.data + H(n-1) )");
  });

  it("contains the verification section with 5 steps", () => {
    expect(src).toContain("Receipt Verifier");
    expect(src).toContain("Ledger Verifier");
    expect(src).toContain("How to verify (no access to RIO needed):");
  });

  it("contains the threat model with 6 threats", () => {
    expect(src).toContain("Unauthorized execution");
    expect(src).toContain("Replay attacks");
    expect(src).toContain("Stale authorization");
    expect(src).toContain("Audit tampering");
    expect(src).toContain("Forgery");
    expect(src).toContain("Silent denials");
  });

  it("contains the trust model section", () => {
    expect(src).toContain("Who you must trust");
    expect(src).toContain("Who you do NOT need to trust");
    expect(src).toContain("The signing key holder");
    expect(src).toContain("The runtime operator");
  });

  it("contains the regulatory alignment table", () => {
    expect(src).toContain("EU AI Act");
    expect(src).toContain("NIST AI RMF");
    expect(src).toContain("ISO 42001");
  });

  it("contains the pipeline diagram CDN URL", () => {
    expect(src).toMatch(/pipeline-diagram/);
  });

  it("contains the three-loop architecture diagram CDN URL", () => {
    expect(src).toMatch(/three-loop-architecture/);
  });

  it("contains links to full docs on GitHub", () => {
    expect(src).toContain("Threat_Model.md");
    expect(src).toContain("Trust_Model.md");
    expect(src).toContain("EGI_Technical_Assessment.pdf");
  });

  it("contains the design principle callout", () => {
    expect(src).toContain("Design principle: fail-closed.");
  });

  it("contains the denial receipts callout", () => {
    expect(src).toContain("Denials are first-class:");
  });

  it("contains 143 test count reference", () => {
    expect(src).toContain("143 tests, 0 failures");
  });
});

describe("Architecture route and navigation", () => {
  const appSrc = readFile("App.tsx");
  const navSrc = readFile("components/NavBar.tsx");

  it("App.tsx imports Architecture page", () => {
    expect(appSrc).toMatch(/import.*Architecture.*from/);
  });

  it("App.tsx has /architecture route", () => {
    expect(appSrc).toContain("/architecture");
  });

  it("NavBar has Architecture link", () => {
    expect(navSrc).toContain("/architecture");
    expect(navSrc).toContain("Architecture");
  });
});
