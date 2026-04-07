# COS Audit: RIO Receipt Protocol — Developer Readiness

**Auditor:** COS (Chief of Staff)
**Date:** 2026-04-07
**Scope:** Cold-eyes developer readiness of `rio-receipt-protocol` repo
**Standard:** A capable engineer should be able to land on the repo and implement end-to-end without needing explanation.

---

## 1. What Is Immediately Clear and Usable

The protocol repo is in strong shape for a developer who wants to **use the receipt library locally**. The following all work as advertised:

**README onboarding.** The quick start section provides copy-paste Node.js and Python code that generates a receipt, verifies it, and appends it to a ledger. Both examples run without modification. The "4 function calls" framing is effective — a developer understands the integration surface immediately.

**Published packages.** `npm install rio-receipt-protocol` (v2.3.0) and `pip install rio-receipt-protocol` (v2.3.0) both work. Zero required dependencies in both languages. This is a real differentiator — no dependency tree to audit.

**Runnable examples.** Every example in the `examples/` directory executes cleanly:

| Example | What It Proves | Status |
|---------|---------------|--------|
| `basic-usage.mjs` | Proof-layer + governed receipt generation | Runs clean |
| `end-to-end.mjs` | Full 6-step lifecycle with signing and tamper detection | Runs clean |
| `end-to-end.py` | Same lifecycle in Python | Runs clean |
| `send_email_demo.mjs` | Domain-specific example (email action) | Runs clean |

**Sample data with CLI verification.** The sample receipts (`sample_receipt_valid.json`, `sample_receipt_governed.json`, `sample_receipt_invalid.json`) and sample ledger (`sample_ledger.json`) all verify correctly with the CLI tool:

```
$ rio-verify receipt examples/sample_receipt_valid.json     → ✓ Receipt hash VALID
$ rio-verify receipt examples/sample_receipt_governed.json  → ✓ Receipt hash VALID
$ rio-verify receipt examples/sample_receipt_invalid.json   → ✗ Receipt hash INVALID (tamper detected)
$ rio-verify chain examples/sample_ledger.json              → ✓ Chain VALID — 2 entries verified
```

**Conformance tests.** 44 Node.js tests and 29 Python tests all pass. The test suite covers receipt generation, hash integrity, ledger operations, cross-verification, batch verification, mixed receipt types, Ed25519 signing, and identity enrichment.

**Breadcrumbing (MVP vs. extension).** The separation between proof-layer (3-hash, no governance) and governed (5-hash, with human approval) is clearly explained throughout. The README, examples, and spec all reinforce that governance is optional. A developer knows what's required vs. what's an extension.

**Architecture positioning.** The Mermaid diagram in `docs/architecture.md` and the layered table in the README clearly show where the protocol sits relative to the full RIO platform. The "open proof layer" vs. "commercial governance layer" distinction is unambiguous.

**Spec completeness.** The `spec/` directory contains 6 documents covering the receipt format, ledger format, signing rules, canonical serialization, conformance levels, and the JSON Schema. The field mapping (Section 17 of `receipt-protocol.md`) documents how the reference implementation's internal schema maps to the canonical protocol fields. This is the right approach — the mapping exists and is documented.

---

## 2. Where a Developer Would Get Stuck or Confused

### 2a. Remote verification fails against the live Gateway

This is the most visible problem. A developer who runs:

```
$ rio-verify remote https://rio-gateway.onrender.com
```

Gets:

```
⚠ 0/10 receipts valid
```

**Why it fails:** The Gateway's `/api/receipts/recent` endpoint returns **ledger entries** (with `entry_id`, `status`, `detail`, `ledger_hash`), not **protocol-format receipts** (with `hash_chain`, `verification`, `receipt_type`). The CLI verifier expects the protocol schema and finds none of the required fields.

**Impact:** This is the first thing a developer would try after seeing the README mention the live Gateway. Getting `0/10 receipts valid` against the production system undermines confidence in the entire protocol. It looks broken even though it is not — the local verification works perfectly.

### 2b. Two schemas with no obvious bridge

The canonical spec defines these required fields: `receipt_id`, `timestamp`, `protocol_version`, `actor_id`, `action_type`, `action_summary`, `decision`, `receipt_hash`, `verification_status`.

The reference implementation uses: `receipt_id`, `timestamp`, `version`, `agent_id`, `action`, `receipt_type`, `hash_chain.receipt_hash`.

Section 17 documents the mapping, but a developer reading the spec first and then looking at the sample receipts will be confused. The sample receipts use the reference implementation schema (which is correct), but they do not match the "Required Receipt Fields" table in Section 6 of the spec.

**Impact:** Medium. The mapping exists, but a developer has to find it. The conformance spec (Section 10) says "Implementations that use an internal schema different from the canonical fields MUST provide a documented mapping" — and the mapping is provided. But it requires reading deep into the spec to discover this.

### 2c. Test count inconsistency

Three different documents report three different test counts:

| Source | Node.js Tests | Python Tests | Total |
|--------|--------------|-------------|-------|
| README badge | 29 | 29 | 58 |
| `canonical-rules.md` checklist | 38 | 29 | 67 |
| Actual test run (v2.3) | 44 | 29 | 73 |

