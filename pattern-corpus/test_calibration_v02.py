"""
Contrast Calibration v0.2 — Before/After Comparison + Acceptance Criteria
Tests the upgraded mantis_contrast.py and surface_formatter.py.
"""

import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))

from validator.validate_pattern import append_pattern, load_corpus
from selector.select_patterns import select_patterns
from mantis.mantis_contrast import mantis_contrast, calculate_alignment_score
from mantis.surface_formatter import format_surface, format_surface_compact
from mantis.trigger_engine import should_trigger, run_trigger
from mantis.mantis_logger import log_observation

# ── Setup: temp corpus ──────────────────────────────────────────────
tmpdir = tempfile.mkdtemp()
corpus_file = os.path.join(tmpdir, "patterns.jsonl")
index_file = os.path.join(tmpdir, "pattern_index.json")
rejected_file = os.path.join(tmpdir, "rejected.jsonl")
log_file = os.path.join(tmpdir, "observations.jsonl")

for f in [corpus_file, rejected_file, log_file]:
    open(f, "w").close()
with open(index_file, "w") as f:
    json.dump({}, f)

os.environ["MANTIS_CORPUS_PATH"] = corpus_file
os.environ["MANTIS_INDEX_PATH"] = index_file
os.environ["MANTIS_REJECTED_PATH"] = rejected_file
os.environ["MANTIS_LOG_PATH"] = log_file

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


def make_valid_pattern(pid, ptype, desc, signals, inputs, context, evidence=3):
    return {
        "pattern_id": pid,
        "pattern_type": ptype,
        "description": desc,
        "source": "test",
        "confidence": {"score": 0.8 if ptype == "communication" else (1.0 if ptype == "constraint" else 0.6), "evidence_count": evidence},
        "conditions": {"signals": signals, "inputs": inputs, "context": context},
        "expression": f"When {desc.lower()}",
        "version": 1,
        "created_at": "2026-04-24T00:00:00Z",
    }


