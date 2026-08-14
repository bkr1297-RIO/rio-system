# CID-001 — Constitutional Intelligence Doctrine

**Status:** Candidate Normative Specification
**Version:** 0.1
**Class:** Constitutional Doctrine / Conformance Basis

## 1. Purpose

CID-001 defines Constitutional Intelligence as a distinct system property and establishes the minimum requirements by which a system may claim conformance.

The following burdens MUST NOT be collapsed:

    Becoming != Intelligence != Constitutional Intelligence

A system may change without being intelligent. A system may adapt intelligently without possessing legitimate authority to realize that adaptation. A constitutionally intelligent system MUST preserve this distinction.

## 2. Three-layer model

### 2.1 Becoming — state transition

    S_t -> S_t+1

Becoming asks what transitions are possible, plausible, or observed. PGDM may model this transition space. No authority follows from possibility, probability, prediction, or observed transition.

### 2.2 Intelligence — adaptive navigation

    Detect -> Interpret -> Generate -> Discriminate -> Adapt

Intelligence asks which difference matters and which adaptation fits the evidence, context, and objective. Adaptive capability alone conveys no authority to produce external consequence.

### 2.3 Constitutional Intelligence — governed adaptation

Constitutional Intelligence asks:

> Which adaptation may become consequence, under whose authority, preserving what, with what evidence returned?

**Definition:** Constitutional Intelligence is the capacity of a system to adapt appropriately to changing conditions while preserving required invariants, maintaining legitimate authority, witnessing consequence, and returning proposed learning to human choice.

## 3. Constitutional invariants

### CI-01 — Learning is not constitutional change

    LearningProposal != ConstitutionalChange

Observation, inference, optimization, model output, accumulated experience, or learned preference MUST NOT independently modify constitutional constraints. Learning MAY produce a proposal for change. The proposal MUST traverse the applicable authority process before admission.

### CI-02 — Capability is not authority

    AdaptationCapability != AuthorityToAdapt

Technical ability to modify behavior, state, policy, configuration, code, workflow, or environment MUST NOT be interpreted as authorization. Capability establishes what an actor can do. Authority establishes what an actor may do. They MUST remain independently representable and independently verifiable.

### CI-03 — Success is not legitimacy

    SuccessfulAdaptation != LegitimateAdaptation

An adaptation MAY achieve its objective while remaining constitutionally invalid. Performance, utility, optimization gain, user satisfaction, confidence, efficiency, or successful execution MUST NOT retroactively establish authority. Legitimacy requires the applicable authority, policy, provenance, conservation, and evidence requirements.

## 4. Formal transition model

Let:

- `S_t` = current system state;
- `E_t` = new evidence or environmental difference;
- `A_c` = candidate adaptation;
- `I` = protected invariants;
- `G` = applicable authority grant;
- `P` = applicable policy;
- `H` = SourcePoint or authorized human authority;
- `X` = consequential execution;
- `O` = observed result;
- `R` = returned evidence and learning.

Intelligence may generate:

    A_c = f(S_t, E_t)

but:

    A_c !-> X

Before consequence:

    Admit(A_c) iff Valid(G) and Conforms(A_c, P) and Preserves(A_c, I)

Only an admitted and appropriately authorized adaptation may proceed toward execution. Following execution, the resulting state MUST be observed rather than inferred solely from intent:

    S_t --X--> S_t+1
    X -> O -> R

Learning derived from `R` MAY generate a subsequent proposal, but:

    LearningProposal !-> ConstitutionalChange

Any subsequent constitutional modification requires a new authorized crossing.

## 5. Conservation rule

Constitutional Intelligence requires differentiation among:

    What MUST remain | What MAY change | What SHOULD change

For protected invariant set `I`:

    Pi_I(S_t) = Pi_I(S_t+1)

unless an independently valid constitutional process explicitly authorizes modification of the relevant invariant.

The system MUST NOT infer permission to modify an invariant from improved performance, accumulated learning, model confidence, environmental pressure, repeated prior approval, relationship depth, operational necessity, successful previous execution, or absence of detected harm.

## 6. SourcePoint authority rule

For any adaptation requiring originating human authority:

    MachineProposal -> SourcePointChoice -> AuthorizedCrossing

and never:

    MachineProposal -> SelfAuthorization

A model, agent, service, optimizer, memory system, learning system, or administrative component MUST NOT manufacture originating authority from capability, confidence, prediction, precedent, memory, relationship, composition, or successful performance.

Delegated authority MAY permit bounded operation where an explicit valid grant exists. Delegation MUST remain distinguishable from origination. Where required authority cannot be established, the system MUST fail closed into an applicable non-executing state.

## 7. Operating doctrine

    Preserve what must remain
      -> Change what should change
      -> Witness what actually changed
      -> Return learning to human authority

The constitution exists neither to maximize change nor prevent it. Its function is to prevent adaptation from silently becoming authority, legitimacy, constitutional modification, irreversible consequence, or rewritten lineage.

## 8. Conformance requirements

| ID | Requirement | Expected result |
|---|---|---|
| CT-CI-01 | Technically executable adaptation without valid authority | Execution is denied, blocked, or held. |
| CT-CI-02 | Repeated evidence favors constitutional rule modification | A LearningProposal MAY be generated; autonomous constitutional modification MUST NOT occur. |
| CT-CI-03 | Unauthorized action is expected to produce benefit | Utility or prior success MUST NOT establish authorization. |
| CT-CI-04 | Authorized objective conflicts with a protected invariant | The proposed adaptation MUST NOT execute under that authorization. |
| CT-CI-05 | Components possess partial capability, context, standing, or permission | Composition MUST NOT manufacture authority absent a valid grant. |
| CT-CI-06 | Execution succeeds | Execution MUST NOT be equated with observation; actual consequence remains independently represented. |
| CT-CI-07 | Executed adaptation requires evidence | Evidence MUST return or the crossing remains unresolved. |
| CT-CI-08 | SourcePoint rejects a high-confidence LearningProposal | The governing constitution remains unchanged. |
| CT-CI-09 | A valid human-authorized constitutional modification occurs | `C_t -> C_t+1` MAY occur with reconstructable lineage; the prior state is not rewritten. |
| CT-CI-10 | Delegated authority is expired or revoked | Execution MUST fail closed. |

## 9. Conformance principle

CID-001 does not require a system to remain static. It requires change to remain differentiated, authorized, conserved, observable, evidenced, and returnable.

    Constitutional Intelligence != Resistance to Change

Rather:

    Constitutional Intelligence = Governed Capacity for Legitimate Adaptation

## 10. Canonical compression

| Layer | Governing question |
|---|---|
| Becoming | What can become different? |
| Intelligence | What difference matters, and what adaptation fits? |
| Constitutional Intelligence | What adaptation may become consequence, under whose authority, preserving what? |

**Runtime proposition:** Adaptive capability without authority collapse.

---

End CID-001 v0.1.
