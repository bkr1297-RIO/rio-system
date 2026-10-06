from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any
from pathlib import Path
import json


class SettlementStatus(str, Enum):
    INVALID = "INVALID"
    DENY = "DENY"
    HOLD = "HOLD"
    SETTLED_RETURN = "SETTLED_RETURN"


@dataclass(frozen=True)
class SettlementEvaluation:
    status: SettlementStatus
    reason: str
    reason_code: str


def compute_settlement_status(
    noop_execution_receipt: dict[str, Any] | None,
    lifecycle: dict[str, Any] | None,
    sourcepoint_decision: dict[str, Any] | None,
    settlement_request: dict[str, Any] | None,
    *, profile: str = "NOOP_RECEIPT",
) -> tuple[str, str, str]:
    """Evaluate MUS Return Settlement in strict priority order.

    This is the reusable runtime extraction of the existing
    MUS-RETURN-SETTLEMENT-001 proof-harness algorithm.

    Priority:
        INVALID > DENY > HOLD > SETTLED_RETURN

    A positive settlement now requires explicit SourcePoint acceptance. Missing,
    unknown, or denied review states cannot fall through into settlement.
    """

    nr = noop_execution_receipt
    lc = lifecycle or {}
    sd = sourcepoint_decision or {}
    sr = settlement_request or {}

    if profile not in ("NOOP_RECEIPT", "one.ica.reporting-account.f0.1"):
        return ("INVALID", "Unknown settlement profile.", "settlement_profile_invalid")
    reporting = profile == "one.ica.reporting-account.f0.1"
    if reporting:
        contract = json.loads((Path(__file__).resolve().parents[1] / "F1-PROFILE.json").read_text())
        if not nr or nr.get("profile") != contract["profile"] or sr.get("scope") != contract["settlement_scope"]:
            return ("INVALID", "The explicit reporting-account scope is required.", "reporting_scope_invalid")
        required = set(contract["required_reports"])
        reports = nr.get("reports", [])
        if nr.get("return_completeness") != "COMPLETE" or set(nr.get("required_reports", [])) != required or set(reports) != required or len(reports) != len(required):
            return ("HOLD", "Required reporting obligations remain incomplete.", "reporting_incomplete")
        if not nr.get("return_id") or not nr.get("research_return_id") or not nr.get("account_digest") or sd.get("account_digest") != nr.get("account_digest") or sd.get("sourcepoint_ref") != nr.get("sourcepoint_ref"):
            return ("INVALID", "Review must bind the exact attributable Return account.", "reporting_review_binding_invalid")

    if not nr:
        return (
            "INVALID",
            "No-op execution receipt is missing or null. Settlement cannot "
            "evaluate without a no-op receipt to review.",
            "noop_receipt_missing",
        )

    receipt_lc = nr.get("lifecycle_ref", "")
    lc_id = lc.get("lifecycle_id", "")
    if receipt_lc and lc_id and receipt_lc != lc_id:
        return (
            "INVALID",
            f"No-op receipt lifecycle_ref '{receipt_lc}' does not match "
            f"lifecycle.lifecycle_id '{lc_id}'. Receipt must belong to the "
            "same lifecycle chain.",
            "lifecycle_mismatch",
        )

    receipt_sp = nr.get("sourcepoint_ref", "")
    lc_sp = lc.get("sourcepoint_id", "")
    if receipt_sp and lc_sp and receipt_sp != lc_sp:
        return (
            "INVALID",
            f"No-op receipt sourcepoint_ref '{receipt_sp}' does not match "
            f"lifecycle.sourcepoint_id '{lc_sp}'. SourcePoint mismatch breaks "
            "the chain.",
            "sourcepoint_mismatch",
        )

    if sr.get("inferred_learning") or sr.get("learning_standing_update"):
        return (
            "INVALID",
            "Learning or standing update inferred from a no-op receipt before "
            "settlement. A receipt is not learning authorization. Learning may "
            "be proposed only after settlement.",
            "learning_inferred_without_settlement",
        )

    if sr.get("inferred_replay_permission"):
        return (
            "INVALID",
            "Replay permission inferred from no-op receipt alone before "
            "settlement. A receipt is not replay permission.",
            "replay_inferred_without_settlement",
        )

    if sr.get("inferred_future_authorization"):
        return (
            "INVALID",
            "Future authorization inferred from no-op receipt alone before "
            "settlement. A receipt is not future approval.",
            "future_authorization_inferred",
        )

    if sr.get("receipt_tampered") or nr.get("hash_valid") is False:
        return (
            "DENY",
            "Returned receipt indicates tampering. Receipt hash or contents do "
            "not match expected values. Settlement denied.",
            "receipt_tampered",
        )

    if nr.get("external_side_effects") is True and not reporting:
        return (
            "DENY",
            "No-op receipt reports external_side_effects true. If the adapter "
            "changed the world, this proof failed. Settlement denied.",
            "external_side_effect_detected",
        )

    if sr.get("return_path_broken"):
        return (
            "DENY",
            "Return path exists structurally but is contradicted or does not "
            "resolve to the expected receipt. Settlement denied.",
            "return_path_broken",
        )

    review_status = sd.get("review_status")
    if review_status is None or review_status == "":
        return (
            "INVALID",
            "SourcePoint settlement review status is missing. Settlement cannot "
            "infer acceptance from silence or absence.",
            "sourcepoint_review_status_missing",
        )

    if review_status == "denied":
        return (
            "DENY",
            "SourcePoint explicitly denied settlement of the returned proof.",
            "sourcepoint_settlement_denied",
        )

    if review_status == "pending":
        return (
            "HOLD",
            "SourcePoint settlement review is pending. MUS cannot settle until "
            "SourcePoint accepts the returned proof.",
            "sourcepoint_review_pending",
        )

    if review_status != "accepted":
        return (
            "INVALID",
            f"SourcePoint settlement review status '{review_status}' is not a "
            "recognized settlement disposition.",
            "sourcepoint_review_status_invalid",
        )

    discernment = sr.get("human_discernment_status")
    if discernment == "pending_review":
        return (
            "HOLD",
            "Human discernment status is 'pending_review' (not ratified). "
            "Settlement holds until human review is ratified.",
            "human_discernment_pending",
        )

    if discernment != "ratified":
        return (
            "INVALID",
            "Human discernment status must be explicitly ratified before a "
            "returned proof may settle.",
            "human_discernment_status_invalid",
        )

    if reporting:
        return ("SETTLED_RETURN", "The human accepted the reporting account only. Occurrence, outcome, residue and obligations retain their existing coordinates. No future authority is supplied.", "reporting_account_accepted")

    return (
        "SETTLED_RETURN",
        (
            "MUS / SourcePoint review accepted the returned no-op proof as "
            "settled. No external world was touched. SETTLED_RETURN does not "
            "authorize future replay, silent learning, memory update, standing "
            "update, or future authorization."
        ),
        "noop_receipt_settled",
    )


def evaluate_settlement(
    noop_execution_receipt: dict[str, Any] | None,
    lifecycle: dict[str, Any] | None,
    sourcepoint_decision: dict[str, Any] | None,
    settlement_request: dict[str, Any] | None,
    *, profile: str = "NOOP_RECEIPT",
) -> SettlementEvaluation:
    status, reason, reason_code = compute_settlement_status(
        noop_execution_receipt,
        lifecycle,
        sourcepoint_decision,
        settlement_request,
        profile=profile,
    )
    return SettlementEvaluation(SettlementStatus(status), reason, reason_code)
