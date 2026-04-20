import { describe, expect, it } from "vitest";

describe("OpenAI API Key", () => {
  it("OPENAI_API_KEY is set in environment", () => {
    const key = process.env.OPENAI_API_KEY;
    expect(key).toBeDefined();
    expect(key).not.toBe("");
    expect(typeof key).toBe("string");
  });
});
