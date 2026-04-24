"""
MANTIS Logging Layer — End-to-End Test
Verifies all acceptance criteria for mantis_logger.py.
"""

import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))

from validator.validate_pattern import append_pattern, load_corpus
from selector.select_patterns import select_patterns
from mantis.mantis_contrast import mantis_contrast
from mantis.trigger_engine import should_trigger, should_surface, run_trigger, reset_dedupe_cache
from mantis.mantis_logger import log_observation, read_log, log_count, clear_log

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
print("  MANTIS LOGGING LAYER — END-TO-END TEST")
print("=" * 60)

# Use a temp file for test logs to avoid polluting the real log
test_log = tempfile.mktemp(suffix=".jsonl")

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
    "task": "Draft a follow-up email to a client about the project timeline delay",
    "type": "pre_action",
    "inputs": ["email", "client", "project timeline"],
    "signals": ["deadline", "delay", "communication"],
}

bad_draft = (
    "Hi team, Just wanted to give you a quick update on the project timeline. "
    "We're running a bit behind on the client deliverables. "
    "We'll get back to you soon with more details about the delay."
)

patterns = select_patterns(task, corpus)
bad_contrast = mantis_contrast(task["description"], bad_draft, patterns)

# ── TEST 1: Basic logging ──────────────────────────────────────────
print("\n[1] BASIC LOGGING — Append works correctly")

clear_log(test_log)
check("Log starts empty", log_count(test_log) == 0)

entry = log_observation(task, bad_contrast, "T4", True, log_path=test_log)
check("log_observation returns entry", entry is not None)
check("Entry has log_id", "log_id" in entry and len(entry["log_id"]) > 0)
check("Entry has timestamp", "timestamp" in entry and len(entry["timestamp"]) > 0)
check("Entry has task", entry["task"] == task["task"])
check("Entry has event_type", entry["event_type"] == "pre_action")
check("Entry has trigger", entry["trigger"] == "T4")
check("Entry has severity", entry["severity"] == bad_contrast["severity"])
check("Entry has summary", entry["summary"] == bad_contrast["summary"])
check("Entry has pattern_ids", len(entry["pattern_ids"]) > 0)
check("Entry has surface_shown", entry["surface_shown"] is True)
check("Entry has notes (None)", entry["notes"] is None)
check("Log count is 1", log_count(test_log) == 1)

# ── TEST 2: Append-only ────────────────────────────────────────────
print("\n[2] APPEND-ONLY — Multiple entries accumulate")

entry2 = log_observation(task, bad_contrast, "T3", False, notes="second entry", log_path=test_log)
check("Second entry appended", log_count(test_log) == 2)

entry3 = log_observation(task, bad_contrast, "T1", True, log_path=test_log)
check("Third entry appended", log_count(test_log) == 3)

# Verify all entries are distinct
entries = read_log(test_log)
ids = [e["log_id"] for e in entries]
check("All log_ids are unique", len(set(ids)) == 3, f"got {ids}")

# Verify order is preserved (first entry is first in file)
check("First entry is first in log", entries[0]["log_id"] == entry["log_id"])
check("Second entry is second in log", entries[1]["log_id"] == entry2["log_id"])
check("Third entry is third in log", entries[2]["log_id"] == entry3["log_id"])

# ── TEST 3: Correct pattern_ids ────────────────────────────────────
print("\n[3] PATTERN_IDS — Correct IDs from contrast observations")

expected_ids = [o["pattern_id"] for o in bad_contrast["observations"]]
check("pattern_ids match contrast observations", entry["pattern_ids"] == expected_ids,
      f"expected {expected_ids}, got {entry['pattern_ids']}")

# ── TEST 4: JSONL format ───────────────────────────────────────────
print("\n[4] JSONL FORMAT — Each line is valid JSON")

with open(test_log, "r") as f:
    lines = [l.strip() for l in f if l.strip()]

check("3 lines in file", len(lines) == 3, f"got {len(lines)}")

all_valid_json = True
for i, line in enumerate(lines):
    try:
        json.loads(line)
    except json.JSONDecodeError:
        all_valid_json = False
        break
check("All lines are valid JSON", all_valid_json)

# ── TEST 5: Notes field ────────────────────────────────────────────
print("\n[5] NOTES — Optional annotation works")

check("Entry with notes has correct value", entry2["notes"] == "second entry")
check("Entry without notes has None", entry["notes"] is None)

# ── TEST 6: Logging when not surfaced ──────────────────────────────
print("\n[6] ALWAYS LOG — Logs even when not surfaced")

clear_log(test_log)
entry_not_surfaced = log_observation(task, bad_contrast, "T4", False, log_path=test_log)
check("Not-surfaced entry logged", log_count(test_log) == 1)
check("surface_shown is False", entry_not_surfaced["surface_shown"] is False)

# ── TEST 7: Logging with None trigger ──────────────────────────────
print("\n[7] NO TRIGGER — Logs even when trigger is None")

