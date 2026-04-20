# ONE Command Center — Visual Logic Map (Gemini/Bondi Spec)

## Four Modules

1. **THE PULSE** (Top Bar) — Node status from MANTIS sweep (NOT self-report). States: IDLE/ACTIVE/ERROR.
2. **RESONANCE FEED** (Left Panel) — Stream from /05_CONTEXT. Timestamp + Event + Pattern Tag.
3. **EXECUTION GATE** (Center Panel) — Task packets with SIGN & AUTHORIZE button. Creates signed approval record, NO direct execution.
4. **LEDGER STRIKE** (Right Panel) — Live receipt feed from /06_PROOF. Receipt ID, Action, Approved By, Commit/Execution Ref.

## Build Constraints
- Extend existing one-app, do NOT rebuild
- Approval button generates signed record; execution is separate system
- MANTIS is source of truth, not agent self-report

## Backend Sources
| Module | Source | Status |
|--------|--------|--------|
| THE PULSE | MANTIS_SWEEP.json | READY |
| RESONANCE FEED | /05_CONTEXT/*.doc | READY |
| EXECUTION GATE | /04_MANTIS/TASKS/ | READY |
| LEDGER STRIKE | /06_PROOF/*.json | INITIALIZED |
