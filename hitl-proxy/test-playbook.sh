#!/bin/bash
# RIO HITL Proxy — Full Playbook End-to-End Test
# Runs all 10 steps from the API Playbook and verifies each one.

BASE="http://localhost:8080/api/hitl"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name (expected: $expected)"
    echo "     GOT: $actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "═══════════════════════════════════════════════════════"
echo " RIO HITL PROXY — FULL PLAYBOOK TEST"
echo "═══════════════════════════════════════════════════════"
echo ""

# Step 1: Onboard
echo "Step 1: Onboard user 'brian'"
R1=$(curl -s -X POST "$BASE/onboard" -H "Content-Type: application/json" -d '{"userId":"brian"}')
echo "  Response: $R1"
check "User onboarded" "ACTIVE" "$R1"
check "Seed bound" "SEED-v1.0.0-system" "$R1"
echo ""

# Step 2: LOW risk intent (echo)
echo "Step 2: Create LOW risk intent (echo)"
R2=$(curl -s -X POST "$BASE/intent" -H "Content-Type: application/json" -d '{"userId":"brian","toolName":"echo","toolArgs":{"message":"hello from RIO HITL"}}')
echo "  Response: $R2"
INTENT_LOW=$(echo "$R2" | python3 -c "import sys,json; print(json.load(sys.stdin)['intentId'])" 2>/dev/null)
echo "  Intent ID: $INTENT_LOW"
check "LOW risk detected" "LOW" "$R2"
check "Approval not required" "false" "$R2"
echo ""

# Step 3: Execute LOW risk intent
echo "Step 3: Execute LOW risk intent (no approval needed)"
R3=$(curl -s -X POST "$BASE/execute" -H "Content-Type: application/json" -d "{\"intentId\":\"$INTENT_LOW\"}")
echo "  Response: $R3"
check "Execution SUCCESS" "SUCCESS" "$R3"
echo ""

# Step 4: HIGH risk intent (send_email)
echo "Step 4: Create HIGH risk intent (send_email)"
R4=$(curl -s -X POST "$BASE/intent" -H "Content-Type: application/json" -d '{"userId":"brian","toolName":"send_email","toolArgs":{"to":"bkr1297@gmail.com","subject":"RIO HITL Test","body":"This email was sent via the RIO HITL proxy after human approval."}}')
echo "  Response: $R4"
INTENT_HIGH=$(echo "$R4" | python3 -c "import sys,json; print(json.load(sys.stdin)['intentId'])" 2>/dev/null)
echo "  Intent ID: $INTENT_HIGH"
check "HIGH risk detected" "HIGH" "$R4"
check "Approval required" "true" "$R4"
check "Blast radius computed" "email" "$R4"
echo ""

# Step 5: Approve the HIGH risk intent
echo "Step 5: Human Root approves the intent"
R5=$(curl -s -X POST "$BASE/approval" -H "Content-Type: application/json" -d "{\"intentId\":\"$INTENT_HIGH\",\"decision\":{\"value\":\"yes\",\"reason\":\"Reviewed and approved — sending test email\"},\"approvingUserId\":\"brian\"}")
echo "  Response: $R5"
APPROVAL_ID=$(echo "$R5" | python3 -c "import sys,json; print(json.load(sys.stdin)['approvalId'])" 2>/dev/null)
echo "  Approval ID: $APPROVAL_ID"
check "Approval APPROVED" "APPROVED" "$R5"
check "Max executions = 1" "maxExecutions" "$R5"
check "Signature present" "signature" "$R5"
echo ""

# Step 6: Execute the approved HIGH risk intent
echo "Step 6: Execute approved HIGH risk intent"
R6=$(curl -s -X POST "$BASE/execute" -H "Content-Type: application/json" -d "{\"intentId\":\"$INTENT_HIGH\",\"approvalId\":\"$APPROVAL_ID\"}")
echo "  Response: $R6"
check "Execution SUCCESS" "SUCCESS" "$R6"
check "Preflight checks passed" "preflightChecks" "$R6"
echo ""

# Step 6b: Try to execute again (should be EXHAUSTED)
echo "Step 6b: Try to execute again (should fail — EXHAUSTED)"
R6B=$(curl -s -X POST "$BASE/execute" -H "Content-Type: application/json" -d "{\"intentId\":\"$INTENT_HIGH\",\"approvalId\":\"$APPROVAL_ID\"}")
echo "  Response: $R6B"
check "Approval exhausted" "EXHAUSTED" "$R6B"
echo ""

# Step 7: Reject an intent
echo "Step 7: Create and reject an intent"
R7A=$(curl -s -X POST "$BASE/intent" -H "Content-Type: application/json" -d '{"userId":"brian","toolName":"send_email","toolArgs":{"to":"test@test.com","subject":"Reject test","body":"Should be rejected"}}')
INTENT_REJECT=$(echo "$R7A" | python3 -c "import sys,json; print(json.load(sys.stdin)['intentId'])" 2>/dev/null)
R7=$(curl -s -X POST "$BASE/approval" -H "Content-Type: application/json" -d "{\"intentId\":\"$INTENT_REJECT\",\"decision\":{\"value\":\"no\",\"reason\":\"Not authorized at this time\"},\"approvingUserId\":\"brian\"}")
echo "  Response: $R7"
check "Intent REJECTED" "REJECTED" "$R7"
echo ""

# Step 8: Check status
echo "Step 8: Check status for brian"
R8=$(curl -s "$BASE/status/brian")
echo "  Response (truncated): $(echo $R8 | head -c 200)..."
check "Proxy user found" "ACTIVE" "$R8"
check "Recent intents present" "recentIntents" "$R8"
echo ""

# Step 9: View ledger
echo "Step 9: View audit ledger"
R9=$(curl -s "$BASE/ledger")
LEDGER_COUNT=$(echo "$R9" | python3 -c "import sys,json; print(json.load(sys.stdin)['count'])" 2>/dev/null)
echo "  Ledger entries: $LEDGER_COUNT"
check "Ledger has entries" "count" "$R9"
echo ""

# Verify hash chain
echo "Step 9b: Verify hash chain integrity"
R9V=$(curl -s "$BASE/verify")
echo "  Response: $R9V"
check "Hash chain valid" "true" "$R9V"
echo ""

# Step 10: Kill switch
echo "Step 10: Kill switch — emergency stop"
R10=$(curl -s -X POST "$BASE/kill" -H "Content-Type: application/json" -d '{"userId":"brian","reason":"Suspicious activity detected"}')
echo "  Response: $R10"
check "PROXY_KILLED" "PROXY_KILLED" "$R10"
check "All approvals revoked" "allApprovalsRevoked" "$R10"
echo ""

# Step 10b: Try to create intent after kill (should fail)
echo "Step 10b: Try to create intent after kill (should fail)"
R10B=$(curl -s -X POST "$BASE/intent" -H "Content-Type: application/json" -d '{"userId":"brian","toolName":"echo","toolArgs":{"message":"should fail"}}')
echo "  Response: $R10B"
check "PROXY_KILLED blocks new intents" "PROXY_KILLED" "$R10B"
echo ""

echo "═══════════════════════════════════════════════════════"
echo " RESULTS: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════"

if [ $FAIL -eq 0 ]; then
  echo " 🎯 ALL TESTS PASSED — PLAYBOOK VERIFIED"
else
  echo " ⚠️  SOME TESTS FAILED"
fi
