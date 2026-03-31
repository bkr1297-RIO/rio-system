/**
 * RIO Gateway — Identity Binding (WS-010) End-to-End Test
 *
 * Tests the full identity binding flow:
 *   1. Login to get JWT
 *   2. Generate keypair via API (private key returned once)
 *   3. List signers (verify registration)
 *   4. Submit intent → govern → authorize with Ed25519 signature
 *   5. Execute → confirm → receipt (verify identity_binding in receipt)
 *   6. Test unsigned authorization rejection (ed25519_mode=required)
 *   7. Test invalid signature rejection
 *   8. Test unregistered signer rejection
 *   9. Register external public key
 *  10. Revoke signer
 */
import { randomUUID } from "node:crypto";

// Import Ed25519 helpers for signing
let nacl;
try {
  nacl = (await import("tweetnacl")).default;
} catch {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  nacl = require("tweetnacl");
}

const BASE = process.env.TEST_URL || "http://localhost:4400";
let TOKEN = "";
let SIGNER_SECRET_KEY = "";
let SIGNER_PUBLIC_KEY = "";
const SIGNER_ID = "brian.k.rasmussen";

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Add replay prevention fields to body (middleware reads from req.body)
  const bodyWithReplay = {
    ...body,
    request_timestamp: new Date().toISOString(),
    request_nonce: randomUUID(),
  };
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyWithReplay),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path, token) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  return { status: res.status, data: await res.json() };
}

async function del(path, token) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  headers["X-Request-Timestamp"] = new Date().toISOString();
  headers["X-Request-Nonce"] = randomUUID();
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers });
  return { status: res.status, data: await res.json() };
}

function buildSignaturePayload({ intent_id, action, decision, signer_id, timestamp }) {
  return JSON.stringify({ intent_id, action, decision, signer_id, timestamp });
}

function signPayload(payload, secretKeyHex) {
  const secretKey = Buffer.from(secretKeyHex, "hex");
  const message = Buffer.from(payload, "utf-8");
  const signature = nacl.sign.detached(message, secretKey);
  return Buffer.from(signature).toString("hex");
}

