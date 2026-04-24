"""
MANTIS Trigger Engine v0.1
Timing + routing layer — decides WHEN MANTIS surfaces contrast.

Rules:
- NEVER executes, blocks, approves, or denies
- Only ONE surface per action
- Fails silent on no meaningful signal
- Does NOT modify corpus or RIO
- Does NOT introduce loops or repeated alerts

Trigger priority (strict order):
  T4 — Constraint violation (always surfaces)
  T3 — Risk flag detected (always surfaces)
  T1 — Pre-action checkpoint
  T2 — Pre-commit checkpoint
  T5 — Manual user request
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
      T4 — Constraint violation
      T3 — Risk flag
      T1 — Pre-action
      T2 — Pre-commit
      T5 — Manual request
    """
    # T4 — Constraint violation (highest priority)
    if contrast_has_constraint_violation(contrast):
        return "T4"

    # T3 — Risk trigger
    if contrast_has_risk_flag(contrast):
        return "T3"

    event_type = event.get("type", "")

    # T1 — Pre-action
    if event_type == EventType.PRE_ACTION:
        return "T1"

    # T2 — Pre-commit
    if event_type == EventType.PRE_COMMIT:
        return "T2"

    # T5 — Manual user request
    if event.get("user_requested"):
        return "T5"

    return None


# ── Surface decision ────────────────────────────────────────────────

def should_surface(trigger: str, contrast: dict) -> bool:
    """
    Decide whether to actually surface the contrast.
    Returns False (fail silent) if no meaningful observations.
    """
    if not contrast.get("observations"):
        return False

    return True


# ── Deduplication ───────────────────────────────────────────────────

def dedupe_key(event: dict, contrast: dict) -> str:
    """
    Generate a deterministic dedup key from event + contrast summary.
    Same input → same key → skip repeated surface.
    """
    payload = json.dumps(
        {"event": event, "summary": contrast.get("summary", {})},
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
      4. Format output based on severity

    Returns:
        {
            "triggered": bool,
            "trigger_code": str | None,
            "surfaced": bool,
            "reason": str,
            "output": str | None,      # formatted surface text
            "compact": str | None,      # compact one-liner
        }
    """
    # Step 1: Classify
    trigger = should_trigger(event, contrast)

    if trigger is None:
        return {
            "triggered": False,
            "trigger_code": None,
            "surfaced": False,
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
            "reason": "fail_silent",
            "output": None,
            "compact": None,
        }

    # Step 3: Dedup
    if is_duplicate(event, contrast):
        return {
            "triggered": True,
            "trigger_code": trigger,
            "surfaced": False,
            "reason": "duplicate",
            "output": None,
            "compact": None,
        }

    # Step 4: Format based on severity
    severity = contrast.get("severity", "low")

    if severity == "low":
        # Compact format for low severity
        output = format_surface_compact(contrast)
        full_output = None
    else:
        # Full output for medium/high
        output = format_surface(contrast)
        full_output = output

    compact = format_surface_compact(contrast)

    return {
        "triggered": True,
        "trigger_code": trigger,
        "surfaced": True,
        "reason": f"trigger_{trigger}",
        "output": output,
        "compact": compact,
    }


# ── CLI interface ───────────────────────────────────────────────────
if __name__ == "__main__":
    print("MANTIS Trigger Engine v0.1")
    print("Usage: import and call run_trigger(event, contrast)")
    print("  event: {type: 'pre_action'|'pre_commit'|'user_request', user_requested: bool}")
    print("  contrast: output from mantis_contrast()")
