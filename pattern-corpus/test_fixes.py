"""
Tests for two fixes:
  1. load_corpus reads fresh every call (no module-level caching)
  2. Selector guarantee: constraint + risk always included if they exist
"""

import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))

# ── Setup: fresh temp dir ────────────────────────────────────────────
tmpdir = tempfile.mkdtemp(prefix="mantis_fix_test_")
corpus_file = os.path.join(tmpdir, "patterns.jsonl")
index_file = os.path.join(tmpdir, "pattern_index.json")
rejected_file = os.path.join(tmpdir, "rejected.jsonl")

for f in [corpus_file, rejected_file]:
    open(f, "w").close()
with open(index_file, "w") as f:
    json.dump({}, f)

os.environ["MANTIS_CORPUS_PATH"] = corpus_file
os.environ["MANTIS_INDEX_PATH"] = index_file
os.environ["MANTIS_REJECTED_PATH"] = rejected_file

from validator.validate_pattern import append_pattern, load_corpus
from selector.select_patterns import select_patterns

passed = 0
failed = 0


def check(name, condition):
    global passed, failed
    if condition:
        print(f"  PASS  {name}")
        passed += 1
    else:
        print(f"  FAIL  {name}")
        failed += 1


def make_pattern(pid, ptype, desc, signals, inputs, context, evidence=3):
    conf_score = min(1.0, evidence * 0.2)
    return {
        "pattern_id": pid,
        "pattern_type": ptype,
        "description": desc,
        "source": "test",
        "confidence": {"score": conf_score, "evidence_count": evidence},
        "conditions": {"signals": signals, "inputs": inputs, "context": context},
        "expression": f"When {desc.lower()}",
        "version": 1,
        "created_at": "2026-04-24T00:00:00Z",
    }


# ══════════════════════════════════════════════════════════════════════
# FIX 1: load_corpus reads fresh every call
# ══════════════════════════════════════════════════════════════════════
print("=" * 60)
print("  FIX 1: load_corpus reads fresh (no caching)")
print("=" * 60)

# Start empty
corpus_before = load_corpus()
check("Empty corpus initially", len(corpus_before) == 0)

# Add one pattern
p1 = make_pattern("PAT-F01", "communication", "Test pattern one",
                   ["signal1"], ["input1"], ["context1"], evidence=3)
r = append_pattern(p1)
check("Pattern appended", r["status"] == "PASS")

# load_corpus should see the new pattern WITHOUT module reload
corpus_after = load_corpus()
check("load_corpus sees new pattern (no reload needed)", len(corpus_after) == 1)
check("Correct pattern_id", corpus_after[0]["pattern_id"] == "PAT-F01")

# Add another
p2 = make_pattern("PAT-F02", "risk", "Test risk pattern",
                   ["risk1"], ["input2"], ["context2"], evidence=3)
append_pattern(p2)

corpus_after2 = load_corpus()
check("load_corpus sees second pattern immediately", len(corpus_after2) == 2)

# Switch to a different temp dir
tmpdir2 = tempfile.mkdtemp(prefix="mantis_fix_test2_")
corpus_file2 = os.path.join(tmpdir2, "patterns.jsonl")
index_file2 = os.path.join(tmpdir2, "pattern_index.json")
rejected_file2 = os.path.join(tmpdir2, "rejected.jsonl")

for f in [corpus_file2, rejected_file2]:
    open(f, "w").close()
with open(index_file2, "w") as f:
    json.dump({}, f)

os.environ["MANTIS_CORPUS_PATH"] = corpus_file2
os.environ["MANTIS_INDEX_PATH"] = index_file2
os.environ["MANTIS_REJECTED_PATH"] = rejected_file2

# load_corpus should now see empty (different file)
corpus_switched = load_corpus()
check("load_corpus respects env var change (empty new dir)", len(corpus_switched) == 0)

# Switch back
os.environ["MANTIS_CORPUS_PATH"] = corpus_file
os.environ["MANTIS_INDEX_PATH"] = index_file
os.environ["MANTIS_REJECTED_PATH"] = rejected_file

corpus_back = load_corpus()
check("load_corpus respects env var switch back (2 patterns)", len(corpus_back) == 2)


# ══════════════════════════════════════════════════════════════════════
# FIX 2: Selector guarantee — constraint + risk always included
# ══════════════════════════════════════════════════════════════════════
print("\n" + "=" * 60)
print("  FIX 2: Selector guarantee rule")
print("=" * 60)

# Reset to fresh corpus
tmpdir3 = tempfile.mkdtemp(prefix="mantis_fix_test3_")
corpus_file3 = os.path.join(tmpdir3, "patterns.jsonl")
index_file3 = os.path.join(tmpdir3, "pattern_index.json")
rejected_file3 = os.path.join(tmpdir3, "rejected.jsonl")

