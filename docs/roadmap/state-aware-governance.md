# State-Aware Governance (Planned Extension)

## Current System
RIO evaluates:
- intent
- risk
- policy

## Extension (Defined, Not Yet Implemented)

Introduce state signals:
- activation_level
- stability
- coherence
- integrity flags

## Integration Point

state_engine → governance_engine

## Intended Behavior

- High activation + medium risk → slow path
- Low coherence → hold
- High authority drift → require approval

## Status

- Fully defined in schema
- Not yet wired into governance engine
- Planned future phase
