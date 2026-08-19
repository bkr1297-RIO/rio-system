const ALLOWED_PATHS = [
  /^\/api\/v1\/ledger$/u,
  /^\/api\/v1\/intents\/[^/]+$/u,
];

export function createReadOnlyClient({ baseUrl, apiKey, fetchImpl = globalThis.fetch }) {
  if (!baseUrl) throw new Error("RIO_GATEWAY_BASE_URL is required.");
  if (!apiKey) throw new Error("A read-only auditor API key is required.");
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is unavailable.");
  const base = new URL(baseUrl);

  return async function getJson(path, query = {}) {
    const url = new URL(path, base);
    if (url.origin !== base.origin) throw new Error("Cross-origin shadow reads are prohibited.");
    if (!ALLOWED_PATHS.some((pattern) => pattern.test(url.pathname))) {
      throw new Error(`Shadow read path is not allowlisted: ${url.pathname}`);
    }
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
      },
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Read-only gateway request failed (${response.status}) at ${url.pathname}.`);
    return response.json();
  };
}
