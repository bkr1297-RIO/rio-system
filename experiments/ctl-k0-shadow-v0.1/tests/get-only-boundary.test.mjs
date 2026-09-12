import assert from "node:assert/strict";
import test from "node:test";
import { createReadOnlyClient } from "../src/http-boundary.mjs";
import { jsonResponse } from "./helpers.mjs";

test("HTTP boundary permits only GET on the ledger surface", async () => {
  const calls = [];
  const getJson = createReadOnlyClient({
    baseUrl: "https://gateway.example",
    bearerToken: "secret-auditor-token",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return jsonResponse({ entries: [], total: 0, chain_tip: "tip" });
    },
  });
  await getJson("/api/v1/ledger", { limit: 1 });
  assert.deepEqual(calls.map((call) => call.options.method), ["GET"]);
  assert.ok(calls.every((call) => call.options.headers.authorization === "Bearer secret-auditor-token"));
  assert.ok(calls.every((call) => call.options.signal instanceof AbortSignal));
  await assert.rejects(() => getJson("/api/v1/intents"), /not allowlisted/u);
  await assert.rejects(() => getJson("/api/v1/intents/intent-001"), /not allowlisted/u);
  await assert.rejects(() => getJson("https://elsewhere.example/api/v1/ledger"), /Cross-origin/u);
});

test("HTTP boundary requires HTTPS off loopback and caps source responses", async () => {
  assert.throws(() => createReadOnlyClient({
    baseUrl: "http://gateway.example",
    bearerToken: "token",
    fetchImpl: async () => jsonResponse({}),
  }), /requires HTTPS/u);
  const getJson = createReadOnlyClient({
    baseUrl: "https://gateway.example",
    bearerToken: "token",
    maxResponseBytes: 5,
    fetchImpl: async () => jsonResponse({ too: "large" }),
  });
  await assert.rejects(() => getJson("/api/v1/ledger"), /exceeded/u);
});
