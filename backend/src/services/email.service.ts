/**
 * Email service (SendGrid).
 *
 * Env-gated: without SENDGRID_API_KEY (and a verified from-address) every send
 * returns 'skipped' (logged once at startup) so the app runs without an email
 * provider. Sends never throw — failures are logged and returned as 'failed'.
 *
 * Two roles for email in Phase 7:
 *  - a delivery channel for user notifications (sendEmail), and
 *  - the transport for password-reset links (sendPasswordResetEmail).
 */
import sgMail from '@sendgrid/mail';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { DeliveryState } from '../models/Notification';

const isConfigured = Boolean(env.SENDGRID_API_KEY && env.SENDGRID_FROM_EMAIL);

if (isConfigured) {
  sgMail.setApiKey(env.SENDGRID_API_KEY as string);
  logger.info('SendGrid email configured');
} else {
  logger.warn('SendGrid not configured — emails will be skipped');
}

export interface EmailOptions {
  to?: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email. Returns 'skipped' when unconfigured or no recipient,
 * 'sent' on success, 'failed' on error (never throws).
 */
export async function sendEmail(options: EmailOptions): Promise<DeliveryState> {
  if (!isConfigured) return 'skipped';
  if (!options.to) return 'skipped';

  try {
    await sgMail.send({
      to: options.to,
      from: env.SENDGRID_FROM_EMAIL as string,
      subject: options.subject,
      text: options.text,
      ...(options.html ? { html: options.html } : {}),
    });
    return 'sent';
  } catch (err) {
    logger.warn('Email send failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return 'failed';
  }
}

/**
 * Send a password-reset link. Unlike notification emails this is on the auth
 * critical path, so the caller (auth.service) is told plainly whether it went
 * out; we still never throw, returning the DeliveryState instead.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<DeliveryState> {
  return sendEmail({
    to,
    subject: 'Reset your Krishi Raksha password',
    text: `You requested a password reset. Open this link to set a new password (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `
      <h2>Krishi Raksha — Password Reset</h2>
      <p>You requested a password reset. The link below is valid for <strong>1 hour</strong>.</p>
      <p><a href="${resetUrl}">Reset your password →</a></p>
      <p style="color:#666;font-size:12px">If you did not request this, you can safely ignore this email.</p>
    `,
  });
}

/** Whether the email provider is configured — used to gate password reset. */
export function isEmailConfigured(): boolean {
  return isConfigured;
}
