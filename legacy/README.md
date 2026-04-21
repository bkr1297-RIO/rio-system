# Legacy Directory

This directory contains prior implementations of the RIO system that are **no longer part of the active runtime**. They are retained for historical reference only.

---

## Contents

The legacy directory includes earlier iterations of:

- **Python server** — the original RIO server implementation before the Node.js/Express gateway
- **React application** — an earlier web interface prototype
- **Architecture iterations** — prior design approaches that informed the current system

---

## Status

| Attribute | Value |
|-----------|-------|
| Runtime status | **Not running** |
| Used by current gateway | **No** |
| Safe to ignore for new contributors | **Yes** |
| Retained for | Historical reference, design archaeology |

---

## Relationship to Current System

The current RIO runtime is the Node.js/Express gateway located in `gateway/`. All governance enforcement, execution gating, receipt generation, and ledger operations run through that single gateway process.

Nothing in this `legacy/` directory is imported, referenced, or executed by the current system.

---

## Note

This directory accounts for approximately 88% of the repository's file count (roughly 1,022 of 1,156 files). If you are evaluating the repository for the first time, start with `gateway/` and the documents listed in `SYSTEM_RUNTIME_MAP.md`.
