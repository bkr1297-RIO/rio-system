/**
 * Validates that SLACK_SIGNING_SECRET is set and accessible via ENV.
 */
import { describe, it, expect } from "vitest";
import { ENV } from "./_core/env";

describe("Slack Signing Secret", () => {
  it("SLACK_SIGNING_SECRET is set in environment", () => {
    expect(ENV.slackSigningSecret).toBeTruthy();
    expect(ENV.slackSigningSecret.length).toBeGreaterThan(0);
  });
});
