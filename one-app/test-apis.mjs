import { config } from "dotenv";
config();

const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

async function tryApi(apiId, opts = {}) {
  const baseUrl = FORGE_URL.endsWith("/") ? FORGE_URL : `${FORGE_URL}/`;
  const fullUrl = new URL("webdevtoken.v1.WebDevService/CallApi", baseUrl).toString();
  
  try {
    const res = await fetch(fullUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "connect-protocol-version": "1",
        authorization: `Bearer ${FORGE_KEY}`,
      },
      body: JSON.stringify({ apiId, ...opts }),
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, body: text.slice(0, 300) };
  } catch (e) {
    return { status: 0, ok: false, body: e.message };
  }
}

const apis = [
  ["Google/search", { query: { q: "test" } }],
  ["Google/web_search", { query: { q: "test" } }],
  ["GoogleSearch/search", { query: { q: "test" } }],
  ["SerpApi/search", { query: { q: "test" } }],
  ["Serper/search", { query: { q: "test" } }],
  ["Web/search", { query: { q: "test" } }],
  ["Bing/search", { query: { q: "test" } }],
  ["DuckDuckGo/search", { query: { q: "test" } }],
  ["Brave/search", { query: { q: "test" } }],
  ["Google/gmail_search", { query: { q: "test" } }],
  ["Google/drive_search", { query: { q: "test" } }],
  ["Google/gmail_send", { body: { to: "test@test.com", subject: "test" } }],
  ["Google/drive_list", { query: {} }],
  ["YahooFinance/get_stock_chart", { query: { symbol: "AAPL" } }],
];

(async () => {
  for (const [apiId, opts] of apis) {
    const r = await tryApi(apiId, opts);
    const status = r.ok ? "OK" : `FAIL(${r.status})`;
    console.log(`${apiId}: ${status} → ${r.body.slice(0, 150)}`);
  }
})();