entry_no_trigger = log_observation(task, bad_contrast, None, False, log_path=test_log)
check("None-trigger entry logged", log_count(test_log) == 2)
check("trigger is None", entry_no_trigger["trigger"] is None)

# ── TEST 8: Empty contrast ─────────────────────────────────────────
print("\n[8] EMPTY CONTRAST — Handles empty safely")

empty_contrast = {
    "observations": [],
    "summary": {"aligned": 0, "deviates": 0, "risk_flags": []},
    "severity": "low",
    "non_authoritative": True,
}

entry_empty = log_observation(task, empty_contrast, None, False, log_path=test_log)
check("Empty contrast logged", entry_empty is not None)
check("Empty pattern_ids", entry_empty["pattern_ids"] == [])
check("Empty summary risk_flags", entry_empty["summary"]["risk_flags"] == [])

# ── TEST 9: Empty event ────────────────────────────────────────────
print("\n[9] EMPTY EVENT — Handles empty event safely")

entry_empty_event = log_observation({}, empty_contrast, None, False, log_path=test_log)
check("Empty event logged", entry_empty_event is not None)
check("Task is empty string", entry_empty_event["task"] == "")
check("event_type is None", entry_empty_event["event_type"] is None)

# ── TEST 10: Fail silent on bad path ────────────────────────────────
print("\n[10] FAIL SILENT — No crash on bad log path")

result = log_observation(task, bad_contrast, "T4", True, log_path="/nonexistent/dir/that/does/not/exist/deep/log.jsonl")
# This should either succeed (makedirs) or return None (fail silent)
# Either way, no crash
check("No crash on bad path", True)

# ── TEST 11: No modification of corpus ──────────────────────────────
print("\n[11] NO WRITES — Corpus unchanged after all logging")

with open(os.path.join(CORPUS_DIR, "patterns.jsonl"), "r") as f:
    check("patterns.jsonl unchanged", f.read() == corpus_snapshot)
with open(os.path.join(CORPUS_DIR, "pattern_index.json"), "r") as f:
    check("pattern_index.json unchanged", f.read() == index_snapshot)

# ── TEST 12: Full pipeline integration ──────────────────────────────
print("\n[12] INTEGRATION — Full pipeline: select → contrast → trigger → log")

clear_log(test_log)
reset_dedupe_cache()

# Full pipeline
corpus_fresh = load_corpus()
selected = select_patterns(task, corpus_fresh)
contrast = mantis_contrast(task["description"], bad_draft, selected)
event = {"type": "pre_action", "task": task["description"], "user_requested": False}
trigger_result = run_trigger(event, contrast)

# Log the observation
log_entry = log_observation(
    event, contrast,
    trigger_result["trigger_code"],
    trigger_result["surfaced"],
    log_path=test_log,
)

check("Full pipeline log entry created", log_entry is not None)
check("Trigger code matches", log_entry["trigger"] == trigger_result["trigger_code"])
check("Surface shown matches", log_entry["surface_shown"] == trigger_result["surfaced"])
check("Pattern IDs present", len(log_entry["pattern_ids"]) > 0)
check("Severity present", log_entry["severity"] is not None)

# Log a second observation (duplicate trigger, not surfaced)
trigger_result2 = run_trigger(event, contrast)
log_entry2 = log_observation(
    event, contrast,
    trigger_result2["trigger_code"],
    trigger_result2["surfaced"],
    notes="duplicate trigger, deduped",
    log_path=test_log,
)

check("Duplicate trigger still logged", log_entry2 is not None)
check("Duplicate not surfaced", log_entry2["surface_shown"] is False)
check("Duplicate has notes", log_entry2["notes"] == "duplicate trigger, deduped")
check("Two entries in log", log_count(test_log) == 2)

print(f"\n  --- Sample Log Entry ---")
print(json.dumps(log_entry, indent=2))
print(f"  --- End ---")

# ── TEST 13: No effect on system behavior ───────────────────────────
print("\n[13] NO SIDE EFFECTS — Logging does not affect trigger/contrast")

reset_dedupe_cache()
clear_log(test_log)

# Run trigger before logging
r1 = run_trigger(event, contrast)

# Log
log_observation(event, contrast, r1["trigger_code"], r1["surfaced"], log_path=test_log)

# Run trigger again (should be deduped by trigger engine, not by logger)
r2 = run_trigger(event, contrast)

check("Trigger engine still works after logging", r2["triggered"])
check("Dedup still works (from trigger engine)", r2["reason"] == "duplicate")

# ── CLEANUP ─────────────────────────────────────────────────────────
try:
    os.remove(test_log)
except:
    pass

# ── RESULTS ─────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print(f"  RESULTS: {passed} PASS / {failed} FAIL")
print("=" * 60)
if failed == 0:
    print("  ALL ACCEPTANCE CRITERIA MET")
else:
    print("  *** SOME TESTS FAILED ***")