for f in [corpus_file3, rejected_file3]:
    open(f, "w").close()
with open(index_file3, "w") as f:
    json.dump({}, f)

os.environ["MANTIS_CORPUS_PATH"] = corpus_file3
os.environ["MANTIS_INDEX_PATH"] = index_file3
os.environ["MANTIS_REJECTED_PATH"] = rejected_file3

# Populate with 5 patterns where communication patterns would normally
# dominate the top 5, pushing constraint and risk out
test_patterns = [
    make_pattern("PAT-C01", "communication",
                 "External communications about delays should include specific revised dates",
                 ["deadline", "delay", "revised", "date"], ["email", "client"],
                 ["timeline", "schedule"], evidence=4),
    make_pattern("PAT-C02", "communication",
                 "Client-facing emails should use professional tone",
                 ["email", "client", "professional"], ["email", "client"],
                 ["communication", "tone"], evidence=4),
    make_pattern("PAT-C03", "communication",
                 "Delay notifications should reference project milestones",
                 ["milestone", "delay", "project"], ["email", "notification"],
                 ["timeline", "milestone"], evidence=4),
    make_pattern("PAT-W01", "workflow",
                 "Email drafts go through review before send",
                 ["review", "approval", "draft"], ["email", "draft"],
                 ["communication", "review"], evidence=3),
    make_pattern("PAT-CON1", "constraint",
                 "Do not send emails to external recipients without explicit approval",
                 ["approval", "review", "external"], ["email", "send"],
                 ["compliance", "approval"], evidence=5),
    make_pattern("PAT-R01", "risk",
                 "Timeline delay communications carry reputational exposure",
                 ["project", "delay"], ["timeline", "client"],
                 ["delay", "exposure"], evidence=3),
]

for p in test_patterns:
    r = append_pattern(p)
    assert r["status"] == "PASS", f"Setup failed: {r}"

corpus = load_corpus()
check("Corpus has 6 patterns", len(corpus) == 6)

# Task that strongly favors communication patterns
task = {
    "description": "Draft a follow-up email to a client about a project timeline delay",
    "inputs": ["email", "client"],
    "signals": ["delay", "project", "timeline"],
}

selected = select_patterns(task, corpus)
selected_ids = [p["pattern_id"] for p in selected]
selected_types = [p["pattern_type"] for p in selected]

print(f"\n  Selected {len(selected)} patterns:")
for i, p in enumerate(selected, 1):
    print(f"    {i}. {p['pattern_id']} [{p['pattern_type']}] {p['description'][:60]}")

check("Max 5 selected", len(selected) <= 5)
check("Min 3 selected", len(selected) >= 3)

# CRITICAL: constraint must be present
has_constraint = "constraint" in selected_types
check("GUARANTEE: Constraint pattern included", has_constraint)

# CRITICAL: risk must be present
has_risk = "risk" in selected_types
check("GUARANTEE: Risk pattern included", has_risk)

# Verify specific IDs
check("PAT-CON1 (constraint) in selection", "PAT-CON1" in selected_ids)
check("PAT-R01 (risk) in selection", "PAT-R01" in selected_ids)

# Verify no duplicates
check("No duplicate pattern_ids", len(selected_ids) == len(set(selected_ids)))

# ── Test: guarantee with only constraint, no risk ────────────────────
print("\n── Scenario: corpus has constraint but no risk ──")

tmpdir4 = tempfile.mkdtemp(prefix="mantis_fix_test4_")
corpus_file4 = os.path.join(tmpdir4, "patterns.jsonl")
index_file4 = os.path.join(tmpdir4, "pattern_index.json")
rejected_file4 = os.path.join(tmpdir4, "rejected.jsonl")

for f in [corpus_file4, rejected_file4]:
    open(f, "w").close()
with open(index_file4, "w") as f:
    json.dump({}, f)

os.environ["MANTIS_CORPUS_PATH"] = corpus_file4
os.environ["MANTIS_INDEX_PATH"] = index_file4
os.environ["MANTIS_REJECTED_PATH"] = rejected_file4

no_risk_patterns = [
    make_pattern("PAT-A01", "communication", "Comm pattern A",
                 ["delay", "email"], ["email", "client"], ["timeline"], evidence=4),
    make_pattern("PAT-A02", "communication", "Comm pattern B",
                 ["delay", "project"], ["email", "client"], ["schedule"], evidence=4),
    make_pattern("PAT-A03", "workflow", "Workflow pattern",
                 ["review", "draft"], ["email", "draft"], ["review"], evidence=3),
    make_pattern("PAT-A04", "constraint", "Must have approval",
                 ["approval", "external"], ["email", "send"], ["compliance"], evidence=5),
]

