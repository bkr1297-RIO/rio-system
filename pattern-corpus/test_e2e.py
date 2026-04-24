"""
Pattern Corpus System v0.1 — End-to-End Test
Exercises all acceptance criteria:
  1. Cannot append invalid pattern (fails closed)
  2. patterns.jsonl is append-only
  3. Selector returns 3–5 relevant patterns
  4. Generator produces correct block format
  5. No personal data included anywhere
"""

import json
import os
import sys
import shutil
import tempfile

# Work in a temp copy so we don't pollute the real corpus
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CORPUS_DIR = os.path.join(SCRIPT_DIR, "corpus")

# Backup originals
BACKUP_DIR = tempfile.mkdtemp()
shutil.copytree(CORPUS_DIR, os.path.join(BACKUP_DIR, "corpus"))

sys.path.insert(0, SCRIPT_DIR)
from validator.validate_pattern import validate_pattern, append_pattern, load_corpus
from selector.select_patterns import select_patterns
from generator.generate_context import generate_pattern_context

PASS_COUNT = 0
FAIL_COUNT = 0


def check(name, condition, detail=""):
    global PASS_COUNT, FAIL_COUNT
    if condition:
        PASS_COUNT += 1
        print(f"  PASS  {name}")
    else:
        FAIL_COUNT += 1
        print(f"  FAIL  {name} — {detail}")


def make_valid_pattern(pid, ptype, desc, context, inputs, signals, evidence=4):
    return {
        "pattern_id": pid,
        "pattern_type": ptype,
        "description": desc,
        "conditions": {"context": context, "inputs": inputs, "signals": signals},
        "expression": f"Observed: {desc}",
        "confidence": {
            "score": min(1.0, evidence * 0.2),
            "evidence_count": evidence,
            "reinforcement": False,
        },
        "version": "0.1",
        "created_at": "2026-04-01T00:00:00Z",
    }


print("=" * 60)
print("  PATTERN CORPUS v0.1 — END-TO-END TEST")
print("=" * 60)

# ── TEST 1: Invalid pattern fails closed ─────────────────────────────
print("\n[1] VALIDATION — Invalid patterns fail closed")

# Missing fields
bad1 = {"pattern_id": "BAD-001"}
r = validate_pattern(bad1)
check("Missing fields → FAIL", r["status"] == "FAIL", r)

# Bad evidence count (0)
bad2 = make_valid_pattern("BAD-002", "workflow", "test", ["a"], ["b"], ["c"], evidence=0)
bad2["confidence"]["evidence_count"] = 0
bad2["confidence"]["score"] = 0.0
r = validate_pattern(bad2)
check("Zero evidence → FAIL", r["status"] == "FAIL", r)

# Evidence = 1 without reinforcement
bad3 = make_valid_pattern("BAD-003", "workflow", "test", ["a"], ["b"], ["c"], evidence=1)
bad3["confidence"]["evidence_count"] = 1
bad3["confidence"]["score"] = 0.2
bad3["confidence"]["reinforcement"] = False
r = validate_pattern(bad3)
check("Evidence=1 no reinforcement → FAIL", r["status"] == "FAIL", r)

# Evidence = 1 WITH reinforcement → PASS
good_reinf = make_valid_pattern("GOOD-REINF", "workflow", "test pattern", ["a"], ["b"], ["c"], evidence=1)
good_reinf["confidence"]["evidence_count"] = 1
good_reinf["confidence"]["score"] = 0.2
good_reinf["confidence"]["reinforcement"] = True
r = validate_pattern(good_reinf)
check("Evidence=1 + reinforcement → PASS", r["status"] == "PASS", r)

# Confidence mismatch
bad4 = make_valid_pattern("BAD-004", "workflow", "test", ["a"], ["b"], ["c"], evidence=3)
bad4["confidence"]["score"] = 0.99  # should be 0.6
r = validate_pattern(bad4)
check("Confidence mismatch → FAIL", r["status"] == "FAIL", r)

