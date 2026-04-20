import { describe, it, expect } from "vitest";

describe("Twilio credentials validation", () => {
  it("should authenticate with Twilio API using Account SID and Auth Token", async () => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    expect(accountSid).toBeTruthy();
    expect(authToken).toBeTruthy();
    expect(accountSid!.startsWith("AC")).toBe(true);

    // Call Twilio's account endpoint to verify credentials
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`;
    const response = await fetch(url, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      },
      signal: AbortSignal.timeout(10000),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sid).toBe(accountSid);
    expect(data.status).toBe("active");
  }, 15000);
});
