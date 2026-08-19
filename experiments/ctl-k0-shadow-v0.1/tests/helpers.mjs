export const LEDGER_ENTRY = Object.freeze({
  entry_id: "entry-001",
  prev_hash: "tip-000",
  ledger_hash: "tip-001",
  timestamp: "2026-08-19T18:00:00.000Z",
  intent_id: "intent-001",
  action: "send_email",
  agent_id: "bondi",
  status: "executed",
  detail: "sensitive detail must not survive",
  intent_hash: "intent-hash-001"
});

export const INTENT = Object.freeze({
  intent_id: "intent-001",
  action: "send_email",
  agent_id: "bondi",
  target_environment: "production",
  timestamp: "2026-08-19T17:59:00.000Z",
  status: "executed",
  parameters: { to: "private@example.com", body: "secret" },
  governance: { status: "complete" },
  authorization: { decision: "approved" },
  execution: { status: "success" },
  receipt: { receipt_id: "receipt-001" }
});

export function jsonResponse(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return structuredClone(value); } };
}

export function fixedClock() {
  const values = ["2026-08-19T18:01:00.000Z", "2026-08-19T18:01:01.000Z"];
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}