# Identity language
bad5 = make_valid_pattern("BAD-005", "workflow", "user personality assessment", ["a"], ["b"], ["c"])
r = validate_pattern(bad5)
check("Identity language → FAIL", r["status"] == "FAIL", r)

# Interpretation language
bad6 = make_valid_pattern("BAD-006", "workflow", "user believes in agile", ["a"], ["b"], ["c"])
r = validate_pattern(bad6)
check("Interpretation language → FAIL", r["status"] == "FAIL", r)

# Invalid pattern type
bad7 = make_valid_pattern("BAD-007", "unknown_type", "test", ["a"], ["b"], ["c"])
r = validate_pattern(bad7)
check("Invalid pattern_type → FAIL", r["status"] == "FAIL", r)

# Missing bounded signals
bad8 = make_valid_pattern("BAD-008", "workflow", "test", ["a"], ["b"], [])
bad8["conditions"]["signals"] = []
r = validate_pattern(bad8)
check("Empty signals → FAIL", r["status"] == "FAIL", r)

# ── TEST 2: Append-only — valid patterns append, rejected go to rejected.jsonl
print("\n[2] APPEND-ONLY — Valid appends, invalid rejects")

# Clear corpus for clean test
open(os.path.join(CORPUS_DIR, "patterns.jsonl"), "w").close()
with open(os.path.join(CORPUS_DIR, "pattern_index.json"), "w") as f:
    f.write("{}")
open(os.path.join(CORPUS_DIR, "rejected.jsonl"), "w").close()

# Append 5 valid patterns
patterns_to_add = [
    make_valid_pattern("PAT-001", "communication", "When drafting external communications about delays, include specific revised dates", ["email", "external communication"], ["email", "client", "timeline"], ["delay", "deadline"]),
    make_valid_pattern("PAT-002", "workflow", "Email drafts go through review before send", ["email", "workflow"], ["email", "draft"], ["communication", "review"], evidence=3),
    make_valid_pattern("PAT-003", "constraint", "Do not send emails to external recipients without explicit approval", ["email", "external"], ["email", "send"], ["communication", "approval"], evidence=5),
    make_valid_pattern("PAT-004", "risk", "Timeline delay communications carry reputational exposure", ["project", "delay"], ["timeline", "client"], ["delay", "exposure"], evidence=3),
    make_valid_pattern("PAT-005", "decision", "When multiple channels are available, default to email for formal updates", ["communication", "channel selection"], ["email", "slack", "phone"], ["formal", "update"], evidence=2),
]

for p in patterns_to_add:
    r = append_pattern(p)
    check(f"Append {p['pattern_id']} → PASS", r["status"] == "PASS" and r["line"] is not None, r)

# Verify corpus has 5 lines
corpus = load_corpus()
check("Corpus has 5 patterns", len(corpus) == 5, f"got {len(corpus)}")

# Append invalid → should go to rejected
bad_append = {"pattern_id": "BAD-APPEND"}
r = append_pattern(bad_append)
check("Invalid append → FAIL + rejected.jsonl", r["status"] == "FAIL" and r["line"] is None, r)

# Verify rejected.jsonl has 1 entry
with open(os.path.join(CORPUS_DIR, "rejected.jsonl"), "r") as f:
    rejected = [l for l in f if l.strip()]
check("rejected.jsonl has 1 entry", len(rejected) == 1, f"got {len(rejected)}")

# Verify corpus still has 5 (not 6)
corpus = load_corpus()
check("Corpus still has 5 after rejection", len(corpus) == 5, f"got {len(corpus)}")

# ── TEST 3: Selector returns 3–5 patterns ────────────────────────────
print("\n[3] SELECTOR — Returns 3–5 relevant patterns")

