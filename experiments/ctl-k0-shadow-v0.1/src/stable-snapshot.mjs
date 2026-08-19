import { readLedger } from "./ledger-reader.mjs";
import { readIntent } from "./intent-reader.mjs";
import { sha256Canonical } from "./stable-json.mjs";

function minimizeLedgerEntry(entry) {
  return {
    entry_id: entry.entry_id ?? null,
    prev_hash: entry.prev_hash ?? null,
    ledger_hash: entry.ledger_hash ?? null,
    timestamp: entry.timestamp ?? null,
    intent_id: entry.intent_id ?? null,
    action: entry.action ?? null,
    agent_id: entry.agent_id ?? null,
    status: entry.status ?? null,
    receipt_hash: entry.receipt_hash ?? null,
    authorization_hash: entry.authorization_hash ?? null,
    intent_hash: entry.intent_hash ?? null,
  };
}

function minimizeIntent(intent) {
  return {
    intent_id: intent.intent_id ?? null,
    action: intent.action ?? null,
    agent_id: intent.agent_id ?? null,
    target_environment: intent.target_environment ?? null,
    timestamp: intent.timestamp ?? null,
    status: intent.status ?? null,
    parameters_digest: sha256Canonical(intent.parameters ?? {}),
    has_governance_record: Boolean(intent.governance),
    has_authorization_record: Boolean(intent.authorization),
    has_execution_record: Boolean(intent.execution),
    has_receipt_record: Boolean(intent.receipt),
  };
}

export function dedupeKey(entry) {
  return sha256Canonical({ entry_id: entry.entry_id, ledger_hash: entry.ledger_hash });
}

export function classifyEpoch(previous, current) {
  if (!previous || previous.total === undefined || !previous.chainTip) return "INITIAL_CAPTURE";
  if (current.total < previous.total) return "SOURCE_REWIND";
  if (current.total === previous.total && current.chainTip !== previous.chainTip) return "EPOCH_RUPTURE";
  if (current.total === previous.total && current.chainTip === previous.chainTip) return "UNCHANGED";
  return "ADVANCED_ANCESTRY_UNVERIFIED";
}

export async function captureStableSnapshot({
  getJson,
  limit = 100,
  offset = 0,
  maxAttempts = 3,
  clock = () => new Date().toISOString(),
  previousCheckpoint,
}) {
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const captureStartedAt = clock();
    const before = await readLedger(getJson, { limit, offset });
    const hydrated = [];
    for (const rawEntry of before.entries) {
      const entry = minimizeLedgerEntry(rawEntry);
      const intent = minimizeIntent(await readIntent(getJson, entry.intent_id));
      hydrated.push({ entry, intent, dedupe_key: dedupeKey(entry) });
    }
    const after = await readLedger(getJson, { limit: 1, offset: 0 });
    const captureCompletedAt = clock();
    const stable = before.chainTip === after.chainTip && before.total === after.total;
    last = {
      schemaVersion: "rio.k0-observation/0.1",
      labels: ["NON_AUTHORITATIVE_SHADOW", "NOT_FOR_DECISION_USE"],
      captureStartedAt,
      captureCompletedAt,
      captureAttempt: attempt,
      atomicity: stable ? "STABLE" : "NON_ATOMIC_SNAPSHOT",
      chainTipBefore: before.chainTip,
      chainTipAfter: after.chainTip,
      totalBefore: before.total,
      totalAfter: after.total,
      epochStatus: classifyEpoch(previousCheckpoint, { total: before.total, chainTip: before.chainTip }),
      records: hydrated,
    };
    last.captureId = sha256Canonical(last);
    if (stable) return last;
  }
  return last;
}
