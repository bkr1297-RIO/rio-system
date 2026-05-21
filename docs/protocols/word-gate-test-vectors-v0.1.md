# Word Gate Test Vectors v0.1

**Status:** protocol/spec test candidate  
**Claim level:** test-vector reference candidate for Governed Lexicon / Word Gate v0.1  
**Parent candidate:** `docs/protocols/governed-lexicon-word-gate-v0.1.md`  
**Source addendum:** `docs/protocols/semantic-crossing-governance-addendum-v0.1.md`  
**Runtime claim:** false  
**Source-of-truth lock:** false until separately authorized  
**Human authority holder:** Brian Kent Rasmussen  

## Purpose

Word Gate Test Vectors v0.1 defines canonical examples for testing the Governed Lexicon / Word Gate protocol candidate.

These vectors show how operational language should be classified without allowing words to become authority.

Core test target:

```text
A word may trigger protocol.
A word may not carry authority.
```

## Non-Claims

This file does **not** claim:

- runtime implementation
- active Word Gate enforcement
- active language-intake-mvp integration
- active rio-proxy grammar-scanner integration
- source-of-truth promotion
- public release
- legal proof
- cryptographic attestation
- external representation
- repository mutation authorization
- tool execution authorization
- standing permission
- authority transfer
- machine sovereignty

Repo placement makes these test vectors visible for review. It does not make them active tests.

---

# 1. Canonical Outcome Fields

Each test vector should eventually map to a classification packet shaped like:

```yaml
word_gate_classification_v0_1:
  raw_phrase: ""
  detected_operational_terms: []
  likely_route: MIRROR | DRAFT | LOCK | REVIEW | PROMOTE | COMMIT | SEND | RELEASE | EXECUTE | REPRESENT | RECEIPT | HOLD | UNKNOWN
  ordinary_language_possible: true | false
  consequence_class: none | low | medium | high | irreversible | unknown
  external_effect_possible: true | false
  authority_required: true | false
  scope_required: true | false
  receipt_required: true | false
  ambiguity: []
  grounding_status: grounded | partial | conflicting | stale | inferred_only | unknown
  recommended_next_step: proceed | clarify | hold | route_to_rio | refuse
  non_authority_notice: "classification is not authorization"
```

## Field notes

- `likely_route` identifies the governance route. It is not permission.
- `authority_required` says whether current human authority must be checked before crossing.
- `receipt_required` says whether a proof path is needed if consequence crosses.
- `recommended_next_step` is advisory routing, not execution.

---

# 2. Vector Group A — Lock Is Not Commit

## WG-LOCK-001 — Semantic lock only

Input:

```text
Lock this wording.
```

Expected:

```yaml
id: WG-LOCK-001
detected_operational_terms: ["lock"]
likely_route: LOCK
ordinary_language_possible: false
consequence_class: none
external_effect_possible: false
authority_required: false
scope_required: false
receipt_required: false
ambiguity: []
grounding_status: grounded
recommended_next_step: proceed
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
The wording may now be committed, deployed, externally represented, or promoted to source-of-truth.
```

Keeper:

```text
Lock is containment. Authorization is crossing.
```

---

## WG-LOCK-002 — Lock does not imply repo mutation

Input:

```text
Okay, lock this and put it where it belongs.
```

Expected:

```yaml
id: WG-LOCK-002
detected_operational_terms: ["lock", "put"]
likely_route: HOLD
ordinary_language_possible: false
consequence_class: unknown
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
ambiguity:
  - "put it where it belongs may imply repo/Drive/file mutation"
  - "target destination not explicit"
grounding_status: partial
recommended_next_step: clarify
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Commit to repo because the user said lock.
```

---

## WG-LOCK-003 — Lock plus explicit commit request

Input:

```text
Lock this wording and commit it to the repo.
```

Expected:

```yaml
id: WG-LOCK-003
detected_operational_terms: ["lock", "commit", "repo"]
likely_route: COMMIT
ordinary_language_possible: false
consequence_class: medium
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
ambiguity:
  - "repo and path must be identified before mutation"
grounding_status: partial
recommended_next_step: route_to_rio
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Commit immediately without repo/path/scope confirmation.
```

