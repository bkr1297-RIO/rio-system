"""
MANTIS Trend Analyzer v0.1
Read-only analytics layer on top of MANTIS observation logs.

Answers:
- "What keeps happening?"
- "Where are we drifting?"

Rules:
- Read-only: never modifies logs, corpus, or any system state
- Observer-only: does not affect execution, surfacing, or decisions
- No automatic decisions or pattern updates
- Manual invocation only (v0.1)

Input: observations.jsonl (from mantis_logger)
Output: structured trend report + human-readable summary
"""

import json
import os
from collections import Counter


# ── Log reader ──────────────────────────────────────────────────────

DEFAULT_LOG_PATH = os.path.join(
    os.path.dirname(__file__), "logs", "observations.jsonl"
)


def _read_logs(log_path: str | None = None) -> list[dict]:
    """
    Read observation log entries from JSONL file.
    Returns list of dicts, newest last (file order).
    Fails gracefully on missing/empty file.
    """
    path = log_path or os.environ.get("MANTIS_LOG_FILE", DEFAULT_LOG_PATH)
    if not os.path.exists(path):
        return []
    entries = []
    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # skip malformed lines
    return entries


# ── Window slicing ──────────────────────────────────────────────────

def _slice_window(entries: list[dict], window_size: int | None) -> list[dict]:
    """
    Slice entries to the last N observations.
    If window_size is None or 0, return all entries.
    """
    if not window_size or window_size <= 0:
        return entries
    return entries[-window_size:]


# ── Core metrics ────────────────────────────────────────────────────

def _compute_drift_score(window: list[dict]) -> float:
    """
    Drift score = % of logs with at least 1 deviation.
    Returns 0-100 as a percentage.
    """
    if not window:
        return 0.0
    deviation_count = sum(
        1 for entry in window
        if entry.get("summary", {}).get("deviates", 0) > 0
    )
    return round((deviation_count / len(window)) * 100, 1)


def _compute_pattern_frequency(window: list[dict]) -> list[dict]:
    """
    Count how often each pattern_id appears across all log entries.
    Returns top 3 most frequent as [{pattern_id, count}].
    """
    counter = Counter()
    for entry in window:
        for pid in entry.get("pattern_ids", []):
            if pid:  # skip empty strings
                counter[pid] += 1
    top3 = counter.most_common(3)
    return [{"pattern_id": pid, "count": count} for pid, count in top3]


def _compute_risk_rate(window: list[dict]) -> dict:
    """
    Risk frequency:
    - risk_count = number of logs with risk_flags
    - risk_rate = risk_count / window_size
    """
    if not window:
        return {"risk_count": 0, "risk_rate": 0.0}
    risk_count = sum(
        1 for entry in window
        if len(entry.get("summary", {}).get("risk_flags", [])) > 0
    )
    return {
        "risk_count": risk_count,
        "risk_rate": round(risk_count / len(window), 2),
    }


def _compute_severity_distribution(window: list[dict]) -> dict:
    """
    Count entries by severity level.
    Returns {"HIGH": n, "MEDIUM": n, "LOW": n}
    """
    dist = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for entry in window:
        severity = (entry.get("severity") or "").upper()
        if severity in dist:
            dist[severity] += 1
        elif severity:
            dist[severity] = 1  # capture unexpected severities
    return dist


# ── Insight generation ──────────────────────────────────────────────

def _generate_insight(drift_score: float, top_patterns: list, risk_rate: dict) -> str:
    """
    Generate a one-line insight based on metrics.
    """
    parts = []

    if drift_score >= 70:
        parts.append("High drift detected — most runs have deviations")
    elif drift_score >= 40:
        parts.append("Moderate drift — recurring deviations present")
    elif drift_score > 0:
        parts.append("Low drift — occasional deviations")
    else:
        parts.append("No drift detected — all runs aligned")

    if risk_rate.get("risk_rate", 0) >= 0.5:
        parts.append("frequent risk flags")
    elif risk_rate.get("risk_rate", 0) > 0:
        parts.append("some risk flags present")

    if top_patterns:
        top_name = top_patterns[0]["pattern_id"]
        top_count = top_patterns[0]["count"]
        parts.append(f"most recurring: {top_name} ({top_count}x)")

    return ". ".join(parts) + "."


