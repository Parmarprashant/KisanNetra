/**
 * Hashing helpers.
 *
 * Device IDs are hashed (SHA-256) before storage so a raw device fingerprint —
 * which can be personally identifying — is never persisted (privacy, per PRD).
 */
import { createHash } from 'crypto';

export function hashDeviceId(deviceId: string): string {
  return createHash('sha256').update(deviceId).digest('hex');
}
