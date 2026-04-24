"""
Pattern Selector v0.1
Selects 3–5 relevant patterns from the corpus for a given task.
Scoring: context match + inputs overlap + signal match + type boost + confidence weight.
"""

import json
import os
import sys

# Add parent to path so we can import validator
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from validator.validate_pattern import load_corpus


# ── Type boost mapping ───────────────────────────────────────────────────
TYPE_BOOST = {
    "workflow": ["workflow", "design"],
    "decision": ["decision"],
    "constraint": ["constraint"],
    "risk": ["risk", "debug"],
}

# Reverse: task keyword → pattern_type boost
TASK_TYPE_KEYWORDS = {
    "workflow": "workflow",
    "design": "workflow",
    "decide": "decision",
    "choose": "decision",
    "rules": "constraint",
    "constraint": "constraint",
    "policy": "constraint",
    "debug": "risk",
    "risk": "risk",
    "error": "risk",
    "fix": "risk",
}


def _tokenize(text: str) -> set:
    """Simple word tokenizer — lowercase, split on non-alpha."""
    import re
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _compute_match_score(task: dict, pattern: dict) -> float:
    """
    Compute raw match score:
      +2 context match
      +2 inputs overlap
      +1 per signal match
    """
    score = 0.0
    task_tokens = _tokenize(task.get("description", ""))
    conditions = pattern.get("conditions", {})

    # Context match: check if task context overlaps with pattern context
    context_tokens = _tokenize(" ".join(conditions.get("context", [])))
    if task_tokens & context_tokens:
        score += 2.0

    # Inputs overlap: check if task inputs overlap with pattern inputs
    task_input_tokens = _tokenize(" ".join(task.get("inputs", [])))
    pattern_input_tokens = _tokenize(" ".join(conditions.get("inputs", [])))
    if task_input_tokens & pattern_input_tokens:
        score += 2.0

    # Signal match: +1 per matching signal
    task_signal_tokens = _tokenize(" ".join(task.get("signals", [])))
    pattern_signal_tokens = _tokenize(" ".join(conditions.get("signals", [])))
    signal_overlap = task_signal_tokens & pattern_signal_tokens
    score += len(signal_overlap) * 1.0

    return score


def _compute_type_boost(task: dict, pattern: dict) -> float:
    """
    Type boost:
      workflow/design → +2 if pattern_type is workflow
      decide → +2 if pattern_type is decision
      rules → +2 if pattern_type is constraint
      debug → +2 if pattern_type is risk
    """
    task_tokens = _tokenize(task.get("description", ""))
    pattern_type = pattern.get("pattern_type", "")

    for keyword, boosted_type in TASK_TYPE_KEYWORDS.items():
        if keyword in task_tokens and pattern_type == boosted_type:
            return 2.0

    return 0.0


def select_patterns(task: dict, corpus: list = None) -> list:
    """
    Select 3–5 relevant patterns for a task.

    Args:
        task: {"description": str, "inputs": [str], "signals": [str]}
        corpus: list of pattern dicts (if None, loads from file)

    Returns:
        list of selected pattern dicts (3–5), sorted by score descending
    """
    if corpus is None:
        corpus = load_corpus()

    if not corpus:
        return []

    scored = []
    for pattern in corpus:
        confidence = pattern.get("confidence", {})
        conf_score = confidence.get("score", 0)

        # Ignore patterns with confidence < 0.5
        if conf_score < 0.5:
            continue

        match_score = _compute_match_score(task, pattern)
        type_boost = _compute_type_boost(task, pattern)
        raw = match_score + type_boost

        # final_score = match * (1 + confidence.score)
        final_score = raw * (1 + conf_score)

        scored.append({
            "pattern": pattern,
            "match_score": match_score,
            "type_boost": type_boost,
            "final_score": final_score,
        })

    # Sort by final_score descending
    scored.sort(key=lambda x: x["final_score"], reverse=True)

    # Drop conflicts: if two patterns of the same type, keep higher score
    seen_types = {}
    deduped = []
    for entry in scored:
        ptype = entry["pattern"]["pattern_type"]
        if ptype not in seen_types:
            seen_types[ptype] = True
            deduped.append(entry)
        else:
            # Allow up to 2 of the same type before dropping
            type_count = sum(1 for e in deduped if e["pattern"]["pattern_type"] == ptype)
            if type_count < 2:
                deduped.append(entry)

    # Ensure at least 1 workflow + 1 constraint if possible
    selected = deduped[:5]  # max 5

    has_workflow = any(e["pattern"]["pattern_type"] == "workflow" for e in selected)
    has_constraint = any(e["pattern"]["pattern_type"] == "constraint" for e in selected)

    if not has_workflow:
        for entry in deduped:
            if entry["pattern"]["pattern_type"] == "workflow" and entry not in selected:
                if len(selected) >= 5:
                    selected[-1] = entry  # replace lowest
                else:
                    selected.append(entry)
                break

    if not has_constraint:
        for entry in deduped:
            if entry["pattern"]["pattern_type"] == "constraint" and entry not in selected:
                if len(selected) >= 5:
                    selected[-1] = entry  # replace lowest
                else:
                    selected.append(entry)
                break

    # Enforce min 3 if available
    if len(selected) < 3:
        for entry in scored:
            if entry not in selected:
                selected.append(entry)
            if len(selected) >= 3:
                break

    # Re-sort final selection
    selected.sort(key=lambda x: x["final_score"], reverse=True)

    return [entry["pattern"] for entry in selected]


# ── CLI interface ────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python select_patterns.py <task.json>")
        print("  Reads a task JSON file and selects matching patterns from corpus.")
        sys.exit(1)

    with open(sys.argv[1], "r") as f:
        task = json.load(f)

    results = select_patterns(task)
    print(f"Selected {len(results)} patterns:")
    for i, p in enumerate(results, 1):
        print(f"  {i}) [{p['pattern_type']}] {p['description']}")
        print(f"     confidence: {p['confidence']['score']}")
    print()
    print(json.dumps(results, indent=2))
