# Agent Integration Contract

## Purpose
Define how any external AI agent connects to RIO.

## Integration Flow

1. Agent proposes an action:
POST /proposals

2. RIO evaluates:
POST /governance/evaluate

3. If required, human approval is collected:
POST /approvals

4. If approved, execution token is issued:
POST /execution-tokens

5. Action executes ONLY with valid token:
POST /execute

## Rules

- Agents cannot execute actions directly
- Agents cannot bypass governance
- Agents do not control approval logic
- Agents do not access ledger directly

## Key Principle

All agents propose.
Only RIO governs.
Only humans authorize.
