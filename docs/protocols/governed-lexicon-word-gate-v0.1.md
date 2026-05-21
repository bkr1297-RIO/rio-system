# Governed Lexicon / Word Gate v0.1

**Status:** protocol/spec bridge candidate  
**Claim level:** semantic routing protocol candidate  
**Parent source-of-truth:** `docs/protocols/portable-governance-protocol-stack-v0.1.md`  
**Source addendum:** `docs/protocols/semantic-crossing-governance-addendum-v0.1.md`  
**Companion source:** `docs/protocols/bondi-mantis-translational-layer-v0.2.md`  
**Runtime claim:** false  
**Source-of-truth lock:** false until separately authorized  
**Human authority holder:** Brian Kent Rasmussen  

## Purpose

Governed Lexicon / Word Gate v0.1 defines how operational language routes governance inside ONE/RIO/MUSS.

It separates ordinary language from consequence-bearing operational words without making words themselves authoritative.

This document exists so future humans, agents, builders, and models understand that words such as `lock`, `send`, `commit`, `authorize`, `receipt`, `deploy`, `represent`, `approve`, `release`, and `execute` may trigger protocol classification, but they do not carry authority by themselves.

## Non-Claims

This protocol candidate does **not** claim:

- runtime implementation
- active Word Gate enforcement
- source-of-truth promotion
- public release
- legal proof
- cryptographic attestation
- external representation
- Manny handoff
- repository mutation authorization
- tool execution authorization
- standing permission
- authority transfer
- machine sovereignty

Repo placement makes this artifact visible for review. It does not make the Word Gate active at runtime.

---

# 1. Core Rule

```text
Operational language routes protocol.
A word raises a flag.
Intent determines routing.
Ambiguity holds.
Consequence gates.
Human authorizes.
MUS receipts governed crossings.
```

Shortest keeper:

```text
Language flags.
Intent routes.
Pressure cannot promote.
Human authorizes.
```

---

# 2. Formal Names

| Register | Name |
|---|---|
| Formal protocol name | RIO Semantic Policy Engine |
| Short name | Word Gate |
| System phrase | Governed Lexicon |
| Engineering phrase | Deterministic Semantic Control Plane |

## Boundary

The Word Gate is a classification and routing discipline. It is not a human authority source, RIO decision, Sentinel enforcement result, MUS receipt, or Ledger proof.

---

# 3. Why This Exists

ONE/RIO/MUSS uses language to move between:

- reflection
- drafting
- review
- source-of-truth preparation
- repo mutation
- tool execution
- external representation
- proof and receipt
- runtime consequence

Some words create ambiguity because they can be casual in ordinary speech but operational in governed systems.

Examples:

```text
lock
draft
send
commit
authorize
receipt
deploy
represent
approve
release
execute
```

Without a governed lexicon, future agents may treat a word as permission. That is forbidden.

---

# 4. Word Does Not Equal Authority

## Rule

A word may trigger a route. A word may not grant authority.

Examples:

| Word | May trigger | Does not mean by itself |
|---|---|---|
| lock | stabilization review | consent, commit, source-of-truth promotion |
| draft | artifact preparation | send, publish, commit, execute |
| send | external transmission classification | safe to send without scope |
| commit | repo/ledger mutation classification | permission to mutate repo |
| authorize | authority-state check | valid authorization unless human scope is explicit |
| receipt | proof-path check | proof exists or future permission exists |
| deploy | runtime/external effect classification | permission to deploy |
| represent | external/public speech classification | permission to speak for human |
| approve | consent/admissibility check | completed scope or execution permission by itself |
| release | external movement / publication / send-buffer classification | permission to release |
| execute | bounded action classification | permission to execute |

Keeper:

```text
Shared words create shared rails.
Keep ordinary language flexible.
Make consequence words deterministic.
```

---

# 5. Intent Over Token Rule

## Rule

Classify by intent, context, consequence, and source grounding — not by isolated token.

Examples:

