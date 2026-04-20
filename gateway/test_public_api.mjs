/**
 * RIO Gateway — Public API v1 End-to-End Test (WS-012)
 *
 * Tests:
 *   1. API key management (create, list, get, revoke)
 *   2. API key authentication on v1 endpoints
 *   3. Rate limiting enforcement
 *   4. Full pipeline via API v1 (intent → govern → authorize → execute → confirm → receipt)
 *   5. OpenAPI docs endpoint
 *   6. Fail-closed: invalid API key, revoked key, insufficient scope
 *   7. Ledger verification via API v1
 */
import { signPayload, buildSignaturePayload } from "./security/ed25519.mjs";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4400";
let TOKEN = "";
let API_KEY = "";
let API_KEY_ID = "";
let READ_ONLY_KEY = "";
let READ_ONLY_KEY_ID = "";
let SIGNER_PRIVATE_KEY = "";
let SIGNER_PUBLIC_KEY = "";
let INTENT_ID = "";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
}

async function post(path, body, headers = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, headers: Object.fromEntries(res.headers.entries()) };
}

async function get(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, headers: Object.fromEntries(res.headers.entries()) };
}

async function del(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ============================================================================
// Test Execution
// ============================================================================
async function run() {
  console.log("\n" + "=".repeat(60));
  console.log("  RIO PUBLIC API v1 — END-TO-END TEST");
  console.log("=".repeat(60));

  // ---- Step 0: Login to get JWT token ----
  console.log("\n--- Step 0: JWT Login ---");
  {
    const r = await post("/login", {
      user_id: "brian.k.rasmussen",
      passphrase: "rio-governed-2026",
    });
    assert(r.status === 200, `Login: status ${r.status} === 200`);
    assert(r.data.token, "Login: JWT token received");
    TOKEN = r.data.token;
  }

  // ---- Step 1: Generate Ed25519 keypair for signing ----
  console.log("\n--- Step 1: Generate Ed25519 Keypair ---");
  {
    const r = await post(
      "/api/signers/generate-keypair",
      { signer_id: "api-test-signer", display_name: "API Test Signer", role: "owner" },
      { Authorization: `Bearer ${TOKEN}` }
    );
    assert(r.status === 201, `Generate keypair: status ${r.status} === 201`);
    assert(r.data.secret_key_hex, "Generate keypair: private key returned");
    assert(r.data.public_key_hex, "Generate keypair: public key returned");
    SIGNER_PRIVATE_KEY = r.data.secret_key_hex;
    SIGNER_PUBLIC_KEY = r.data.public_key_hex;
  }

  // ---- Step 2: Create API keys ----
  console.log("\n--- Step 2: Create API Keys ---");
  {
    // Create admin-scoped key
    const r = await post(
      "/api/v1/keys",
      { display_name: "Test Admin Key", scopes: ["read", "write", "admin"], rate_limit: 200 },
      { Authorization: `Bearer ${TOKEN}` }
    );
    assert(r.status === 201, `Create admin key: status ${r.status} === 201`);
    assert(r.data.raw_key, "Create admin key: raw key returned");
    assert(r.data.key_id, "Create admin key: key_id returned");
    assert(r.data.warning?.includes("NOT be shown again"), "Create admin key: security warning present");
    API_KEY = r.data.raw_key;
    API_KEY_ID = r.data.key_id;
  }
  {
    // Create read-only key
    const r = await post(
      "/api/v1/keys",
      { display_name: "Test Read-Only Key", scopes: ["read"], rate_limit: 50 },
      { Authorization: `Bearer ${TOKEN}` }
    );
    assert(r.status === 201, `Create read-only key: status ${r.status} === 201`);
    READ_ONLY_KEY = r.data.raw_key;
    READ_ONLY_KEY_ID = r.data.key_id;
  }

  // ---- Step 3: List API keys ----
  console.log("\n--- Step 3: List API Keys ---");
  {
    const r = await get("/api/v1/keys", { Authorization: `Bearer ${TOKEN}` });
    assert(r.status === 200, `List keys: status ${r.status} === 200`);
    assert(r.data.count >= 2, `List keys: count ${r.data.count} >= 2`);
  }

  // ---- Step 4: Test API key authentication ----
  console.log("\n--- Step 4: API Key Authentication ---");
  {
    // Valid API key
    const r = await get("/api/v1/health", { "X-API-Key": API_KEY });
    assert(r.status === 200, `Valid API key: status ${r.status} === 200`);
    assert(r.data.api_version === "v1", "Valid API key: api_version = v1");
  }
  {
    // Invalid API key
    const r = await get("/api/v1/intents", { "X-API-Key": "rio_pk_invalid_key_12345" });
    assert(r.status === 401, `Invalid API key: status ${r.status} === 401`);
  }
  {
    // No auth at all on protected endpoint
    const r = await get("/api/v1/intents");
    assert(r.status === 401, `No auth: status ${r.status} === 401`);
  }

  // ---- Step 5: Test rate limit headers ----
  console.log("\n--- Step 5: Rate Limit Headers ---");
  {
    const r = await get("/api/v1/health", { "X-API-Key": API_KEY });
    assert(r.headers["x-ratelimit-limit"], `Rate limit header present: X-RateLimit-Limit = ${r.headers["x-ratelimit-limit"]}`);
    assert(r.headers["x-ratelimit-remaining"], `Rate limit header present: X-RateLimit-Remaining = ${r.headers["x-ratelimit-remaining"]}`);
  }

  // ---- Step 6: Scope enforcement ----
  console.log("\n--- Step 6: Scope Enforcement ---");
  {
    // Read-only key can read
    const r = await get("/api/v1/intents", { "X-API-Key": READ_ONLY_KEY });
    assert(r.status === 200, `Read-only key can read: status ${r.status} === 200`);
  }
  {
    // Read-only key cannot write
    const r = await post(
      "/api/v1/intents",
      {
        identity: { subject: "test-agent", auth_method: "api_key", role: "agent" },
        intent: { action: "send_email", target: "staging", parameters: { to: "test@example.com" } },
        context: { reason: "Scope test" },
      },
      { "X-API-Key": READ_ONLY_KEY }
    );
    assert(r.status === 403, `Read-only key cannot write: status ${r.status} === 403`);
    assert(r.data.error?.includes("Insufficient scope"), "Read-only key: scope error message");
  }

  // ---- Step 7: Full pipeline via API v1 ----
  console.log("\n--- Step 7: Full Pipeline via API v1 ---");

  // 7a: Submit intent
  console.log("  7a: Submit intent");
  {
    const r = await post(
      "/api/v1/intents",
      {
        identity: { subject: "MANUS", auth_method: "api_key", role: "agent" },
        intent: { action: "send_email", target: "staging", parameters: { to: "test@example.com", subject: "API v1 Test", body: "Hello from API v1" } },
        context: { reason: "End-to-end API v1 test", urgency: "normal" },
        confidence: 95,
      },
      { "X-API-Key": API_KEY }
    );
    assert(r.status === 201, `Submit intent: status ${r.status} === 201`);
    assert(r.data.intent_id, `Submit intent: intent_id = ${r.data.intent_id}`);
    assert(r.data.intent_hash, "Submit intent: intent_hash present");
    assert(r.data.api_version === "v1", "Submit intent: api_version = v1");
    INTENT_ID = r.data.intent_id;
  }

  // 7b: Get intent
  console.log("  7b: Get intent");
  {
    const r = await get(`/api/v1/intents/${INTENT_ID}`, { "X-API-Key": API_KEY });
    assert(r.status === 200, `Get intent: status ${r.status} === 200`);
    assert(r.data.status === "submitted", `Get intent: status = ${r.data.status}`);
  }

  // 7c: Govern
  console.log("  7c: Govern intent");
  {
    const r = await post(`/api/v1/intents/${INTENT_ID}/govern`, {}, { "X-API-Key": API_KEY });
    assert(r.status === 200, `Govern: status ${r.status} === 200`);
    assert(r.data.governance_hash, "Govern: governance_hash present");
    assert(r.data.risk_level, `Govern: risk_level = ${r.data.risk_level}`);
    assert(r.data.api_version === "v1", "Govern: api_version = v1");
  }

  // 7d: Authorize with Ed25519 signature
  console.log("  7d: Authorize with Ed25519 signature");
  {
    const timestamp = new Date().toISOString();
    const payload = buildSignaturePayload({
      intent_id: INTENT_ID,
      action: "send_email",
      decision: "approved",
      signer_id: "api-test-signer",
      timestamp,
    });
    const signature = signPayload(payload, SIGNER_PRIVATE_KEY);

    const r = await post(
      `/api/v1/intents/${INTENT_ID}/authorize`,
      {
        decision: "approved",
        authorized_by: "api-test-signer",
        signature,
        signature_timestamp: timestamp,
      },
      { "X-API-Key": API_KEY }
    );
    assert(r.status === 200, `Authorize: status ${r.status} === 200`);
    assert(r.data.authorization_status === "authorized", `Authorize: status = ${r.data.authorization_status}`);
    assert(r.data.ed25519_signed === true, "Authorize: Ed25519 signed = true");
    assert(r.data.authorization_hash, "Authorize: authorization_hash present");
  }

  // 7e: Execute
  console.log("  7e: Execute");
  let executionToken = "";
  {
    const r = await post(`/api/v1/intents/${INTENT_ID}/execute`, {}, { "X-API-Key": API_KEY });
    assert(r.status === 200, `Execute: status ${r.status} === 200`);
    assert(r.data.status === "execute_now", `Execute: status = ${r.data.status}`);
    assert(r.data.execution_token?.execution_token, "Execute: execution_token present");
    executionToken = r.data.execution_token.execution_token;
  }

  // 7f: Confirm execution
  console.log("  7f: Confirm execution");
  {
    const r = await post(
      `/api/v1/intents/${INTENT_ID}/confirm`,
      {
        execution_result: "Email sent successfully to test@example.com",
        connector: "gmail-oauth2",
        execution_token: executionToken,
      },
      { "X-API-Key": API_KEY }
    );
    assert(r.status === 200, `Confirm: status ${r.status} === 200`);
    assert(r.data.status === "executed", `Confirm: status = ${r.data.status}`);
    assert(r.data.execution_hash, "Confirm: execution_hash present");
  }

  // 7g: Generate receipt
  console.log("  7g: Generate receipt");
  {
    const r = await post(`/api/v1/intents/${INTENT_ID}/receipt`, {}, { "X-API-Key": API_KEY });
    assert(r.status === 200, `Receipt: status ${r.status} === 200`);
    assert(r.data.receipt_id, `Receipt: receipt_id = ${r.data.receipt_id}`);
    assert(r.data.hash_chain?.receipt_hash, "Receipt: receipt_hash present");
    assert(r.data.identity_binding?.ed25519_signed === true, "Receipt: identity_binding.ed25519_signed = true");
    assert(r.data.identity_binding?.signer_public_key_hex, "Receipt: signer_public_key_hex present");
  }

  // ---- Step 8: Ledger via API v1 ----
  console.log("\n--- Step 8: Ledger & Verification via API v1 ---");
  {
    const r = await get(`/api/v1/ledger?intent_id=${INTENT_ID}`, { "X-API-Key": API_KEY });
    assert(r.status === 200, `Ledger by intent: status ${r.status} === 200`);
    assert(r.data.entries?.length >= 5, `Ledger entries for intent: ${r.data.entries?.length} >= 5`);
  }
  {
    const r = await get("/api/v1/verify", { "X-API-Key": API_KEY });
    assert(r.status === 200, `Verify chain: status ${r.status} === 200`);
    assert(r.data.ledger_chain_verification?.valid === true, "Verify chain: valid = true");
  }

  // ---- Step 9: OpenAPI docs ----
  console.log("\n--- Step 9: OpenAPI Documentation ---");
  {
    const r = await get("/api/v1/docs");
    assert(r.status === 200, `OpenAPI docs: status ${r.status} === 200`);
    assert(r.data.openapi === "3.0.3", `OpenAPI version: ${r.data.openapi}`);
    assert(r.data.info?.title === "RIO Governance Gateway API", "OpenAPI title correct");
    assert(Object.keys(r.data.paths || {}).length >= 10, `OpenAPI paths: ${Object.keys(r.data.paths || {}).length} >= 10`);
    assert(r.data.components?.securitySchemes?.ApiKeyAuth, "OpenAPI: ApiKeyAuth scheme present");
    assert(r.data.components?.securitySchemes?.BearerAuth, "OpenAPI: BearerAuth scheme present");
  }

  // ---- Step 10: Revoke API key and verify fail-closed ----
  console.log("\n--- Step 10: Key Revocation & Fail-Closed ---");
  {
    const r = await del(`/api/v1/keys/${READ_ONLY_KEY_ID}`, { Authorization: `Bearer ${TOKEN}` });
    assert(r.status === 200, `Revoke key: status ${r.status} === 200`);
    assert(r.data.revoked === true, "Revoke key: revoked = true");
  }
  {
    // Revoked key should be rejected
    const r = await get("/api/v1/intents", { "X-API-Key": READ_ONLY_KEY });
    assert(r.status === 401, `Revoked key rejected: status ${r.status} === 401`);
  }

  // ---- Step 11: Fail-closed — execute without authorization ----
  console.log("\n--- Step 11: Fail-Closed Verification ---");
  {
    // Submit a new intent and try to execute without authorization
    const r1 = await post(
      "/api/v1/intents",
      {
        identity: { subject: "MANUS", auth_method: "api_key", role: "agent" },
        intent: { action: "delete_data", target: "staging", parameters: {} },
        context: { reason: "Unauthorized test" },
        confidence: 95,
      },
      { "X-API-Key": API_KEY }
    );
    assert(r1.status === 201, `Submit rogue intent: status ${r1.status} === 201`);
    const rogueId = r1.data.intent_id;

    // Try to execute without governance
    const r2 = await post(`/api/v1/intents/${rogueId}/execute`, {}, { "X-API-Key": API_KEY });
    assert(r2.status === 403 || r2.status === 409, `Execute without governance: blocked (${r2.status})`);
  }

  // ---- Summary ----
  console.log("\n" + "=".repeat(60));
  console.log(`  RESULTS: ${passed} PASSED / ${failed} FAILED / ${passed + failed} TOTAL`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
