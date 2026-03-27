import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * PositionPaper page — structural validation tests
 *
 * Validates that the PositionPaper component file exists, is well-formed,
 * route is registered, Resources dropdown works, OG tags exist, and
 * Get Involved section is present.
 */

const CLIENT_SRC = path.resolve(import.meta.dirname, "..", "client", "src");
const INDEX_HTML = path.resolve(import.meta.dirname, "..", "client", "index.html");

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

  it("includes the Get Involved section", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("Get Involved");
  });

  it("Get Involved section links to CONTRIBUTING.md", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("CONTRIBUTING.md");
  });

  it("Get Involved section links to all three repositories", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("rio-protocol");
    expect(content).toContain("rio-tools");
    expect(content).toContain("rio-reference-impl");
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

describe("NavBar Resources dropdown", () => {
  const navPath = path.join(CLIENT_SRC, "components", "NavBar.tsx");

  it("has a Resources dropdown group", () => {
    const content = fs.readFileSync(navPath, "utf-8");
    expect(content).toContain('"Resources"');
  });

  it("Resources dropdown contains Documentation link", () => {
    const content = fs.readFileSync(navPath, "utf-8");
    expect(content).toContain('"Documentation"');
  });

  it("Resources dropdown contains Whitepaper link", () => {
    const content = fs.readFileSync(navPath, "utf-8");
    // Whitepaper should be inside the Resources children array
    const resourcesBlock = content.match(
      /label:\s*"Resources"[\s\S]*?children:\s*\[([\s\S]*?)\]/
    );
    expect(resourcesBlock).not.toBeNull();
    expect(resourcesBlock![1]).toContain("Whitepaper");
  });

  it("Resources dropdown contains Position Paper link", () => {
    const content = fs.readFileSync(navPath, "utf-8");
    const resourcesBlock = content.match(
      /label:\s*"Resources"[\s\S]*?children:\s*\[([\s\S]*?)\]/
    );
    expect(resourcesBlock).not.toBeNull();
    expect(resourcesBlock![1]).toContain("Position Paper");
  });

  it("Resources dropdown contains FAQ link", () => {
    const content = fs.readFileSync(navPath, "utf-8");
    const resourcesBlock = content.match(
      /label:\s*"Resources"[\s\S]*?children:\s*\[([\s\S]*?)\]/
    );
    expect(resourcesBlock).not.toBeNull();
    expect(resourcesBlock![1]).toContain("FAQ");
  });

  it("Position Paper link is in the navigation bar", () => {
    const content = fs.readFileSync(navPath, "utf-8");
    expect(content).toContain("Position Paper");
    expect(content).toContain("/position-paper");
  });
});

describe("Open Graph meta tags", () => {
  it("index.html contains og:title meta tag", () => {
    const content = fs.readFileSync(INDEX_HTML, "utf-8");
    expect(content).toContain('property="og:title"');
  });

  it("index.html contains og:description meta tag", () => {
    const content = fs.readFileSync(INDEX_HTML, "utf-8");
    expect(content).toContain('property="og:description"');
  });

  it("index.html contains og:image meta tag", () => {
    const content = fs.readFileSync(INDEX_HTML, "utf-8");
    expect(content).toContain('property="og:image"');
  });

  it("index.html contains og:url meta tag with domain", () => {
    const content = fs.readFileSync(INDEX_HTML, "utf-8");
    expect(content).toContain('property="og:url"');
    expect(content).toContain("riodemo-ux2sxdqo.manus.space");
  });

  it("index.html contains twitter:card meta tag", () => {
    const content = fs.readFileSync(INDEX_HTML, "utf-8");
    expect(content).toContain('name="twitter:card"');
  });

  it("index.html contains meta description", () => {
    const content = fs.readFileSync(INDEX_HTML, "utf-8");
    expect(content).toContain('name="description"');
  });

  it("index.html contains meta author with Brian K. Rasmussen", () => {
    const content = fs.readFileSync(INDEX_HTML, "utf-8");
    expect(content).toContain('name="author"');
    expect(content).toContain("Brian K. Rasmussen");
  });
});
