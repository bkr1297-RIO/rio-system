"""
MANTIS Contrast Layer — End-to-End Test
Acceptance criteria:
  1. Does not execute or block anything
  2. Correctly flags aligned vs deviates
  3. Surfaces risk patterns clearly
  4. Produces readable output
  5. No writes to corpus
  6. Works with existing selector
"""

import json
import os
import sys
import shutil
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CORPUS_DIR = os.path.join(SCRIPT_DIR, "corpus")

# Backup corpus to verify no writes
BACKUP_DIR = tempfile.mkdtemp()
shutil.copytree(CORPUS_DIR, os.path.join(BACKUP_DIR, "corpus"))

sys.path.insert(0, SCRIPT_DIR)
from validator.validate_pattern import append_pattern, load_corpus
from selector.select_patterns import select_patterns
from mantis.mantis_contrast import mantis_contrast
from mantis.surface_formatter import format_surface, format_surface_compact

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
print("  MANTIS CONTRAST LAYER — END-TO-END TEST")
print("=" * 60)

# ── SETUP: Populate corpus with test patterns ────────────────────────
print("\n[SETUP] Populating corpus with test patterns")

# Clear corpus
open(os.path.join(CORPUS_DIR, "patterns.jsonl"), "w").close()
with open(os.path.join(CORPUS_DIR, "pattern_index.json"), "w") as f:
    f.write("{}")
open(os.path.join(CORPUS_DIR, "rejected.jsonl"), "w").close()

test_patterns = [
    make_valid_pattern("PAT-001", "communication", "When drafting external communications about delays, include specific revised dates", ["email", "external communication"], ["email", "client", "timeline"], ["delay", "deadline"]),
    make_valid_pattern("PAT-002", "workflow", "Email drafts go through review before send", ["email", "workflow"], ["email", "draft"], ["communication", "review"], evidence=3),
    make_valid_pattern("PAT-003", "constraint", "Do not send emails to external recipients without explicit approval", ["email", "external"], ["email", "send"], ["communication", "approval"], evidence=5),
    make_valid_pattern("PAT-004", "risk", "Timeline delay communications carry reputational exposure", ["project", "delay"], ["timeline", "client"], ["delay", "exposure"], evidence=3),
]

for p in test_patterns:
    r = append_pattern(p)
    assert r["status"] == "PASS", f"Setup failed: {r}"

corpus = load_corpus()
print(f"  Corpus loaded: {len(corpus)} patterns")

# Snapshot corpus files after setup (to verify no writes later)
with open(os.path.join(CORPUS_DIR, "patterns.jsonl"), "r") as f:
    corpus_snapshot = f.read()
with open(os.path.join(CORPUS_DIR, "pattern_index.json"), "r") as f:
    index_snapshot = f.read()

# ── TEST 1: Correctly flags aligned vs deviates ─────────────────────
print("\n[1] CONTRAST — Aligned vs Deviates detection")

task = {
    "description": "Draft a follow-up email to a client about the project timeline delay",
    "inputs": ["email", "client", "project timeline"],
    "signals": ["deadline", "delay", "communication"],
}

# Bad draft — vague, no dates, no review mention, but mentions delay context
bad_draft = "Hi team, Just wanted to give you a quick update on the project timeline. We're running a bit behind on the client deliverables. We'll get back to you soon with more details about the delay."

patterns = select_patterns(task, corpus)
check("Selector returns patterns", len(patterns) >= 3, f"got {len(patterns)}")

packet = mantis_contrast(task["description"], bad_draft, patterns)

check("Packet has observations", len(packet["observations"]) > 0)
check("Packet has summary", "summary" in packet)
check("Packet has severity", "severity" in packet)
check("Packet is non_authoritative", packet.get("non_authoritative") is True)
check("Packet has packet_id", "packet_id" in packet and len(packet["packet_id"]) > 0)

# Bad draft should have deviations
deviates = sum(1 for o in packet["observations"] if o["status"] == "DEVIATES")
check("Bad draft has deviations", deviates > 0, f"deviates={deviates}")

