/**
 * RIO Gateway — Full End-to-End Pipeline Test
 * Tests: Login → Intent → Govern → Ed25519 Signed Authorize → Execute → Receipt → Verify
 * With PostgreSQL ledger persistence verification.
 */
import { readFileSync } from "node:fs";

const nacl = (await import("tweetnacl")).default;

const BASE = "http://localhost:4400";
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"} — ${name}${detail ? ": " + detail : ""}`);
}

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}

async function get(path, token) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  return { status: res.status, data: await res.json() };
}

function signPayload(payload, secretKeyHex) {
  const sk = Buffer.from(secretKeyHex, "hex");
  const msg = Buffer.from(payload, "utf-8");
  const sig = nacl.sign.detached(msg, sk);
  return Buffer.from(sig).toString("hex");
}

// Load Brian's keys
const secretKey = readFileSync("/home/ubuntu/rio-system/gateway/data/keys/brian.k.rasmussen.sec.hex", "utf-8").trim();

console.log("============================================================");
console.log("  RIO GATEWAY — FULL END-TO-END PIPELINE TEST");
console.log("  PostgreSQL + Ed25519 + JWT Auth");
console.log("============================================================\n");

// -----------------------------------------------------------------------
// 1. LOGIN
// -----------------------------------------------------------------------
console.log("--- Step 1: Login ---");
const login = await post("/login", { user_id: "brian.k.rasmussen", passphrase: "rio-governed-2026" });
record("Login returns 200", login.status === 200, `status=${login.status}`);
record("Login returns token", !!login.data.token, `token=${login.data.token?.substring(0, 20)}...`);
record("Login returns role=owner", login.data.role === "owner");
const TOKEN = login.data.token;

// -----------------------------------------------------------------------
// 2. WHOAMI
// -----------------------------------------------------------------------
console.log("\n--- Step 2: Whoami ---");
const whoami = await get("/whoami", TOKEN);
record("Whoami authenticated", whoami.data.authenticated === true);
record("Whoami user_id correct", whoami.data.user_id === "brian.k.rasmussen");

// -----------------------------------------------------------------------
// 3. SUBMIT INTENT
// -----------------------------------------------------------------------
console.log("\n--- Step 3: Submit Intent ---");
const intent = await post("/intent", {
  action: "send_email",
  agent_id: "MANUS",
  description: "Full pipeline test with all v2.1 features",
  parameters: { to: "test@example.com", subject: "Pipeline Test" },
  confidence: 95,
}, TOKEN);
record("Intent returns 201", intent.status === 201);
record("Intent has ID", !!intent.data.intent_id);
record("Intent has hash", !!intent.data.intent_hash);
const INTENT_ID = intent.data.intent_id;
console.log(`  Intent ID: ${INTENT_ID}`);

// -----------------------------------------------------------------------
// 4. GOVERN
// -----------------------------------------------------------------------
console.log("\n--- Step 4: Govern ---");
const govern = await post("/govern", { intent_id: INTENT_ID }, TOKEN);
record("Govern returns 200", govern.status === 200);
record("Govern requires approval", govern.data.requires_approval === true);
record("Govern risk=high", govern.data.risk_level === "high");

// -----------------------------------------------------------------------
// 5. AUTHORIZE (Ed25519 Signed)
// -----------------------------------------------------------------------
console.log("\n--- Step 5: Authorize (Ed25519 Signed) ---");
const sigTimestamp = new Date().toISOString();
const payload = JSON.stringify({
  intent_id: INTENT_ID,
  action: "send_email",
  decision: "approved",
  signer_id: "brian.k.rasmussen",
  timestamp: sigTimestamp,
});
const signature = signPayload(payload, secretKey);

const auth = await post("/authorize", {
  intent_id: INTENT_ID,
  decision: "approved",
  authorized_by: "brian.k.rasmussen",
  signature,
  signature_timestamp: sigTimestamp,
}, TOKEN);
record("Authorize returns 200", auth.status === 200);
record("Ed25519 signed=true", auth.data.ed25519_signed === true);
record("Auth status=authorized", auth.data.authorization_status === "authorized");

