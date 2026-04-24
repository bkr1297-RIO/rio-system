"""
Trend Detection v0.1 — Acceptance Tests

Verifies:
1. Correct counts from logs
2. Window slicing works
3. No crashes on small/empty datasets
4. No changes to core system behavior
5. Output is clear and readable
"""

import json
import os
import sys
import tempfile

# ── Setup ───────────────────────────────────────────────────────────

sys.path.insert(0, os.path.dirname(__file__))

from mantis.trend_analyzer import (
    analyze_trends,
    format_trends,
    format_trends_compact,
    _read_logs,
    _slice_window,
    _compute_drift_score,
    _compute_pattern_frequency,
    _compute_risk_rate,
    _compute_severity_distribution,
    _generate_insight,
)

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


# ── Test data helpers ───────────────────────────────────────────────

def make_log_entry(
    severity="high",
    deviates=3,
    aligned=1,
    risk_flags=None,
    pattern_ids=None,
    task="Test task",
    trigger="T4",
    surface_shown=True,
):
    return {
        "log_id": f"test-{os.urandom(4).hex()}",
        "timestamp": "2026-04-24T12:00:00+00:00",
        "task": task,
        "event_type": "pre_action",
        "trigger": trigger,
        "severity": severity,
        "summary": {
            "aligned": aligned,
            "deviates": deviates,
            "risk_flags": risk_flags or [],
        },
        "pattern_ids": pattern_ids or ["PAT-001"],
        "surface_shown": surface_shown,
        "notes": None,
    }


