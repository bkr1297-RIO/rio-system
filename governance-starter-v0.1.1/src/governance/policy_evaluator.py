from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import yaml

DEFAULT_PRECEDENCE = [
    "DENY",
    "REQUIRE_HUMAN_APPROVAL",
    "PREAUTHORIZED_EXTERNAL",
    "ALLOW_WITH_RECEIPT",
    "ALLOW_INTERNAL",
]

EXTERNAL_TOOLS = {"github", "email", "crm", "calendar", "qiskit_runtime"}
DENY_BY_DEFAULT_ACTIONS = {"use_secret", "move_money", "purchase", "change_billing"}
REQUIRE_HUMAN_ACTIONS = {
    "send_email",
    "publish_post",
    "submit_form",
    "message_external_party",
}


def load_policy_schema(path: str | Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def build_precedence_map(precedence_order: Iterable[str]) -> Dict[str, int]:
    order = list(precedence_order)
    return {verdict: index for index, verdict in enumerate(order)}


def most_restrictive_verdict(
    verdicts: Iterable[str],
    precedence_order: Optional[Iterable[str]] = None,
) -> str:
    verdict_list = list(verdicts)
    if not verdict_list:
        raise ValueError("At least one verdict is required.")

    precedence = build_precedence_map(precedence_order or DEFAULT_PRECEDENCE)
    unknown = [verdict for verdict in verdict_list if verdict not in precedence]
    if unknown:
        raise ValueError(f"Unknown verdict(s): {unknown}")

    return min(verdict_list, key=lambda verdict: precedence[verdict])


def _ensure_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


@dataclass
class EvaluationResult:
    policy_verdict: str
    execution_allowed: bool
    approval_satisfied: bool
    governance_state: str
    receipt_required: bool
    advisory_only: bool
    matched_policy_ids: List[str]
    reasons: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "policy_verdict": self.policy_verdict,
            "execution_allowed": self.execution_allowed,
            "approval_satisfied": self.approval_satisfied,
            "governance_state": self.governance_state,
            "receipt_required": self.receipt_required,
            "advisory_only": self.advisory_only,
            "matched_policy_ids": self.matched_policy_ids,
            "reasons": self.reasons,
        }


