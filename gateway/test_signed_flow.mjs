/**
 * RIO Signed Authorization Flow — End-to-End Verification
 *
 * Tests the full pipeline with Ed25519 signed authorization:
 * 1. Login → JWT
 * 2. Register signer (brian-sovereign) with known public key
 * 3. Submit intent (send_email, agent brian.k.rasmussen)
 * 4. Govern intent → should pass (agent now recognized in policy v1.1)
 * 5. Authorize with Ed25519 signature → should pass
 * 6. Execute → get execution token
 * 7. Confirm execution
 * 8. Generate receipt → should include identity_binding
 * 9. Verify unsigned authorization is REJECTED (ed25519_mode=required)
 */
import nacl from "tweetnacl";
import { createHash, randomUUID } from "node:crypto";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4400";

// Brian's sovereign keypair — the public key matches what's registered on production
const BRIAN_PUBLIC_KEY = "721b260779007c8292851832ffd5cf692fe31532643a1f9089193745a9135903";
// These will be set by the keypair generation endpoint
let TEST_PUBLIC_KEY = "";
let TEST_SECRET_KEY = "";

let TOKEN = "";
let INTENT_ID = "";
let pass = 0;
let fail = 0;

function assert(condition, label) {
  if (condition) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ FAIL: ${label}`); }
}

function replayFields() {
  return {
    request_timestamp: new Date().toISOString(),
    request_nonce: randomUUID(),
  };
}

/**
 * Sign a payload matching the gateway's buildSignaturePayload + signPayload format.
 * The gateway builds a canonical JSON string and signs it as UTF-8 bytes.
 */
function signForGateway({ intent_id, action, decision, signer_id, timestamp }, secretKeyHex) {
  const payload = JSON.stringify({ intent_id, action, decision, signer_id, timestamp });
  const secretKey = Buffer.from(secretKeyHex, "hex");
  const message = Buffer.from(payload, "utf-8");
  const signatureBytes = nacl.sign.detached(message, secretKey);
  return Buffer.from(signatureBytes).toString("hex");
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({ ...body, ...replayFields() }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function run() {
  console.log("=== RIO Signed Authorization Flow — E2E Verification ===\n");
  console.log(`Target: ${BASE}`);
  console.log(`Ed25519 Mode: required\n`);

  // ---------------------------------------------------------------
  // Step 1: Login
  // ---------------------------------------------------------------
  console.log("--- Step 1: Login ---");
  const login = await post("/login", {
    user_id: "brian.k.rasmussen",
    passphrase: "rio-governed-2026",
  });
  assert(login.status === 200, `Login returned 200 (got ${login.status})`);
  assert(login.data.token, "JWT token received");
  assert(login.data.role === "owner", `Role is owner (got ${login.data.role})`);
  TOKEN = login.data.token;

  // ---------------------------------------------------------------
  // Step 2: Generate keypair via API and register signer
  // ---------------------------------------------------------------
  console.log("\n--- Step 2: Generate Keypair & Register Signer ---");
  const genKeypair = await post("/api/signers/generate-keypair", {
    signer_id: "brian-sovereign-test",
    display_name: "Brian K. Rasmussen (Test Keypair)",
    role: "owner",
  });
  if (genKeypair.status === 201) {
    TEST_SECRET_KEY = genKeypair.data.secret_key_hex;
    TEST_PUBLIC_KEY = genKeypair.data.public_key_hex;
    assert(true, `Keypair generated and signer registered (status ${genKeypair.status})`);
    assert(genKeypair.data.signer_id === "brian-sovereign-test", "Signer ID matches");
  } else if (genKeypair.status === 409) {
    // Signer already exists — we can't get the private key again
    // This means we need a clean DB. Flag it.
    assert(false, `Signer already exists (409) — need clean DB for fresh test`);
    console.log("  ⚠️  Cannot proceed without the private key. Restart with clean DB.");
    process.exit(1);
  } else {
    assert(false, `Keypair generation failed (status ${genKeypair.status}): ${JSON.stringify(genKeypair.data)}`);
    process.exit(1);
  }
  console.log(`  Public key: ${TEST_PUBLIC_KEY.substring(0, 16)}...`);

  // ---------------------------------------------------------------
  // Step 3: Submit Intent
  // ---------------------------------------------------------------
  console.log("\n--- Step 3: Submit Intent ---");
  const intent = await post("/intent", {
    action: "send_email",
    agent_id: "brian.k.rasmussen",
    target_environment: "staging",
    confidence: 95,
    parameters: {
      to: "brian@rasmussen.dev",
      subject: "RIO Signed Authorization Test",
      body: "First signed governed action through the RIO gateway.",
    },
  });
  assert(intent.status === 201, `Intent submitted (status ${intent.status})`);
  INTENT_ID = intent.data.intent_id;
  assert(INTENT_ID, `Intent ID: ${INTENT_ID}`);
  assert(intent.data.intent_hash, `Intent hash: ${intent.data.intent_hash?.substring(0, 16)}...`);
  console.log(`  Agent ID resolved to: ${intent.data.agent_id}`);

  // ---------------------------------------------------------------
  // Step 4: Govern Intent
  // ---------------------------------------------------------------
  console.log("\n--- Step 4: Govern Intent ---");
  const govern = await post("/govern", { intent_id: INTENT_ID });
  assert(govern.status === 200, `Governance returned 200 (got ${govern.status})`);
  assert(govern.data.governance_status !== "blocked",
    `Governance NOT blocked (got ${govern.data.governance_status})`);
  assert(govern.data.requires_approval === true, "Requires human approval");

  // Check individual governance checks
  const checks = govern.data.checks || [];
  const agentCheck = checks.find(c => c.check === "agent_recognized");
  assert(agentCheck?.passed === true,
    `Agent recognized: ${agentCheck?.passed} (agent: ${agentCheck?.agent})`);
  const envCheck = checks.find(c => c.check === "environment_valid");
  assert(envCheck?.passed === true,
    `Environment valid: ${envCheck?.passed} (env: ${envCheck?.environment})`);
  const confCheck = checks.find(c => c.check === "confidence_threshold");
  assert(confCheck?.passed === true,
    `Confidence passed: ${confCheck?.passed} (${confCheck?.confidence}/${confCheck?.threshold})`);

  console.log(`  Risk level: ${govern.data.risk_level}`);
  console.log(`  Governance hash: ${govern.data.governance_hash?.substring(0, 16)}...`);

  // ---------------------------------------------------------------
  // Step 5: Authorize with Ed25519 Signature
  // ---------------------------------------------------------------
  console.log("\n--- Step 5: Authorize (Ed25519 Signed) ---");
  const sigTimestamp = new Date().toISOString();
  const signature = signForGateway({
    intent_id: INTENT_ID,
    action: "send_email",
    decision: "approved",
    signer_id: "brian-sovereign-test",
    timestamp: sigTimestamp,
  }, TEST_SECRET_KEY);
  const authorize = await post("/authorize", {
    intent_id: INTENT_ID,
    decision: "approved",
    authorized_by: "brian.k.rasmussen",
    signer_id: "brian-sovereign-test",
    signature: signature,
    signature_timestamp: sigTimestamp,
    reason: "First signed governed action — verifying Ed25519 flow",
  });
  assert(authorize.status === 200, `Authorization returned 200 (got ${authorize.status})`);
  assert(authorize.data.status === "authorized",
    `Status is authorized (got ${authorize.data.status})`);
  assert(authorize.data.authorization_hash,
    `Authorization hash: ${authorize.data.authorization_hash?.substring(0, 16)}...`);
  assert(authorize.data.signature_verified === true, "Signature verified");
  console.log(`  Signature payload hash: ${authorize.data.signature_payload_hash?.substring(0, 16)}...`);

  // ---------------------------------------------------------------
  // Step 6: Execute
  // ---------------------------------------------------------------
  console.log("\n--- Step 6: Execute ---");
  const execute = await post("/execute", { intent_id: INTENT_ID });
  assert(execute.status === 200, `Execute returned 200 (got ${execute.status})`);
  const execTokenObj = execute.data.execution_token;
  const execToken = execTokenObj?.execution_token || execTokenObj;
  assert(execToken, `Execution token received: ${typeof execToken === 'string' ? execToken.substring(0, 16) + '...' : JSON.stringify(execToken).substring(0, 40)}`);

  // ---------------------------------------------------------------
  // Step 7: Confirm Execution
  // ---------------------------------------------------------------
  console.log("\n--- Step 7: Confirm Execution ---");
  const confirm = await post("/execute-confirm", {
    intent_id: INTENT_ID,
    execution_token: execToken,
    execution_result: {
      status: "simulated",
      connector: "gmail-oauth2",
      detail: "Test — email not actually sent",
    },
    connector: "gmail-oauth2",
  });
  assert(confirm.status === 200, `Confirm returned 200 (got ${confirm.status})`);
  assert(confirm.data.execution_hash,
    `Execution hash: ${confirm.data.execution_hash?.substring(0, 16)}...`);

  // ---------------------------------------------------------------
  // Step 8: Generate Receipt
  // ---------------------------------------------------------------
  console.log("\n--- Step 8: Generate Receipt ---");
  const receipt = await post("/receipt", { intent_id: INTENT_ID });
  assert(receipt.status === 200, `Receipt returned 200 (got ${receipt.status})`);
  assert(receipt.data.receipt_hash,
    `Receipt hash: ${receipt.data.receipt_hash?.substring(0, 16)}...`);

  // Check identity_binding in receipt
  const binding = receipt.data.identity_binding;
  assert(binding, "Receipt includes identity_binding");
  if (binding) {
    assert(binding.signer_id === "brian-sovereign-test",
      `Signer ID in receipt: ${binding.signer_id}`);
    assert(binding.public_key === TEST_PUBLIC_KEY,
      `Public key in receipt matches`);
    assert(binding.signature_payload_hash,
      `Signature payload hash in receipt: ${binding.signature_payload_hash?.substring(0, 16)}...`);
    assert(binding.verification_method === "Ed25519",
      `Verification method: ${binding.verification_method}`);
  }

  // ---------------------------------------------------------------
  // Step 9: Verify unsigned authorization is REJECTED
  // ---------------------------------------------------------------
  console.log("\n--- Step 9: Unsigned Authorization Rejection (ed25519_mode=required) ---");
  // Submit a second intent
  const intent2 = await post("/intent", {
    action: "send_email",
    agent_id: "brian.k.rasmussen",
    target_environment: "staging",
    confidence: 95,
    parameters: { to: "test@example.com", subject: "Unsigned test", body: "Should be rejected" },
  });
  assert(intent2.status === 201, `Second intent submitted (status ${intent2.status})`);
  const INTENT2_ID = intent2.data.intent_id;

  // Govern it
  const govern2 = await post("/govern", { intent_id: INTENT2_ID });
  assert(govern2.status === 200, `Second intent governed (status ${govern2.status})`);

  // Try to authorize WITHOUT signature
  const unsignedAuth = await post("/authorize", {
    intent_id: INTENT2_ID,
    decision: "approved",
    authorized_by: "brian.k.rasmussen",
    // No signer_id, no signature
    reason: "Attempting unsigned authorization — should be rejected",
  });
  assert(unsignedAuth.status === 400,
    `Unsigned auth REJECTED with 400 (got ${unsignedAuth.status})`);
  assert(unsignedAuth.data.error?.includes("Ed25519") || unsignedAuth.data.error?.includes("signature"),
    `Error mentions Ed25519/signature: ${unsignedAuth.data.error}`);

  // ---------------------------------------------------------------
  // Step 10: Verify Ledger Integrity
  // ---------------------------------------------------------------
  console.log("\n--- Step 10: Verify Ledger Integrity ---");
  const ledger = await get("/ledger");
  assert(ledger.status === 200, `Ledger returned 200`);
  const entries = ledger.data.entries || [];
  assert(entries.length >= 8, `Ledger has ${entries.length} entries (expected ≥8)`);

  const verify = await get("/verify");
  assert(verify.status === 200, `Verify returned 200`);
  assert(verify.data.valid === true, `Hash chain valid: ${verify.data.valid}`);

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULTS: ${pass} passed, ${fail} failed out of ${pass + fail} tests`);
  console.log(`${"=".repeat(60)}`);

  if (fail > 0) {
    console.log("\n⚠️  Some tests failed. Review output above.");
    process.exit(1);
  } else {
    console.log("\n✅ ALL TESTS PASSED — Signed authorization flow verified end-to-end.");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
