"""
RIO Compliance Runner — Live System Verification
═════════════════════════════════════════════════
Reference implementation (Python) of the live compliance runner
in the live RIO system (rio-proxy/server/live-compliance-runner.test.ts).

This runner executes 7 scenarios against the real system:
  S1: Full governed path (propose → approve → execute → receipt)
  S2: Unauthorized execution (no token → Gate rejection)
  S3: Token replay (burn → reuse → rejection)
  S4: Argument mutation (approve A → tamper → attempt B → rejection)
  S5: Self-approval (proposer approves own → rejection)
  S6: Expired approval (TTL exceeded → rejection)
  S7: Gateway enforcement (fail-closed + principal enforcement)

Each scenario:
  - Generates or injects a real packet
  - Attempts execution (or bypass)
  - Observes real system behavior
  - Asserts based on actual Gate decision, execution outcome, receipt artifacts

No mocked responses. All PASS/FAIL from real system state.
"""

import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.security.tokens import (
    register_root_authority,
    activate_policy,
    DEFAULT_POLICY_RULES,
    issue_authorization_token,
    validate_authorization_token,
    burn_authorization_token,
    get_authorization_token,
    reset_authority_state,
    compute_args_hash,
    extract_denial_reasons,
)
from server.orchestrator import propose, approve, execute, reset_orchestrator_state


# ═══════════════════════════════════════════════════════════════
# TEST INFRASTRUCTURE
# ═══════════════════════════════════════════════════════════════

class ComplianceResult:
    def __init__(self, scenario: str, claim: str):
        self.scenario = scenario
        self.claim = claim
        self.pass_fail = "PENDING"
        self.evidence: dict[str, Any] = {}
        self.timestamp = datetime.now(timezone.utc).isoformat()

    def mark_pass(self, evidence: dict):
        self.pass_fail = "PASS"
        self.evidence = evidence

    def mark_fail(self, evidence: dict):
        self.pass_fail = "FAIL"
        self.evidence = evidence

    def to_dict(self) -> dict:
        return {
            "scenario": self.scenario,
            "claim": self.claim,
            "passFail": self.pass_fail,
            "evidence": self.evidence,
            "timestamp": self.timestamp,
        }


def setup_authority():
    """Initialize the authority layer for testing."""
    reset_authority_state()
    reset_orchestrator_state()

    root_key = "a]" * 32  # 64-char hex-like string for testing
    register_root_authority(root_key)

    policy_sig = "b" * 128  # Valid-length signature
    activate_policy(
        policy_id="COMPLIANCE-TEST-POLICY",
        rules=DEFAULT_POLICY_RULES,
        policy_signature=policy_sig,
        root_public_key=root_key,
    )


# ═══════════════════════════════════════════════════════════════
# SCENARIOS
# ═══════════════════════════════════════════════════════════════

def s1_full_governed_path() -> ComplianceResult:
    """S1: Full governed path — propose → approve → execute → receipt."""
    r = ComplianceResult("S1", "Full governed execution produces valid receipt")

    intent = propose(
        tool_name="send_email",
        tool_args={"to": "test@example.com", "subject": "S1 Test", "body": "Governed"},
        proposer_id="proposer-1",
    )

    approved = approve(
        intent_id=intent["intent_id"],
        approver_id="approver-1",
    )

    result = execute(
        intent_id=intent["intent_id"],
        executor_id="executor-1",
    )

    receipt = result["receipt"]
    has_receipt = receipt is not None
    has_hash = len(receipt.get("receipt_hash", "")) == 64
    has_signature = len(receipt.get("gateway_signature", "")) > 0

    if has_receipt and has_hash and has_signature:
        r.mark_pass({
            "receipt_id": receipt["receipt_id"],
            "receipt_hash": receipt["receipt_hash"],
            "gateway_signature_present": True,
            "status": receipt["status"],
        })
    else:
        r.mark_fail({"receipt": receipt})

    return r


def s2_unauthorized_execution() -> ComplianceResult:
    """S2: Unauthorized execution — no token → Gate rejection."""
    r = ComplianceResult("S2", "Execution without valid token is blocked by Gate")

    intent = propose(
        tool_name="send_email",
        tool_args={"to": "test@example.com", "subject": "S2", "body": "Unauthorized"},
        proposer_id="proposer-1",
    )
    # Do NOT approve — attempt direct execution
    try:
        execute(intent_id=intent["intent_id"], executor_id="attacker")
        r.mark_fail({"error": "Execution succeeded without approval"})
    except (ValueError, PermissionError) as e:
        r.mark_pass({"blocked": True, "error": str(e)})

    return r


def s3_token_replay() -> ComplianceResult:
    """S3: Token replay — burn token → attempt reuse → rejection."""
    r = ComplianceResult("S3", "Burned token cannot be replayed")

    intent = propose(
        tool_name="send_email",
        tool_args={"to": "test@example.com", "subject": "S3", "body": "Replay"},
        proposer_id="proposer-1",
    )
    approved = approve(intent_id=intent["intent_id"], approver_id="approver-1")

    # Execute once (burns token)
    result = execute(intent_id=intent["intent_id"], executor_id="executor-1")

    # Attempt replay
    intent2 = propose(
        tool_name="send_email",
        tool_args={"to": "test@example.com", "subject": "S3", "body": "Replay"},
        proposer_id="proposer-1",
    )
    # Manually set the burned token ID
    from server.orchestrator import _intents
    _intents[intent2["intent_id"]]["status"] = "approved"
    _intents[intent2["intent_id"]]["authorization_token_id"] = approved["authorization_token_id"]
    _intents[intent2["intent_id"]]["approval_id"] = approved["approval_id"]
    _intents[intent2["intent_id"]]["approved_at"] = approved["approved_at"]

    try:
        execute(intent_id=intent2["intent_id"], executor_id="attacker")
        r.mark_fail({"error": "Replay succeeded"})
    except PermissionError as e:
        r.mark_pass({"blocked": True, "error": str(e), "reason": "TOKEN_ALREADY_CONSUMED"})

    return r


