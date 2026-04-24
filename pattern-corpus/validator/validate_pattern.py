"""
Pattern Corpus Validator v0.1
Strict gate — patterns must pass ALL checks before append.
No repair mode. Fail closed.
"""

import json
import os
import re
from datetime import datetime, timezone

# ── Required schema fields ──────────────────────────────────────────────
REQUIRED_FIELDS = [
    "pattern_id",
    "pattern_type",
    "description",
    "conditions",
    "expression",
    "confidence",
    "version",
    "created_at",
]

VALID_PATTERN_TYPES = [
    "workflow",
    "decision",
    "constraint",
    "risk",
    "communication",
    "design",
]

# Words that imply identity or personality traits — patterns must not contain these
IDENTITY_TRAIT_WORDS = [
    r"\bpersonality\b",
    r"\btrait\b",
    r"\bidentity\b",
    r"\bcharacter\b",
    r"\btemperament\b",
    r"\bego\b",
    r"\bself-image\b",
    r"\bpersona\b",
    r"\bintrinsic\b",
    r"\binherent\b",
    r"\bborn\b",
    r"\bnature\b",
    r"\bdisposition\b",
]

# Words that imply interpretation beyond signals
INTERPRETATION_WORDS = [
    r"\bbelieves\b",
    r"\bfeels\b",
    r"\bwants\b",
    r"\bdesires\b",
    r"\bintends\b",
    r"\bprefers\b",
    r"\bthinks\b",
    r"\bloves\b",
    r"\bhates\b",
    r"\bneeds\b",
]

# System-rule indicators (extraction rules, not behavioral patterns)
SYSTEM_RULE_INDICATORS = [
    r"\bextract\b.*\brule\b",
    r"\bsystem\s+rule\b",
    r"\bparsing\s+rule\b",
    r"\bregex\s+rule\b",
    r"\bvalidation\s+rule\b",
]

# ── File paths (resolved at call time, not import time) ────────────────
_DEFAULT_CORPUS_DIR = os.path.join(os.path.dirname(__file__), "..", "corpus")


def _get_patterns_file():
    return os.environ.get("MANTIS_CORPUS_PATH",
                          os.path.join(_DEFAULT_CORPUS_DIR, "patterns.jsonl"))


def _get_index_file():
    return os.environ.get("MANTIS_INDEX_PATH",
                          os.path.join(_DEFAULT_CORPUS_DIR, "pattern_index.json"))


def _get_rejected_file():
    return os.environ.get("MANTIS_REJECTED_PATH",
                          os.path.join(_DEFAULT_CORPUS_DIR, "rejected.jsonl"))


def validate_pattern(p: dict) -> dict:
    """
    Validate a pattern dict against all checks.
    Returns: {"status": "PASS"|"FAIL", "failed_checks": [...]}
    """
    failed = []

    # 1. Schema completeness
    for field in REQUIRED_FIELDS:
        if field not in p or p[field] is None or p[field] == "":
            failed.append(f"missing_field:{field}")

    # Early exit if schema is incomplete — can't check further
    if failed:
        return {"status": "FAIL", "failed_checks": failed}

    # 2. pattern_type must be valid
    if p["pattern_type"] not in VALID_PATTERN_TYPES:
        failed.append(f"invalid_pattern_type:{p['pattern_type']}")

    # 3. Evidence count check: ≥ 2 OR (1 + reinforcement)
    confidence = p.get("confidence", {})
    evidence_count = confidence.get("evidence_count", 0)
    reinforcement = confidence.get("reinforcement", False)

    if evidence_count < 2 and not (evidence_count >= 1 and reinforcement):
        failed.append(
            f"insufficient_evidence:count={evidence_count},reinforcement={reinforcement}"
        )

    # 4. Confidence score matches formula: score = min(1.0, evidence_count * 0.2)
    expected_score = min(1.0, evidence_count * 0.2)
    actual_score = confidence.get("score", -1)
    if abs(actual_score - expected_score) > 0.001:
        failed.append(
            f"confidence_mismatch:expected={expected_score},got={actual_score}"
        )

    # 5. No identity/trait language
    text_to_check = json.dumps(p).lower()
    for pattern in IDENTITY_TRAIT_WORDS:
        if re.search(pattern, text_to_check):
            failed.append(f"identity_language:{pattern}")

    # 6. No interpretation beyond signals
    for pattern in INTERPRETATION_WORDS:
        if re.search(pattern, text_to_check):
            failed.append(f"interpretation_language:{pattern}")

    # 7. Not a system rule
    for pattern in SYSTEM_RULE_INDICATORS:
        if re.search(pattern, text_to_check, re.IGNORECASE):
            failed.append(f"system_rule_detected:{pattern}")

    # 8. Bounded context/inputs/signals present
    conditions = p.get("conditions", {})
    if not conditions.get("context"):
        failed.append("missing_bounded:context")
    if not conditions.get("inputs"):
        failed.append("missing_bounded:inputs")
    if not conditions.get("signals"):
        failed.append("missing_bounded:signals")

    status = "PASS" if not failed else "FAIL"
    return {"status": status, "failed_checks": failed}


def append_pattern(p: dict) -> dict:
    """
    Validate and append a pattern. Fail closed.
    Returns: {"status": "PASS"|"FAIL", "failed_checks": [...], "line": int|None}
    """
    result = validate_pattern(p)

    patterns_file = _get_patterns_file()
    index_file = _get_index_file()
    rejected_file = _get_rejected_file()

    if result["status"] == "FAIL":
        # Write to rejected.jsonl
        rejection = {
            "pattern": p,
            "failed_checks": result["failed_checks"],
            "rejected_at": datetime.now(timezone.utc).isoformat(),
        }
        with open(rejected_file, "a") as f:
            f.write(json.dumps(rejection) + "\n")
        result["line"] = None
        return result

    # PASS — append to patterns.jsonl
    with open(patterns_file, "a") as f:
        f.write(json.dumps(p) + "\n")

    # Count current line number
    with open(patterns_file, "r") as f:
        line_count = sum(1 for line in f if line.strip())

    # Update index
    index = {}
    if os.path.exists(index_file):
        with open(index_file, "r") as f:
            content = f.read().strip()
            if content:
                index = json.loads(content)

    index[p["pattern_id"]] = {"line": line_count, "type": p["pattern_type"]}

    with open(index_file, "w") as f:
        json.dump(index, f, indent=2)

    result["line"] = line_count
    return result


def load_corpus() -> list:
    """Load all patterns from the corpus file. Always reads fresh — no caching."""
    patterns_file = _get_patterns_file()
    patterns = []
    if not os.path.exists(patterns_file):
        return patterns
    with open(patterns_file, "r") as f:
        for line in f:
            line = line.strip()
            if line:
                patterns.append(json.loads(line))
    return patterns


# ── CLI interface ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python validate_pattern.py <pattern.json>")
        print("  Reads a JSON file and validates/appends the pattern.")
        sys.exit(1)

    with open(sys.argv[1], "r") as f:
        pattern = json.load(f)

    result = append_pattern(pattern)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["status"] == "PASS" else 1)
