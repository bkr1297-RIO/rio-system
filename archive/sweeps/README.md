# RIO Daily Integrity Sweeps

Automated daily observation of the `rio-system` repository. Each sweep checks governance artifact integrity, verifies SHA-256 hashes, logs recent commits, and produces a RESULT packet.

## What the Sweep Checks

| Check | Description |
|-------|-------------|
| Governance artifacts | SHA-256 hash verification of critical files (GOVERNANCE.md, rio_monitor.py, whitepaper, etc.) |
| Known baselines | Compares computed hashes against known-good baselines where available |
| Git state | Branch, last commit, dirty/clean status, untracked files |
| Recent commits | All commits in the last 24 hours |
| Drift detection | Any MISSING or MISMATCH artifact triggers a violation |

## Status Codes

| Status | Meaning | Action |
|--------|---------|--------|
| **SUCCESS** | All artifacts verified, no drift | No action required |
| **PARTIAL** | Non-critical drift detected | Review violations, approve or remediate |
| **BLOCKED** | Critical governance artifact compromised | TIER-1 ALERT — immediate Brian review |

## How to Run

```bash
cd /path/to/rio-system
python3 integrity_sweep.py --json-only    # JSON RESULT packet only
python3 integrity_sweep.py                # Human-readable + JSON
python3 integrity_sweep.py --notify       # With notification (when configured)
```

## File Naming Convention

```
integrity-sweep-result-YYYY-MM-DD.json
```

## Governance Rule

> The sweep **observes only**. It has no execution authority. It cannot commit, modify, or approve anything. If drift is detected, it reports to Brian for decision.

## Where Results Go

1. **This directory** (`sweeps/`) — committed to the repo for agent visibility
2. **Google Drive** — `RIO > RIO-System > backups` folder
3. **MANTIS Status Dashboard** — Google Doc updated with sweep summary
