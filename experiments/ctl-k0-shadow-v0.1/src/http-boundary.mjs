const ALLOWED_PATHS = [
  /^\/api\/v1\/ledger$/u,
];

export function createReadOnlyClient({
  baseUrl,
  bearerToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5_000,
  maxResponseBytes = 2_000_000,
}) {
  if (!baseUrl) throw new Error("RIO_GATEWAY_BASE_URL is required.");
  if (!bearerToken) throw new Error("A pre-provisioned auditor bearer token is required.");
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is unavailable.");
  const base = new URL(baseUrl);
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(base.hostname);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && loopback)) {
    throw new Error("Shadow source requires HTTPS outside explicit loopback use.");
  }

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
        authorization: `Bearer ${bearerToken}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Read-only gateway request failed (${response.status}) at ${url.pathname}.`);
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > maxResponseBytes) {
      throw new Error(`Read-only gateway response exceeded ${maxResponseBytes} bytes.`);
    }
    try {
      return JSON.parse(body);
    } catch {
      throw new Error(`Read-only gateway returned invalid JSON at ${url.pathname}.`);
    }
  };
}
