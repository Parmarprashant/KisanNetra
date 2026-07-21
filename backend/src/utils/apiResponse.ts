/**
 * Standard API response builder.
 *
 * Per rules.md, all responses use a consistent envelope:
 *   Success: { success: true, data: { ... } }
 *   Error:   { success: false, error: { code, message } }
 */

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const apiResponse = {
  success<T>(data: T, meta?: Record<string, unknown>): SuccessEnvelope<T> {
    return meta ? { success: true, data, meta } : { success: true, data };
  },

  error(code: string, message: string, details?: unknown): ErrorEnvelope {
    return {
      success: false,
      error: details ? { code, message, details } : { code, message },
    };
  },
};
