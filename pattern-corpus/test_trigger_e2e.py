"""
MANTIS Trigger System — End-to-End Test
Verifies all acceptance criteria for trigger_engine.py + event_types.py.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from validator.validate_pattern import append_pattern, load_corpus
from selector.select_patterns import select_patterns
from mantis.mantis_contrast import mantis_contrast
from mantis.event_types import EventType, is_valid_event_type, VALID_EVENT_TYPES
from mantis.trigger_engine import (
    should_trigger,
    should_surface,
    dedupe_key,
    is_duplicate,
    run_trigger,
    reset_dedupe_cache,
    contrast_has_constraint_violation,
    contrast_has_risk_flag,
)

CORPUS_DIR = os.path.join(os.path.dirname(__file__), "corpus")

passed = 0
failed = 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  PASS  {name}")
        passed += 1
    else:
        print(f"  FAIL  {name} — {detail}")
        failed += 1


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
print("  MANTIS TRIGGER SYSTEM — END-TO-END TEST")
print("=" * 60)

# ── SETUP ───────────────────────────────────────────────────────────
print("\n[SETUP] Populating corpus with test patterns")

open(os.path.join(CORPUS_DIR, "patterns.jsonl"), "w").close()
with open(os.path.join(CORPUS_DIR, "pattern_index.json"), "w") as f:
    f.write("{}")
open(os.path.join(CORPUS_DIR, "rejected.jsonl"), "w").close()

test_patterns = [
    make_valid_pattern(
        "PAT-001", "communication",
        "External communications about delays should include specific revised dates",
        ["email", "external communication"], ["email", "client", "timeline"],
        ["delay", "deadline"],
    ),
    make_valid_pattern(
        "PAT-002", "workflow",
        "Email drafts go through review before send",
        ["email", "workflow"], ["email", "draft"],
        ["communication", "review"], evidence=3,
    ),
    make_valid_pattern(
        "PAT-003", "constraint",
        "Do not send emails to external recipients without explicit approval",
        ["email", "external"], ["email", "send"],
        ["communication", "approval"], evidence=5,
    ),
    make_valid_pattern(
        "PAT-004", "risk",
        "Timeline delay communications carry reputational exposure",
        ["project", "delay"], ["timeline", "client"],
        ["delay", "exposure"], evidence=3,
    ),
]

for p in test_patterns:
    r = append_pattern(p)
    assert r["status"] == "PASS", f"Setup failed: {r}"

corpus = load_corpus()
print(f"  Corpus loaded: {len(corpus)} patterns")

# Snapshot corpus for no-write verification
with open(os.path.join(CORPUS_DIR, "patterns.jsonl"), "r") as f:
    corpus_snapshot = f.read()
with open(os.path.join(CORPUS_DIR, "pattern_index.json"), "r") as f:
    index_snapshot = f.read()

# ── Shared test data ────────────────────────────────────────────────
task = {
    "description": "Draft a follow-up email to a client about the project timeline delay",
    "inputs": ["email", "client", "project timeline"],
    "signals": ["deadline", "delay", "communication"],
}

bad_draft = (
    "Hi team, Just wanted to give you a quick update on the project timeline. "
    "We're running a bit behind on the client deliverables. "
    "We'll get back to you soon with more details about the delay."
)

good_draft = (
    "Hi team,\n\n"
    "Following up on our earlier conversation. The revised deadline is May 15, 2026.\n"
    "We have completed the review of all deliverables and received approval from\n"
    "the lead. The scope changes were communicated last week.\n\n"
    "Please confirm receipt of this update.\n\nBest regards"
)

patterns = select_patterns(task, corpus)
bad_contrast = mantis_contrast(task["description"], bad_draft, patterns)
good_contrast = mantis_contrast(task["description"], good_draft, patterns)

# ── TEST 1: Event Types ────────────────────────────────────────────
print("\n[1] EVENT TYPES — Valid types recognized")
check("PRE_ACTION is valid", is_valid_event_type(EventType.PRE_ACTION))
check("PRE_COMMIT is valid", is_valid_event_type(EventType.PRE_COMMIT))
check("USER_REQUEST is valid", is_valid_event_type(EventType.USER_REQUEST))
check("Invalid type rejected", not is_valid_event_type("random_thing"))
check("3 valid types total", len(VALID_EVENT_TYPES) == 3, f"got {len(VALID_EVENT_TYPES)}")

# ── TEST 2: Trigger Priority Order ─────────────────────────────────
print("\n[2] TRIGGER PRIORITY — Correct trigger codes fire")
reset_dedupe_cache()

# T4 — Constraint violation (bad draft has constraint deviation)
event_pre_action = {"type": "pre_action", "user_requested": False}
t = should_trigger(event_pre_action, bad_contrast)
check("T4 fires on constraint violation", t == "T4", f"got {t}")

# T3 — Risk flag only (no constraint violation)
risk_only_contrast = {
    "observations": [
        {"pattern_id": "PAT-004", "status": "DEVIATES", "note": "Risk trigger detected", "confidence": 0.6},
    ],
    "summary": {"aligned": 0, "deviates": 1, "risk_flags": ["Reputational exposure"]},
    "severity": "high",
    "non_authoritative": True,
}
t = should_trigger(event_pre_action, risk_only_contrast)
check("T3 fires on risk flag (no constraint)", t == "T3", f"got {t}")

# T1 — Pre-action (no constraint, no risk)
clean_contrast = {
    "observations": [
        {"pattern_id": "PAT-001", "status": "ALIGNED", "note": "All good", "confidence": 0.8},
    ],
    "summary": {"aligned": 1, "deviates": 0, "risk_flags": []},
    "severity": "low",
    "non_authoritative": True,
}
t = should_trigger(event_pre_action, clean_contrast)
check("T1 fires on pre_action (clean contrast)", t == "T1", f"got {t}")

# T2 — Pre-commit
event_pre_commit = {"type": "pre_commit", "user_requested": False}
t = should_trigger(event_pre_commit, clean_contrast)
check("T2 fires on pre_commit", t == "T2", f"got {t}")

# T5 — Manual request (event type is user_request)
event_manual = {"type": "user_request", "user_requested": True}
t = should_trigger(event_manual, clean_contrast)
check("T5 fires on manual request", t == "T5", f"got {t}")

# No trigger — unknown event type, no risk, no constraint
event_unknown = {"type": "unknown", "user_requested": False}
t = should_trigger(event_unknown, clean_contrast)
check("No trigger on unknown event + clean contrast", t is None, f"got {t}")

# ── TEST 3: Priority ordering — T4 beats T1 ────────────────────────
print("\n[3] PRIORITY — T4 > T3 > T1 > T2 > T5")

# Even though event is pre_action (T1), constraint violation (T4) wins
t = should_trigger(event_pre_action, bad_contrast)
check("T4 beats T1 when constraint violation present", t == "T4", f"got {t}")

# Risk flag (T3) beats pre_action (T1)
t = should_trigger(event_pre_action, risk_only_contrast)
check("T3 beats T1 when risk flag present", t == "T3", f"got {t}")

# ── TEST 4: Surface Decision ───────────────────────────────────────
print("\n[4] SURFACE — Correct surface decisions")

check("Surface on non-empty observations", should_surface("T4", bad_contrast))
check("Surface on clean observations", should_surface("T1", clean_contrast))

empty_contrast = {
    "observations": [],
    "summary": {"aligned": 0, "deviates": 0, "risk_flags": []},
    "severity": "low",
    "non_authoritative": True,
}
check("No surface on empty observations (fail silent)", not should_surface("T1", empty_contrast))

# ── TEST 5: Deduplication ──────────────────────────────────────────
print("\n[5] DEDUP — No repeated alerts for same input")
reset_dedupe_cache()

# First time → not duplicate
check("First call is not duplicate", not is_duplicate(event_pre_action, bad_contrast))

# Same input again → duplicate
check("Second call IS duplicate", is_duplicate(event_pre_action, bad_contrast))

# Different input → not duplicate
check("Different input is not duplicate", not is_duplicate(event_pre_commit, bad_contrast))

# Reset and verify
reset_dedupe_cache()
check("After reset, same input is not duplicate", not is_duplicate(event_pre_action, bad_contrast))

# Deterministic keys
key1 = dedupe_key(event_pre_action, bad_contrast)
key2 = dedupe_key(event_pre_action, bad_contrast)
check("Dedupe key is deterministic", key1 == key2, f"{key1} != {key2}")

key3 = dedupe_key(event_pre_commit, bad_contrast)
check("Different events produce different keys", key1 != key3)

# ── TEST 6: run_trigger orchestrator ────────────────────────────────
print("\n[6] RUN_TRIGGER — Full pipeline orchestration")
reset_dedupe_cache()

# Bad draft + pre_action → T4, surfaced
result = run_trigger(event_pre_action, bad_contrast)
check("Triggered on bad draft", result["triggered"])
check("Trigger code is T4", result["trigger_code"] == "T4", f"got {result['trigger_code']}")
check("Surfaced", result["surfaced"])
check("Has output text", result["output"] is not None and len(result["output"]) > 0)
check("Has compact text", result["compact"] is not None and len(result["compact"]) > 0)
check("Output contains MANTIS", "MANTIS" in result["output"])

# Same input again → duplicate, not surfaced
result2 = run_trigger(event_pre_action, bad_contrast)
check("Duplicate not surfaced", not result2["surfaced"])
check("Reason is duplicate", result2["reason"] == "duplicate")

# Clean contrast + pre_action → T1, surfaced (low severity → compact)
reset_dedupe_cache()
result3 = run_trigger(event_pre_action, clean_contrast)
check("Clean contrast triggers T1", result3["trigger_code"] == "T1", f"got {result3['trigger_code']}")
check("Clean contrast is surfaced", result3["surfaced"])

# Empty contrast → triggered but not surfaced (fail silent)
reset_dedupe_cache()
result4 = run_trigger(event_pre_action, empty_contrast)
check("Empty contrast: triggered", result4["triggered"])
check("Empty contrast: not surfaced (fail silent)", not result4["surfaced"])
check("Empty contrast: reason is fail_silent", result4["reason"] == "fail_silent")

# No trigger at all
reset_dedupe_cache()
result5 = run_trigger(event_unknown, clean_contrast)
check("Unknown event + clean: not triggered", not result5["triggered"])
check("No trigger: reason is no_trigger", result5["reason"] == "no_trigger")

# ── TEST 7: Only ONE surface per action ─────────────────────────────
print("\n[7] SINGLE SURFACE — Only one surface per action")
reset_dedupe_cache()

r1 = run_trigger(event_pre_action, bad_contrast)
r2 = run_trigger(event_pre_action, bad_contrast)
r3 = run_trigger(event_pre_action, bad_contrast)

surfaced_count = sum(1 for r in [r1, r2, r3] if r["surfaced"])
check("Only ONE surface for repeated identical input", surfaced_count == 1, f"surfaced {surfaced_count} times")

# ── TEST 8: Risk + constraint always surfaced ───────────────────────
print("\n[8] ALWAYS SURFACE — Risk and constraint never suppressed")
reset_dedupe_cache()

# Constraint violation always surfaces
r = run_trigger(event_pre_action, bad_contrast)
check("Constraint violation surfaces", r["surfaced"])
check("Constraint violation trigger is T4", r["trigger_code"] == "T4")

# Risk flag always surfaces
reset_dedupe_cache()
r = run_trigger(event_pre_action, risk_only_contrast)
check("Risk flag surfaces", r["surfaced"])
check("Risk flag trigger is T3", r["trigger_code"] == "T3")

# ── TEST 9: No crashes on empty input ───────────────────────────────
print("\n[9] FAIL SILENT — No crashes on empty/malformed input")
reset_dedupe_cache()

# Empty event
try:
    r = run_trigger({}, empty_contrast)
    check("Empty event does not crash", True)
    check("Empty event not surfaced", not r["surfaced"])
except Exception as e:
    check("Empty event does not crash", False, str(e))

# Empty everything
try:
    r = run_trigger({}, {"observations": [], "summary": {"risk_flags": []}, "severity": "low"})
    check("Fully empty input does not crash", True)
except Exception as e:
    check("Fully empty input does not crash", False, str(e))

# Missing keys in contrast
try:
    r = run_trigger(event_pre_action, {})
    check("Missing contrast keys does not crash", True)
except Exception as e:
    check("Missing contrast keys does not crash", False, str(e))

# ── TEST 10: No modification of corpus ──────────────────────────────
print("\n[10] NO WRITES — Corpus unchanged after all trigger operations")

with open(os.path.join(CORPUS_DIR, "patterns.jsonl"), "r") as f:
    check("patterns.jsonl unchanged", f.read() == corpus_snapshot)
with open(os.path.join(CORPUS_DIR, "pattern_index.json"), "r") as f:
    check("pattern_index.json unchanged", f.read() == index_snapshot)

# ── TEST 11: Integration with existing pipeline ─────────────────────
print("\n[11] INTEGRATION — Full pipeline: select → contrast → trigger")
reset_dedupe_cache()

# Full pipeline from scratch
corpus_fresh = load_corpus()
selected = select_patterns(task, corpus_fresh)
contrast = mantis_contrast(task["description"], bad_draft, selected)
event = {"type": "pre_action", "user_requested": False}
result = run_trigger(event, contrast)

check("Full pipeline produces trigger", result["triggered"])
check("Full pipeline produces surface", result["surfaced"])
check("Full pipeline output is non-empty", result["output"] is not None)

print(f"\n  --- Full Pipeline Output ---")
print(result["output"])
print(f"  --- End ---")

# ── TEST 12: Helper checks ──────────────────────────────────────────
print("\n[12] HELPERS — constraint_has_constraint_violation, contrast_has_risk_flag")

check("Bad contrast has constraint violation", contrast_has_constraint_violation(bad_contrast))
check("Clean contrast has no constraint violation", not contrast_has_constraint_violation(clean_contrast))
check("Bad contrast has risk flag", contrast_has_risk_flag(bad_contrast))
check("Clean contrast has no risk flag", not contrast_has_risk_flag(clean_contrast))
check("Empty contrast has no constraint violation", not contrast_has_constraint_violation(empty_contrast))
check("Empty contrast has no risk flag", not contrast_has_risk_flag(empty_contrast))

# ── RESULTS ─────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print(f"  RESULTS: {passed} PASS / {failed} FAIL")
print("=" * 60)
if failed == 0:
    print("  ALL ACCEPTANCE CRITERIA MET")
else:
    print("  *** SOME TESTS FAILED ***")
