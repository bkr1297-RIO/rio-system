/**
 * RIO SMS Executor — Twilio Connector (Hardened)
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
 * Hardening (2026-04-10):
 *   - Friction 1: Env var is TWILIO_PHONE_NUMBER (matches Render config)
 *   - Friction 2: E.164 sanitization on recipient number
 *   - Friction 3: Twilio trial account "Restricted Number" guardrail
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
 * Sanitize a phone number to E.164 format.
 *
 * Twilio requires E.164: +[country code][number], no spaces/dashes/parens.
 * Examples:
 *   "(555) 123-4567"  → "+15551234567"
 *   "555-123-4567"    → "+15551234567"
 *   "+15551234567"    → "+15551234567"  (already valid)
 *   "15551234567"     → "+15551234567"
 *   "5551234567"      → "+15551234567"  (assumes US +1)
 *
 * @param {string} raw - Raw phone number input
 * @returns {string} E.164 formatted number
 */
export function sanitizeToE164(raw) {
  if (!raw || typeof raw !== "string") {
    throw new Error("Phone number is required and must be a string.");
  }

  // Strip all non-digit characters except leading +
  let digits = raw.replace(/[^\d+]/g, "");

  // If it starts with +, keep it and strip + from the rest
  if (digits.startsWith("+")) {
    digits = "+" + digits.slice(1).replace(/\+/g, "");
  }

  // Already in E.164 format
  if (/^\+\d{10,15}$/.test(digits)) {
    return digits;
  }

  // Strip the + if present for digit counting
  const justDigits = digits.replace(/^\+/, "");

  // 11 digits starting with 1 → US number, prepend +
  if (justDigits.length === 11 && justDigits.startsWith("1")) {
    return `+${justDigits}`;
  }

  // 10 digits → assume US, prepend +1
  if (justDigits.length === 10) {
    return `+1${justDigits}`;
  }

  // 12+ digits → assume country code is included, prepend +
  if (justDigits.length >= 12) {
    return `+${justDigits}`;
  }

  // Fallback: prepend + and hope for the best (Twilio will reject if invalid)
  console.warn(`[RIO SMS Executor] Unusual phone format: "${raw}" → "+${justDigits}" — Twilio will validate.`);
  return `+${justDigits}`;
}

/**
 * Detect if a Twilio error is a trial account restriction.
 *
 * Twilio trial accounts can only send to verified numbers.
 * Error code 21608 = "The number is unverified. Trial accounts
 * cannot send messages to unverified numbers."
 *
 * @param {Error} err - The Twilio error
 * @returns {boolean}
 */
function isTrialRestrictionError(err) {
  const trialCodes = [21608, 21610, 21611, 21612, 21614];
  return trialCodes.includes(err.code) ||
    (err.message && (
      err.message.includes("unverified") ||
      err.message.includes("Trial accounts") ||
      err.message.includes("not a valid") ||
      err.message.includes("is not verified")
    ));
}

/**
 * Send a real SMS via Twilio.
 *
 * @param {object} params
 * @param {string} params.to - Recipient phone number (any format — will be sanitized to E.164)
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

  // Friction 2: Sanitize recipient to E.164
  const sanitizedTo = sanitizeToE164(to);
  // Also sanitize the sender (in case it was entered without +)
  const sanitizedFrom = sanitizeToE164(from);

  console.log(`[RIO SMS Executor] Sending SMS to: ${sanitizedTo} (raw: ${to})`);
  console.log(`[RIO SMS Executor] From: ${sanitizedFrom}`);
  console.log(`[RIO SMS Executor] Body: ${body.substring(0, 50)}...`);

  try {
    const message = await twilioClient.messages.create({
      body,
      from: sanitizedFrom,
      to: sanitizedTo,
    });

    console.log(`[RIO SMS Executor] Sent — SID: ${message.sid}`);

    return {
      status: "sent",
      connector: "twilio_sms",
      detail: `SMS sent to ${sanitizedTo} — SID: ${message.sid}`,
      message_sid: message.sid,
    };
  } catch (smsErr) {
    // Friction 3: Handle trial account restrictions gracefully
    if (isTrialRestrictionError(smsErr)) {
      console.warn(`[RIO SMS Executor] TRIAL RESTRICTION: ${smsErr.message}`);
      console.warn(`[RIO SMS Executor] The governance signature was VALID. Delivery blocked by Twilio trial account restrictions, not by RIO.`);

      return {
        status: "trial_restricted",
        connector: "twilio_sms",
        detail: `SMS governance approved and signature valid. Delivery blocked by Twilio trial account: ${smsErr.message}. Recipient ${sanitizedTo} must be verified in Twilio console for trial accounts.`,
        twilio_error_code: smsErr.code,
        twilio_error: smsErr.message,
        governance_valid: true,
        recipient: sanitizedTo,
      };
    }

    // Re-throw non-trial errors for the route handler to catch
    throw smsErr;
  }
}
