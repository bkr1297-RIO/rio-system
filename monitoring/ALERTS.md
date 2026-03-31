# RIO Alert Taxonomy and Severity Levels (TASK-030)

**Lane:** DevOps / Infrastructure
**Owner:** Damon
**Status:** DRAFT

## 1. Overview

The RIO Alerting System provides real-time observability into the health and security of the Governance Gateway. It ensures that the Sovereign Authority (I-1) is immediately notified of critical failures or unauthorized attempts, maintaining the integrity of the **Fail-Closed** architecture.

## 2. Severity Levels

| Severity | Description | Examples | Action Required |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | System-wide failure or security breach. | Execution failure, ledger integrity breach, hash chain break, database offline. | **Immediate** (Email + Webhook) |
| **HIGH** | Security event or protocol violation. | Unauthorized attempt blocked, Ed25519 signature verification failure, replay attack detected. | **Urgent** (Email + Webhook) |
| **MEDIUM** | Operational issue or timeout. | Expired approval timeout, rate limit exceeded, high latency (>2s). | **Daily Review** (Webhook) |
| **LOW** | Informational or minor degradation. | Health check degraded, memory usage >80%, new policy loaded. | **Log Only** (Dashboard) |

## 3. Alert Categories

### 3.1. Governance Alerts (GOV)
*   **GOV-001 (CRITICAL):** Execution Failure. An authorized action failed to execute at the connector level.
*   **GOV-002 (HIGH):** Unauthorized Attempt. An unauthenticated or unauthorized request was blocked by the gate.
*   **GOV-003 (HIGH):** Signature Failure. An approval was submitted with an invalid Ed25519 signature.
*   **GOV-004 (MEDIUM):** Approval Timeout. A pending action expired before receiving a signature.

### 3.2. Ledger Alerts (LDG)
*   **LDG-001 (CRITICAL):** Hash Chain Break. The scheduled integrity check detected a mismatch in the SHA-256 chain.
*   **LDG-002 (CRITICAL):** Database Offline. The persistent PostgreSQL ledger is unreachable.
*   **LDG-003 (MEDIUM):** Ledger Latency. Writing to the ledger is taking longer than 500ms.

### 3.3. Infrastructure Alerts (INF)
*   **INF-001 (MEDIUM):** Rate Limit. A user or IP has exceeded the allowed request frequency.
*   **INF-002 (LOW):** Memory/CPU Pressure. System resources are nearing capacity.
*   **INF-003 (LOW):** Health Degraded. A non-critical dependency (e.g., external monitoring) is failing.

## 4. Alert Payload Schema (JSON)

All alerts dispatched by the system will follow this standard format:

```json
{
  "alert_id": "uuid-v4",
  "event_type": "GOV-001",
  "severity": "CRITICAL",
  "timestamp": "2026-03-31T00:00:00Z",
  "details": "Execution failed for Gmail connector: API_LIMIT_EXCEEDED",
  "ledger_entry_id": "optional-receipt-id",
  "source": "rio-gateway-prod",
  "verification_link": "https://rio-gateway.onrender.com/verify/{hash}"
}
```

---
**Defined by:** Damon (DevOps)
**Date:** 2026-03-30
**Task:** TASK-030
