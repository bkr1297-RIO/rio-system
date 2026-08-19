export async function readIntent(getJson, intentId) {
  if (typeof intentId !== "string" || intentId.length === 0) {
    throw new Error("A ledger entry without intent_id cannot be hydrated.");
  }
  return getJson(`/api/v1/intents/${encodeURIComponent(intentId)}`);
}
