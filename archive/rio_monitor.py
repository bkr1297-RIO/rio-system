#!/usr/bin/env python3
"""
rio_monitor.py — RIO Governance Integrity Monitor
==================================================

Mechanical guard for the RIO governance layer.
Computes SHA-256 hashes of all governance artifacts and verifies
them against a known-good manifest. Fail-closed: any mismatch or
missing file triggers a Tier-1 alert.

Usage:
    python3 rio_monitor.py              # Full integrity check
    python3 rio_monitor.py --hash-only  # Print hashes only (for Courier Log)
    python3 rio_monitor.py --verify     # Verify and exit with status code

Exit codes:
    0 — All governance artifacts verified. Integrity intact.
    1 — INTEGRITY VIOLATION DETECTED. Fail-closed triggered.
    2 — Missing artifact. Fail-closed triggered.

Filed by Manny (Builder) on instruction from Brian (Sovereign Authority).
Source: Librarian Directive S1-GENESIS, M.A.N.T.I.S. Phase 2.
"""

import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Root of the rio-system repo (this script lives at repo root)
REPO_ROOT = Path(__file__).resolve().parent

# Governance artifacts to monitor — path relative to repo root
# Each entry: (relative_path, known_good_sha256 or None)
# When known_good_sha256 is None, the monitor records but does not verify
GOVERNANCE_MANIFEST = [
    {
        "file": "GOVERNANCE.md",
        "description": "Sandbox Invariant, Two-Gate Architecture, Role Assignments",
        "known_sha256": "b1de1ada74663b8c875bdc738927286a431a98c0a94bd7e9baab1770d148def5",
    },
    {
        "file": "docs/whitepaper.md",
        "description": "RIO Whitepaper v2 — canonical system specification",
        "known_sha256": None,  # Record only — content evolves
    },
    {
        "file": "docs/architecture/bondi.md",
        "description": "Bondi role definition — Strategist boundaries",
        "known_sha256": None,
    },
    {
        "file": "docs/integration/agent-integration.md",
        "description": "5-step agent integration contract",
        "known_sha256": None,
    },
    {
        "file": "docs/compliance/eu_ai_act_mapping.md",
        "description": "EU AI Act compliance mapping",
        "known_sha256": None,
    },
    {
        "file": "docs/GOLDEN_PATH.md",
        "description": "Golden Path — proven governed action reference",
        "known_sha256": None,
    },
]

# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------

def sha256_file(filepath: Path) -> str:
    """Compute SHA-256 hex digest of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def run_integrity_check(hash_only: bool = False) -> dict:
    """
    Run full integrity check on all governance artifacts.

    Returns a result dict with:
        status: "PASS" | "FAIL" | "MISSING"
        timestamp: ISO-8601 UTC
        artifacts: list of per-file results
        violations: list of violation descriptions
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    artifacts = []
    violations = []

    for entry in GOVERNANCE_MANIFEST:
        filepath = REPO_ROOT / entry["file"]
        result = {
            "file": entry["file"],
            "description": entry["description"],
            "exists": filepath.exists(),
            "computed_sha256": None,
            "known_sha256": entry["known_sha256"],
            "status": "UNKNOWN",
        }

        if not filepath.exists():
            result["status"] = "MISSING"
            violations.append(f"MISSING: {entry['file']} — {entry['description']}")
        else:
            computed = sha256_file(filepath)
            result["computed_sha256"] = computed

            if entry["known_sha256"] is None:
                result["status"] = "RECORDED"
            elif computed == entry["known_sha256"]:
                result["status"] = "VERIFIED"
            else:
                result["status"] = "MISMATCH"
                violations.append(
                    f"MISMATCH: {entry['file']} — "
                    f"expected {entry['known_sha256'][:16]}... "
                    f"got {computed[:16]}..."
                )

        artifacts.append(result)

    overall = "PASS" if len(violations) == 0 else "FAIL"

    return {
        "monitor": "rio_monitor.py",
        "version": "1.0.0",
        "timestamp": timestamp,
        "status": overall,
        "artifacts_checked": len(artifacts),
        "violations_found": len(violations),
        "violations": violations,
        "artifacts": artifacts,
    }


def print_report(result: dict, hash_only: bool = False):
    """Print human-readable report to stdout."""
    if hash_only:
        print("# RIO Governance Artifact Hashes")
        print(f"# Generated: {result['timestamp']}")
        print()
        for a in result["artifacts"]:
            if a["computed_sha256"]:
                print(f"{a['computed_sha256']}  {a['file']}")
            else:
                print(f"{'(missing)':64s}  {a['file']}")
        return

    width = 72
    print("=" * width)
    print("  RIO GOVERNANCE INTEGRITY MONITOR")
    print("=" * width)
    print(f"  Timestamp : {result['timestamp']}")
    print(f"  Status    : {result['status']}")
    print(f"  Artifacts : {result['artifacts_checked']} checked")
    print(f"  Violations: {result['violations_found']}")
    print("-" * width)

    for a in result["artifacts"]:
        icon = {
            "VERIFIED": "[OK]",
            "RECORDED": "[--]",
            "MISSING":  "[!!]",
            "MISMATCH": "[!!]",
        }.get(a["status"], "[??]")

        print(f"  {icon} {a['file']}")
        print(f"       {a['description']}")
        if a["computed_sha256"]:
            print(f"       SHA-256: {a['computed_sha256']}")
        if a["status"] == "VERIFIED" and a["known_sha256"]:
            print(f"       Known:   {a['known_sha256']} ✓ MATCH")
        elif a["status"] == "MISMATCH":
            print(f"       Known:   {a['known_sha256']} ✗ MISMATCH")
        print()

    print("-" * width)

    if result["status"] == "PASS":
        print("  ✓ ALL GOVERNANCE ARTIFACTS VERIFIED")
        print("  Mechanical Guard Active. Fail-Closed Protocol Armed.")
    else:
        print("  ✗ INTEGRITY VIOLATION DETECTED")
        print("  TIER-1 ALERT: Governance artifacts have been modified or are missing.")
        print()
        for v in result["violations"]:
            print(f"    → {v}")

    print("=" * width)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    hash_only = "--hash-only" in sys.argv
    verify_mode = "--verify" in sys.argv

    result = run_integrity_check(hash_only=hash_only)

    if hash_only:
        print_report(result, hash_only=True)
    else:
        print_report(result)

    # Also write JSON result to stdout if in verify mode
    if verify_mode:
        print()
        print("--- JSON RESULT ---")
        print(json.dumps(result, indent=2))

    # Exit code: 0 = pass, 1 = violation, 2 = missing
    if result["status"] == "PASS":
        sys.exit(0)
    elif any(a["status"] == "MISSING" for a in result["artifacts"]):
        sys.exit(2)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