**Impact:** Low-medium. A developer who runs the tests and sees 44 pass instead of 29 will wonder if something is wrong. The badge and docs should match reality.

### 2d. `toCanonical()` function has a bug

The `toCanonical()` function in Section 17 maps `decision` as:

```javascript
decision: v22Receipt.receipt_type === "governed_action" ? "executed" : "executed",
```

Both branches return `"executed"`. A denied or blocked action would incorrectly show as "executed" in the canonical view. This is a copy-paste bug.

### 2e. No signed sample receipt

All three sample receipt JSON files are unsigned (no `identity_binding` with `signature_hex`). The `demo-output/receipt.json` (generated by `cli/demo.mjs`) is signed, but it is not in the `examples/` directory where a developer would look. A developer wanting to test signature verification has to run the demo first to generate a signed receipt.

### 2f. No guide for connecting to the live Gateway

All examples are local/in-memory. The integration guide covers OpenAI, Anthropic, and LangChain — but none of them show how to submit an intent to the live Gateway, get approval, execute, and receive a receipt. The `RECREATE_GOVERNED_ACTION.md` in the rio-system repo covers this, but it is not referenced from the protocol repo.

---

## 3. Exact Gaps That Need Fixing Before External Exposure

### P0 — Must Fix (blocks credibility)

| # | Gap | Fix | Effort |
|---|-----|-----|--------|
| 1 | `rio-verify remote` returns 0/10 against live Gateway | Gateway needs to return protocol-format receipts at `/api/receipts/recent` (with `hash_chain`, `verification` objects), OR the CLI verifier needs to handle Gateway-format responses and translate them | 2-4 hours |
| 2 | Test count mismatch across 3 documents | Update README badge to "73 conformance (44 Node + 29 Python)", update `canonical-rules.md` checklist to 44, update `conformance.md` to reflect v2.3 counts | 15 minutes |
| 3 | `toCanonical()` decision mapping bug | Fix the ternary to map `receipt_type` + execution status correctly (e.g., `"action" → "executed"`, `"governed_action" → "executed"`, but also handle denied/blocked cases) | 15 minutes |

### P1 — Should Fix (improves developer experience)

| # | Gap | Fix | Effort |
|---|-----|-----|--------|
| 4 | No signed sample receipt in examples/ | Generate and commit `sample_receipt_signed.json` with `identity_binding` including `signature_hex`, `public_key_hex`, `signer_id` | 30 minutes |
| 5 | Python missing v2.3 identity enrichment tests | Port the 15 Node.js v2.3 tests (Category 9-10) to Python | 2-3 hours |
| 6 | No "Connect to Live Gateway" guide | Add a section to integration-guide.md or a new `docs/gateway-integration.md` showing the full API flow: `POST /submit-intent` → `POST /approve-intent` → `POST /execute-action` → verify receipt | 1-2 hours |
| 7 | `rio-verify remote` fragile | Make the remote verifier handle both protocol-format and Gateway-format responses, with clear messaging about which format was detected | 1-2 hours |

### P2 — Nice to Have (polish)

| # | Gap | Fix | Effort |
|---|-----|-----|--------|
| 8 | Health endpoint reports `chain_valid: false` | The v2.9.0 Gateway already reports `current_epoch.valid: true` — the CLI remote verifier should display this prominently instead of the full-chain validity (which includes legacy breaks) | 30 minutes |
| 9 | No standalone QUICKSTART.md | Create a 2-minute "zero to verified receipt" guide that is shorter than the README | 1 hour |

---

## 4. Recommended Changes (Prioritized)

**Do today (before increasing visibility):**

1. Fix the test count in README badge, `conformance.md`, and `canonical-rules.md`. This is 15 minutes and eliminates a visible inconsistency.

2. Fix the `toCanonical()` bug in `receipt-protocol.md` Section 17. Another 15 minutes.

3. Either fix the Gateway's `/api/receipts/recent` to return protocol-format receipts, or update `rio-verify remote` to handle Gateway-format responses. This is the highest-impact fix — it is the difference between a developer's first impression being "this works" vs. "this is broken."

**Do this week:**

4. Add a signed sample receipt to `examples/`.

5. Add a "Connecting to the Live Gateway" section to the integration guide, or cross-reference the `RECREATE_GOVERNED_ACTION.md` from the rio-system repo.

6. Port Python v2.3 tests.

**Do before public launch:**

7. Standalone QUICKSTART.md.

8. Make `rio-verify remote` robust to both response formats.

---

## 5. Overall Assessment

The protocol repo is **substantially ready**. The spec is clear, the implementations work, the examples run, the tests pass, and the breadcrumbing between MVP and extension is well-done. A developer can pick up the library and generate verified receipts locally within 5 minutes.

The gap is at the **boundary between the protocol library and the live Gateway**. The protocol repo promises that receipts are verifiable, and they are — locally. But the moment a developer points the CLI at the production Gateway, it fails. That is the one thing that must be fixed before external exposure.

Everything else is documentation hygiene that can be done in a few hours.

**Readiness: 85%.** Fix the remote verification and the test counts, and it is ready for external developers.

---

*COS — Chief of Staff, RIO System*
*Audit conducted 2026-04-07*