async function run() {
  console.log("=".repeat(60));
  console.log("  RIO Identity Binding (WS-010) — End-to-End Test");
  console.log("=".repeat(60));
  console.log();

  // ---------------------------------------------------------------
  // 1. Login
  // ---------------------------------------------------------------
  console.log("--- Step 1: Login ---");
  const login = await post("/login", {
    user_id: "brian.k.rasmussen",
    passphrase: "rio-governed-2026",
  });
  assert(login.status === 200, "Login returns 200");
  assert(login.data.token, "JWT token received");
  TOKEN = login.data.token;

  // ---------------------------------------------------------------
  // 2. Generate keypair via API
  // ---------------------------------------------------------------
  console.log("\n--- Step 2: Generate Keypair via API ---");
  const keygen = await post(
    "/api/signers/generate-keypair",
    {
      signer_id: SIGNER_ID,
      display_name: "Brian K. Rasmussen",
      role: "owner",
    },
    TOKEN
  );
  assert(keygen.status === 201, "Keypair generation returns 201");
  assert(keygen.data.public_key_hex, "Public key returned");
  assert(keygen.data.secret_key_hex, "Secret key returned (one-time)");
  assert(keygen.data._warning, "Warning about saving private key");
  SIGNER_SECRET_KEY = keygen.data.secret_key_hex;
  SIGNER_PUBLIC_KEY = keygen.data.public_key_hex;
  console.log(`  Public key: ${SIGNER_PUBLIC_KEY.substring(0, 16)}...`);

  // ---------------------------------------------------------------
  // 2b. Verify duplicate registration is rejected
  // ---------------------------------------------------------------
  console.log("\n--- Step 2b: Duplicate Registration Rejection ---");
  const dupKeygen = await post(
    "/api/signers/generate-keypair",
    { signer_id: SIGNER_ID, display_name: "Duplicate" },
    TOKEN
  );
  assert(dupKeygen.status === 409, "Duplicate keypair generation returns 409");

  // ---------------------------------------------------------------
  // 3. List signers
  // ---------------------------------------------------------------
  console.log("\n--- Step 3: List Signers ---");
  const signers = await get("/api/signers", TOKEN);
  assert(signers.status === 200, "List signers returns 200");
  assert(signers.data.count >= 1, `Signer count >= 1 (got ${signers.data.count})`);
  const brianSigner = signers.data.signers.find((s) => s.signer_id === SIGNER_ID);
  assert(brianSigner, "Brian found in signer list");
  assert(brianSigner?.public_key_hex === SIGNER_PUBLIC_KEY, "Public key matches");

  // ---------------------------------------------------------------
  // 4. Submit intent
  // ---------------------------------------------------------------
  console.log("\n--- Step 4: Submit Intent ---");
  const intent = await post(
    "/intent",
    {
      identity: {
        subject: "MANUS",
        auth_method: "jwt_session",
        on_behalf_of: "brian.k.rasmussen",
      },
      intent: {
        action: "send_email",
        target: "production",
        parameters: { to: "test@example.com", subject: "WS-010 Test", body: "Identity binding test" },
      },
      context: {
        reason: "Testing identity binding flow",
        urgency: "low",
      },
    },
    TOKEN
  );
  assert(intent.status === 201, "Intent submitted (201)");
  const INTENT_ID = intent.data.intent_id;
  console.log(`  Intent ID: ${INTENT_ID}`);

  // ---------------------------------------------------------------
  // 5. Govern
  // ---------------------------------------------------------------
  console.log("\n--- Step 5: Govern ---");
  const govern = await post("/govern", { intent_id: INTENT_ID }, TOKEN);
  assert(govern.status === 200, "Governance evaluation returns 200");
  console.log(`  Governance status: ${govern.data.governance_status}`);

  // ---------------------------------------------------------------
  // 6. Authorize with Ed25519 signature
  // ---------------------------------------------------------------
  console.log("\n--- Step 6: Authorize with Ed25519 Signature ---");
  const sigTimestamp = new Date().toISOString();
  const payload = buildSignaturePayload({
    intent_id: INTENT_ID,
    action: "send_email",
    decision: "approved",
    signer_id: SIGNER_ID,
    timestamp: sigTimestamp,
  });
  const signature = signPayload(payload, SIGNER_SECRET_KEY);

  const auth = await post(
    "/authorize",
    {
      intent_id: INTENT_ID,
      decision: "approved",
      authorized_by: SIGNER_ID,
      signature,
      signature_timestamp: sigTimestamp,
    },
    TOKEN
  );
  assert(auth.status === 200, "Authorization returns 200");
  assert(auth.data.ed25519_signed === true, "Ed25519 signature verified");
  assert(auth.data.authorization_status === "authorized", "Status is authorized");

  // ---------------------------------------------------------------
  // 7. Execute
  // ---------------------------------------------------------------
  console.log("\n--- Step 7: Execute ---");
  const exec = await post("/execute", { intent_id: INTENT_ID }, TOKEN);
  assert(exec.status === 200, "Execution token issued (200)");
  const execToken = exec.data.execution_token?.execution_token;
  assert(execToken, "Execution token received");

  // ---------------------------------------------------------------
  // 8. Execute-confirm
  // ---------------------------------------------------------------
  console.log("\n--- Step 8: Execute-confirm ---");
  const confirm = await post(
    "/execute-confirm",
    {
      intent_id: INTENT_ID,
      execution_result: "Email sent to test@example.com",
      connector: "gmail-oauth2",
      execution_token: execToken,
    },
    TOKEN
  );
  assert(confirm.status === 200, "Execution confirmed (200)");

  // ---------------------------------------------------------------
  // 9. Receipt — verify identity_binding
  // ---------------------------------------------------------------
  console.log("\n--- Step 9: Receipt with Identity Binding ---");
  const receipt = await post("/receipt", { intent_id: INTENT_ID }, TOKEN);
  assert(receipt.status === 200, "Receipt generated (200)");
  assert(receipt.data.identity_binding, "identity_binding field present in receipt");
  assert(
    receipt.data.identity_binding?.ed25519_signed === true,
    "Receipt shows ed25519_signed=true"
  );
  assert(
    receipt.data.identity_binding?.signer_id === SIGNER_ID,
    "Receipt shows correct signer_id"
  );
  assert(
    receipt.data.identity_binding?.signer_public_key_hex === SIGNER_PUBLIC_KEY,
    "Receipt includes signer public key"
  );
  assert(
    receipt.data.identity_binding?.signature_payload_hash,
    "Receipt includes signature_payload_hash"
  );

  // ---------------------------------------------------------------
  // 10. Test unsigned authorization rejection (ed25519_mode=required)
  // ---------------------------------------------------------------
  console.log("\n--- Step 10: Unsigned Authorization Rejection ---");
  // Submit a new intent for this test
  const intent2 = await post(
    "/intent",
    {
      identity: { subject: "MANUS", auth_method: "jwt_session" },
      intent: { action: "send_email", target: "production", parameters: { to: "test2@example.com" } },
      context: { reason: "Test unsigned rejection" },
    },
    TOKEN
  );
  const INTENT_ID_2 = intent2.data.intent_id;
  await post("/govern", { intent_id: INTENT_ID_2 }, TOKEN);

  const unsignedAuth = await post(
    "/authorize",
    {
      intent_id: INTENT_ID_2,
      decision: "approved",
      authorized_by: SIGNER_ID,
      // No signature!
    },
    TOKEN
  );
  assert(unsignedAuth.status === 400, "Unsigned authorization rejected (400)");
  assert(
    unsignedAuth.data.error?.includes("required"),
    "Error mentions signature required"
  );

  // ---------------------------------------------------------------
  // 11. Test invalid signature rejection
  // ---------------------------------------------------------------
  console.log("\n--- Step 11: Invalid Signature Rejection ---");
  const intent3 = await post(
    "/intent",
    {
      identity: { subject: "MANUS", auth_method: "jwt_session" },
      intent: { action: "send_email", target: "production", parameters: { to: "test3@example.com" } },
      context: { reason: "Test invalid signature" },
    },
    TOKEN
  );
  const INTENT_ID_3 = intent3.data.intent_id;
  await post("/govern", { intent_id: INTENT_ID_3 }, TOKEN);

  const badSigAuth = await post(
    "/authorize",
    {
      intent_id: INTENT_ID_3,
      decision: "approved",
      authorized_by: SIGNER_ID,
      signature: "a".repeat(128), // Invalid signature
      signature_timestamp: new Date().toISOString(),
    },
    TOKEN
  );
  assert(badSigAuth.status === 403, "Invalid signature rejected (403)");
  assert(
    badSigAuth.data.reason?.includes("verification failed"),
    "Error mentions verification failed"
  );

  // ---------------------------------------------------------------
  // 12. Test unregistered signer rejection
  // ---------------------------------------------------------------
  console.log("\n--- Step 12: Unregistered Signer Rejection ---");
  const intent4 = await post(
    "/intent",
    {
      identity: { subject: "MANUS", auth_method: "jwt_session" },
      intent: { action: "send_email", target: "production", parameters: { to: "test4@example.com" } },
      context: { reason: "Test unregistered signer" },
    },
    TOKEN
  );
  const INTENT_ID_4 = intent4.data.intent_id;
  await post("/govern", { intent_id: INTENT_ID_4 }, TOKEN);

  const unregAuth = await post(
    "/authorize",
    {
      intent_id: INTENT_ID_4,
      decision: "approved",
      authorized_by: "unknown.signer",
      signature: "a".repeat(128),
      signature_timestamp: new Date().toISOString(),
    },
    TOKEN
  );
  assert(unregAuth.status === 403, "Unregistered signer rejected (403)");
  assert(
    unregAuth.data.error?.includes("No registered public key"),
    "Error mentions no registered public key"
  );

  // ---------------------------------------------------------------
  // 13. Register external public key
  // ---------------------------------------------------------------
  console.log("\n--- Step 13: Register External Public Key ---");
  // Generate a keypair locally (simulating offline generation)
  const extPair = nacl.sign.keyPair();
  const extPubHex = Buffer.from(extPair.publicKey).toString("hex");

  const extReg = await post(
    "/api/signers/register",
    {
      signer_id: "auditor.external",
      public_key_hex: extPubHex,
      display_name: "External Auditor",
      role: "auditor",
    },
    TOKEN
  );
  assert(extReg.status === 201, "External key registration returns 201");
  assert(extReg.data.public_key_hex === extPubHex, "Stored public key matches");

  // Verify it appears in the list
  const signers2 = await get("/api/signers", TOKEN);
  assert(signers2.data.count >= 2, `Signer count >= 2 (got ${signers2.data.count})`);

  // ---------------------------------------------------------------
  // 14. Revoke signer
  // ---------------------------------------------------------------
  console.log("\n--- Step 14: Revoke Signer ---");
  const revoke = await del("/api/signers/auditor.external", TOKEN);
  assert(revoke.status === 200, "Signer revoked (200)");
  assert(revoke.data.status === "revoked", "Status is revoked");

  // Verify removed from list
  const signers3 = await get("/api/signers", TOKEN);
  const revokedSigner = signers3.data.signers.find(
    (s) => s.signer_id === "auditor.external"
  );
  assert(!revokedSigner, "Revoked signer no longer in list");

  // ---------------------------------------------------------------
  // 15. Verify ledger integrity
  // ---------------------------------------------------------------
  console.log("\n--- Step 15: Verify Ledger Integrity ---");
  const ledger = await get("/ledger", TOKEN);
  assert(ledger.status === 200, "Ledger accessible");
  assert(ledger.data.total > 0, `Ledger has ${ledger.data.total} entries`);

  const verify = await get("/verify", TOKEN);
  assert(verify.status === 200, "Verification endpoint accessible");
  assert(
    verify.data.ledger_chain_verification?.valid === true,
    "Ledger hash chain is valid"
  );

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log();
  console.log("=".repeat(60));
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED (${passed + failed} total)`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