for p in no_risk_patterns:
    r = append_pattern(p)
    assert r["status"] == "PASS", f"Setup failed: {r}"

corpus_no_risk = load_corpus()
selected_no_risk = select_patterns(task, corpus_no_risk)
types_no_risk = [p["pattern_type"] for p in selected_no_risk]

check("Constraint included (no risk in corpus)", "constraint" in types_no_risk)
check("No risk in selection (none in corpus)", "risk" not in types_no_risk)

# ── Test: guarantee with only risk, no constraint ────────────────────
print("\n── Scenario: corpus has risk but no constraint ──")

tmpdir5 = tempfile.mkdtemp(prefix="mantis_fix_test5_")
corpus_file5 = os.path.join(tmpdir5, "patterns.jsonl")
index_file5 = os.path.join(tmpdir5, "pattern_index.json")
rejected_file5 = os.path.join(tmpdir5, "rejected.jsonl")

for f in [corpus_file5, rejected_file5]:
    open(f, "w").close()
with open(index_file5, "w") as f:
    json.dump({}, f)

os.environ["MANTIS_CORPUS_PATH"] = corpus_file5
os.environ["MANTIS_INDEX_PATH"] = index_file5
os.environ["MANTIS_REJECTED_PATH"] = rejected_file5

no_constraint_patterns = [
    make_pattern("PAT-B01", "communication", "Comm pattern C",
                 ["delay", "email"], ["email", "client"], ["timeline"], evidence=4),
    make_pattern("PAT-B02", "communication", "Comm pattern D",
                 ["delay", "project"], ["email", "client"], ["schedule"], evidence=4),
    make_pattern("PAT-B03", "workflow", "Workflow pattern B",
                 ["review", "draft"], ["email", "draft"], ["review"], evidence=3),
    make_pattern("PAT-B04", "risk", "Risk pattern B",
                 ["project", "delay"], ["timeline", "client"], ["exposure"], evidence=3),
]

for p in no_constraint_patterns:
    r = append_pattern(p)
    assert r["status"] == "PASS", f"Setup failed: {r}"

corpus_no_constraint = load_corpus()
selected_no_constraint = select_patterns(task, corpus_no_constraint)
types_no_constraint = [p["pattern_type"] for p in selected_no_constraint]

check("Risk included (no constraint in corpus)", "risk" in types_no_constraint)
check("No constraint in selection (none in corpus)", "constraint" not in types_no_constraint)

# ── Test: full e2e with MANTIS contrast to verify T4 fires ──────────
print("\n── Scenario: full flow — constraint selected → T4 fires ──")

os.environ["MANTIS_CORPUS_PATH"] = corpus_file3
os.environ["MANTIS_INDEX_PATH"] = index_file3
os.environ["MANTIS_REJECTED_PATH"] = rejected_file3

from mantis.mantis_contrast import mantis_contrast
from mantis.trigger_engine import should_trigger, reset_dedupe_cache

reset_dedupe_cache()

corpus_full = load_corpus()
selected_full = select_patterns(task, corpus_full)
full_types = [p["pattern_type"] for p in selected_full]
full_ids = [p["pattern_id"] for p in selected_full]

check("Full flow: constraint in selection", "constraint" in full_types)
check("Full flow: risk in selection", "risk" in full_types)

draft = """Hi Marcus,

I wanted to reach out regarding the Apex project. We've run into some 
internal challenges that have caused a delay in our delivery timeline. 
The team is actively working through these issues and we expect to have 
a clearer picture soon.

Best regards,
Brian"""

packet = mantis_contrast(task["description"], draft, selected_full)

# Check that constraint deviation is detected
has_constraint_dev = any(
    o["status"] == "DEVIATES" and "constraint" in o["note"].lower()
    for o in packet["observations"]
)
check("Full flow: constraint deviation detected in contrast", has_constraint_dev)

# Check trigger fires T4 (constraint violation)
event = {"type": "pre_action", "task": task["description"]}
trigger_code = should_trigger(event, packet)
check("Full flow: trigger fires", trigger_code is not None)
check("Full flow: trigger is T4 (constraint violation)", trigger_code == "T4")

print(f"\n  Trigger code: {trigger_code}")
print(f"  Severity: {packet['severity']}")
print(f"  Alignment: {packet['alignment_score']}%")
print(f"  Selected IDs: {full_ids}")
print(f"  Selected types: {full_types}")

# ══════════════════════════════════════════════════════════════════════
# RESULTS
# ══════════════════════════════════════════════════════════════════════
print("\n" + "=" * 60)
print(f"  RESULTS: {passed} PASS / {failed} FAIL")
print("=" * 60)
