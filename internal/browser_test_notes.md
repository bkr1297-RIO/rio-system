# Browser Test Notes - Enhancement Verification

## Demo 2 - Stage-Light Pipeline
- Initial state: 5 stage lights visible at top (Intent Logged, Policy Checked, Approval, Execute, Receipt Recorded)
- All lights start as gray/off circles
- System diagram visible on left with 8 boxes (Agent → Intent/Request → Policy/Control Plane → Approval Required → Human Decision → Signature Service → Executor → Ledger/Receipt)
- Live System Log on right shows "Waiting for first step..."
- "Create Intent" button visible at bottom
- Need to click through to verify color transitions

### After Create Intent:
- Intent Logged: YELLOW (filled circle) ✓
- Policy Checked: YELLOW (filled circle) ✓
- Approval: RED (filled circle) ✓ — shows blocked state
- Execute: gray/off ✓
- Receipt Recorded: gray/off ✓
- "Approval Required" box highlighted in red on system diagram ✓
- Live log shows real backend entries with timestamps
- Two buttons now visible: "Attempt Execution Without Approval" and "Approve"

### After Attempt Execution Without Approval:
- Approval light stays RED
- Executor box highlighted in red on diagram
- Red banner: "Execution Blocked — This is a real server-side rejection, not a UI animation."
- Log shows EXECUTION_ATTEMPTED and EXECUTION_STATUS: BLOCKED — HTTP 403

### After Approve:
- Approval light changed to BLUE ✓
- Signature Service box highlighted in blue on diagram
- Log shows HUMAN_DECISION: APPROVED, SIGNATURE_CREATED, SIGNATURE_VERIFIED: TRUE

### After Execute:
- Execute light: GREEN ✓
- Receipt Recorded light: WHITE ✓
- Ledger/Receipt box highlighted at bottom of diagram
- Log shows EXECUTION_STATUS: AUTHORIZED, ACTION_EXECUTED, RECEIPT_CREATED, LEDGER_ENTRY_WRITTEN
- Real receipt JSON and ledger entry displayed side by side below

## Stage-Light Pipeline Summary:
Intent Logged 🟡 → Policy Checked 🟡 → Approval 🔴 → Approved 🔵 → Executed 🟢 → Receipt ⚪
ALL TRANSITIONS VERIFIED ✓

## Demo 1 — Deny Flow Test (Fixed)
- Step 1: Created intent INT-1A904662 ✓
- Step 2: Phone notification appeared with Approve/Deny buttons ✓
- Clicked Deny: Auto-advanced to Step 3 showing denial record ✓
- Denial Record shows: intentId, decision: "denied", decidedBy: "human_user", timestamp ✓
- Execution Attempt After Denial shows: allowed: false, httpStatus: 403, status: "denied" ✓
- Step 4: Shows "EXECUTION PERMANENTLY BLOCKED" in red, denial receipt with Copy button ✓
- All 6 vitest tests pass ✓
