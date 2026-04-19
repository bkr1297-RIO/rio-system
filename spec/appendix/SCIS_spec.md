# Appendix: Structured Credential Isolation Specification (SCIS)

**Version:** 0.1
**Status:** Active

---

## Overview

The Structured Credential Isolation Specification (SCIS) defines the rules for how execution-capable credentials are stored, accessed, and protected within the RIO system.

---

## Core Rule

> Execution-capable credentials exist ONLY inside adapter modules. No credential is accessible in shared config, environment loaders, background workers, or any module outside the adapter boundary.

---

## Credential Categories

| Category | Example | Adapter | Isolation Method |
|----------|---------|---------|-----------------|
| SMTP | Gmail app password | FakeEmailAdapter | Module-private `_SMTP_CREDENTIALS` |
| OAuth | Google Drive token | DriveAdapter | Module-private `_get_drive_token()` |
| File System | Write paths | FakeFileAdapter | Module-private `_ALLOWED_PATHS` |
| Transport | HMAC signing key | GmailTransportGate | Closure-scoped, frozen |

---

## Verification Method

The credential audit (Step 1 of the 5-step hardening) uses 10 programmatic scans:

1. `grep` for credential patterns in shared config files
2. `grep` for credential patterns in environment loaders
3. `grep` for credential patterns in background workers
4. `grep` for credential patterns in route handlers (outside adapters)
5. `grep` for `export` of credential variables in adapter modules
6. Verify adapter credentials are declared with `const` (not `let`)
7. Verify adapter credentials are not passed as function parameters
8. Verify no `global` or `window` assignment of credentials
9. Verify no credential serialization to logs or error messages
10. Verify no credential transmission over non-HTTPS channels

---

## Enforcement

SCIS is enforced by:
1. **Code structure** — Credentials are module-private (closure-scoped or `const` in module scope)
2. **Import analysis** — No module outside the adapter can import credential variables
3. **Red-team testing** — Direct connector bypass tests verify credentials are unreachable
4. **Audit artifacts** — The credential audit produces a signed report stored in `/artifacts/`
