"""
MANTIS Contrast Layer v0.2 — Calibrated
Read-only observer — compares drafts/actions against the pattern corpus.
Detects alignment, partial alignment, or deviation. NEVER executes, blocks, or decides.

v0.2 changes:
- Added PARTIAL status for graded alignment
- Added alignment_score (0–100) to contrast packet
- Improved severity logic (constraint/risk=HIGH, score<50=MEDIUM, else=LOW)
- Improved deviation messaging (less harsh, more descriptive)
- Constraint and risk patterns remain binary (no PARTIAL)

Output is advisory only. Fails silent on insufficient signal.
Deterministic — no guessing, no inference.
"""

import json
import os
import re
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from selector.select_patterns import select_patterns
from validator.validate_pattern import load_corpus


def _tokenize(text: str) -> set:
    """Simple word tokenizer — lowercase, split on non-alpha."""
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def calculate_alignment_score(observations: list) -> int:
    """
    Calculate a 0–100 alignment score from observations.
    ALIGNED=1.0, PARTIAL=0.5, DEVIATES=0.0
    """
    weights = {
        "ALIGNED": 1.0,
        "PARTIAL": 0.5,
        "DEVIATES": 0.0,
    }

    total = len(observations)
    if total == 0:
        return 0

    score = sum(weights.get(o["status"], 0) for o in observations) / total
    return round(score * 100)


def _check_workflow(draft: str, pattern: dict) -> dict:
    """
    Workflow / design patterns:
    Check if expected structure is present in the draft.
    Graded: ALIGNED (>=60% coverage), PARTIAL (>=20%), DEVIATES (<20%).
    """
    draft_tokens = _tokenize(draft)
    conditions = pattern.get("conditions", {})
    expected_tokens = (
        _tokenize(" ".join(conditions.get("signals", [])))
        | _tokenize(" ".join(conditions.get("inputs", [])))
    )

    if not expected_tokens:
        return {"status": "ALIGNED", "note": "No specific structure expected"}

    overlap = draft_tokens & expected_tokens
    coverage = len(overlap) / len(expected_tokens) if expected_tokens else 0

    if coverage >= 0.6:
        return {
            "status": "ALIGNED",
            "note": f"Expected structure present ({', '.join(sorted(overlap))})",
        }
    elif coverage >= 0.2:
        missing = expected_tokens - draft_tokens
        present = sorted(overlap)
        return {
            "status": "PARTIAL",
            "note": f"Partially aligned: mentions {', '.join(present)} but lacks {', '.join(sorted(missing)[:3])}",
        }
    else:
        missing = expected_tokens - draft_tokens
        return {
            "status": "DEVIATES",
            "note": f"Missing expected elements: {', '.join(sorted(missing)[:5])}",
        }


def _check_constraint(draft: str, pattern: dict) -> dict:
    """
    Constraint patterns:
    Binary only — NO PARTIAL.
    If violated → DEVIATES (HIGH). If respected → ALIGNED.
    """
    draft_tokens = _tokenize(draft)
    conditions = pattern.get("conditions", {})
    constraint_signals = _tokenize(" ".join(conditions.get("signals", [])))

    # If constraint mentions approval/review and draft doesn't mention it
    approval_words = {"approval", "review", "confirm", "verify", "check"}
    needs_approval = bool(constraint_signals & approval_words)

    if needs_approval:
        has_approval_ref = bool(draft_tokens & approval_words)
        if has_approval_ref:
            return {"status": "ALIGNED", "note": "Approval/review step referenced"}
        else:
            return {
                "status": "DEVIATES",
                "note": "Constraint: approval/review step missing",
            }

    # General constraint: check if constraint signals are acknowledged
    signal_overlap = draft_tokens & constraint_signals
    if signal_overlap:
        return {"status": "ALIGNED", "note": "Constraint signals acknowledged"}
    else:
        return {
            "status": "DEVIATES",
            "note": f"Constraint: signals not addressed ({', '.join(sorted(constraint_signals)[:5])})",
        }


def _check_risk(draft: str, pattern: dict) -> dict:
    """
    Risk patterns:
    Binary only — NO PARTIAL.
    If trigger condition detected → DEVIATES + risk_flag.
    Check signals, inputs, AND context for risk detection.
    """
    draft_tokens = _tokenize(draft)
    conditions = pattern.get("conditions", {})
    risk_tokens = (
        _tokenize(" ".join(conditions.get("signals", [])))
        | _tokenize(" ".join(conditions.get("inputs", [])))
        | _tokenize(" ".join(conditions.get("context", [])))
    )

    trigger_overlap = draft_tokens & risk_tokens
    if trigger_overlap:
        return {
            "status": "DEVIATES",
            "note": f"Risk trigger detected: {', '.join(sorted(trigger_overlap))}",
            "risk_flag": pattern.get("description", "Risk pattern triggered"),
        }
    else:
        return {"status": "ALIGNED", "note": "No risk triggers detected"}


