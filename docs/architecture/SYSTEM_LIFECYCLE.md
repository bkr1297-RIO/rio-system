# RIO System Lifecycle

The RIO system operates on a continuous, 9-step lifecycle loop. This loop ensures that every action is governed, executed, recorded, and learned from.

## The 9-Step Lifecycle Loop

**Observe → Analyze → Plan → Govern → Approve → Execute → Record → Verify → Learn**

### Component Mapping

| Step | Action | Component | Description |
|---|---|---|---|
| 1 | **Observe** | Mantis / Observer | Monitors environment, receives signals, detects anomalies. |
| 2 | **Analyze** | AI / Intelligence | Processes observations, identifies patterns, determines goals. |
| 3 | **Plan** | AI / Intelligence | Translates goals into structured, proposed intents. |
| 4 | **Govern** | RIO Gateway | Evaluates intent against policy, calculates risk, determines approval requirements. |
| 5 | **Approve** | Human / Governor | Reviews high-risk intents and provides cryptographic approval (or denial). |
| 6 | **Execute** | RIO Gateway | Performs the approved action via external connectors (fail-closed). |
| 7 | **Record** | Receipt Protocol | Generates a cryptographically signed receipt of the execution. |
| 8 | **Verify** | Ledger | Writes the receipt to the immutable, hash-chained ledger for audit. |
| 9 | **Learn** | Policy Engine | Uses ledger history and execution outcomes to refine future policies. |

## Lifecycle Diagram

```mermaid
graph TD
    subgraph Intelligence [Intelligence Layer]
        O[Observe] --> A[Analyze]
        A --> P[Plan]
    end

    subgraph Governance [Governance Layer]
        P -->|Proposed Intent| G[Govern]
        G -->|Risk Assessment| AP[Approve]
    end

    subgraph Execution [Execution Layer]
        AP -->|Cryptographic Sig| E[Execute]
    end

    subgraph Witness [Witness Layer]
        E -->|Result Payload| R[Record]
        R -->|Signed Receipt| V[Verify]
    end

    subgraph Feedback [Learning Loop]
        V -->|Audit History| L[Learn]
        L -->|Policy Updates| G
    end

    classDef intel fill:#e6f0ff,stroke:#5da9ff,stroke-width:2px;
    classDef govern fill:#fff0e6,stroke:#ffb366,stroke-width:2px;
    classDef exec fill:#e6ffe6,stroke:#66cc66,stroke-width:2px;
    classDef witness fill:#f0e6ff,stroke:#b366ff,stroke-width:2px;
    classDef feedback fill:#f2f2f2,stroke:#999999,stroke-width:2px,stroke-dasharray: 5 5;

    class O,A,P intel;
    class G,AP govern;
    class E exec;
    class R,V witness;
    class L feedback;
```

*This lifecycle is the standard model for all RIO deployments. It enforces the core invariants: AI proposes, humans approve, systems execute, receipts prove.*
