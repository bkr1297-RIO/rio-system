/**
 * Microsoft OAuth Credential Validation Tests
 *
 * Validates that Microsoft Azure AD credentials are configured and
 * the OAuth discovery endpoint is reachable.
 */

import { describe, it, expect } from "vitest";

describe("Microsoft OAuth Credentials", () => {
  it("should have MICROSOFT_OAUTH_CLIENT_ID configured", () => {
    const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
    expect(clientId).toBeDefined();
    expect(clientId).not.toBe("");
    // Azure AD client IDs are UUIDs
    expect(clientId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("should have MICROSOFT_OAUTH_CLIENT_SECRET configured", () => {
    const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
    expect(clientSecret).toBeDefined();
    expect(clientSecret).not.toBe("");
    // Client secrets are typically 30+ characters
    expect(clientSecret!.length).toBeGreaterThan(10);
  });

  it("should have MICROSOFT_OAUTH_TENANT_ID configured", () => {
    const tenantId = process.env.MICROSOFT_OAUTH_TENANT_ID;
    expect(tenantId).toBeDefined();
    expect(tenantId).not.toBe("");
    // Tenant ID is either a UUID or 'common'/'organizations'/'consumers'
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId!);
    const isWellKnown = ["common", "organizations", "consumers"].includes(tenantId!);
    expect(isUuid || isWellKnown).toBe(true);
  });

  it("should be able to reach Microsoft OpenID discovery endpoint", async () => {
    const tenantId = process.env.MICROSOFT_OAUTH_TENANT_ID || "common";
    const discoveryUrl = `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`;

    const response = await fetch(discoveryUrl);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.authorization_endpoint).toContain("login.microsoftonline.com");
    expect(data.token_endpoint).toContain("login.microsoftonline.com");
  });

  it("ENV module should expose Microsoft credentials", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV.microsoftOAuthClientId).not.toBe("");
    expect(ENV.microsoftOAuthClientSecret).not.toBe("");
    expect(ENV.microsoftOAuthTenantId).not.toBe("");
  });
});
