import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * PositionPaper page — structural validation tests
 *
 * Validates that the PositionPaper component file exists, is well-formed,
 * and that the route is properly registered in App.tsx.
 */

const CLIENT_SRC = path.resolve(import.meta.dirname, "..", "client", "src");

describe("PositionPaper page file", () => {
  const filePath = path.join(CLIENT_SRC, "pages", "PositionPaper.tsx");

  it("exists in the pages directory", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("exports a default component", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export default function PositionPaper");
  });

  it("contains all 12 required section headings", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    const requiredSections = [
      "Introduction",
      "Execution Governance Infrastructure",
      "RIO Protocol Overview",
      "Technical Guarantees",
      "EGI Assessment",
      "EU AI Act",
      "NIST AI RMF",
      "ISO/IEC 42001",
      "Does Not Address",
      "Landscape",
      "Practical Implications",
      "Conclusion",
    ];
    for (const section of requiredSections) {
      expect(content).toContain(section);
    }
  });

  it("contains the Abstract section", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("Abstract");
  });

  it("contains the References section", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("References");
  });

  it("includes a PDF download link", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("Download PDF");
  });

  it("includes the protocol repository link", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("github.com/bkr1297-RIO/rio-protocol");
  });

  it("includes author attribution to Brian K. Rasmussen", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("Brian K. Rasmussen");
  });

  it("includes the EGI property table (P1-P5)", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("P1");
    expect(content).toContain("P2");
    expect(content).toContain("P3");
    expect(content).toContain("P4");
    expect(content).toContain("P5");
  });

  it("includes the test evidence count (143 tests)", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("143");
  });
});

describe("PositionPaper route registration", () => {
  const appPath = path.join(CLIENT_SRC, "App.tsx");

  it("route is registered in App.tsx", () => {
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).toContain("/position-paper");
  });

  it("PositionPaper component is imported in App.tsx", () => {
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).toContain("import PositionPaper");
  });
});

describe("PositionPaper navigation", () => {
  const navPath = path.join(CLIENT_SRC, "components", "NavBar.tsx");

  it("Position Paper link is in the navigation bar", () => {
    const content = fs.readFileSync(navPath, "utf-8");
    expect(content).toContain("Position Paper");
    expect(content).toContain("/position-paper");
  });
});
