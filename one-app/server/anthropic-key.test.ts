import { describe, expect, it } from "vitest";

describe("Anthropic API Key", () => {
  it("ANTHROPIC_API_KEY is set in environment", () => {
    const key = process.env.ANTHROPIC_API_KEY;
    expect(key).toBeDefined();
    expect(key).not.toBe("");
    expect(typeof key).toBe("string");
  });
});