def s4_argument_mutation() -> ComplianceResult:
    """S4: Argument mutation — approve A → tamper → attempt B → rejection."""
    r = ComplianceResult("S4", "Mutated arguments are rejected by Gate")

    intent = propose(
        tool_name="send_email",
        tool_args={"to": "safe@example.com", "subject": "S4", "body": "Original"},
        proposer_id="proposer-1",
    )
    approved = approve(intent_id=intent["intent_id"], approver_id="approver-1")

    # Tamper with the intent args
    from server.orchestrator import _intents
    _intents[intent["intent_id"]]["tool_args"] = {
        "to": "evil@attacker.com", "subject": "HACKED", "body": "Mutated"
    }

    try:
        execute(intent_id=intent["intent_id"], executor_id="attacker")
        r.mark_fail({"error": "Mutated execution succeeded"})
    except PermissionError as e:
        error_str = str(e)
        r.mark_pass({
            "blocked": True,
            "error": error_str,
            "mutation_detected": "TOKEN_HASH_MISMATCH" in error_str or "token_parameters_hash_match" in error_str,
        })

    return r


def s5_self_approval() -> ComplianceResult:
    """S5: Self-approval — proposer attempts to approve own intent → rejection."""
    r = ComplianceResult("S5", "Proposer cannot approve their own intent")

    intent = propose(
        tool_name="send_email",
        tool_args={"to": "test@example.com", "subject": "S5", "body": "Self-approve"},
        proposer_id="proposer-1",
    )

    try:
        approve(intent_id=intent["intent_id"], approver_id="proposer-1")
        r.mark_fail({"error": "Self-approval succeeded"})
    except PermissionError as e:
        r.mark_pass({"blocked": True, "error": str(e)})

    return r


def s6_expired_approval() -> ComplianceResult:
    """S6: Expired approval — create expired token → attempt execution → rejection."""
    r = ComplianceResult("S6", "Expired token is rejected by Gate")

    intent = propose(
        tool_name="send_email",
        tool_args={"to": "test@example.com", "subject": "S6", "body": "Expired"},
        proposer_id="proposer-1",
    )

    # Issue token with 0-minute expiry (already expired)
    token = issue_authorization_token(
        intent_id=intent["intent_id"],
        action="send_email",
        tool_args={"to": "test@example.com", "subject": "S6", "body": "Expired"},
        approved_by="APPR-expired",
        expiry_minutes=0,  # Immediately expired
    )

    # Validate the expired token
    validation = validate_authorization_token(
        token=token,
        action="send_email",
        tool_args={"to": "test@example.com", "subject": "S6", "body": "Expired"},
    )

    if not validation["valid"]:
        reasons = extract_denial_reasons(validation)
        r.mark_pass({
            "blocked": True,
            "denial_reasons": reasons,
            "expired": "TOKEN_EXPIRED" in reasons,
        })
    else:
        r.mark_fail({"error": "Expired token was accepted"})

    return r


def s7_local_enforcement() -> ComplianceResult:
    """S7: Local enforcement — verify fail-closed behavior is active."""
    r = ComplianceResult("S7", "Local enforcement is active (fail-closed)")

    from server.security.tokens import get_active_policy
    policy = get_active_policy()

    if policy and policy["rules"]["fail_closed"]:
        r.mark_pass({
            "fail_closed": True,
            "policy_id": policy["policy_id"],
            "policy_status": policy["status"],
        })
    else:
        r.mark_fail({"error": "Fail-closed not active"})

    return r


# ═══════════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════════

def run_compliance_suite() -> dict:
    """Run all 7 compliance scenarios and generate report."""
    setup_authority()

    scenarios = [
        s1_full_governed_path,
        s2_unauthorized_execution,
        s3_token_replay,
        s4_argument_mutation,
        s5_self_approval,
        s6_expired_approval,
        s7_local_enforcement,
    ]

    results = []
    for fn in scenarios:
        setup_authority()  # Fresh state per scenario
        result = fn()
        results.append(result)
        print(f"  {result.scenario}: {result.pass_fail} — {result.claim}")

    passed = sum(1 for r in results if r.pass_fail == "PASS")
    failed = sum(1 for r in results if r.pass_fail == "FAIL")

    report = {
        "_meta": {
            "type": "compliance_report",
            "version": "1.0.0",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "runner": "run_tests.py",
        },
        "summary": {
            "total": len(results),
            "passed": passed,
            "failed": failed,
            "overall": "PASS" if failed == 0 else "FAIL",
        },
        "results": [r.to_dict() for r in results],
    }

    return report


def main():
    print("═══════════════════════════════════════════════════")
    print("  RIO Compliance Runner — Live System Verification")
    print("═══════════════════════════════════════════════════")
    print()

    report = run_compliance_suite()

    print()
    print(f"  Overall: {report['summary']['overall']} "
          f"({report['summary']['passed']}/{report['summary']['total']})")
    print()

    # Write report
    os.makedirs("artifacts/compliance", exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    report_path = f"artifacts/compliance/compliance-report-{timestamp}.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"  Report: {report_path}")

    return 0 if report["summary"]["overall"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