class PolicyEvaluator:
    def __init__(self, schema_path: str | Path):
        self.schema = load_policy_schema(schema_path)
        self.defaults = self.schema.get("defaults", {})
        self.policies = self.schema.get("policies", [])
        self.rule_precedence = self.schema.get("rule_precedence", DEFAULT_PRECEDENCE)

    def evaluate(self, request: Dict[str, Any]) -> Dict[str, Any]:
        candidates: List[str] = []
        reasons: List[str] = []
        matched_policy_ids: List[str] = []
        receipt_required = False

        safeguard_verdict = self._apply_safeguards(request, reasons)
        if safeguard_verdict is not None:
            candidates.append(safeguard_verdict)
            receipt_required = True

        for policy in self.policies:
            if self._policy_matches(policy, request):
                matched_policy_ids.append(policy["id"])
                candidates.append(policy["verdict"])
                receipt_required = receipt_required or bool(policy.get("receipt_required", False))

        if not candidates:
            if self._is_external_request(request):
                candidates.append(self.defaults.get("external_default", "REQUIRE_HUMAN_APPROVAL"))
                reasons.append("No explicit allow rule matched for an external or consequential request.")
                receipt_required = True
            else:
                candidates.append("ALLOW_INTERNAL")
                reasons.append("No external consequence detected; defaulting to internal execution.")

        final_verdict = most_restrictive_verdict(candidates, self.rule_precedence)
        execution_allowed = self._execution_allowed(final_verdict, request)
        approval_satisfied = self._approval_satisfied(final_verdict, request)
        governance_state = self._governance_state(final_verdict, approval_satisfied)
        advisory_only = self._advisory_only(request)

        if final_verdict != "ALLOW_INTERNAL":
            receipt_required = True

        return EvaluationResult(
            policy_verdict=final_verdict,
            execution_allowed=execution_allowed,
            approval_satisfied=approval_satisfied,
            governance_state=governance_state,
            receipt_required=receipt_required,
            advisory_only=advisory_only,
            matched_policy_ids=matched_policy_ids,
            reasons=reasons,
        ).to_dict()

    def _apply_safeguards(self, request: Dict[str, Any], reasons: List[str]) -> Optional[str]:
        requested_action = request.get("requested_action")
        principal = request.get("principal")
        scope = request.get("scope")
        authority_basis = request.get("authority_basis")
        confidence = request.get("confidence")
        prior_receipt_present = request.get("prior_receipt_present", False)
        memory_claimed_scope = request.get("memory_claimed_scope", False)

        safeguard_candidates: List[str] = []

        if not principal:
            safeguard_candidates.append(self.defaults.get("missing_identity", "DENY"))
            reasons.append("Missing principal identity.")

        if not scope:
            safeguard_candidates.append(self.defaults.get("missing_scope", "DENY"))
            reasons.append("Missing explicit scope.")

        if memory_claimed_scope and not scope:
            safeguard_candidates.append("DENY")
            reasons.append("Memory is not scope.")

        if requested_action in DENY_BY_DEFAULT_ACTIONS:
            safeguard_candidates.append("DENY")
            reasons.append("Credential use and money movement deny by default.")

        if authority_basis == "language_output" and self._is_external_request(request):
            safeguard_candidates.append("REQUIRE_HUMAN_APPROVAL")
            reasons.append("Language output is not authority.")

        if confidence is not None and self._is_external_request(request):
            safeguard_candidates.append("REQUIRE_HUMAN_APPROVAL")
            reasons.append("Confidence is not consent.")

        if prior_receipt_present and self._is_external_request(request) and not request.get("explicit_human_approval", False):
            safeguard_candidates.append("REQUIRE_HUMAN_APPROVAL")
            reasons.append("Receipt is not future authorization.")

        if request.get("quantum_result_present") and self._request_has_downstream_consequence(request):
            if requested_action in DENY_BY_DEFAULT_ACTIONS:
                safeguard_candidates.append("DENY")
            else:
                safeguard_candidates.append("REQUIRE_HUMAN_APPROVAL")
            reasons.append("Quantum result is not execution permission.")

        if safeguard_candidates:
            return most_restrictive_verdict(safeguard_candidates, self.rule_precedence)
        return None

    def _policy_matches(self, policy: Dict[str, Any], request: Dict[str, Any]) -> bool:
        when = policy.get("when", {})
        conditions = policy.get("conditions", {})
        return self._match_when(when, request) and self._match_conditions(conditions, request)

    def _match_when(self, when: Dict[str, Any], request: Dict[str, Any]) -> bool:
        for key, allowed_values in when.items():
            request_value = request.get(key)
            if not self._value_matches(request_value, allowed_values):
                return False
        return True

    def _value_matches(self, request_value: Any, allowed_values: Any) -> bool:
        allowed_list = _ensure_list(allowed_values)
        request_list = _ensure_list(request_value)
        if not request_list:
            return False
        return any(item in allowed_list for item in request_list)

    def _match_conditions(self, conditions: Dict[str, Any], request: Dict[str, Any]) -> bool:
        if not conditions:
            return True

        scope = request.get("scope", {})
        if not isinstance(scope, dict):
            scope = {}

        repo_allowlist = conditions.get("repo_allowlist")
        if repo_allowlist and scope.get("repo") not in repo_allowlist:
            return False

        path_prefix_allowlist = conditions.get("path_prefix_allowlist")
        if path_prefix_allowlist:
            path = scope.get("path", "")
            if not any(path.startswith(prefix) for prefix in path_prefix_allowlist):
                return False

        branch_strategy = conditions.get("branch_strategy", [])
        if "feature_branch_only" in branch_strategy:
            branch = scope.get("branch")
            default_branch = scope.get("default_branch", "main")
            if not branch or branch == default_branch:
                return False

        if conditions.get("require_live_token") and not request.get("live_token_present", False):
            return False

        if conditions.get("require_cost_limit") and request.get("cost_limit") not in {"low", "medium", "high"}:
            return False

        if conditions.get("require_backend_name_or_selector"):
            has_backend_reference = bool(request.get("backend_selector") or request.get("backend_name"))
            if not has_backend_reference:
                return False

        return True

    def _is_external_request(self, request: Dict[str, Any]) -> bool:
        tool_scope = request.get("tool_scope")
        consequence_class = request.get("consequence_class")
        requested_action = request.get("requested_action")

        tool_values = set(_ensure_list(tool_scope))

        if consequence_class in {"low", "medium", "high"}:
            return True
        if tool_values & EXTERNAL_TOOLS:
            return True
        if requested_action in REQUIRE_HUMAN_ACTIONS:
            return True
        return False

    def _request_has_downstream_consequence(self, request: Dict[str, Any]) -> bool:
        return request.get("consequence_class") in {"low", "medium", "high"} or self._is_external_request(request)

    def _execution_allowed(self, verdict: str, request: Dict[str, Any]) -> bool:
        if verdict == "DENY":
            return False
        if verdict == "REQUIRE_HUMAN_APPROVAL":
            return bool(request.get("explicit_human_approval", False))
        return True

    def _approval_satisfied(self, verdict: str, request: Dict[str, Any]) -> bool:
        if verdict == "DENY":
            return False
        if verdict == "REQUIRE_HUMAN_APPROVAL":
            return bool(request.get("explicit_human_approval", False))
        return True

    def _governance_state(self, verdict: str, approval_satisfied: bool) -> str:
        if verdict == "DENY":
            return "DENIED"
        if verdict == "REQUIRE_HUMAN_APPROVAL":
            return "APPROVED_AFTER_HUMAN_REVIEW" if approval_satisfied else "AWAITING_HUMAN_APPROVAL"
        if verdict == "PREAUTHORIZED_EXTERNAL":
            return "APPROVED_BY_PREAUTH"
        if verdict == "ALLOW_WITH_RECEIPT":
            return "APPROVED_WITH_RECEIPT"
        return "INTERNAL_ONLY_EXECUTION"

    def _advisory_only(self, request: Dict[str, Any]) -> bool:
        if request.get("requested_action") != "run_quantum_task":
            return False
        scope = request.get("scope", {})
        if not isinstance(scope, dict):
            scope = {}
        return scope.get("result_mode") == "advisory"
