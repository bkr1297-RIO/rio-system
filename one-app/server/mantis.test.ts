import { describe, it, expect } from "vitest";

describe("MANTIS - GH_TOKEN validation", () => {
  it("should read STATUS.json from rio-system using GH_TOKEN", async () => {
    const token = process.env.GH_TOKEN;
    expect(token, "GH_TOKEN must be set").toBeTruthy();

    const res = await fetch(
      "https://api.github.com/repos/bkr1297-RIO/rio-system/contents/STATUS.json",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "rio-one-mantis",
        },
      }
    );

    expect(res.status, `GitHub API returned ${res.status}`).toBe(200);

    const data = (await res.json()) as { content?: string; encoding?: string };
    expect(data.content, "Response should contain base64 content").toBeTruthy();
    expect(data.encoding).toBe("base64");

    // Decode and verify it's valid JSON
    const decoded = Buffer.from(data.content!, "base64").toString("utf-8");
    const status = JSON.parse(decoded);
    expect(status).toHaveProperty("system_state");
    console.log("[MANTIS] STATUS.json read OK — system_state:", status.system_state);
  });

  it("should list sweep files from rio-system/sweeps/", async () => {
    const token = process.env.GH_TOKEN;
    expect(token, "GH_TOKEN must be set").toBeTruthy();

    const res = await fetch(
      "https://api.github.com/repos/bkr1297-RIO/rio-system/contents/sweeps",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "rio-one-mantis",
        },
      }
    );

    expect(res.status, `GitHub API returned ${res.status}`).toBe(200);

    const files = (await res.json()) as Array<{ name: string; type: string }>;
    expect(Array.isArray(files), "Should return array of files").toBe(true);
    expect(files.length, "Should have at least one sweep file").toBeGreaterThan(0);

    const jsonFiles = files.filter((f) => f.name.endsWith(".json"));
    expect(jsonFiles.length, "Should have at least one JSON sweep file").toBeGreaterThan(0);
    console.log("[MANTIS] Sweep files found:", jsonFiles.map((f) => f.name).join(", "));
  });
});