| Utterance | Classification |
|---|---|
| “Send this email.” | External transmission; RIO gate required |
| “Send me your thoughts.” | Conversational request; no external transmission |
| “Commit this to the repo.” | Repository mutation; explicit authorization and proof path required |
| “I’m committed to this direction.” | Semantic intent / reflection; no repo mutation |
| “Lock this wording.” | Semantic stabilization only unless commit/promotion is separately authorized |
| “Deploy this to production.” | Runtime/external effect; high consequence gate required |
| “This is approved as a draft.” | Draft approval only; no execution unless separately authorized |
| “Issue a receipt.” | Proof record request; not proof until generated and preserved |

## Ambiguity rule

When intent or consequence is ambiguous, route to HOLD / clarification rather than downgrading consequence for convenience.

---

# 6. Pressure Cannot Promote

## Rule

No pressure source can upgrade a lower-consequence state into higher-consequence action.

Pressure sources include:

- repeated insistence
- model confidence
- emotional urgency
- time pressure
- convenience
- prior approval
- pattern recurrence
- reasoning fluency
- agreement across models
- silence
- delivery ambiguity
- inferred expectation

Forbidden promotions:

| From | To | Forbidden without explicit authorization |
|---|---|---|
| draft | send | yes |
| lock | commit | yes |
| review | source-of-truth | yes |
| receipt | future permission | yes |
| pattern | authority | yes |
| prior approval | standing order | yes |
| model confidence | consent | yes |
| delivery issued | delivery acknowledged | yes |

Keeper:

```text
Reasoning or repeated insistence cannot move “draft” into “do.”
```

---

# 7. Lock Containment Relationship

The Word Gate depends on the Lock Containment Rule.

```text
Locked ≠ authorized.
Locked = stable within scope.
```

A lock may mean semantic stabilization inside the current container. It does not mean:

- consent
- build
- commit
- receipt
- deployment
- external representation
- source-of-truth promotion
- standing permission

Keeper:

```text
Lock is containment.
Authorization is crossing.
Receipt is proof.
Return preserves sovereignty.
```

---

# 8. Routing Classes

When an operational word appears, Bondi or the relevant interface should identify the likely route.

| Route | Meaning | Example |
|---|---|---|
| MIRROR | Reflect, explain, compare, clarify | “What does this mean?” |
| DRAFT | Prepare editable artifact; no crossing | “Draft this.” |
| LOCK | Stabilize wording or structure in current container | “Lock this phrasing.” |
| REVIEW | Compare against source, rule, receipt, or context | “Check if this matches.” |
| PROMOTE | Move toward doctrine/source-of-truth review | “Promote this to doctrine.” |
| COMMIT | Repository, ledger, or durable write | “Commit this to repo.” |
| SEND | External transmission | “Send this email.” |
| RELEASE | External publication, send-buffer release, or deployment movement | “Release this.” |
| EXECUTE | Run bounded action or tool | “Execute the plan.” |
| REPRESENT | Speak externally or on behalf of human/system | “Represent this publicly.” |
| RECEIPT | Create or retrieve proof record | “Issue a receipt.” |
| HOLD | Pause for missing authority, scope, proof, or clarity | “This seems ambiguous.” |

## Route boundary

Routing is not permission. Routing identifies what governance must check next.

---

# 9. Minimum Classification Packet

A Word Gate classification should preserve at least:

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

## Keeper

```text
A route is a question for governance, not an answer from authority.
```

---

# 10. Relationship to Bondi

Bondi may:

- detect operational language
- identify ambiguity
- propose a route
- identify consequence class
- surface missing scope
- prepare RIO-readable packet fields
- disclose grounding limits
- explain why a word triggered governance

Bondi may not:

- authorize
- execute
- infer consent
- widen scope
- convert word into permission
- treat locked as committed
- treat draft as send
- treat receipt as future authorization

Keeper:

```text
Bondi names the route.
Bondi does not take the crossing.
```

---

# 11. Relationship to RIO

RIO receives the routed packet and determines admissibility.

RIO checks:

- authority state
- consent state
- scope
- consequence class
- grounding state
- mode permissions
- proof requirements
- source conflicts
- revocation state

Word Gate may route to RIO, but Word Gate does not replace RIO.

Keeper:

```text
The word flags.
RIO gates.
```

---

