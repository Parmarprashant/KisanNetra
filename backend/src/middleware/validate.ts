/**
 * Validation middleware.
 *
 * Validates request body / query / params against Zod schemas BEFORE the
 * controller runs (per rules.md). On success, the parsed (and coerced) values
 * replace the originals so controllers receive typed, trusted data. On failure,
 * a ZodError is forwarded to the global error handler → 422.
 */
import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';

interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export const validate =
  (schemas: ValidationSchemas) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        // req.query is a getter-only property on some Express versions; assign
        // parsed values field-by-field to stay compatible.
        const parsed = schemas.query.parse(req.query);
        Object.assign(req.query, parsed);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
