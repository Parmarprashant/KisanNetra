/**
 * S3 / MinIO client configuration.
 *
 * A single S3Client is shared across the app. When S3_ENDPOINT is set (MinIO or
 * other S3-compatible storage) we enable path-style addressing; for real AWS S3
 * the endpoint is omitted and virtual-hosted style is used.
 *
 * `ensureBucket` is called at startup so local/dev MinIO has the target bucket
 * without a manual setup step. On real AWS the bucket is expected to pre-exist
 * (created via IaC), and a missing-permission error here is logged, not fatal.
 */
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { env } from './env';
import { logger } from '../utils/logger';

export const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
  // MinIO / S3-compatible: custom endpoint + path-style addressing.
  ...(env.S3_ENDPOINT
    ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true }
    : {}),
});

export async function ensureBucket(): Promise<void> {
  const Bucket = env.AWS_S3_BUCKET;
  try {
    await s3.send(new HeadBucketCommand({ Bucket }));
    logger.info(`S3 bucket ready: ${Bucket}`);
  } catch {
    // Bucket missing (or no head permission) — try to create it (MinIO/dev).
    try {
      await s3.send(new CreateBucketCommand({ Bucket }));
      logger.info(`S3 bucket created: ${Bucket}`);
    } catch (err) {
      logger.warn(
        `Could not ensure S3 bucket '${Bucket}' — assuming it exists / is managed externally`,
        { error: err instanceof Error ? err.message : String(err) },
      );
    }
  }
}