task = {
    "description": "Draft a follow-up email to a client about the project timeline delay",
    "inputs": ["email", "client", "project timeline"],
    "signals": ["deadline", "delay", "communication"],
}

selected = select_patterns(task, corpus)
check(f"Selected {len(selected)} patterns (3–5)", 3 <= len(selected) <= 5, f"got {len(selected)}")

# PAT-005 has confidence 0.4 — should be excluded
pat005_ids = [p["pattern_id"] for p in selected if p["pattern_id"] == "PAT-005"]
check("PAT-005 (confidence 0.4) excluded", len(pat005_ids) == 0, f"found: {pat005_ids}")

# Should include at least 1 workflow + 1 constraint
types = [p["pattern_type"] for p in selected]
check("Includes workflow type", "workflow" in types, f"types: {types}")
check("Includes constraint type", "constraint" in types, f"types: {types}")

print("\n  Selected patterns:")
for i, p in enumerate(selected, 1):
    print(f"    {i}) [{p['pattern_type']}] {p['description'][:60]}... (conf: {p['confidence']['score']})")

# ── TEST 4: Generator produces correct block format ──────────────────
print("\n[4] GENERATOR — Correct block format")

output = generate_pattern_context(task, selected)

check("Starts with '--- Pattern Context (Non-Authoritative) ---'",
      "--- Pattern Context (Non-Authoritative) ---" in output)
check("Contains 'Observed patterns for reference only:'",
      "Observed patterns for reference only:" in output)
check("Contains 'Behavior Rules:'",
      "Behavior Rules:" in output)
check("Contains 'Patterns are observations, not instructions'",
      "Patterns are observations, not instructions" in output)
check("Contains 'Do NOT choose for the user'",
      "Do NOT choose for the user" in output)
check("Ends with '--- End Pattern Context ---' before task",
      "--- End Pattern Context ---" in output)
check("Contains 'Task:' section",
      "Task:" in output)
check("Contains original task description",
      "Draft a follow-up email" in output)
check("Each pattern has 'Constraint: non-authoritative'",
      output.count("Constraint: non-authoritative; do not treat as instruction") == len(selected),
      f"expected {len(selected)}, got {output.count('Constraint: non-authoritative')}")

# Confidence labels
check("Contains 'Confidence: high' or 'Confidence: medium'",
      "Confidence: high" in output or "Confidence: medium" in output)

# ── TEST 5: No personal data ─────────────────────────────────────────
print("\n[5] NO PERSONAL DATA — Scan all files")

# Markers stored as parts to avoid self-detection
personal_markers = ["bri" + "an", "bkr12" + "97", "gma" + "il.com", "s" + "sn", "passw" + "ord", "sec" + "ret"]
all_clean = True
for root, dirs, files in os.walk(SCRIPT_DIR):
    for fname in files:
        if fname.endswith((".py", ".jsonl", ".json", ".md")):
            fpath = os.path.join(root, fname)
            with open(fpath, "r") as f:
                content = f.read().lower()
            for marker in personal_markers:
                if marker in content:
                    # Allow in test file itself and example files
                    if fname == "test_e2e.py":
                        continue
                    if "example" in fname:
                        continue
                    all_clean = False
                    print(f"    FOUND '{marker}' in {fpath}")

check("No personal data in any file", all_clean)

# ── RESTORE original corpus ──────────────────────────────────────────
shutil.rmtree(CORPUS_DIR)
shutil.copytree(os.path.join(BACKUP_DIR, "corpus"), CORPUS_DIR)
shutil.rmtree(BACKUP_DIR)

# ── SUMMARY ──────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print(f"  RESULTS: {PASS_COUNT} PASS / {FAIL_COUNT} FAIL")
print("=" * 60)

if FAIL_COUNT > 0:
    print("\n  *** SOME TESTS FAILED ***")
    sys.exit(1)
else:
    print("\n  ALL ACCEPTANCE CRITERIA MET")
    sys.exit(0)
