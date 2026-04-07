/**
 * RIO SMS Executor — Twilio Connector
 *
 * Sends real SMS via Twilio API.
 * Called ONLY by the gateway /execute-action route
 * AFTER the full governance pipeline has completed and
 * human authorization has been verified.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID  — Twilio Account SID
 *   TWILIO_AUTH_TOKEN   — Twilio Auth Token
 *   TWILIO_PHONE_NUMBER — Twilio phone number (sender)
 *
 * Architecture rule: All external API calls go through
 * the gateway. No agent calls Twilio directly.
 */
import twilio from "twilio";

let client = null;

/**
 * Initialize the Twilio client (lazy, once).
 */
function getClient() {
  if (client) return client;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "SMS executor not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables."
    );
  }

  client = twilio(accountSid, authToken);

  console.log(`[RIO SMS Executor] Client initialized (SID: ${accountSid.substring(0, 8)}...)`);
  return client;
}

/**
 * Send a real SMS via Twilio.
 *
 * @param {object} params
 * @param {string} params.to - Recipient phone number (E.164 format)
 * @param {string} params.body - SMS message body
 * @returns {Promise<object>} { status, connector, detail, message_sid }
 */
export async function sendSms({ to, body }) {
  const twilioClient = getClient();

  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) {
    throw new Error(
      "SMS executor not configured. Set TWILIO_PHONE_NUMBER environment variable."
    );
  }

  console.log(`[RIO SMS Executor] Sending SMS to: ${to}`);
  console.log(`[RIO SMS Executor] Body: ${body.substring(0, 50)}...`);

  const message = await twilioClient.messages.create({
    body,
    from,
    to,
  });

  console.log(`[RIO SMS Executor] Sent — SID: ${message.sid}`);

  return {
    status: "sent",
    connector: "twilio_sms",
    detail: `SMS sent to ${to} — SID: ${message.sid}`,
    message_sid: message.sid,
  };
}