def _check_communication(draft: str, pattern: dict) -> dict:
    """
    Communication patterns:
    Graded: ALIGNED (>=60% coverage), PARTIAL (>=20%), DEVIATES (<20%).
    """
    draft_tokens = _tokenize(draft)
    conditions = pattern.get("conditions", {})
    expected = _tokenize(" ".join(conditions.get("signals", [])))

    if not expected:
        return {"status": "ALIGNED", "note": "No specific communication elements expected"}

    overlap = draft_tokens & expected
    coverage = len(overlap) / len(expected) if expected else 0

    if coverage >= 0.6:
        return {
            "status": "ALIGNED",
            "note": f"Communication elements present ({', '.join(sorted(overlap))})",
        }
    elif coverage >= 0.2:
        missing = expected - draft_tokens
        present = sorted(overlap)
        return {
            "status": "PARTIAL",
            "note": f"Partially aligned: mentions {', '.join(present)} but lacks {', '.join(sorted(missing)[:3])}",
        }
    else:
        missing = expected - draft_tokens
        return {
            "status": "DEVIATES",
            "note": f"Missing communication elements: {', '.join(sorted(missing)[:5])}",
        }


# ── Dispatch table ───────────────────────────────────────────────────
_CHECKERS = {
    "workflow": _check_workflow,
    "design": _check_workflow,
    "decision": _check_workflow,
    "constraint": _check_constraint,
    "risk": _check_risk,
    "communication": _check_communication,
}


def mantis_contrast(task: str, draft: str, patterns: list) -> dict:
    """
    Compare a draft against selected patterns.
    Returns a Contrast Packet (read-only, advisory).

    Args:
        task: the original task description
        draft: the current draft/action text to contrast
        patterns: list of pattern dicts (from selector)

    Returns:
        Contrast Packet dict with alignment_score (0–100)
    """
    observations = []
    risk_flags = []

    for pattern in patterns:
        ptype = pattern.get("pattern_type", "workflow")
        checker = _CHECKERS.get(ptype, _check_workflow)

        result = checker(draft, pattern)

        observation = {
            "pattern_id": pattern.get("pattern_id", "unknown"),
            "status": result["status"],
            "note": result["note"],
            "confidence": pattern.get("confidence", {}).get("score", 0),
        }
        observations.append(observation)

        if "risk_flag" in result:
            risk_flags.append(result["risk_flag"])

    # Count by status
    aligned = sum(1 for o in observations if o["status"] == "ALIGNED")
    partial = sum(1 for o in observations if o["status"] == "PARTIAL")
    deviates = sum(1 for o in observations if o["status"] == "DEVIATES")

    # Alignment score (0–100)
    alignment_score = calculate_alignment_score(observations)

    # Severity rules (v0.2):
    # constraint violation or risk flag → HIGH
    # alignment_score < 50 → MEDIUM
    # else → LOW
    has_constraint_deviation = any(
        o["status"] == "DEVIATES"
        for o, p in zip(observations, patterns)
        if p.get("pattern_type") == "constraint"
    )
    has_risk_flag = len(risk_flags) > 0

    if has_constraint_deviation or has_risk_flag:
        severity = "high"
    elif alignment_score < 50:
        severity = "medium"
    else:
        severity = "low"

    return {
        "packet_id": str(uuid.uuid4()),
        "task": task,
        "observations": observations,
        "summary": {
            "aligned": aligned,
            "partial": partial,
            "deviates": deviates,
            "risk_flags": risk_flags,
        },
        "alignment_score": alignment_score,
        "severity": severity,
        "non_authoritative": True,
    }


# ── CLI interface ────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python mantis_contrast.py <task.json> <draft.txt>")
        print("  task.json: {description, inputs, signals}")
        print("  draft.txt: plain text draft to contrast against patterns")
        sys.exit(1)

    with open(sys.argv[1], "r") as f:
        task_data = json.load(f)

    with open(sys.argv[2], "r") as f:
        draft_text = f.read()

    corpus = load_corpus()
    patterns = select_patterns(task_data, corpus)
    packet = mantis_contrast(task_data.get("description", ""), draft_text, patterns)

    print(json.dumps(packet, indent=2))