// -----------------------------------------------------------------------
// 6. EXECUTE (get token)
// -----------------------------------------------------------------------
console.log("\n--- Step 6: Execute (get token) ---");
const exec = await post("/execute", { intent_id: INTENT_ID }, TOKEN);
record("Execute returns 200", exec.status === 200);
record("Execute status=execute_now", exec.data.status === "execute_now");
record("Execute has authorization_hash", !!exec.data.execution_token?.authorization_hash);

// -----------------------------------------------------------------------
// 7. EXECUTE-CONFIRM
// -----------------------------------------------------------------------
console.log("\n--- Step 7: Execute-Confirm ---");
const confirm = await post("/execute-confirm", {
  intent_id: INTENT_ID,
  execution_result: {
    status: "completed",
    provider: "test_provider",
    message_id: "test-msg-001",
  },
}, TOKEN);
record("Confirm returns 200", confirm.status === 200);
record("Confirm status=executed", confirm.data.status === "executed");

// -----------------------------------------------------------------------
// 8. RECEIPT
// -----------------------------------------------------------------------
console.log("\n--- Step 8: Generate Receipt ---");
const receipt = await post("/receipt", { intent_id: INTENT_ID }, TOKEN);
record("Receipt returns 200", receipt.status === 200);
record("Receipt has receipt_id", !!receipt.data.receipt_id);
record("Receipt has 5-hash chain", receipt.data.hash_chain && Object.keys(receipt.data.hash_chain).length === 5);

// -----------------------------------------------------------------------
// 9. VERIFY
// -----------------------------------------------------------------------
console.log("\n--- Step 9: Verify ---");
const verify = await get(`/verify?intent_id=${INTENT_ID}`, TOKEN);
record("Verify receipt valid", verify.data.receipt_verification?.valid === true);
record("Verify chain valid", verify.data.ledger_chain_verification?.valid === true);
record("Hashes match", verify.data.receipt_verification?.computed_hash === verify.data.receipt_verification?.stored_hash);

// -----------------------------------------------------------------------
// 10. FAIL-CLOSED TEST (invalid signature)
// -----------------------------------------------------------------------
console.log("\n--- Step 10: Fail-Closed Test (invalid signature) ---");
const intent2 = await post("/intent", {
  action: "delete_file",
  agent_id: "MANUS",
  description: "This should be blocked by invalid signature",
  parameters: { path: "/important/file.txt" },
  confidence: 90,
});
await post("/govern", { intent_id: intent2.data.intent_id });
const badAuth = await post("/authorize", {
  intent_id: intent2.data.intent_id,
  decision: "approved",
  authorized_by: "brian.k.rasmussen",
  signature: "0".repeat(128),
  signature_timestamp: new Date().toISOString(),
});
record("Invalid sig returns 403", badAuth.status === 403);
record("Invalid sig blocked", badAuth.data.status === "blocked");

// -----------------------------------------------------------------------
// 11. FAIL-CLOSED TEST (unauthorized execute)
// -----------------------------------------------------------------------
console.log("\n--- Step 11: Fail-Closed Test (unauthorized execute) ---");
const intent3 = await post("/intent", {
  action: "send_email",
  agent_id: "MANUS",
  description: "Try to execute without authorization",
  parameters: {},
  confidence: 95,
});
await post("/govern", { intent_id: intent3.data.intent_id });
// Skip authorize — go straight to execute
const blockedExec = await post("/execute", { intent_id: intent3.data.intent_id });
record("Unauthorized exec returns 403", blockedExec.status === 403);
record("Unauthorized exec blocked", blockedExec.data.status === "blocked");

// -----------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------
console.log("\n============================================================");
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${results.length} total`);
if (failed === 0) {
  console.log("  ALL TESTS PASSED");
} else {
  console.log("  FAILURES:");
  results.filter(r => !r.pass).forEach(r => console.log(`    - ${r.name}: ${r.detail}`));
}
console.log("============================================================");
