/**
 * Leaf image upload middleware (Multer).
 *
 * Uses memory storage so the buffer flows straight into Sharp (EXIF strip /
 * resize) without touching disk. Enforces a size cap and an image MIME allowlist
 * at the edge. Multer errors are normalized to typed AppErrors so the global
 * error handler returns consistent envelopes (413 too large, 415 unsupported).
 */
import multer from 'multer';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { BadRequestError, AppError } from '../utils/errors';

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Unsupported image type', 'unsupported_media_type'));
    }
  },
}).single('image');

/**
 * Wraps Multer so its errors become typed AppErrors.
 */
export const uploadLeafImage: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  multerUpload(req, res, (err: unknown) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(
          new AppError('Image exceeds 8MB limit', 413, 'image_too_large'),
        );
      }
      return next(new BadRequestError(err.message, 'upload_error'));
    }
    return next(err);
  });
};
