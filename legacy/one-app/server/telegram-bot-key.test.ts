/**
 * Validates that the TELEGRAM_BOT_TOKEN env var is a real, working bot token
 * by calling the Telegram Bot API getMe endpoint.
 */
import { describe, it, expect } from "vitest";

describe("Telegram bot token validation", () => {
  it("should authenticate with Telegram Bot API using TELEGRAM_BOT_TOKEN", async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    expect(token).toBeTruthy();

    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.ok).toBe(true);
    expect(data.result).toBeDefined();
    expect(data.result.is_bot).toBe(true);
    expect(data.result.username).toBeDefined();
    console.log(`Bot verified: @${data.result.username} (id: ${data.result.id})`);
  }, 10000);
});