# Good draft — includes dates, review, approval references
good_draft = """Hi team,

Following up on our earlier conversation. The revised deadline is May 15, 2026.
We have completed the review of all deliverables and received approval from
the lead. The scope changes were communicated last week.

Please confirm receipt of this update.

Best regards"""

good_packet = mantis_contrast(task["description"], good_draft, patterns)
good_aligned = sum(1 for o in good_packet["observations"] if o["status"] == "ALIGNED")
check("Good draft has more alignment", good_aligned > deviates or good_aligned >= 2, f"aligned={good_aligned}")

# ── TEST 2: Risk flags surfaced ──────────────────────────────────────
print("\n[2] RISK — Risk patterns surfaced clearly")

risk_flags = packet["summary"].get("risk_flags", [])
check("Bad draft triggers risk flags", len(risk_flags) > 0, f"flags={risk_flags}")
check("Risk flag is descriptive", any("exposure" in f.lower() or "delay" in f.lower() for f in risk_flags) if risk_flags else False)

# ── TEST 3: Severity rules ──────────────────────────────────────────
print("\n[3] SEVERITY — Correct severity assignment")

check("Bad draft severity is high (constraint deviation + risk)", packet["severity"] == "high", f"got {packet['severity']}")

# All-aligned case should be low
check("Good draft severity is lower", good_packet["severity"] in ("low", "medium"), f"got {good_packet['severity']}")

# ── TEST 4: Surface formatter produces readable output ───────────────
print("\n[4] FORMATTER — Readable output")

output = format_surface(packet)
check("Output contains 'MANTIS'", "MANTIS" in output)
check("Output contains severity", "HIGH" in output or "MEDIUM" in output or "LOW" in output)
check("Output contains 'Deviates:'", "Deviates:" in output)
check("Output contains options", "Options:" in output)
check("Output contains non-binding footer", "Non-binding. You decide." in output)
check("Output contains score", "Score:" in output)

# Compact format
compact = format_surface_compact(packet)
check("Compact format is single line", "\n" not in compact)
check("Compact contains MANTIS", "MANTIS" in compact)

print(f"\n  --- Surface Output (bad draft) ---")
print(output)
print(f"  --- End ---")

# ── TEST 5: No writes to corpus ─────────────────────────────────────
print("\n[5] NO WRITES — Corpus unchanged after contrast")

with open(os.path.join(CORPUS_DIR, "patterns.jsonl"), "r") as f:
    corpus_after = f.read()
with open(os.path.join(CORPUS_DIR, "pattern_index.json"), "r") as f:
    index_after = f.read()

check("patterns.jsonl unchanged", corpus_after == corpus_snapshot)
check("pattern_index.json unchanged", index_after == index_snapshot)

# ── TEST 6: Does not execute or block ────────────────────────────────
print("\n[6] READ-ONLY — No execution, no blocking")

# Verify the contrast function returns a dict (advisory) not an exception or side effect
check("Returns dict (advisory)", isinstance(packet, dict))
check("No 'execute' key in packet", "execute" not in packet)
check("No 'block' key in packet", "block" not in packet)
check("No 'deny' key in packet", "deny" not in packet)
check("No 'approve' key in packet", "approve" not in packet)

# ── TEST 7: Works with existing selector ─────────────────────────────
print("\n[7] INTEGRATION — Works with existing selector pipeline")

# Full pipeline: select → contrast → format
selected = select_patterns(task, corpus)
contrast = mantis_contrast(task["description"], bad_draft, selected)
formatted = format_surface(contrast)
check("Full pipeline produces output", len(formatted) > 50)
check("Pipeline packet has observations", len(contrast["observations"]) == len(selected))

# ── TEST 8: Fail silent on insufficient signal ───────────────────────
print("\n[8] FAIL SILENT — Empty patterns, empty draft")

empty_packet = mantis_contrast("test", "", [])
check("Empty patterns → empty observations", len(empty_packet["observations"]) == 0)
check("Empty patterns → low severity", empty_packet["severity"] == "low")

empty_output = format_surface(empty_packet)
check("Empty packet still produces valid output", "MANTIS" in empty_output)

# ── RESTORE ──────────────────────────────────────────────────────────
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
