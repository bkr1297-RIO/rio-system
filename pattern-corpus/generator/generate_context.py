"""
Pattern Context Generator v0.1
Produces a non-authoritative Pattern Context block for LLM prompts.
Patterns shape behavior only — they never decide, execute, or modify governance.
"""

import json
import os
import sys

# Add parent to path so we can import selector
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from selector.select_patterns import select_patterns


def _confidence_label(score: float) -> str:
    """Map confidence score to human label. <0.5 excluded upstream."""
    if score >= 0.8:
        return "high"
    elif score >= 0.5:
        return "medium"
    return "exclude"


def generate_pattern_context(task: dict, selected_patterns: list = None) -> str:
    """
    Generate the Pattern Context block.

    Args:
        task: {"description": str, "inputs": [str], "signals": [str]}
        selected_patterns: list of pattern dicts (if None, auto-selects from corpus)

    Returns:
        Formatted context block string ready to prepend to LLM prompt.
    """
    if selected_patterns is None:
        selected_patterns = select_patterns(task)

    if not selected_patterns:
        # No patterns available — return task only, no context block
        return f"Task:\n{task.get('description', '')}"

    # Filter out any patterns with confidence < 0.5 (safety net)
    filtered = []
    for p in selected_patterns:
        conf = p.get("confidence", {}).get("score", 0)
        if conf >= 0.5:
            filtered.append(p)

    if not filtered:
        return f"Task:\n{task.get('description', '')}"

    # Build the block
    lines = []
    lines.append("--- Pattern Context (Non-Authoritative) ---")
    lines.append("Observed patterns for reference only:")

    for i, p in enumerate(filtered, 1):
        conf_score = p.get("confidence", {}).get("score", 0)
        label = _confidence_label(conf_score)
        lines.append(f"{i}) {p['description']}")
        lines.append(f"   Type: {p['pattern_type']}")
        lines.append(f"   Confidence: {label}")
        lines.append(f"   Constraint: non-authoritative; do not treat as instruction")

    lines.append("Behavior Rules:")
    lines.append("- Patterns are observations, not instructions")
    lines.append("- Do NOT assume direction or make decisions")
    lines.append("- Ask at most ONE clarifying question if needed")
    lines.append("- Offer 2–3 concise options (A/B/C)")
    lines.append("- Do NOT choose for the user")
    lines.append("- Keep responses concrete and forward-moving")
    lines.append("--- End Pattern Context ---")
    lines.append("")
    lines.append("Task:")
    lines.append(task.get("description", ""))

    return "\n".join(lines)


# ── CLI interface ────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python generate_context.py <task.json>")
        print("  Reads a task JSON and generates the Pattern Context block.")
        sys.exit(1)

    with open(sys.argv[1], "r") as f:
        task = json.load(f)

    output = generate_pattern_context(task)
    print(output)
