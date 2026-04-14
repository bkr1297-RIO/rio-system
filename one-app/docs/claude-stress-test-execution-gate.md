# Claude Stress-Test: Execution Gate Authorization Schema

## The Gap (Identified by Claude)
The Sign button in the Execution Gate must produce a JSON authorization record with a **defined schema**. Without this, either:
- Manny defines the schema himself (governance leak — agent defines authorization format)
- Or builds something that can't validate the record properly (security gap)

## Required Fields (minimum)
1. Task ID (e.g., MUSS-095-COMMAND)
2. Timestamp (ISO 8601)
3. Authorizing identity (B-Rass)
4. Action being authorized (specific, not generic)
5. Nonce (replay protection — already in RIO gate spec)

## Resolution
The Sign button produces a JSON authorization record matching the existing RIO packet schema.
Schema is already in `packets/` directory in rio-system.
Manny validates against that schema before executing.

## Status
Claude: ALL CLEAR with this addition. Baton to Manny.
