import assert from "node:assert/strict";
import test from "node:test";
import { createReadOnlyClient } from "../src/http-boundary.mjs";
import { jsonResponse } from "./helpers.mjs";

test("HTTP boundary permits only GET on two read surfaces", async () => {
  const calls = [];
  const getJson = createReadOnlyClient({
    baseUrl: "https://gateway.example",
    apiKey: "secret-read-key",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return jsonResponse({ entries: [], total: 0, chain_tip: "tip" });
    },
  });
  await getJson("/api/v1/ledger", { limit: 1 });
  await getJson("/api/v1/intents/intent-001");
  assert.deepEqual(calls.map((call) => call.options.method), ["GET", "GET"]);
  assert.ok(calls.every((call) => call.options.headers["x-api-key"] === "secret-read-key"));
  await assert.rejects(() => getJson("/api/v1/intents"), /not allowlisted/u);
  await assert.rejects(() => getJson("/api/v1/intents/one/execute"), /not allowlisted/u);
  await assert.rejects(() => getJson("https://elsewhere.example/api/v1/ledger"), /Cross-origin/u);
});
