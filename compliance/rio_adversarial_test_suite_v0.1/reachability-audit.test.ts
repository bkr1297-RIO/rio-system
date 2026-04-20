/**
 * Step 4: Import / Reachability Audit
 * ═══════════════════════════════════════
 *
 * Proves: no module can import or reconstruct a direct execution path.
 * Raw connectors are not reachable outside adapters.
 *
 * This is a structural audit — it scans the codebase, not runtime behavior.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SERVER_DIR = path.resolve(__dirname);
const ADAPTERS_DIR = path.join(SERVER_DIR, "adapters");

// Walk all .ts files in server/ (excluding test files, node_modules, _core)
function walkDir(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "_core") {
        files.push(...walkDir(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        files.push(fullPath);
      }
    }
  } catch { /* ignore */ }
  return files;
}

function isAdapterFile(filePath: string): boolean {
  return filePath.startsWith(ADAPTERS_DIR);
}

function isSealedTransport(filePath: string): boolean {
  const name = path.basename(filePath);
  return name === "gmailSmtp.ts";
}

describe("STEP 4: Import / Reachability Audit", () => {
  const allFiles = walkDir(SERVER_DIR);
  const productionFiles = allFiles.filter(f => !isAdapterFile(f) && !isSealedTransport(f));

  // ═══════════════════════════════════════════════════════════════
  // AUDIT-1: No production file imports sendViaGmail
  // ═══════════════════════════════════════════════════════════════
  it("AUDIT-1: sendViaGmail is not imported by any production file", () => {
    const violations: string[] = [];
    for (const filePath of productionFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      // Check for import of sendViaGmail
      if (/import\s+.*sendViaGmail/.test(content)) {
        violations.push(path.relative(SERVER_DIR, filePath));
      }
    }
    console.log(`📂 Scanned ${productionFiles.length} production files for sendViaGmail imports`);
    if (violations.length > 0) {
      console.log("❌ VIOLATIONS:", violations);
    }
    expect(violations).toEqual([]);
    console.log("✅ AUDIT-1 PASS: Zero files import sendViaGmail");
  });

  // ═══════════════════════════════════════════════════════════════
  // AUDIT-2: No production file creates nodemailer transport
  // ═══════════════════════════════════════════════════════════════
  it("AUDIT-2: nodemailer.createTransport exists only in sealed module", () => {
    const violations: string[] = [];
    for (const filePath of allFiles) {
      if (isSealedTransport(filePath)) continue; // gmailSmtp.ts is allowed
      if (filePath.endsWith(".test.ts")) continue; // test files scan for it
      const content = fs.readFileSync(filePath, "utf-8");
      // Check for actual createTransport calls (not comments)
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/nodemailer\.createTransport/.test(line) && !line.trim().startsWith("//") && !line.trim().startsWith("*")) {
          violations.push(`${path.relative(SERVER_DIR, filePath)}:${i + 1}`);
        }
      }
    }
    console.log(`📂 Scanned ${allFiles.length} files for nodemailer.createTransport`);
    expect(violations).toEqual([]);
    console.log("✅ AUDIT-2 PASS: createTransport exists only in sealed gmailSmtp.ts");
  });

  // ═══════════════════════════════════════════════════════════════
  // AUDIT-3: No production file has direct Google Drive API calls outside adapters
  // ═══════════════════════════════════════════════════════════════
  it("AUDIT-3: Direct Google Drive API calls exist only in adapters or mirror modules", () => {
    // These patterns indicate direct Drive execution capability
    const DRIVE_EXECUTION_PATTERNS = [
      /googleapis\.com\/upload\/drive/,  // Direct upload API
      /drive\.files\.create\s*\(/,       // Google SDK create
      /drive\.files\.update\s*\(/,       // Google SDK update
      /drive\.files\.delete\s*\(/,       // Google SDK delete
    ];

    const violations: string[] = [];
    for (const filePath of productionFiles) {
      // Allow existing mirror modules (librarian.ts, driveSubFiles.ts) — they are post-receipt, fail-silent
      const name = path.basename(filePath);
      if (name === "librarian.ts" || name === "driveSubFiles.ts") continue;

      const content = fs.readFileSync(filePath, "utf-8");
      for (const pattern of DRIVE_EXECUTION_PATTERNS) {
        const match = content.match(pattern);
        if (match) {
          violations.push(`${path.relative(SERVER_DIR, filePath)}: ${match[0]}`);
        }
      }
    }
    console.log(`📂 Scanned ${productionFiles.length} production files for direct Drive API calls`);
    if (violations.length > 0) {
      console.log("⚠️  Violations:", violations);
    }
    expect(violations).toEqual([]);
    console.log("✅ AUDIT-3 PASS: No direct Drive API calls outside adapters/mirrors");
  });

  // ═══════════════════════════════════════════════════════════════
  // AUDIT-4: No production file imports adapter internals
  // ═══════════════════════════════════════════════════════════════
  it("AUDIT-4: No production file imports adapter internal functions (perform, verify, writeReceipt)", () => {
    const FORBIDDEN_IMPORTS = [
      /import\s+.*\bperform\b.*from.*adapters/,
      /import\s+.*\bverify\b.*from.*adapters/,
      /import\s+.*\bwriteReceipt\b.*from.*adapters/,
      /import\s+.*\bFAKE_CREDENTIALS\b.*from.*adapters/,
      /import\s+.*\bDRIVE_CREDENTIALS\b.*from.*adapters/,
      /import\s+.*\b_sendViaGmail\b.*from/,
      /import\s+.*\b_SIGNING_KEY\b.*from/,
    ];

    const violations: string[] = [];
    for (const filePath of productionFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      for (const pattern of FORBIDDEN_IMPORTS) {
        const match = content.match(pattern);
        if (match) {
          violations.push(`${path.relative(SERVER_DIR, filePath)}: ${match[0]}`);
        }
      }
    }
    console.log(`📂 Scanned ${productionFiles.length} files for forbidden adapter internal imports`);
    expect(violations).toEqual([]);
    console.log("✅ AUDIT-4 PASS: No file imports adapter internals");
  });

  // ═══════════════════════════════════════════════════════════════
  // AUDIT-5: Adapter modules export ONLY public API
  // ═══════════════════════════════════════════════════════════════
  it("AUDIT-5: Adapter modules export only public API (no internals leaked)", async () => {
    // Check FakeEmailAdapter
    const emailAdapter = await import("./adapters/FakeEmailAdapter");
    const emailExports = Object.keys(emailAdapter);
    expect(emailExports).not.toContain("perform");
    expect(emailExports).not.toContain("verify");
    expect(emailExports).not.toContain("writeReceipt");
    expect(emailExports).not.toContain("FAKE_CREDENTIALS");
    expect(emailExports).not.toContain("PhaseTracker");
    console.log("✅ FakeEmailAdapter exports:", emailExports);

    // Check FakeFileAdapter
    const fileAdapter = await import("./adapters/FakeFileAdapter");
    const fileExports = Object.keys(fileAdapter);
    expect(fileExports).not.toContain("perform");
    expect(fileExports).not.toContain("verify");
    expect(fileExports).not.toContain("writeReceipt");
    expect(fileExports).not.toContain("FILE_CREDENTIALS");
    expect(fileExports).not.toContain("PhaseTracker");
    console.log("✅ FakeFileAdapter exports:", fileExports);

    // Check DriveAdapter
    const driveAdapter = await import("./adapters/DriveAdapter");
    const driveExports = Object.keys(driveAdapter);
    expect(driveExports).not.toContain("perform");
    expect(driveExports).not.toContain("performVirtual");
    expect(driveExports).not.toContain("performReal");
    expect(driveExports).not.toContain("verify");
    expect(driveExports).not.toContain("writeReceipt");
    expect(driveExports).not.toContain("DRIVE_CREDENTIALS");
    expect(driveExports).not.toContain("getDriveToken");
    expect(driveExports).not.toContain("PhaseTracker");
    console.log("✅ DriveAdapter exports:", driveExports);

    console.log("✅ AUDIT-5 PASS: All adapter modules export only public API");
  });

  // ═══════════════════════════════════════════════════════════════
  // AUDIT-6: GmailTransportGate is the ONLY path to sendViaGmail
  // ═══════════════════════════════════════════════════════════════
  it("AUDIT-6: GmailTransportGate is the only interface to sealed transport", async () => {
    const gmailSmtp = await import("./one/gmailSmtp");
    const exports = Object.keys(gmailSmtp);

    // sendViaGmail must NOT be exported
    expect(exports).not.toContain("sendViaGmail");
    expect(exports).not.toContain("_sendViaGmail");

    // GmailTransportGate MUST be exported
    expect(exports).toContain("GmailTransportGate");

    // Internal signing functions must NOT be exported
    expect(exports).not.toContain("_SIGNING_KEY");
    expect(exports).not.toContain("_computeHmac");
    expect(exports).not.toContain("_usedTokens");

    console.log("✅ gmailSmtp exports:", exports);
    console.log("✅ AUDIT-6 PASS: GmailTransportGate is the only interface to sealed transport");
  });

  // ═══════════════════════════════════════════════════════════════
  // AUDIT-7: No raw fetch() to Google Drive API outside adapters/mirrors
  // ═══════════════════════════════════════════════════════════════
  it("AUDIT-7: No raw fetch() to Google Drive API outside adapters and mirror modules", () => {
    const violations: string[] = [];
    for (const filePath of productionFiles) {
      const name = path.basename(filePath);
      // Allow existing mirror modules
      if (name === "librarian.ts" || name === "driveSubFiles.ts") continue;
      // Allow connectors.ts (has DEFERRED drive connectors)
      if (name === "connectors.ts") continue;

      const content = fs.readFileSync(filePath, "utf-8");
      // Look for fetch calls to googleapis.com/drive
      if (/fetch\s*\([^)]*googleapis\.com\/drive/.test(content)) {
        violations.push(path.relative(SERVER_DIR, filePath));
      }
    }
    console.log(`📂 Scanned ${productionFiles.length} files for raw Drive API fetch calls`);
    expect(violations).toEqual([]);
    console.log("✅ AUDIT-7 PASS: No raw fetch() to Drive API outside adapters/mirrors");
  });

  // ═══════════════════════════════════════════════════════════════
  // AUDIT-8: Comprehensive execution surface inventory
  // ═══════════════════════════════════════════════════════════════
  it("AUDIT-8: Complete execution surface inventory — all paths accounted for", () => {
    // Every execution-capable pattern in the codebase
    const EXECUTION_PATTERNS = [
      { pattern: /sendViaGmail\s*\(/, name: "sendViaGmail()" },
      { pattern: /nodemailer\.createTransport/, name: "nodemailer.createTransport" },
      { pattern: /\.sendMail\s*\(/, name: ".sendMail()" },
      { pattern: /googleapis\.com\/upload\/drive/, name: "Drive upload API" },
      { pattern: /drive\.files\.(create|update|delete)\s*\(/, name: "Drive SDK mutation" },
    ];

    const inventory: { file: string; pattern: string; allowed: boolean; reason: string }[] = [];

    for (const filePath of allFiles) {
      if (filePath.endsWith(".test.ts")) continue;
      const relPath = path.relative(SERVER_DIR, filePath);
      const content = fs.readFileSync(filePath, "utf-8");

      for (const { pattern, name } of EXECUTION_PATTERNS) {
        if (pattern.test(content)) {
          const isAdapter = isAdapterFile(filePath);
          const isSealed = isSealedTransport(filePath);
          const isMirror = ["librarian.ts", "driveSubFiles.ts"].includes(path.basename(filePath));
          const isConnector = path.basename(filePath) === "connectors.ts";
          const isApproval = path.basename(filePath) === "emailApproval.ts";

          let allowed = false;
          let reason = "UNKNOWN";

          if (isAdapter) { allowed = true; reason = "Inside adapter closure"; }
          else if (isSealed) { allowed = true; reason = "Sealed transport module (GmailTransportGate)"; }
          else if (isMirror) { allowed = true; reason = "Post-receipt mirror (fail-silent, non-blocking)"; }
          else if (isConnector) { allowed = true; reason = "Gateway-only connector (refuses direct execution)"; }
          else if (isApproval) { allowed = true; reason = "HMAC-gated approval flow"; }
          else { allowed = false; reason = "UNGATED EXECUTION PATH"; }

          inventory.push({ file: relPath, pattern: name, allowed, reason });
        }
      }
    }

    console.log("\n📋 EXECUTION SURFACE INVENTORY:");
    console.log("─".repeat(80));
    for (const entry of inventory) {
      const status = entry.allowed ? "✅" : "❌";
      console.log(`${status} ${entry.file} | ${entry.pattern} | ${entry.reason}`);
    }
    console.log("─".repeat(80));

    // Assert: no ungated execution paths
    const ungated = inventory.filter(e => !e.allowed);
    if (ungated.length > 0) {
      console.log("❌ UNGATED EXECUTION PATHS FOUND:");
      ungated.forEach(e => console.log(`   ${e.file}: ${e.pattern}`));
    }
    expect(ungated).toEqual([]);
    console.log(`\n✅ AUDIT-8 PASS: ${inventory.length} execution surfaces found, ALL accounted for and gated`);
  });
});
