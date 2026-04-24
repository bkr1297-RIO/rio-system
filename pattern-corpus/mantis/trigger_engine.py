"""
MANTIS Trigger Engine v0.2
Timing + routing layer — decides WHEN MANTIS surfaces contrast.

v0.2 changes:
- Minimum signal threshold (has_meaningful_signal)
- Refined trigger conditions (T1/T2 conditional on alignment_score)
- Low-signal suppression
- Surface level adjustment (HIGH/MEDIUM/LOW/NONE)
- Quiet mode (score >= 70 + no risk + no constraint → no surface)
- Dedup includes alignment_score

Rules:
- NEVER executes, blocks, approves, or denies
- Only ONE surface per action
- Fails silent on no meaningful signal
- Does NOT modify corpus or RIO
- Does NOT introduce loops or repeated alerts

Trigger priority (strict order):
  T4 — Constraint violation (ALWAYS surfaces)
  T3 — Risk flag detected (ALWAYS surfaces)
  T1 — Pre-action checkpoint (CONDITIONAL: alignment_score < 60)
  T2 — Pre-commit checkpoint (CONDITIONAL: alignment_score < 50)
  T5 — Manual user request (ALWAYS surfaces)
"""

import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from mantis.event_types import EventType, is_valid_event_type
from mantis.surface_formatter import format_surface, format_surface_compact


# ── In-memory dedup cache ───────────────────────────────────────────
_seen_keys: set = set()


def reset_dedupe_cache():
    """Clear the dedup cache. Used in tests."""
    global _seen_keys
    _seen_keys = set()


# ── Signal detection ───────────────────────────────────────────────

def has_meaningful_signal(contrast: dict) -> bool:
    """
    Minimum signal threshold.
    Returns True only if there are actual deviations or risk flags.
    """
    summary = contrast.get("summary", {})
    return (
        summary.get("deviates", 0) > 0
        or len(summary.get("risk_flags", [])) > 0
    )


# ── Trigger classification ──────────────────────────────────────────

def contrast_has_constraint_violation(contrast: dict) -> bool:
    """Check if any observation is a constraint deviation."""
    return any(
        o["status"] == "DEVIATES" and "constraint" in o.get("note", "").lower()
        for o in contrast.get("observations", [])
    )


def contrast_has_risk_flag(contrast: dict) -> bool:
    """Check if contrast has any risk flags."""
    return len(contrast.get("summary", {}).get("risk_flags", [])) > 0


def should_trigger(event: dict, contrast: dict) -> str | None:
    """
    Determine which trigger fires, if any.
    Returns trigger code (T1-T5) or None.

    Priority order (strict):
      T4 — Constraint violation (ALWAYS)
      T3 — Risk flag (ALWAYS)
      T1 — Pre-action (CONDITIONAL: alignment_score < 60)
      T2 — Pre-commit (CONDITIONAL: alignment_score < 50)
      T5 — Manual request (ALWAYS)

    Low-signal suppression: if no meaningful signal, return None
    (except T4/T3 which are checked first).
    """
    # T4 — Constraint violation (highest priority, ALWAYS)
    if contrast_has_constraint_violation(contrast):
        return "T4"

    # T3 — Risk trigger (ALWAYS)
    if contrast_has_risk_flag(contrast):
        return "T3"

    # Low-signal suppression: no deviations and no risk → no trigger
    if not has_meaningful_signal(contrast):
        return None

    alignment_score = contrast.get("alignment_score", 0)
    event_type = event.get("type", "")

    # T1 — Pre-action (CONDITIONAL)
    if event_type == EventType.PRE_ACTION:
        if alignment_score < 60:
            return "T1"

    # T2 — Pre-commit (CONDITIONAL)
    if event_type == EventType.PRE_COMMIT:
        if alignment_score < 50:
            return "T2"

    # T5 — Manual user request (ALWAYS)
    if event.get("user_requested"):
        return "T5"

    return None


# ── Surface level adjustment ───────────────────────────────────────

