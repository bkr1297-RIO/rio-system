# RIO Runtime Diagnostic Engine (RDE) Specification

**Version:** 0.1
**Status:** Draft — Pending Implementation

---

## Overview

The Runtime Diagnostic Engine (RDE) monitors the live RIO system for anomalies, integrity drift, and enforcement failures. It operates as a passive observer — it reads system state but never modifies it.

---

## Monitoring Categories

| Category | What It Watches | Example Anomaly |
|----------|----------------|-----------------|
| Gate | Token validation decisions | Spike in TOKEN_EXPIRED denials |
| Token | Issuance and burn patterns | Token issued but never burned |
| Ledger | Hash chain integrity | Chain break (hash mismatch) |
| Receipt | Receipt generation and chaining | Missing receipt for executed intent |
| Adapter | Execution timing and outcomes | Adapter timeout > 30s |
| Credential | Access patterns to module-private credentials | Unexpected credential read |

---

## Diagnostic Events

Each anomaly produces a `DiagnosticEvent`:

```json
{
  "event_id": "DIAG-a1b2c3d4",
  "timestamp": "2026-04-19T12:00:00.000Z",
  "category": "ledger",
  "severity": "critical",
  "message": "Hash chain break detected at entry 2934",
  "context": {
    "entry_id": "LE-2934",
    "expected_prev_hash": "abc123...",
    "actual_prev_hash": "def456..."
  }
}
```

---

## Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| `info` | Normal operational event | Log only |
| `warning` | Unusual pattern, not yet a violation | Alert owner |
| `critical` | Governance invariant violated | Alert owner + consider kill switch |

---

## Implementation Status

The RDE is specified but not yet implemented. The reference stub is at `server/rde/runtimeDiagnostics.ts`.

When implemented, the RDE will:
1. Run on a configurable interval (default: every 60s)
2. Produce a `DiagnosticReport` with aggregated events
3. Persist reports to the ledger for auditability
4. Trigger owner notifications for `critical` events
