# Method-to-Runtime Build Translation v0.1

Artifact type: build translation / implementation bridge  
Lane: Method to Runtime  
System: ONE/RIO/MUSS/Genesis  
Status: v0.1 build translation candidate  
Parent method: `docs/method/master-runtime-method-v0.1.md`  
Drive working copy: ONE Method Translation v0.1  
Drive URL: https://docs.google.com/document/d/1theA_OveYdWTVmPSkanc956YyBSQcPUCa-oxVVTKBMI

## Purpose

This artifact turns the Master Runtime Method into build targets.

It names:

- what needs code,
- what needs tests,
- which repo owns each work lane,
- and what order the build should follow.

## Non-Claims

This file does not prove runtime implementation, production readiness, public release, or source-of-truth promotion.

## Repo Ownership Map

| Repo | Build lane | Owns |
|---|---|---|
| `rio-system` | Architecture / method / source map | Method docs, migration indexes, source-map alignment |
| `rio-proxy` | Primary runtime candidate | Governed-action loop, proposal flow, RIO gate wiring, connector boundary, review surface |
| `rio-receipt-protocol` | Proof layer | Receipt schema, verification, chain validation, ledger integrity patterns |
| `language-intake-mvp` | Language boundary | Word Gate examples and language-crossing tests |
| `rio-protocol` | Public protocol standard | Public protocol and conformance definitions |
| `rio-tools` | Tooling and verifier lane | CLI checks, SDK support, verification utilities |
| `rio-demo-site` | Demo and narrative lane | Walkthroughs, state-surface explanation, demo storytelling |

Current runtime assumption:

Use `rio-proxy` as the primary runtime lane unless a separate runtime decision changes that.

## Runtime Build Targets

| Method area | Build target | Primary repo |
|---|---|---|
| Session orientation | Session record / loader | `rio-proxy` |
| Proposal formation | Proposal packet builder | `rio-proxy` |
| MUSS envelope | Authority and scope record | `rio-proxy` + `rio-receipt-protocol` |
| RIO intake | Intake gate | `rio-proxy` |
| RIO admissibility | Completeness and scope check | `rio-proxy` |
| RIO policy decision | Decision outcome | `rio-proxy` |
| Execution boundary | Exact-match tool boundary | `rio-proxy` |
| Receipt closure | Receipt chain | `rio-proxy` + `rio-receipt-protocol` |
| Adaptive Coherence | Delta routing | `rio-proxy` |
| Genesis coordination | Runtime coordinator | `rio-proxy` |
| Human review surface | Proposal / decision / proof view | `rio-proxy` + `rio-demo-site` |
| Word Gate compatibility | Language test alignment | `language-intake-mvp` + `rio-proxy` |

## First MVP Build Path

The first build should not attempt the whole ONE operating system.

It should build one governed turn:

1. Human requests a small repository action.
2. The system forms a proposal.
3. RIO evaluates it.
4. Human approves it.
5. The runtime checks that the approved content still matches.
6. The action occurs.
7. A receipt is created.
8. The state surface shows the action and proof together.

MVP target:

One governed turn, one safe connector, one receipt, one visible state surface.

## Implementation Order

1. `rio-proxy`: create ONE Governed Turn MVP Charter v0.1.
2. `rio-proxy`: add proposal packet and session orientation schemas/tests.
3. `rio-proxy`: add first governed-turn connector test.
4. `rio-receipt-protocol`: add receipt event mapping for method stages.
5. `language-intake-mvp`: review Word Gate runtime vectors against this build path.
6. `rio-demo-site`: add demo state-surface explanation after runtime behavior exists.

## Required Test Themes

The first runtime tests should prove:

- an unoriented session cannot proceed to action,
- a proposal is not approval,
- missing authority or unclear scope holds the action,
- tool availability is not permission,
- changed content after approval does not pass the boundary,
- receipts reference their upstream proposal and decision,
- revocation prevents future use,
- correction creates a record rather than silently rewriting history.

## Build Discipline

Every build PR should answer:

- What changed?
- What behavior is now testable?
- What risk is reduced?
- What is still not proven?
- Should the human merge or hold?

## Close State

This artifact converts the Master Runtime Method into a build sequence.

It does not prove the runtime exists.

Final keeper:

Build one governed turn. Prove the crossing. Show the receipt. Return to human authority.
