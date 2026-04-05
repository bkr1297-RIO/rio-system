/**
 * RIO Gmail Executor — Nodemailer Connector
 *
 * Sends real email via Gmail SMTP using nodemailer.
 * Called ONLY by the gateway /execute-action route
 * AFTER the full governance pipeline has completed and
 * human authorization has been verified.
 *
 * Required env vars:
 *   GMAIL_USER         — Gmail address (e.g. bkr1297@gmail.com)
 *   GMAIL_APP_PASSWORD — Gmail App Password (16-char, no spaces)
 *
 * Architecture rule: All external API calls go through
 * the gateway. No agent calls Gmail directly.
 */
import nodemailer from "nodemailer";

let transporter = null;

/**
 * Initialize the nodemailer transporter (lazy, once).
 */
function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "Gmail executor not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD environment variables."
    );
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  console.log(`[RIO Gmail Executor] Transporter initialized for ${user}`);
  return transporter;
}

/**
 * Send a real email via Gmail SMTP.
 *
 * @param {object} params
 * @param {string|string[]} params.to - Recipient email(s)
 * @param {string[]} [params.cc] - CC recipients
 * @param {string} params.subject - Email subject
 * @param {string} params.body - Email body (plain text)
 * @returns {Promise<object>} { status, connector, detail, message_id }
 */
export async function sendEmail({ to, cc, subject, body }) {
  const transport = getTransporter();

  // Normalize 'to' to comma-separated string
  const toStr = Array.isArray(to) ? to.join(", ") : to;

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: toStr,
    subject,
    text: body,
  };

  if (cc && cc.length > 0) {
    mailOptions.cc = Array.isArray(cc) ? cc.join(", ") : cc;
  }

  console.log(`[RIO Gmail Executor] Sending email to: ${toStr}`);
  if (cc) console.log(`[RIO Gmail Executor] CC: ${mailOptions.cc}`);
  console.log(`[RIO Gmail Executor] Subject: ${subject}`);

  const info = await transport.sendMail(mailOptions);

  console.log(`[RIO Gmail Executor] Sent — Message ID: ${info.messageId}`);

  return {
    status: "sent",
    connector: "gmail_smtp",
    detail: `Email sent to ${toStr} — Message ID: ${info.messageId}`,
    message_id: info.messageId,
  };
}