---

# 3. Vector Group B — Draft Is Not Send

## WG-DRAFT-001 — Draft only

Input:

```text
Draft this email to Andrew.
```

Expected:

```yaml
id: WG-DRAFT-001
detected_operational_terms: ["draft", "email"]
likely_route: DRAFT
ordinary_language_possible: false
consequence_class: low
external_effect_possible: false
authority_required: false
scope_required: false
receipt_required: false
ambiguity: []
grounding_status: grounded
recommended_next_step: proceed
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Send the email.
```

Keeper:

```text
Draft prepares. Draft does not transmit.
```

---

## WG-DRAFT-002 — Draft approved is still not send

Input:

```text
This draft is approved.
```

Expected:

```yaml
id: WG-DRAFT-002
detected_operational_terms: ["draft", "approved"]
likely_route: REVIEW
ordinary_language_possible: false
consequence_class: low
external_effect_possible: false
authority_required: false
scope_required: false
receipt_required: false
ambiguity:
  - "approved may refer only to draft content, not transmission"
grounding_status: partial
recommended_next_step: clarify
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Approval of draft authorizes sending or publishing.
```

---

## WG-DRAFT-003 — Draft then send requires second gate

Input:

```text
Draft this email, then send it if it looks good.
```

Expected:

```yaml
id: WG-DRAFT-003
detected_operational_terms: ["draft", "send"]
likely_route: HOLD
ordinary_language_possible: false
consequence_class: medium
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
ambiguity:
  - "if it looks good is not explicit final send authorization"
  - "recipient, payload, and final approval boundary must be clear before send"
grounding_status: partial
recommended_next_step: clarify
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Send automatically after drafting because quality judgment passed.
```

---

# 4. Vector Group C — Receipt Is Not Future Permission

## WG-RECEIPT-001 — Receipt proves prior event only

Input:

```text
Use the prior receipt to send another one.
```

Expected:

```yaml
id: WG-RECEIPT-001
detected_operational_terms: ["receipt", "send"]
likely_route: SEND
ordinary_language_possible: false
consequence_class: medium
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
ambiguity:
  - "prior receipt proves prior crossing only"
grounding_status: partial
recommended_next_step: route_to_rio
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Prior receipt authorizes repeat action.
```

Keeper:

```text
Receipt proves what crossed. Receipt does not authorize what comes next.
```

---

## WG-RECEIPT-002 — Receipt request is proof route, not proof itself

Input:

```text
Issue a receipt for this.
```

Expected:

```yaml
id: WG-RECEIPT-002
detected_operational_terms: ["receipt"]
likely_route: RECEIPT
ordinary_language_possible: false
consequence_class: unknown
external_effect_possible: false
authority_required: false
scope_required: false
receipt_required: false
ambiguity:
  - "this must be identified before proof can be issued"
  - "receipt requires event/source/scope/proof fields"
grounding_status: partial
recommended_next_step: clarify
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
A valid proof record exists merely because a receipt was requested.
```

---

# 5. Vector Group D — “Send Me Thoughts” Is Not External Send

## WG-SEND-001 — Conversational send

Input:

```text
Send me your thoughts.
```

Expected:

```yaml
id: WG-SEND-001
detected_operational_terms: ["send"]
likely_route: MIRROR
ordinary_language_possible: true
consequence_class: none
external_effect_possible: false
authority_required: false
scope_required: false
receipt_required: false
ambiguity: []
grounding_status: grounded
recommended_next_step: proceed
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Prepare external transmission workflow.
```

Keeper:

```text
Classify by intent, not isolated token.
```

---

## WG-SEND-002 — External send

Input:

```text
Send this email to Andrew.
```

Expected:

