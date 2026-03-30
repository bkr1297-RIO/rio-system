# RIO Connector Architecture

RIO is a universal governance layer. Connectors are the execution modules that sit behind the governance gate. Every connector follows the same contract: **no receipt, no execution.**

## Architecture

```
AI proposes intent
       ↓
RIO intercepts → Policy check → Risk assessment
       ↓
Human approves (or policy auto-approves)
       ↓
Receipt generated (Ed25519 signed)
       ↓
Ledger entry written (hash-chain linked)
       ↓
Connector executes action ← YOU ARE HERE
       ↓
Verification recorded
```

## Connector Interface

Every connector implements the `RioConnector` interface defined in `base.ts`:

| Method | Purpose |
|---|---|
| `info()` | Returns connector metadata: name, platform, supported actions, connection status |
| `execute(request)` | Executes the action after RIO authorization. Returns success/failure and execution details |
| `verify(executionId)` | Independently verifies that the action was executed as authorized |

## Registered Connectors

| Connector | Platform | Actions | CLI Tool | Status |
|---|---|---|---|---|
| Gmail | Google | `send_email` | `manus-mcp-cli` (Gmail MCP) | Connected |
| Google Calendar | Google | `create_event`, `update_event`, `delete_event` | `gws calendar` | Simulated (scope limitation) |
| Google Drive | Google | `write_file`, `create_folder`, `share_file` | `gws drive` | Connected |
| GitHub | GitHub | `create_issue`, `create_pr`, `commit_file`, `close_issue` | `gh` CLI | Connected |

## Adding a New Connector

1. Create a new file in `connectors/` (e.g., `slack.ts`)
2. Implement the `RioConnector` interface from `base.ts`
3. Register it in `registry.ts`
4. Export it from `index.ts`

The connector receives an `ExecutionRequest` containing:
- `intentId` — the governed intent ID
- `receiptId` — the cryptographic receipt ID (proof of authorization)
- `action` — the action type (e.g., `send_email`)
- `parameters` — action-specific parameters
- `mode` — `live` or `simulated`

The connector must return an `ExecutionResult` with:
- `success` — whether the action executed
- `mode` — `live` or `simulated`
- `details` — execution-specific details (message ID, file ID, etc.)
- `error` — error message if failed

## Fail-Closed Guarantee

Connectors only execute after:
1. Intent is created and classified
2. Policy engine evaluates (may auto-approve/deny)
3. Human approves (if policy requires)
4. Cryptographic receipt is generated and signed
5. Ledger entry is written to the hash chain

If any step fails, execution is blocked. The connector never sees the request.

## CLI Executor

All connectors that use sandbox CLI tools (MCP, gws, gh) go through `cli-executor.ts`, which provides:
- Timeout handling (30s default)
- Error capture and structured result parsing
- Logging for audit trail
