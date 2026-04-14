# Core Artifact Index — Manny's Confirmation

## Artifacts Indexed

### 1. RIO Whitepaper (Sovereign Hub / Universal Architecture)
- **Drive ID:** `1j32JxTxZM_QH0oHVmjOLu6bzPMlylBac3zJN3Dlxlb4` (Repo Export)
- **Drive ID:** `1W2ETfkp7VuVPxeR9sapZ7anfSlEVol7yHBAt7rvb6JE` (vCurrent — identical content)
- **Location:** `01_REFINED/RESEARCH/` folder (parent: `1vb-QfA7zwBEh0s1AmRLF45odw6U69HmO`)
- **Content:** Full RIO whitepaper — 14 sections covering protocol overview, threat model, receipt protocol, 4-layer architecture, 8-layer functional decomposition, governance pipeline, connector model, independent convergence validation

### 2. Cross-Model Convergence (Patterns / Failure Modes)
- **Drive ID:** `1EmEA1s4TNhWrLOcQQwXLvxT4MG7iV_p807fS55osO-o`
- **Location:** `01_REFINED/RESEARCH/`
- **Content:** Validation that 4 independent AI systems (Claude, ChatGPT, Grok, Gemini) converge on the same core architecture under constraint. 6 convergent invariants identified.

### 3. MANTIS Status Dashboard V1
- **Drive ID:** `1Vn4G8wbWlaBDYGEf8L3jVEmrpprDORhXLSe2GqQI5ik`
- **Location:** `08_META/`
- **Content:** System status dashboard showing ALL GREEN. Includes governance artifact integrity, commit log, executive receipt from Bondi, daily integrity sweep results.

---

## 10-Layer Architecture (from Whitepaper Section 14.2)

The whitepaper defines two architectural views:

### 4-Layer Runtime Architecture (Section 4.1)
| Layer | Name | ONE Implementation |
|-------|------|--------------------|
| L1 | Agent / Planner | Bondi (ChatGPT) submits intents via ONE → Gateway |
| L2 | Governance Gateway | Gateway on Render — policy, approvals, execution gating |
| L3 | Connectors | gmail-executor.mjs, sms-executor.mjs in gateway/execution/ |
| L4 | Ledger | Hash-chained receipt storage, verified via /verify endpoint |

### 8-Layer Functional Decomposition (Section 14.2)
| Layer | Function | ONE Coverage |
|-------|----------|--------------| 
| Invariants | 7 non-negotiable system rules | Enforced by Gateway (fail-closed, proposer≠approver, etc.) |
| Lifecycle | 9-stage execution flow | Full pipeline: intent→govern→authorize→execute→receipt→ledger |
| Layer Model | Functional decomposition | 4 runtime layers + governance config + receipt protocol |

### 7 Core Invariants (from Whitepaper)
1. INV-001: Human Authority — No action without human approval
2. INV-002: Fail-Closed — Default deny on any failure
3. INV-003: Separation of Duties — Proposer ≠ Approver
4. INV-004: Non-Repudiation — Cryptographic receipts for every action
5. INV-005: Tamper Evidence — Hash-chained ledger
6. INV-006: Model Agnostic — Any AI can submit intents
7. INV-007: Connector Isolation — Credentials never exposed to agents

---

## Alignment Verification

Every feature in ONE maps back to the architecture:

| Whitepaper Requirement | ONE Feature | Status |
|------------------------|-------------|--------|
| Intent submission (L1→L2) | NewIntent page → Gateway /intent | IMPLEMENTED |
| Policy evaluation (L2) | Gateway /govern endpoint | IMPLEMENTED |
| Human approval (L2) | Approvals page → Gateway /authorize | IMPLEMENTED |
| Execution gating (L2→L3) | Gateway /execute with token validation | IMPLEMENTED |
| Receipt generation (L2) | Gateway /receipt with Ed25519 signing | IMPLEMENTED |
| Ledger recording (L4) | Receipts page + Ledger page | IMPLEMENTED |
| Hash chain verification (L4) | Gateway /verify endpoint | IMPLEMENTED |
| Fail-closed behavior | Every Gateway endpoint returns error on missing prereqs | IMPLEMENTED |
| Proposer ≠ Approver | Gateway enforces principal separation | IMPLEMENTED |
| MANTIS integrity sweep | MantisPanel on GovernanceDashboard | IMPLEMENTED |
| Resonance Feed (system activity) | ResonanceFeed on GovernanceDashboard | IMPLEMENTED |
| SMS connector (L3) | sms-executor.mjs with E.164 + trial guardrail | IMPLEMENTED |
| Gmail connector (L3) | gmail-executor.mjs | IMPLEMENTED |

**Gaps:** None identified. ONE is a complete implementation of the 4-layer architecture with all 7 invariants enforced.
