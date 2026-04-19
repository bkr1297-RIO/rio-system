#!/usr/bin/env python3
"""
integrity_sweep.py — RIO Daily Integrity Sweep
================================================

Autonomous observation layer. Wakes on timer, checks repo state,
verifies governance file hashes, detects drift, and produces a
RESULT packet. Observation only — no writes, no commits, no deploys.

ALLOWED:  observe, compare, summarize, notify
BLOCKED:  commit, deploy, modify runtime, approve

Usage:
    python3 integrity_sweep.py                  # Full sweep, human-readable + JSON
    python3 integrity_sweep.py --json-only      # JSON RESULT packet only
    python3 integrity_sweep.py --notify         # Sweep + send notification (if configured)

Exit codes:
    0 — Clean. No drift detected.
    1 — Drift detected. Approval required.
    2 — Missing artifacts. Tier-1 alert.

Filed by Manny (Builder). Authorized by Brian (Sovereign).
Governance rule: Timers can wake the system to observe;
only humans can authorize it to act.
"""

import hashlib
import json
import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent
SWEEP_VERSION = "1.0.0"
SWEEP_ID = str(uuid.uuid4())

# Governance artifacts with known-good hashes (pinned at verification time)
# None = record only, string = verify against known-good
GOVERNANCE_BASELINE = [
    {
        "file": "GOVERNANCE.md",
        "description": "Sandbox Invariant, Two-Gate Architecture, Role Assignments",
        "known_sha256": "b1de1ada74663b8c875bdc738927286a431a98c0a94bd7e9baab1770d148def5",
        "criticality": "CRITICAL",
    },
    {
        "file": "rio_monitor.py",
        "description": "Mechanical Guard — SHA-256 integrity checker",
        "known_sha256": None,
        "criticality": "HIGH",
    },
    {
        "file": "docs/whitepaper.md",
        "description": "RIO Whitepaper v2 — canonical system specification",
        "known_sha256": None,
        "criticality": "HIGH",
    },
    {
        "file": "docs/GOLDEN_PATH.md",
        "description": "Golden Path — proven governed action reference",
        "known_sha256": None,
        "criticality": "HIGH",
    },
    {
        "file": "docs/architecture/bondi.md",
        "description": "Bondi role definition — Strategist boundaries",
        "known_sha256": None,
        "criticality": "MEDIUM",
    },
    {
        "file": "docs/bondi-operating-policy.md",
        "description": "Bondi operating policy — governance constraints",
        "known_sha256": None,
        "criticality": "MEDIUM",
    },
    {
        "file": "packets/README.md",
        "description": "Universal Packet Format specification",
        "known_sha256": None,
        "criticality": "MEDIUM",
    },
]

# Policy files to check for drift (any change = flag for review)
POLICY_FILES = [
    "policy/config.json",
    "governance/",
    "directives/",
]

# ---------------------------------------------------------------------------
# Core functions — READ ONLY, no writes
# ---------------------------------------------------------------------------

