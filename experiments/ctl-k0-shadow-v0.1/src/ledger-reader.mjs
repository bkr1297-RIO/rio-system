export async function readLedger(getJson, { limit = 100, offset = 0 } = {}) {
  const result = await getJson("/api/v1/ledger", { limit, offset });
  if (!result || !Array.isArray(result.entries) || !Number.isInteger(result.total)
      || typeof result.chain_tip !== "string") {
    throw new Error("Ledger response does not satisfy the shadow source contract.");
  }
  return {
    entries: result.entries,
    total: result.total,
    chainTip: result.chain_tip,
    apiVersion: result.api_version ?? null,
  };
}
