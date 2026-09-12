export async function readLedger(getJson, { limit = 20, offset = 0 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Shadow ledger limit must be an integer from 1 through 20.");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("Shadow ledger offset must be a non-negative integer.");
  }
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