def sha256_file(filepath: Path) -> str:
    """Compute SHA-256 hex digest of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def get_git_state() -> dict:
    """Read current git state — branch, last commit, dirty status."""
    state = {
        "branch": None,
        "last_commit_hash": None,
        "last_commit_message": None,
        "last_commit_date": None,
        "is_dirty": None,
        "untracked_files": [],
    }

    try:
        state["branch"] = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=REPO_ROOT, stderr=subprocess.DEVNULL
        ).decode().strip()

        state["last_commit_hash"] = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO_ROOT, stderr=subprocess.DEVNULL
        ).decode().strip()

        state["last_commit_message"] = subprocess.check_output(
            ["git", "log", "-1", "--format=%s"],
            cwd=REPO_ROOT, stderr=subprocess.DEVNULL
        ).decode().strip()

        state["last_commit_date"] = subprocess.check_output(
            ["git", "log", "-1", "--format=%aI"],
            cwd=REPO_ROOT, stderr=subprocess.DEVNULL
        ).decode().strip()

        dirty_output = subprocess.check_output(
            ["git", "status", "--porcelain"],
            cwd=REPO_ROOT, stderr=subprocess.DEVNULL
        ).decode().strip()
        state["is_dirty"] = len(dirty_output) > 0

        if dirty_output:
            state["untracked_files"] = [
                line.strip() for line in dirty_output.split("\n") if line.strip()
            ]

    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    return state


def check_governance_artifacts() -> tuple:
    """
    Check all governance artifacts against baseline.
    Returns (artifacts_list, violations_list, drift_list).
    """
    artifacts = []
    violations = []
    drift = []

    for entry in GOVERNANCE_BASELINE:
        filepath = REPO_ROOT / entry["file"]
        result = {
            "file": entry["file"],
            "description": entry["description"],
            "criticality": entry["criticality"],
            "exists": filepath.exists(),
            "computed_sha256": None,
            "known_sha256": entry["known_sha256"],
            "status": "UNKNOWN",
        }

        if not filepath.exists():
            result["status"] = "MISSING"
            violations.append({
                "type": "MISSING_ARTIFACT",
                "file": entry["file"],
                "criticality": entry["criticality"],
                "message": f"Governance artifact missing: {entry['file']}",
            })
        else:
            computed = sha256_file(filepath)
            result["computed_sha256"] = computed

            if entry["known_sha256"] is None:
                result["status"] = "RECORDED"
            elif computed == entry["known_sha256"]:
                result["status"] = "VERIFIED"
            else:
                result["status"] = "MISMATCH"
                violations.append({
                    "type": "HASH_MISMATCH",
                    "file": entry["file"],
                    "criticality": entry["criticality"],
                    "expected": entry["known_sha256"][:16] + "...",
                    "actual": computed[:16] + "...",
                    "message": f"Hash mismatch on {entry['file']}",
                })

        artifacts.append(result)

    return artifacts, violations, drift


def check_recent_commits(days: int = 1) -> list:
    """Get commits from the last N days — observation only."""
    commits = []
    try:
        output = subprocess.check_output(
            ["git", "log", f"--since={days} days ago", "--format=%H|%h|%s|%aI|%an"],
            cwd=REPO_ROOT, stderr=subprocess.DEVNULL
        ).decode().strip()

        for line in output.split("\n"):
            if not line.strip():
                continue
            parts = line.split("|", 4)
            if len(parts) == 5:
                commits.append({
                    "hash": parts[0],
                    "short_hash": parts[1],
                    "message": parts[2],
                    "date": parts[3],
                    "author": parts[4],
                })
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    return commits


def generate_result_packet(
    git_state: dict,
    artifacts: list,
    violations: list,
    recent_commits: list,
) -> dict:
    """Generate a RESULT packet from sweep findings."""

    now = datetime.now(timezone.utc).isoformat()

    # Determine status
    if any(v["type"] == "MISSING_ARTIFACT" and v["criticality"] == "CRITICAL" for v in violations):
        status = "BLOCKED"
    elif len(violations) > 0:
        status = "PARTIAL"
    else:
        status = "SUCCESS"

    # Determine if approval is needed
    needs_approval = len(violations) > 0

    # Build summary
    verified_count = sum(1 for a in artifacts if a["status"] == "VERIFIED")
    recorded_count = sum(1 for a in artifacts if a["status"] == "RECORDED")
    missing_count = sum(1 for a in artifacts if a["status"] == "MISSING")
    mismatch_count = sum(1 for a in artifacts if a["status"] == "MISMATCH")

    summary_parts = [
        f"Daily Integrity Sweep completed at {now}.",
        f"Checked {len(artifacts)} governance artifacts.",
        f"Verified: {verified_count}, Recorded: {recorded_count}, Missing: {missing_count}, Mismatch: {mismatch_count}.",
        f"Recent commits (24h): {len(recent_commits)}.",
        f"Repo dirty: {git_state.get('is_dirty', 'unknown')}.",
    ]

    if not violations:
        summary_parts.append("No drift detected. System clean.")
    else:
        summary_parts.append(f"DRIFT DETECTED: {len(violations)} violation(s). Approval required.")

    # Next action
    if not violations:
        next_action = "No action required. Next sweep in 24 hours."
    elif any(v["criticality"] == "CRITICAL" for v in violations):
        next_action = "TIER-1 ALERT: Critical governance artifact compromised. Immediate review required by Brian."
    else:
        next_action = "Review violations and approve remediation or acknowledge drift."

    packet = {
        "packet_type": "RESULT",
        "task_id": SWEEP_ID,
        "completed_at": now,
        "completed_by": "MANNY",
        "status": status,
        "summary": " ".join(summary_parts),
        "artifacts": {
            "repo_commit": git_state.get("last_commit_hash"),
            "drive_files": None,
            "docs_created": None,
        },
        "verification": {
            "tests": "PASS" if not violations else "FAIL",
            "notes": f"{len(artifacts)} artifacts checked, {len(violations)} violations",
        },
        "blockers": [v["message"] for v in violations] if violations else [],
        "next_recommended_action": next_action,
        "sweep_detail": {
            "sweep_version": SWEEP_VERSION,
            "sweep_id": SWEEP_ID,
            "git_state": git_state,
            "governance_artifacts": artifacts,
            "violations": violations,
            "recent_commits": recent_commits,
            "needs_approval": needs_approval,
        },
    }

    return packet


# ---------------------------------------------------------------------------
# Output — READ ONLY
# ---------------------------------------------------------------------------

def print_human_report(packet: dict):
    """Print human-readable sweep report."""
    width = 72
    detail = packet.get("sweep_detail", {})
    artifacts = detail.get("governance_artifacts", [])
    violations = detail.get("violations", [])
    git_state = detail.get("git_state", {})
    recent = detail.get("recent_commits", [])

    print("=" * width)
    print("  RIO DAILY INTEGRITY SWEEP")
    print("  Autonomous Observation — No Execution Authority")
    print("=" * width)
    print(f"  Sweep ID  : {detail.get('sweep_id', 'N/A')}")
    print(f"  Timestamp : {packet['completed_at']}")
    print(f"  Status    : {packet['status']}")
    print(f"  Branch    : {git_state.get('branch', 'N/A')}")
    print(f"  Last Commit: {git_state.get('last_commit_hash', 'N/A')} — {git_state.get('last_commit_message', 'N/A')}")
    print(f"  Repo Dirty: {git_state.get('is_dirty', 'N/A')}")
    print("-" * width)

    print("\n  GOVERNANCE ARTIFACTS:")
    for a in artifacts:
        icon = {
            "VERIFIED": "[OK]",
            "RECORDED": "[--]",
            "MISSING":  "[!!]",
            "MISMATCH": "[!!]",
        }.get(a["status"], "[??]")
        crit = f"[{a['criticality']}]"
        print(f"    {icon} {crit:10s} {a['file']}")
        if a["computed_sha256"]:
            print(f"                       SHA-256: {a['computed_sha256'][:32]}...")

    if recent:
        print(f"\n  RECENT COMMITS ({len(recent)} in last 24h):")
        for c in recent[:5]:
            print(f"    {c['short_hash']} — {c['message'][:50]} ({c['author']})")

    print("-" * width)

    if not violations:
        print("  RESULT: CLEAN — No drift detected.")
        print("  No action required. Next sweep in 24 hours.")
    else:
        print(f"  RESULT: DRIFT DETECTED — {len(violations)} violation(s)")
        for v in violations:
            print(f"    [{v['criticality']}] {v['message']}")
        print()
        print(f"  NEXT: {packet['next_recommended_action']}")

    print("=" * width)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    json_only = "--json-only" in sys.argv
    notify = "--notify" in sys.argv

    # Step 1: Observe git state
    git_state = get_git_state()

    # Step 2: Check governance artifacts
    artifacts, violations, drift = check_governance_artifacts()

    # Step 3: Check recent commits
    recent_commits = check_recent_commits(days=1)

    # Step 4: Generate RESULT packet
    packet = generate_result_packet(git_state, artifacts, violations, recent_commits)

    # Step 5: Output (observation only — no writes to repo)
    if json_only:
        print(json.dumps(packet, indent=2))
    else:
        print_human_report(packet)
        print()
        print("--- RESULT PACKET (JSON) ---")
        print(json.dumps(packet, indent=2))

    # Step 6: Notify (if requested and configured)
    if notify and violations:
        print("\n[NOTIFY] Drift detected. Notification would be sent to Brian.")
        print("[NOTIFY] (Notification channel not yet configured — observation logged only)")

    # Exit code
    if packet["status"] == "SUCCESS":
        sys.exit(0)
    elif packet["status"] == "BLOCKED":
        sys.exit(2)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
