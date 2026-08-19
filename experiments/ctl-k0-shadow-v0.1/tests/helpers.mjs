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

export function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(value); },
  };
}

export function fixedClock() {
  const values = ["2026-08-19T18:01:00.000Z", "2026-08-19T18:01:01.000Z"];
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}
