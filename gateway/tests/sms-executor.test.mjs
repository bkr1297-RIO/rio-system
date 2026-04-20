/**
 * Tests for RIO SMS Executor — E.164 Sanitization & Trial Guardrail
 *
 * Run: node --test gateway/tests/sms-executor.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeToE164 } from "../execution/sms-executor.mjs";

describe("sanitizeToE164", () => {
  it("passes through valid E.164 numbers unchanged", () => {
    assert.equal(sanitizeToE164("+15551234567"), "+15551234567");
    assert.equal(sanitizeToE164("+442071234567"), "+442071234567");
  });

  it("strips parentheses, dashes, and spaces from US numbers", () => {
    assert.equal(sanitizeToE164("(555) 123-4567"), "+15551234567");
    assert.equal(sanitizeToE164("555-123-4567"), "+15551234567");
    assert.equal(sanitizeToE164("555 123 4567"), "+15551234567");
  });

  it("handles 11-digit US numbers starting with 1", () => {
    assert.equal(sanitizeToE164("15551234567"), "+15551234567");
    assert.equal(sanitizeToE164("1-555-123-4567"), "+15551234567");
  });

  it("handles 10-digit US numbers by prepending +1", () => {
    assert.equal(sanitizeToE164("5551234567"), "+15551234567");
  });

  it("handles numbers with + prefix — treated as already having country code", () => {
    // +5551234567 has + and 10 digits — the regex matches \+\d{10,15} so it passes through.
    // This is correct: if someone typed +5551234567, they intended a specific country code.
    assert.equal(sanitizeToE164("+5551234567"), "+5551234567");
  });

  it("handles international numbers with 12+ digits", () => {
    assert.equal(sanitizeToE164("442071234567"), "+442071234567");
    assert.equal(sanitizeToE164("+442071234567"), "+442071234567");
  });

  it("throws on empty or non-string input", () => {
    assert.throws(() => sanitizeToE164(""), /required/);
    assert.throws(() => sanitizeToE164(null), /required/);
    assert.throws(() => sanitizeToE164(undefined), /required/);
  });
});
