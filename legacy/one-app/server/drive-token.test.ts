import { describe, it, expect } from "vitest";
import * as fs from "fs";

function getToken(): string | null {
  const envToken = process.env.GOOGLE_DRIVE_TOKEN || process.env.GOOGLE_WORKSPACE_CLI_TOKEN;
  if (envToken && envToken.length > 30) return envToken;
  try {
    const configPath = "/home/ubuntu/.gdrive-rclone.ini";
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      const match = content.match(/"access_token":\s*"([^"]+)"/);
      if (match?.[1] && match[1].length > 30) return match[1];
    }
  } catch { /* */ }
  return null;
}

describe("GOOGLE_DRIVE_TOKEN validation", () => {
  it("should resolve a valid Drive token from env or rclone config", () => {
    const token = getToken();
    expect(token).toBeDefined();
    expect(token!.length).toBeGreaterThan(30);
  });

  it("should be able to list files in /RIO/01_PROTOCOL/ folder", async () => {
    const token = getToken();
    expect(token).toBeDefined();
    const folderId = "11UIU99kDafFEQ5Z7nAniZyRfmU-sbBUS";
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=5`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.ok).toBe(true);
    const data = await res.json() as { files?: unknown[] };
    expect(data.files).toBeDefined();
  });
});