def adjust_surface_level(contrast: dict) -> str:
    """
    Determine surface level based on contrast content.
    Returns: "HIGH", "MEDIUM", "LOW", or "NONE"

    Rules:
    - Constraint violation or risk flag → HIGH
    - alignment_score < 50 → MEDIUM
    - alignment_score < 70 → LOW
    - alignment_score >= 70 (quiet mode) → NONE
    """
    score = contrast.get("alignment_score", 0)

    if contrast_has_constraint_violation(contrast) or contrast_has_risk_flag(contrast):
        return "HIGH"

    if score < 50:
        return "MEDIUM"

    if score < 70:
        return "LOW"

    return "NONE"  # quiet mode — do not surface


# ── Surface decision ────────────────────────────────────────────────

def should_surface(trigger: str, contrast: dict) -> bool:
    """
    Decide whether to actually surface the contrast.
    Returns False if:
    - No meaningful observations
    - Quiet mode (surface level = NONE)
    """
    if not contrast.get("observations"):
        return False

    # Quiet mode: high-quality drafts with no risk/constraint → no surface
    level = adjust_surface_level(contrast)
    if level == "NONE":
        return False

    return True


# ── Deduplication ───────────────────────────────────────────────────

def dedupe_key(event: dict, contrast: dict) -> str:
    """
    Generate a deterministic dedup key from event + contrast summary + alignment_score.
    Same input → same key → skip repeated surface.
    v0.2: includes alignment_score in key.
    """
    payload = json.dumps(
        {
            "event": event,
            "summary": contrast.get("summary", {}),
            "alignment_score": contrast.get("alignment_score", 0),
        },
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def is_duplicate(event: dict, contrast: dict) -> bool:
    """
    Check if this event+contrast combination has already been surfaced.
    If new, register it and return False.
    If seen, return True (skip surface).
    """
    key = dedupe_key(event, contrast)
    if key in _seen_keys:
        return True
    _seen_keys.add(key)
    return False


# ── Main orchestrator ───────────────────────────────────────────────

def run_trigger(event: dict, contrast: dict) -> dict:
    """
    Full trigger pipeline:
      1. Classify trigger
      2. Check if should surface
      3. Dedup check
      4. Determine surface level
      5. Format output based on level

    Returns:
        {
            "triggered": bool,
            "trigger_code": str | None,
            "surfaced": bool,
            "surface_level": str | None,   # HIGH, MEDIUM, LOW, NONE
            "reason": str,
            "output": str | None,           # formatted surface text
            "compact": str | None,          # compact one-liner
        }
    """
    # Step 1: Classify
    trigger = should_trigger(event, contrast)

    if trigger is None:
        return {
            "triggered": False,
            "trigger_code": None,
            "surfaced": False,
            "surface_level": None,
            "reason": "no_trigger",
            "output": None,
            "compact": None,
        }

    # Step 2: Should surface?
    if not should_surface(trigger, contrast):
        return {
            "triggered": True,
            "trigger_code": trigger,
            "surfaced": False,
            "surface_level": adjust_surface_level(contrast),
            "reason": "quiet_mode" if adjust_surface_level(contrast) == "NONE" else "fail_silent",
            "output": None,
            "compact": None,
        }

    # Step 3: Dedup
    if is_duplicate(event, contrast):
        return {
            "triggered": True,
            "trigger_code": trigger,
            "surfaced": False,
            "surface_level": adjust_surface_level(contrast),
            "reason": "duplicate",
            "output": None,
            "compact": None,
        }

    # Step 4: Determine surface level
    level = adjust_surface_level(contrast)

    # Step 5: Format based on level
    if level == "LOW":
        # Compact format only for LOW
        output = format_surface_compact(contrast)
        full_output = None
    else:
        # Full output for MEDIUM/HIGH
        output = format_surface(contrast)
        full_output = output

    compact = format_surface_compact(contrast)

    return {
        "triggered": True,
        "trigger_code": trigger,
        "surfaced": True,
        "surface_level": level,
        "reason": f"trigger_{trigger}",
        "output": output,
        "compact": compact,
    }


# ── CLI interface ───────────────────────────────────────────────────
if __name__ == "__main__":
    print("MANTIS Trigger Engine v0.2")
    print("Usage: import and call run_trigger(event, contrast)")
    print("  event: {type: 'pre_action'|'pre_commit'|'user_request', user_requested: bool}")
    print("  contrast: output from mantis_contrast()")
