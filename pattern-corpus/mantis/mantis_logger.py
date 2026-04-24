"""
MANTIS Logger v0.1
Append-only observation log for contrast results, trigger events, surface summaries.

Rules:
- Append-only (no edits, no deletes)
- Never affects execution
- Never modifies patterns or corpus
- Never influences decisions
- Separate from RIO ledger (authoritative) and pattern corpus (reference)
- Fails silent if logging fails (no crash)
"""

import json
import os
import uuid
from datetime import datetime, timezone

# Default log path (relative to this file)
DEFAULT_LOG_PATH = os.path.join(
    os.path.dirname(__file__), "logs", "observations.jsonl"
)


def generate_log_id() -> str:
    """Generate a unique log entry ID."""
    return str(uuid.uuid4())


def now_iso() -> str:
    """Return current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def log_observation(
    event: dict,
    contrast: dict,
    trigger: str | None,
    surface_shown: bool,
    notes: str | None = None,
    log_path: str | None = None,
) -> dict | None:
    """
    Append a single observation entry to the log.

    Args:
        event: The event dict (type, task, user_requested, etc.)
        contrast: The contrast packet from mantis_contrast()
        trigger: Trigger code (T1-T5) or None
        surface_shown: Whether the surface was shown to the user
        notes: Optional short annotation
        log_path: Override log file path (for testing)

    Returns:
        The log entry dict on success, None on failure (fail silent).
    """
    try:
        entry = {
            "log_id": generate_log_id(),
            "timestamp": now_iso(),
            "task": event.get("task", event.get("description", "")),
            "event_type": event.get("type"),
            "trigger": trigger,
            "severity": contrast.get("severity"),
            "summary": contrast.get("summary", {}),
            "pattern_ids": [
                o.get("pattern_id", "")
                for o in contrast.get("observations", [])
            ],
            "surface_shown": surface_shown,
            "notes": notes,
        }

        path = log_path or DEFAULT_LOG_PATH

        # Ensure directory exists
        os.makedirs(os.path.dirname(path), exist_ok=True)

        # Append-only write
        with open(path, "a") as f:
            f.write(json.dumps(entry, separators=(",", ":")) + "\n")

        return entry

    except Exception:
        # Fail silent — logging must never crash the system
        return None


def read_log(log_path: str | None = None) -> list[dict]:
    """
    Read all observation log entries.

    Returns:
        List of log entry dicts.
    """
    path = log_path or DEFAULT_LOG_PATH
    entries = []
    try:
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))
    except FileNotFoundError:
        pass
    return entries


def log_count(log_path: str | None = None) -> int:
    """Return the number of log entries."""
    return len(read_log(log_path))


def clear_log(log_path: str | None = None):
    """
    Clear the log file. ONLY for testing.
    In production, this function should not exist.
    """
    path = log_path or DEFAULT_LOG_PATH
    with open(path, "w") as f:
        f.write("")


# ── CLI interface ───────────────────────────────────────────────────
if __name__ == "__main__":
    print("MANTIS Logger v0.1")
    print(f"Log path: {DEFAULT_LOG_PATH}")
    entries = read_log()
    print(f"Entries: {len(entries)}")
    if entries:
        print(f"Latest: {json.dumps(entries[-1], indent=2)}")
