/**
 * Image service — Sharp processing + S3/MinIO storage.
 *
 * Responsibilities:
 *  1. Strip EXIF (privacy — removes GPS/device metadata) and normalize
 *     orientation, then resize to a sensible max for storage.
 *  2. Produce a smaller buffer for AI classification (fewer tokens / bandwidth).
 *  3. Upload the processed image to S3/MinIO (private ACL).
 *  4. Issue a short-lived pre-signed GET URL for the client to view it.
 */
import sharp from 'sharp';
import {
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';
import { s3 } from '../config/s3';
import { env } from '../config/env';
import { BadRequestError } from '../utils/errors';

export const PRESIGNED_URL_TTL_SECONDS = 15 * 60; // 15 minutes

export interface ProcessedImage {
  s3Key: string;
  s3Url: string;
  classifyBase64: string;
  mimeType: 'image/jpeg';
}

/**
 * Process a raw upload buffer and store it. Returns storage refs, a viewable
 * pre-signed URL, and a base64 payload for the classifier.
 */
export async function processAndUploadImage(
  buffer: Buffer,
  userId: string,
): Promise<ProcessedImage> {
  // 1. Storage version: EXIF-stripped, orientation-corrected, max 1024px JPEG.
  //    Sharp throws if the buffer is not a decodable image (e.g. a spoofed
  //    content-type) — surface that as a clean 400 rather than a 500.
  let processed: Buffer;
  let classifyBuffer: Buffer;
  try {
    processed = await sharp(buffer)
      .rotate() // apply EXIF orientation before stripping metadata
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }) // drop alpha for consistent JPEG
      .jpeg({ quality: 85 })
      .toBuffer(); // sharp does not copy EXIF into output → metadata stripped

    // 2. Classification version: 512px is plenty for leaf disease features.
    classifyBuffer = await sharp(buffer)
      .rotate()
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    throw new BadRequestError(
      'Uploaded file is not a valid image',
      'invalid_image',
    );
  }

  // 3. Upload processed image (private).
  const s3Key = `scans/${userId}/${nanoid()}.jpg`;
  await s3.send(
    new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: s3Key,
      Body: processed,
      ContentType: 'image/jpeg',
    }),
  );

  // 4. Pre-signed URL for viewing.
  const s3Url = await getPresignedUrl(s3Key);

  return {
    s3Key,
    s3Url,
    classifyBase64: classifyBuffer.toString('base64'),
    mimeType: 'image/jpeg',
  };
}

/** Generate a short-lived pre-signed GET URL for a stored object. */
export async function getPresignedUrl(s3Key: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: s3Key }),
    { expiresIn: PRESIGNED_URL_TTL_SECONDS },
  );
}

/**
 * Upload an arbitrary buffer (e.g. a generated report) to S3/MinIO under the
 * given key. Generic counterpart to processAndUploadImage — no image
 * processing, caller controls the content type. Objects are private; serve them
 * via getPresignedDownloadUrl.
 */
export async function uploadBuffer(
  s3Key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: s3Key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/**
 * Pre-signed GET URL that prompts a download with a friendly filename
 * (Content-Disposition: attachment). Used for report downloads.
 */
export async function getPresignedDownloadUrl(
  s3Key: string,
  filename: string,
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: s3Key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
    { expiresIn: PRESIGNED_URL_TTL_SECONDS },
  );
}
