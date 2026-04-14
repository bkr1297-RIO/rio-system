import { describe, it, expect } from "vitest";

describe("HITL Proxy URL", () => {
  it("should have HITL_PROXY_URL env var set", () => {
    const url = process.env.HITL_PROXY_URL;
    expect(url).toBeDefined();
    expect(url).toContain("replit");
  });

  it("should reach the HITL pending-approvals endpoint", async () => {
    const url = process.env.HITL_PROXY_URL;
    const res = await fetch(`${url}/api/hitl/pending-approvals`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty("count");
    expect(data).toHaveProperty("intents");
  });

  it("should reach the HITL ledger endpoint", async () => {
    const url = process.env.HITL_PROXY_URL;
    const res = await fetch(`${url}/api/hitl/ledger`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty("count");
    expect(data).toHaveProperty("entries");
  });

  it("should reach the HITL receipts endpoint", async () => {
    const url = process.env.HITL_PROXY_URL;
    const res = await fetch(`${url}/api/hitl/receipts`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty("count");
    expect(data).toHaveProperty("receipts");
  });
});