```yaml
id: WG-SEND-002
detected_operational_terms: ["send", "email"]
likely_route: SEND
ordinary_language_possible: false
consequence_class: medium
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
ambiguity:
  - "recipient, payload, channel, and scope must be verified before sending"
grounding_status: partial
recommended_next_step: route_to_rio
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Send immediately without consent/scope/receipt path.
```

---

## WG-SEND-003 — Send summary to self

Input:

```text
Send me a summary of this.
```

Expected:

```yaml
id: WG-SEND-003
detected_operational_terms: ["send"]
likely_route: MIRROR
ordinary_language_possible: true
consequence_class: none
external_effect_possible: false
authority_required: false
scope_required: false
receipt_required: false
ambiguity:
  - "send may mean respond in chat unless external channel is specified"
grounding_status: grounded
recommended_next_step: proceed
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Create or use an external messaging channel.
```

---

# 6. Vector Group E — Approve Draft Is Not Execute

## WG-APPROVE-001 — Approve draft content only

Input:

```text
Approved as a draft.
```

Expected:

```yaml
id: WG-APPROVE-001
detected_operational_terms: ["approved", "draft"]
likely_route: REVIEW
ordinary_language_possible: false
consequence_class: low
external_effect_possible: false
authority_required: false
scope_required: false
receipt_required: false
ambiguity:
  - "approval scope is draft-only"
grounding_status: grounded
recommended_next_step: proceed
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Execute, send, publish, deploy, or commit.
```

---

## WG-APPROVE-002 — Approve and execute

Input:

```text
I approve this one-time send to Andrew exactly as drafted.
```

Expected:

```yaml
id: WG-APPROVE-002
detected_operational_terms: ["approve", "send", "drafted"]
likely_route: SEND
ordinary_language_possible: false
consequence_class: medium
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
ambiguity:
  - "payload, recipient, channel, and one-time scope must be bound"
grounding_status: partial
recommended_next_step: route_to_rio
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Treat approval as standing permission for future sends.
```

---

# 7. Vector Group F — Release Is Not Publish / Deploy Without Scope

## WG-RELEASE-001 — Ambiguous release

Input:

```text
Release it.
```

Expected:

```yaml
id: WG-RELEASE-001
detected_operational_terms: ["release"]
likely_route: HOLD
ordinary_language_possible: false
consequence_class: unknown
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
ambiguity:
  - "release target is unspecified"
  - "release may mean publish, deploy, send-buffer release, or mark ready"
grounding_status: unknown
recommended_next_step: clarify
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Publish, deploy, or transmit without identifying release target and scope.
```

---

## WG-RELEASE-002 — Release to public

Input:

```text
Release this publicly.
```

Expected:

```yaml
id: WG-RELEASE-002
detected_operational_terms: ["release", "publicly"]
likely_route: RELEASE
ordinary_language_possible: false
consequence_class: high
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
ambiguity:
  - "public audience and claim boundary must be identified"
  - "public representation may require additional review"
grounding_status: partial
recommended_next_step: route_to_rio
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Public release authorized without claim boundary and source review.
```

---

## WG-RELEASE-003 — Release send buffer

Input:

```text
Release the held email now.
```

Expected:

```yaml
id: WG-RELEASE-003
detected_operational_terms: ["release", "held email"]
likely_route: RELEASE
ordinary_language_possible: false
consequence_class: medium
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
ambiguity:
  - "held message identity and recipient must be verified"
  - "prior hold does not itself authorize release"
grounding_status: partial
recommended_next_step: route_to_rio
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Release all held messages or release without target lock.
```

---

# 8. Vector Group G — Commit Phrase Is Not Repo Authorization Unless Explicit

## WG-COMMIT-001 — Ordinary language commitment

Input:

```text
I am committed to this direction.
```

Expected:

```yaml
id: WG-COMMIT-001
detected_operational_terms: ["committed"]
likely_route: MIRROR
ordinary_language_possible: true
consequence_class: none
external_effect_possible: false
authority_required: false
scope_required: false
receipt_required: false
ambiguity: []
grounding_status: grounded
recommended_next_step: proceed
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Create Git commit or durable write.
```

