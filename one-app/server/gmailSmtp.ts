/**
 * Gmail SMTP Delivery via Nodemailer
 * ────────────────────────────────────
 * Server-side only. Uses Gmail App Password for SMTP auth.
 * Called exclusively from the send_email connector when delivery_mode = "gmail".
 *
 * Credentials come from ENV (GMAIL_USER, GMAIL_APP_PASSWORD).
 * No OAuth required — uses App Password with TLS.
 */

import nodemailer from "nodemailer";
import { ENV } from "./_core/env";

// ─── Types ─────────────────────────────────────────────────────

export type GmailDeliveryResult = {
  success: boolean;
  messageId?: string;       // Gmail message ID (external_message_id for receipt)
  accepted?: string[];      // Recipients that accepted
  rejected?: string[];      // Recipients that rejected
  error?: string;
};

// ─── Transporter (lazy singleton) ──────────────────────────────

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    if (!ENV.gmailUser || !ENV.gmailAppPassword) {
      throw new Error("GMAIL_USER or GMAIL_APP_PASSWORD not configured");
    }
    _transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: ENV.gmailUser,
        pass: ENV.gmailAppPassword,
      },
    });
  }
  return _transporter;
}

/** Reset transporter (for testing) */
export function resetTransporter(): void {
  _transporter = null;
}

// ─── Send ──────────────────────────────────────────────────────

export async function sendViaGmail(
  to: string,
  subject: string,
  body: string,
  options?: {
    cc?: string;
    bcc?: string;
    replyTo?: string;
    html?: string;  // If provided, sends as HTML email (body becomes plain-text fallback)
  },
): Promise<GmailDeliveryResult> {
  try {
    const transporter = getTransporter();

    const mailOptions: nodemailer.SendMailOptions = {
      from: `RIO Governed Proxy <${ENV.gmailUser}>`,
      to,
      subject,
      text: body,
      ...(options?.html ? { html: options.html } : {}),
      ...(options?.cc ? { cc: options.cc } : {}),
      ...(options?.bcc ? { bcc: options.bcc } : {}),
      ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
    };

    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      accepted: Array.isArray(info.accepted)
        ? info.accepted.map(String)
        : typeof info.accepted === "string"
          ? [info.accepted]
          : [],
      rejected: Array.isArray(info.rejected)
        ? info.rejected.map(String)
        : [],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `GMAIL_SMTP_ERROR: ${msg}`,
    };
  }
}

/** Verify SMTP connection (lightweight health check) */
export async function verifyGmailConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    return { connected: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { connected: false, error: msg };
  }
}
