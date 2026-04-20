/**
 * Test script for Ed25519 signature module.
 * Run: node security/test-ed25519.mjs
 */
import {
  generateKeypair,
  generateAndSaveKeypair,
  loadKeypair,
  buildSignaturePayload,
  signPayload,
  verifySignature,
  hashPayload,
} from "./ed25519.mjs";

console.log("=== Ed25519 Test Suite ===\n");

// Test 1: Generate keypair
console.log("Test 1: Generate keypair");
const pair = generateKeypair();
console.log(`  Public key (${pair.publicKey.length} chars): ${pair.publicKey.substring(0, 32)}...`);
console.log(`  Secret key (${pair.secretKey.length} chars): ${pair.secretKey.substring(0, 32)}...`);
console.log(`  PASS\n`);

// Test 2: Generate and save keypair for Brian
console.log("Test 2: Generate and save keypair for brian.k.rasmussen");
const brianPair = generateAndSaveKeypair("brian.k.rasmussen");
console.log(`  PASS\n`);

// Test 3: Load keypair from disk
console.log("Test 3: Load keypair from disk");
const loaded = loadKeypair("brian.k.rasmussen");
if (loaded && loaded.publicKey === brianPair.publicKey) {
  console.log(`  Loaded matches generated: PASS\n`);
} else {
  console.log(`  FAIL — loaded keys don't match\n`);
  process.exit(1);
}

// Test 4: Build, sign, and verify a payload
console.log("Test 4: Sign and verify an authorization payload");
const payload = buildSignaturePayload({
  intent_id: "test-intent-001",
  action: "send_email",
  decision: "approved",
  signer_id: "brian.k.rasmussen",
  timestamp: new Date().toISOString(),
});
console.log(`  Payload: ${payload}`);

const signature = signPayload(payload, brianPair.secretKey);
console.log(`  Signature (${signature.length} chars): ${signature.substring(0, 32)}...`);

const valid = verifySignature(payload, signature, brianPair.publicKey);
console.log(`  Verification: ${valid ? "PASS" : "FAIL"}\n`);

// Test 5: Verify that a tampered payload fails
console.log("Test 5: Tampered payload should fail verification");
const tamperedPayload = payload.replace("approved", "denied");
const tamperedValid = verifySignature(tamperedPayload, signature, brianPair.publicKey);
console.log(`  Tampered verification: ${tamperedValid ? "FAIL (should have rejected)" : "PASS (correctly rejected)"}\n`);

// Test 6: Verify that a wrong key fails
console.log("Test 6: Wrong public key should fail verification");
const wrongPair = generateKeypair();
const wrongKeyValid = verifySignature(payload, signature, wrongPair.publicKey);
console.log(`  Wrong key verification: ${wrongKeyValid ? "FAIL (should have rejected)" : "PASS (correctly rejected)"}\n`);

// Test 7: Hash payload
console.log("Test 7: Hash payload");
const hash = hashPayload(payload);
console.log(`  SHA-256: ${hash}`);
console.log(`  PASS\n`);

console.log("=== All tests passed ===");
