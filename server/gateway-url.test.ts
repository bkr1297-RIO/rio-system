/**
 * Validate GATEWAY_URL environment variable is set and the gateway is reachable.
 */
import { describe, it, expect } from "vitest";

describe("GATEWAY_URL validation", () => {
  it("should have GATEWAY_URL set in environment", () => {
    expect(process.env.GATEWAY_URL).toBeDefined();
    expect(process.env.GATEWAY_URL).not.toBe("");
    expect(process.env.GATEWAY_URL).toContain("rio-gateway");
  });

  it("should reach the gateway health endpoint", async () => {
    const url = `${process.env.GATEWAY_URL}/health`;
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.status).toBe("operational");
    expect(data.gateway).toBe("RIO Governance Gateway");
    expect(data.ledger.chain_valid).toBe(true);
  }, 30000);

  it("should reach the gateway intents endpoint", async () => {
    const url = `${process.env.GATEWAY_URL}/intents`;
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data).toHaveProperty("intents");
    expect(data).toHaveProperty("count");
  }, 30000);

  it("should reach the gateway ledger endpoint", async () => {
    const url = `${process.env.GATEWAY_URL}/ledger`;
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data).toHaveProperty("entries");
    expect(Array.isArray(data.entries)).toBe(true);
  }, 30000);
});