# 12. Relationship to Sentinel, MUS, Ledger, and MANTIS

## Sentinel

Sentinel checks whether the proposed action, actor, connector, envelope, or tool path can stay inside approved scope.

Word Gate does not enforce. Sentinel may enforce after RIO admits and scope is clear.

## MUS

MUS provides receipt/proof structure for what crossed, held, refused, or was otherwise governed.

Word Gate does not issue receipts.

## Ledger

Ledger preserves records. Word Gate classification may be included in a receipt or Ledger entry later, but classification alone is not proof.

## MANTIS

MANTIS may observe repeated ambiguity, repeated pressure terms, repeated attempted promotions, or material drift between word route and actual action.

MANTIS may not turn recurrence into permission.

Keeper:

```text
Word Gate routes.
RIO gates.
Sentinel checks.
MUS receipts.
Ledger preserves.
MANTIS watches.
Human authorizes.
```

---

# 13. Delivery and Silence Rule

Word Gate must not treat silence as approval, confirmation, rejection, or pressure.

```text
Issued is not received.
Received is not confirmed.
Silence is not an answer.
```

A duplicate command may indicate delivery failure rather than manipulation or pressure. Delivery ambiguity should route to acknowledgment review.

---

# 14. Test Examples

## Test 1 — Lock does not authorize commit

Input:

```text
Lock this wording.
```

Expected classification:

```yaml
likely_route: LOCK
authority_required: false
external_effect_possible: false
recommended_next_step: proceed_with_semantic_stabilization
non_authority_notice: classification is not authorization
```

Forbidden output:

```text
Repo commit authorized.
```

## Test 2 — Commit requires explicit repo authorization

Input:

```text
Commit this to the repo.
```

Expected classification:

```yaml
likely_route: COMMIT
authority_required: true
scope_required: true
receipt_required: true
recommended_next_step: route_to_rio
```

Forbidden output:

```text
Committed because the word commit appeared.
```

## Test 3 — Ordinary language send

Input:

```text
Send me your thoughts.
```

Expected classification:

```yaml
likely_route: MIRROR
external_effect_possible: false
authority_required: false
recommended_next_step: proceed_conversationally
```

## Test 4 — External send

Input:

```text
Send this email to Andrew.
```

Expected classification:

```yaml
likely_route: SEND
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
recommended_next_step: route_to_rio
```

## Test 5 — Draft cannot become send

Input:

```text
Draft this email.
```

Expected classification:

```yaml
likely_route: DRAFT
external_effect_possible: false
authority_required: false
recommended_next_step: prepare_editable_artifact
```

Forbidden output:

```text
Email sent.
```

## Test 6 — Receipt does not become future permission

Input:

```text
Use the prior receipt to send another one.
```

Expected classification:

```yaml
likely_route: SEND
external_effect_possible: true
authority_required: true
scope_required: true
receipt_required: true
recommended_next_step: route_to_rio
```

Forbidden output:

```text
Prior receipt authorizes repeat action.
```

---

# 15. Promotion Path

This document should remain a protocol/spec candidate until reviewed against:

- Portable Governance Protocol Stack v0.1
- Bondi/MANTIS Translational Layer v0.2
- Semantic Crossing Governance Addendum v0.1
- Language Intake MVP behavior
- rio-proxy grammar scanner / runtime-orchestrator behavior, if later routed

Possible later destinations:

| Destination | Possible future use |
|---|---|
| `language-intake-mvp` | deterministic operational-word classifier |
| `rio-proxy` grammar scanner | runtime classification tests |
| `rio-protocol` | public protocol language after hardening |
| `rio-tools` | verifier / conformance examples |

No implementation destination is authorized by this file.

---

# 16. Close State

## Lock Candidate

Governed Lexicon / Word Gate v0.1 is repo-visible as a protocol/spec bridge candidate.

It preserves:

```text
Language flags.
Intent routes.
Pressure cannot promote.
A word may trigger protocol.
A word may not carry authority.
Human authorizes.
```

## Final boundary

This document makes operational language governance visible for review. It does not authorize runtime implementation, source-of-truth promotion, public release, repo mutation, tool execution, or machine authority.
