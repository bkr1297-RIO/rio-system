import { describe, it, expect } from "vitest";

describe("VITE_GATEWAY_URL", () => {
  it("should be set and be a valid URL", () => {
    const url = process.env.VITE_GATEWAY_URL;
    expect(url).toBeTruthy();
    expect(url).toMatch(/^https?:\/\//);
  });
});
