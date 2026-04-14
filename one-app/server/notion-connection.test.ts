import { describe, it, expect } from "vitest";

/**
 * Validates that the NOTION_API_TOKEN and NOTION_DECISION_LOG_DB_ID
 * environment variables are set and can reach the Notion API.
 */
describe("Notion connection", () => {
  const NOTION_API_TOKEN = process.env.NOTION_API_TOKEN;
  const NOTION_DECISION_LOG_DB_ID = process.env.NOTION_DECISION_LOG_DB_ID;

  it("should have NOTION_API_TOKEN set", () => {
    expect(NOTION_API_TOKEN).toBeDefined();
    expect(NOTION_API_TOKEN!.length).toBeGreaterThan(10);
    expect(NOTION_API_TOKEN!.startsWith("ntn_")).toBe(true);
  });

  it("should have NOTION_DECISION_LOG_DB_ID set", () => {
    expect(NOTION_DECISION_LOG_DB_ID).toBeDefined();
    expect(NOTION_DECISION_LOG_DB_ID!.length).toBe(32);
  });

  it("should authenticate with the Notion API", async () => {
    const res = await fetch("https://api.notion.com/v1/users/me", {
      headers: {
        "Authorization": `Bearer ${NOTION_API_TOKEN}`,
        "Notion-Version": "2022-06-28",
      },
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { object: string; type: string };
    expect(data.object).toBe("user");
    expect(data.type).toBe("bot");
  });

  it("should access the RIO DECISION LOG database", async () => {
    const res = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_DECISION_LOG_DB_ID}`,
      {
        headers: {
          "Authorization": `Bearer ${NOTION_API_TOKEN}`,
          "Notion-Version": "2022-06-28",
        },
      }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { object: string; title: Array<{ plain_text: string }> };
    expect(data.object).toBe("database");
    // Verify it's the right database
    const title = data.title?.map((t) => t.plain_text).join("") || "";
    expect(title).toContain("DECISION LOG");
  });
});
