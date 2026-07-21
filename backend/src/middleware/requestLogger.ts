/**
 * HTTP request logging via Morgan, piped into the Winston logger so all logs
 * share one structured transport.
 */
import morgan from 'morgan';
import { isProduction } from '../config/env';
import { logger } from '../utils/logger';

const stream = {
  write: (message: string) => logger.http?.(message.trim()) ?? logger.info(message.trim()),
};

// 'combined' in production (Apache-style, richer), 'dev' locally (concise/colored).
export const requestLogger = morgan(isProduction ? 'combined' : 'dev', {
  stream,
  skip: (req) => req.url === '/api/v1/health',
});
