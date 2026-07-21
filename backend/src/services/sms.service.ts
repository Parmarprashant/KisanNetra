/**
 * SMS service (Twilio).
 *
 * Env-gated: without Twilio credentials every send returns 'skipped' (logged
 * once at startup) so the app runs without an SMS provider. Sends never throw —
 * a failure is logged and returned as 'failed' so the notification pipeline
 * stays resilient. Indian numbers are normalized to E.164 (+91) when a bare
 * 10-digit number is supplied.
 */
import twilio from 'twilio';
import type { Twilio } from 'twilio';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { DeliveryState } from '../models/Notification';

const isConfigured = Boolean(
  env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER,
);

let client: Twilio | undefined;
if (isConfigured) {
  client = twilio(env.TWILIO_ACCOUNT_SID as string, env.TWILIO_AUTH_TOKEN as string);
  logger.info('Twilio SMS configured');
} else {
  logger.warn('Twilio not configured — SMS notifications will be skipped');
}

/** Normalize a bare 10-digit Indian mobile to E.164; pass through if already +. */
function toE164(phone: string): string {
  if (phone.startsWith('+')) return phone;
  return `+91${phone}`;
}

/**
 * Send an SMS. Returns 'skipped' when unconfigured or no phone is given,
 * 'sent' on success, 'failed' on a provider/network error (never throws).
 */
export async function sendSMS(
  phone: string | undefined,
  body: string,
): Promise<DeliveryState> {
  if (!isConfigured || !client) return 'skipped';
  if (!phone) return 'skipped';

  try {
    await client.messages.create({
      to: toE164(phone),
      from: env.TWILIO_FROM_NUMBER as string,
      body,
    });
    return 'sent';
  } catch (err) {
    logger.warn('SMS send failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return 'failed';
  }
}