def write_log_file(entries, tmp_dir):
    """Write entries to a temp JSONL file and return the path."""
    log_dir = os.path.join(tmp_dir, "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, "observations.jsonl")
    with open(log_path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")
    return log_path


# ══════════════════════════════════════════════════════════════════
print("=" * 60)
print("  TREND DETECTION v0.1 — ACCEPTANCE TESTS")
print("=" * 60)

# ── 1. Empty dataset ────────────────────────────────────────────
print("\n[1] EMPTY DATASET — NO CRASHES")

with tempfile.TemporaryDirectory() as tmp:
    log_path = write_log_file([], tmp)
    report = analyze_trends(window_size=20, log_path=log_path)

    check("Empty: no crash", report is not None)
    check("Empty: drift_score = 0", report["drift_score"] == 0.0)
    check("Empty: actual_entries = 0", report["actual_entries"] == 0)
    check("Empty: top_patterns empty", report["top_patterns"] == [])
    check("Empty: risk_rate = 0", report["risk_rate"] == 0.0)
    check("Empty: severity all zero", all(v == 0 for v in report["severity_distribution"].values()))

    # Format should not crash
    text = format_trends(report)
    check("Empty: format_trends no crash", isinstance(text, str))
    compact = format_trends_compact(report)
    check("Empty: format_compact no crash", isinstance(compact, str))


# ── 2. Small dataset (fewer than window) ────────────────────────
print("\n[2] SMALL DATASET (3 entries, window=20)")

with tempfile.TemporaryDirectory() as tmp:
    entries = [
        make_log_entry(severity="high", deviates=3, risk_flags=["risk A"]),
        make_log_entry(severity="medium", deviates=1, risk_flags=[]),
        make_log_entry(severity="low", deviates=0, risk_flags=[]),
    ]
    log_path = write_log_file(entries, tmp)
    report = analyze_trends(window_size=20, log_path=log_path)

    check("Small: actual_entries = 3", report["actual_entries"] == 3)
    check("Small: window_size = 20", report["window_size"] == 20)
    # 2 of 3 have deviates > 0
    check("Small: drift_score = 66.7", report["drift_score"] == 66.7)
    # 1 of 3 has risk flags
    check("Small: risk_count = 1", report["risk_count"] == 1)
    check("Small: risk_rate = 0.33", report["risk_rate"] == 0.33)
    check("Small: severity HIGH=1", report["severity_distribution"]["HIGH"] == 1)
    check("Small: severity MEDIUM=1", report["severity_distribution"]["MEDIUM"] == 1)
    check("Small: severity LOW=1", report["severity_distribution"]["LOW"] == 1)


# ── 3. Window slicing ──────────────────────────────────────────
print("\n[3] WINDOW SLICING")

with tempfile.TemporaryDirectory() as tmp:
    # 10 entries: first 5 have deviations, last 5 are clean
    entries = []
    for i in range(5):
        entries.append(make_log_entry(severity="high", deviates=3, risk_flags=["risk"],
                                      pattern_ids=["PAT-001", "PAT-003"]))
    for i in range(5):
        entries.append(make_log_entry(severity="low", deviates=0, risk_flags=[],
                                      pattern_ids=["PAT-002"]))
    log_path = write_log_file(entries, tmp)

    # Window = 5 (last 5 = clean)
    report_5 = analyze_trends(window_size=5, log_path=log_path)
    check("Window 5: actual = 5", report_5["actual_entries"] == 5)
    check("Window 5: drift = 0 (last 5 clean)", report_5["drift_score"] == 0.0)
    check("Window 5: risk_rate = 0", report_5["risk_rate"] == 0.0)

    # Window = 10 (all entries)
    report_10 = analyze_trends(window_size=10, log_path=log_path)
    check("Window 10: actual = 10", report_10["actual_entries"] == 10)
    check("Window 10: drift = 50 (5/10 deviate)", report_10["drift_score"] == 50.0)
    check("Window 10: risk_rate = 0.5", report_10["risk_rate"] == 0.5)

    # Window = 0 (full history)
    report_all = analyze_trends(window_size=0, log_path=log_path)
    check("Window 0 (all): actual = 10", report_all["actual_entries"] == 10)
    check("Window 0 (all): same as window 10", report_all["drift_score"] == report_10["drift_score"])


# ── 4. Drift score accuracy ────────────────────────────────────
print("\n[4] DRIFT SCORE ACCURACY")

with tempfile.TemporaryDirectory() as tmp:
    # 7 of 10 have deviations → 70%
    entries = []
    for i in range(7):
        entries.append(make_log_entry(deviates=2))
    for i in range(3):
        entries.append(make_log_entry(deviates=0))
    log_path = write_log_file(entries, tmp)
    report = analyze_trends(window_size=10, log_path=log_path)
    check("Drift: 70% (7/10)", report["drift_score"] == 70.0)

    # All clean → 0%
    entries_clean = [make_log_entry(deviates=0) for _ in range(5)]
    log_path2 = write_log_file(entries_clean, tmp)
    report2 = analyze_trends(window_size=10, log_path=log_path2)
    check("Drift: 0% (all clean)", report2["drift_score"] == 0.0)

    # All deviate → 100%
    entries_all = [make_log_entry(deviates=1) for _ in range(5)]
    log_path3 = write_log_file(entries_all, tmp)
    report3 = analyze_trends(window_size=10, log_path=log_path3)
    check("Drift: 100% (all deviate)", report3["drift_score"] == 100.0)


# ── 5. Pattern frequency ───────────────────────────────────────
print("\n[5] PATTERN FREQUENCY")

with tempfile.TemporaryDirectory() as tmp:
    entries = [
        make_log_entry(pattern_ids=["PAT-001", "PAT-003", "PAT-002", "PAT-004"]),
        make_log_entry(pattern_ids=["PAT-001", "PAT-003", "PAT-002", "PAT-004"]),
        make_log_entry(pattern_ids=["PAT-001", "PAT-002"]),
        make_log_entry(pattern_ids=["PAT-003", "PAT-004"]),
        make_log_entry(pattern_ids=["PAT-001", "PAT-003", "PAT-002", "PAT-004"]),
    ]
    log_path = write_log_file(entries, tmp)
    report = analyze_trends(window_size=10, log_path=log_path)

    top = report["top_patterns"]
    check("Patterns: top 3 returned", len(top) == 3)
    # PAT-001 appears in entries 1,2,3,5 = 4 times
    # PAT-003 appears in entries 1,2,4,5 = 4 times
    # PAT-002 appears in entries 1,2,3,5 = 4 times
    # PAT-004 appears in entries 1,2,4,5 = 4 times
    # All tied at 4 — top 3 should be any 3 of them
    top_ids = [p["pattern_id"] for p in top]
    check("Patterns: all top have count 4", all(p["count"] == 4 for p in top))
    check("Patterns: top are from known set", all(pid in ["PAT-001", "PAT-002", "PAT-003", "PAT-004"] for pid in top_ids))


# ── 6. Risk rate ────────────────────────────────────────────────
print("\n[6] RISK RATE")

with tempfile.TemporaryDirectory() as tmp:
    entries = [
        make_log_entry(risk_flags=["risk A"]),
        make_log_entry(risk_flags=["risk B", "risk C"]),
        make_log_entry(risk_flags=[]),
        make_log_entry(risk_flags=["risk A"]),
        make_log_entry(risk_flags=[]),
    ]
    log_path = write_log_file(entries, tmp)
    report = analyze_trends(window_size=10, log_path=log_path)

    check("Risk: count = 3", report["risk_count"] == 3)
    check("Risk: rate = 0.6", report["risk_rate"] == 0.6)


# ── 7. Severity distribution ───────────────────────────────────
print("\n[7] SEVERITY DISTRIBUTION")

with tempfile.TemporaryDirectory() as tmp:
    entries = [
        make_log_entry(severity="high"),
        make_log_entry(severity="high"),
        make_log_entry(severity="medium"),
        make_log_entry(severity="low"),
        make_log_entry(severity="low"),
        make_log_entry(severity="low"),
    ]
    log_path = write_log_file(entries, tmp)
    report = analyze_trends(window_size=10, log_path=log_path)

    check("Severity: HIGH=2", report["severity_distribution"]["HIGH"] == 2)
    check("Severity: MEDIUM=1", report["severity_distribution"]["MEDIUM"] == 1)
    check("Severity: LOW=3", report["severity_distribution"]["LOW"] == 3)


# ── 8. Human-readable output ───────────────────────────────────
print("\n[8] HUMAN-READABLE OUTPUT")

with tempfile.TemporaryDirectory() as tmp:
    entries = [
        make_log_entry(severity="high", deviates=3, risk_flags=["Timeline risk"],
                       pattern_ids=["PAT-001", "PAT-003"]),
        make_log_entry(severity="high", deviates=2, risk_flags=["Timeline risk"],
                       pattern_ids=["PAT-001", "PAT-003"]),
        make_log_entry(severity="medium", deviates=1, risk_flags=[],
                       pattern_ids=["PAT-001", "PAT-002"]),
        make_log_entry(severity="low", deviates=0, risk_flags=[],
                       pattern_ids=["PAT-002"]),
    ]
    log_path = write_log_file(entries, tmp)
    report = analyze_trends(window_size=10, log_path=log_path)

    text = format_trends(report)
    check("Format: contains 'MANTIS — Trends'", "MANTIS — Trends" in text)
    check("Format: contains 'Drift:'", "Drift:" in text)
    check("Format: contains 'Top recurring'", "Top recurring" in text)
    check("Format: contains 'Risk frequency'", "Risk frequency" in text)
    check("Format: contains 'Severity'", "Severity:" in text)
    check("Format: contains 'Insight'", "Insight:" in text)

    compact = format_trends_compact(report)
    check("Compact: contains 'MANTIS Trends'", "MANTIS Trends" in compact)
    check("Compact: contains 'Drift:'", "Drift:" in compact)
    check("Compact: contains 'Risk:'", "Risk:" in compact)

    print(f"\n  --- SAMPLE OUTPUT ---")
    print(text)
    print(f"\n  --- COMPACT ---")
    print(compact)


# ── 9. Insight generation ──────────────────────────────────────
print("\n[9] INSIGHT GENERATION")

check("Insight: high drift", "High drift" in _generate_insight(75, [{"pattern_id": "P1", "count": 5}], {"risk_rate": 0.6}))
check("Insight: moderate drift", "Moderate drift" in _generate_insight(50, [], {"risk_rate": 0}))
check("Insight: low drift", "Low drift" in _generate_insight(20, [], {"risk_rate": 0}))
check("Insight: no drift", "No drift" in _generate_insight(0, [], {"risk_rate": 0}))
check("Insight: frequent risk", "frequent risk" in _generate_insight(75, [], {"risk_rate": 0.5}))
check("Insight: some risk", "some risk" in _generate_insight(75, [], {"risk_rate": 0.3}))


# ── 10. Missing file ───────────────────────────────────────────
print("\n[10] MISSING FILE — NO CRASH")

report = analyze_trends(window_size=20, log_path="/nonexistent/path/observations.jsonl")
check("Missing file: no crash", report is not None)
check("Missing file: drift = 0", report["drift_score"] == 0.0)
check("Missing file: actual = 0", report["actual_entries"] == 0)


# ── 11. Malformed lines ────────────────────────────────────────
print("\n[11] MALFORMED LINES — GRACEFUL SKIP")

with tempfile.TemporaryDirectory() as tmp:
    log_dir = os.path.join(tmp, "logs")
    os.makedirs(log_dir)
    log_path = os.path.join(log_dir, "observations.jsonl")
    with open(log_path, "w") as f:
        f.write(json.dumps(make_log_entry(deviates=2)) + "\n")
        f.write("NOT VALID JSON\n")
        f.write("\n")  # empty line
        f.write(json.dumps(make_log_entry(deviates=0)) + "\n")

    report = analyze_trends(window_size=10, log_path=log_path)
    check("Malformed: reads 2 valid entries", report["actual_entries"] == 2)
    check("Malformed: drift = 50 (1/2)", report["drift_score"] == 50.0)


# ── 12. No core system changes ─────────────────────────────────
print("\n[12] NO CORE SYSTEM CHANGES")

# Verify imports still work (no modifications to other modules)
try:
    from mantis.mantis_contrast import mantis_contrast
    from mantis.trigger_engine import should_trigger, run_trigger
    from mantis.mantis_logger import log_observation
    from mantis.surface_formatter import format_surface
    from selector.select_patterns import select_patterns
    from validator.validate_pattern import load_corpus
    check("Core imports: all succeed", True)
except ImportError as e:
    check(f"Core imports: FAILED ({e})", False)


# ══════════════════════════════════════════════════════════════════
print("\n" + "=" * 60)
print(f"  RESULTS: {passed} PASS / {failed} FAIL")
print("=" * 60)
if failed == 0:
    print("  ALL TESTS PASSED")
else:
    print(f"  {failed} TESTS FAILED")
    sys.exit(1)