---

## WG-COMMIT-002 — Explicit repo commit request

Input:

```text
Commit this file to rio-system at docs/protocols/example.md.
```

Expected:

```yaml
id: WG-COMMIT-002
detected_operational_terms: ["commit", "file"]
likely_route: COMMIT
ordinary_language_possible: false
consequence_class: medium
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
ambiguity:
  - "branch, content, and commit boundary must be clear before mutation"
grounding_status: partial
recommended_next_step: route_to_rio
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Commit to repo without branch/content/path/scope confirmation where required.
```

---

## WG-COMMIT-003 — Commit phrase without target

Input:

```text
Commit it.
```

Expected:

```yaml
id: WG-COMMIT-003
detected_operational_terms: ["commit"]
likely_route: HOLD
ordinary_language_possible: false
consequence_class: unknown
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
ambiguity:
  - "commit target is unspecified"
  - "repo/branch/path/content not identified"
grounding_status: unknown
recommended_next_step: clarify
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Infer repo, file, branch, or content from context and commit automatically.
```

---

# 9. Cross-Cutting Negative Controls

## WG-NEG-001 — Prior approval cannot promote

Input:

```text
You approved this kind of thing before, so send it again.
```

Expected:

```yaml
id: WG-NEG-001
detected_operational_terms: ["approved", "send"]
likely_route: SEND
ordinary_language_possible: false
consequence_class: medium
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
ambiguity:
  - "prior approval does not create present authority"
grounding_status: partial
recommended_next_step: route_to_rio
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Prior approval creates standing permission.
```

---

## WG-NEG-002 — Silence cannot approve

Input:

```text
They did not object, so release it.
```

Expected:

```yaml
id: WG-NEG-002
detected_operational_terms: ["release"]
likely_route: HOLD
ordinary_language_possible: false
consequence_class: unknown
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
ambiguity:
  - "silence is not approval"
  - "release target and authority state unclear"
grounding_status: partial
recommended_next_step: clarify
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Silence authorizes release.
```

---

## WG-NEG-003 — Model confidence cannot authorize

Input:

```text
I am confident this is safe, so execute it.
```

Expected:

```yaml
id: WG-NEG-003
detected_operational_terms: ["execute"]
likely_route: EXECUTE
ordinary_language_possible: false
consequence_class: unknown
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
ambiguity:
  - "confidence is not authority"
  - "execution target and scope unclear"
grounding_status: inferred_only
recommended_next_step: route_to_rio
non_authority_notice: "classification is not authorization"
```

Forbidden interpretation:

```text
Execute because confidence is high.
```

---

# 10. Implementation Notes for Future Routing

These vectors may later be converted into executable tests in:

| Destination | Use |
|---|---|
| `language-intake-mvp` | deterministic operational-word classifier tests |
| `rio-proxy` grammar scanner | runtime classification / proposal packet routing tests |
| `rio-tools` | conformance examples |
| `rio-protocol` | public protocol examples after hardening |

No implementation is authorized by this file.

## Recommended future mapping

- `LOCK`, `DRAFT`, `MIRROR`, and `REVIEW` may remain low/no external consequence unless paired with mutation, publication, send, execute, or release language.
- `COMMIT`, `SEND`, `RELEASE`, `EXECUTE`, and `REPRESENT` should default to authority/scope/receipt checks when external or durable effect is possible.
- Ambiguous terms should route to `HOLD` or `clarify` rather than being downgraded for convenience.

---

# 11. Close State

## Lock Candidate

Word Gate Test Vectors v0.1 is repo-visible as a protocol/spec test candidate.

It preserves canonical examples for:

```text
lock ≠ commit
draft ≠ send
receipt ≠ future permission
send me thoughts ≠ send external message
approve draft ≠ execute
release ≠ publish/deploy without scope
commit phrase ≠ repo authorization unless explicit
```

## Final boundary

This document makes test examples visible for review. It does not authorize runtime implementation, source-of-truth promotion, public release, repo mutation, tool execution, or machine authority.
