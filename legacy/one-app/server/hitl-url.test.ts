import { describe, it, expect } from "vitest";

describe("HITL_PROXY_URL validation", () => {
  it("should reach the HITL health endpoint", async () => {
    const url = process.env.HITL_PROXY_URL;
    expect(url).toBeTruthy();
    // The URL should be set — we just test reachability
    const res = await fetch(`${url}/api/health`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  it("should reach the HITL ledger endpoint", async () => {
    const url = process.env.HITL_PROXY_URL;
    const res = await fetch(`${url}/api/hitl/ledger`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(typeof data.count).toBe("number");
    expect(Array.isArray(data.entries)).toBe(true);
  });
});