# ── Main analyzer ───────────────────────────────────────────────────

def analyze_trends(
    window_size: int = 20,
    log_path: str | None = None,
) -> dict:
    """
    Analyze MANTIS observation logs for trends.

    Args:
        window_size: Number of most recent observations to analyze.
                     Use 0 or None for full history.
        log_path: Override log file path (for testing).

    Returns:
        {
            "window_size": int,
            "actual_entries": int,
            "drift_score": float,       # 0-100%
            "top_patterns": [...],      # top 3 by frequency
            "risk_count": int,
            "risk_rate": float,         # 0.0-1.0
            "severity_distribution": {},
            "insight": str,
        }
    """
    entries = _read_logs(log_path)
    window = _slice_window(entries, window_size)

    drift = _compute_drift_score(window)
    patterns = _compute_pattern_frequency(window)
    risk = _compute_risk_rate(window)
    severity = _compute_severity_distribution(window)
    insight = _generate_insight(drift, patterns, risk)

    return {
        "window_size": window_size if window_size else len(entries),
        "actual_entries": len(window),
        "drift_score": drift,
        "top_patterns": patterns,
        "risk_count": risk["risk_count"],
        "risk_rate": risk["risk_rate"],
        "severity_distribution": severity,
        "insight": insight,
    }


# ── Human-readable formatter ───────────────────────────────────────

def format_trends(report: dict) -> str:
    """
    Format a trend report as human-readable text.
    """
    lines = []
    actual = report["actual_entries"]
    window = report["window_size"]

    lines.append(f"MANTIS — Trends (last {window} runs, {actual} available)")
    lines.append("")

    # Drift
    drift = report["drift_score"]
    drift_count = round(drift * actual / 100)
    lines.append(f"Drift: {drift}% ({drift_count}/{actual} runs had deviations)")
    lines.append("")

    # Top patterns
    top = report["top_patterns"]
    if top:
        lines.append("Top recurring patterns:")
        for p in top:
            lines.append(f"  - {p['pattern_id']} ({p['count']})")
    else:
        lines.append("Top recurring patterns: none")
    lines.append("")

    # Risk
    risk_rate = report["risk_rate"]
    risk_count = report["risk_count"]
    lines.append("Risk frequency:")
    lines.append(f"  - {int(risk_rate * 100)}% of runs triggered risk flags ({risk_count}/{actual})")
    lines.append("")

    # Severity
    severity = report["severity_distribution"]
    lines.append("Severity:")
    for level in ["HIGH", "MEDIUM", "LOW"]:
        count = severity.get(level, 0)
        lines.append(f"  - {level}: {count}")
    # Include any unexpected severities
    for level, count in severity.items():
        if level not in ("HIGH", "MEDIUM", "LOW"):
            lines.append(f"  - {level}: {count}")
    lines.append("")

    # Insight
    lines.append(f"Insight: {report['insight']}")

    return "\n".join(lines)


# ── Compact one-liner ───────────────────────────────────────────────

def format_trends_compact(report: dict) -> str:
    """
    Compact one-line trend summary.
    """
    drift = report["drift_score"]
    risk = int(report["risk_rate"] * 100)
    top = report["top_patterns"]
    top_str = ", ".join(f"{p['pattern_id']}({p['count']})" for p in top[:2]) if top else "none"
    return f"MANTIS Trends | Drift: {drift}% | Risk: {risk}% | Top: {top_str}"


# ── CLI ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    window = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    log_file = sys.argv[2] if len(sys.argv) > 2 else None
    report = analyze_trends(window_size=window, log_path=log_file)
    print(format_trends(report))
    print()
    print(format_trends_compact(report))