# ── Populate corpus ─────────────────────────────────────────────────
test_patterns = [
    make_valid_pattern(
        "PAT-001", "communication",
        "External communications about delays should include specific revised dates",
        ["deadline", "delay", "revised", "date"], ["email", "client"],
        ["timeline", "schedule"], evidence=4,
    ),
    make_valid_pattern(
        "PAT-002", "workflow",
        "Email drafts go through review before send",
        ["review", "approval", "draft"], ["email", "draft"],
        ["communication", "review"], evidence=3,
    ),
    make_valid_pattern(
        "PAT-003", "constraint",
        "Do not send emails to external recipients without explicit approval",
        ["approval", "review", "external"], ["email", "send"],
        ["compliance", "approval"], evidence=5,
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
task = "Draft a follow-up email to a client about a project timeline delay"

# ── Select patterns ─────────────────────────────────────────────────
selected = select_patterns({"description": task, "inputs": ["email", "client"], "signals": ["delay", "timeline"]}, corpus)

print("=" * 70)
print("  CONTRAST CALIBRATION v0.2 — ACCEPTANCE TESTS")
print("=" * 70)

# ── Test 1: PARTIAL appears for partially matching drafts ───────────
print("\n── Test 1: PARTIAL status appears ──")

# Draft that mentions SOME but not all communication signals
# PAT-001 signals: deadline, delay, revised, date — draft has "delay" only → PARTIAL
partial_draft = (
    "Hi Sarah,\n\n"
    "I wanted to let you know about a delay on the project.\n"
    "We are working to resolve it and will update you soon.\n\n"
    "Best,\nBrian"
)

packet = mantis_contrast(task, partial_draft, selected)

statuses = [o["status"] for o in packet["observations"]]
check("PARTIAL status exists in observations", "PARTIAL" in statuses)
check("Not all DEVIATES (graded)", set(statuses) != {"DEVIATES"})
check("Has alignment_score field", "alignment_score" in packet)
check("Has partial count in summary", "partial" in packet["summary"])

partial_count = packet["summary"]["partial"]
check("Partial count > 0", partial_count > 0)

print(f"\n  Statuses: {statuses}")
print(f"  Alignment score: {packet['alignment_score']}%")
print(f"  Summary: aligned={packet['summary']['aligned']}, partial={packet['summary']['partial']}, deviates={packet['summary']['deviates']}")

# ── Test 2: Alignment score reflects reality ────────────────────────
print("\n── Test 2: Alignment score is proportional ──")

score = packet["alignment_score"]
check("Score is not 0 (not all deviates)", score > 0)
check("Score is not 100 (not all aligned)", score < 100)
check("Score is integer", isinstance(score, int))

# Test calculate_alignment_score directly
test_obs = [
    {"status": "ALIGNED"},
    {"status": "PARTIAL"},
    {"status": "DEVIATES"},
    {"status": "PARTIAL"},
]
direct_score = calculate_alignment_score(test_obs)
check("calculate_alignment_score([A,P,D,P]) = 50", direct_score == 50)

all_aligned = calculate_alignment_score([{"status": "ALIGNED"}, {"status": "ALIGNED"}])
check("All ALIGNED → 100", all_aligned == 100)

all_deviates = calculate_alignment_score([{"status": "DEVIATES"}, {"status": "DEVIATES"}])
check("All DEVIATES → 0", all_deviates == 0)

empty_score = calculate_alignment_score([])
check("Empty → 0", empty_score == 0)

# ── Test 3: Constraint/risk still trigger HIGH ──────────────────────
print("\n── Test 3: Constraint/risk → HIGH severity ──")

check("Severity is HIGH (constraint + risk present)", packet["severity"] == "high")

# Test with a draft that has NO constraint violation and NO risk trigger
safe_draft = (
    "Hi Sarah,\n\n"
    "I wanted to confirm the review and approval of the document.\n"
    "Please verify and check the attached draft.\n\n"
    "Best,\nBrian"
)

# Only use workflow + communication patterns (no constraint/risk)
safe_patterns = [p for p in selected if p["pattern_type"] in ("workflow", "communication")]
safe_packet = mantis_contrast(task, safe_draft, safe_patterns)
check("No constraint/risk → severity not HIGH", safe_packet["severity"] != "high")

# ── Test 4: Severity uses alignment_score for non-constraint cases ──
print("\n── Test 4: Severity uses alignment_score ──")

# Low alignment (<50) without constraint/risk → MEDIUM
low_draft = "Hello, just checking in about things."
low_packet = mantis_contrast(task, low_draft, safe_patterns)
if low_packet["alignment_score"] < 50:
    check("Low score without constraint/risk → MEDIUM", low_packet["severity"] == "medium")
else:
    check("Score >= 50 without constraint/risk → LOW", low_packet["severity"] == "low")

# High alignment (>=50) without constraint/risk → LOW
high_draft = (
    "Hi Sarah,\n\n"
    "Regarding the deadline and delay, here are the revised dates.\n"
    "The review and approval of the draft email is complete.\n\n"
    "Best,\nBrian"
)
high_packet = mantis_contrast(task, high_draft, safe_patterns)
if high_packet["alignment_score"] >= 50:
    check("High score without constraint/risk → LOW", high_packet["severity"] == "low")
else:
    check("Score < 50 → MEDIUM", high_packet["severity"] == "medium")

# ── Test 5: Constraint patterns are binary (no PARTIAL) ─────────────
print("\n── Test 5: Constraint patterns are binary ──")

constraint_patterns = [p for p in selected if p["pattern_type"] == "constraint"]
if constraint_patterns:
    # Draft without approval
    no_approval_packet = mantis_contrast(task, partial_draft, constraint_patterns)
    constraint_obs = no_approval_packet["observations"]
    for o in constraint_obs:
        check(f"Constraint {o['pattern_id']} is not PARTIAL", o["status"] != "PARTIAL")

# ── Test 6: Risk patterns are binary (no PARTIAL) ───────────────────
print("\n── Test 6: Risk patterns are binary ──")

risk_patterns = [p for p in selected if p["pattern_type"] == "risk"]
if risk_patterns:
    risk_packet = mantis_contrast(task, partial_draft, risk_patterns)
    risk_obs = risk_packet["observations"]
    for o in risk_obs:
        check(f"Risk {o['pattern_id']} is not PARTIAL", o["status"] != "PARTIAL")

# ── Test 7: Surface output shows graded format ──────────────────────
print("\n── Test 7: Surface output format ──")

surface = format_surface(packet)
check("Surface contains 'Alignment:'", "Alignment:" in surface)
check("Surface contains percentage", f"{packet['alignment_score']}%" in surface)
check("Surface contains 'Partial:' section", "Partial:" in surface)
check("Surface contains 'Deviates:' section", "Deviates:" in surface)
check("Surface contains options", "Options:" in surface)
check("Surface contains 'Improve alignment'", "Improve alignment" in surface)
check("Surface ends with non-binding", "(Non-binding. You decide.)" in surface)

print(f"\n  Full surface output:\n{surface}")

# ── Test 8: Compact output shows percentage ─────────────────────────
print("\n── Test 8: Compact output format ──")

compact = format_surface_compact(packet)
check("Compact contains percentage", f"{packet['alignment_score']}%" in compact)
check("Compact contains MANTIS", "MANTIS" in compact)
check("Compact contains severity", packet["severity"].upper() in compact)

print(f"\n  Compact: {compact}")

# ── Test 9: Trigger system still works (no changes) ────────────────
print("\n── Test 9: Trigger system unchanged ──")

from mantis.trigger_engine import reset_dedupe_cache
reset_dedupe_cache()

event = {"type": "pre_action", "task": task}
trigger_code = should_trigger(event, packet)
check("Trigger still fires", trigger_code is not None)
check("Trigger code is T4", trigger_code == "T4")

trigger_full = run_trigger(event, packet)
check("run_trigger returns triggered=True", trigger_full["triggered"])
check("run_trigger trigger_code is T4", trigger_full["trigger_code"] == "T4")

# ── Test 10: Logging still works with new fields ───────────────────
print("\n── Test 10: Logging with alignment_score ──")

log_entry = log_observation(event, packet, trigger_code, surface_shown=True, notes="calibration v0.2 test")
check("Log entry has log_id", "log_id" in log_entry)
check("Log entry has severity", log_entry.get("severity") == packet["severity"])
check("Log entry has summary", "summary" in log_entry)

# ── Test 11: Improved messaging (less harsh) ────────────────────────
print("\n── Test 11: Improved messaging ──")

partial_obs = [o for o in packet["observations"] if o["status"] == "PARTIAL"]
if partial_obs:
    for o in partial_obs:
        check(f"Partial note is descriptive: '{o['note'][:50]}...'", "Partially aligned" in o["note"] or "mentions" in o["note"])

# ── Before/After Comparison ─────────────────────────────────────────
print("\n" + "=" * 70)
print("  BEFORE / AFTER COMPARISON")
print("=" * 70)

print("\n  BEFORE (v0.1):")
print("  ─────────────")
print("  Statuses:  ALIGNED | DEVIATES (binary)")
print("  Score:     0/4 aligned")
print("  Severity:  HIGH (any deviation + constraint)")
print("  Message:   'Missing expected elements: communication, draft, email, review'")
print("  Surface:   'Score: 0/4 aligned'")
print("  Compact:   'MANTIS [HIGH] | 0 aligned | 4 deviates | 1 risk flag'")

print(f"\n  AFTER (v0.2):")
print("  ────────────")
print(f"  Statuses:  {', '.join(statuses)}")
print(f"  Score:     Alignment: {packet['alignment_score']}%")
print(f"  Severity:  {packet['severity'].upper()}")
for o in packet["observations"]:
    print(f"  Message:   [{o['status']}] {o['note']}")
print(f"  Surface:   'Alignment: {packet['alignment_score']}%'")
print(f"  Compact:   '{compact}'")

# ── Summary ─────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print(f"  RESULTS: {passed} PASS / {failed} FAIL")
print("=" * 70)

if failed > 0:
    sys.exit(1)
