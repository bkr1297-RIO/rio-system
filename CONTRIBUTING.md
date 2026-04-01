# Contributing to RIO Governance Gateway

## 1. Welcome

Welcome to the RIO Governance Gateway project! We appreciate your interest in contributing to a system designed to bring security and control to AI operations. RIO is a security-critical system, and all contributions must be thoughtful, precise, and adhere to our strict standards.

## 2. How to Contribute

There are three primary ways to contribute:

### 2.1. Report Issues

If you find a bug or an issue, please use [GitHub Issues](https://github.com/bkr1297-RIO/rio-system/issues) to report it. Describe the problem, expected behavior, and steps to reproduce. For security vulnerabilities, **DO NOT** open a public issue. Instead, email Brian directly (Brian will provide the contact method).

### 2.2. Suggest Improvements

For suggestions or ideas for improvement, open a [GitHub Discussion](https://github.com/bkr1297-RIO/rio-system/discussions) or an Issue tagged `enhancement`. Describe the use case, the proposed change, and how it aligns with RIO's core invariants (fail-closed execution, three-power separation, tamper-evident ledger).

### 2.3. Submit Code

To contribute code, please follow these steps:

1.  Fork the `bkr1297-RIO/rio-system` repository.
2.  Create a feature branch from `main`.
3.  Make your changes.
4.  Ensure all PRs include tests if they touch the governance pipeline.
5.  All PRs **MUST NOT** violate the core invariants listed in the Architecture document.
6.  Open a Pull Request to the `main` branch.

## 3. Code Standards

*   **Language:** TypeScript for all code.
*   **Testing:** Tests are required for governance pipeline changes.
*   **Commit Messages:** Use conventional commit messages (e.g., `feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
*   **Secrets:** No secrets or credentials in code.

## 4. Core Invariants (Do Not Break These)

The following 8 invariants are non-negotiable and any PR that violates them will be rejected. These are detailed in the [Architecture v2.7 document](docs/architecture/ARCHITECTURE_v2.7.md).

1.  No action executes without governance evaluation.
2.  No execution without human authorization.
3.  Execution tokens are single-use.
4.  Ledger is append-only.
5.  Hash chain is contiguous.
6.  Ed25519 signatures bind identity to decisions.
7.  Replay prevention on all mutations.
8.  Three-Power Separation boundaries cannot be crossed.

## 5. License

Note that the license is being finalized. Until a `LICENSE` file is added, all rights are reserved by Brian Rasmussen.

## 6. Contact

For general questions, open a [GitHub Discussion](https://github.com/bkr1297-RIO/rio-system/discussions). For security issues, contact Brian directly.
