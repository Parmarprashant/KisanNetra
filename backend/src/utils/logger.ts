/**
 * Centralized Winston logger.
 *
 * Emits structured JSON logs in production (easy to aggregate) and a colorized,
 * human-readable format in development. Per rules.md, no sensitive data (tokens,
 * passwords, PII) should ever be passed to the logger.
 */
import winston from 'winston';
import { env, isProduction } from '../config/env';

const { combine, timestamp, colorize, printf, json, errors } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level}: ${stack ?? message}${metaStr}`;
  }),
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  silent: env.NODE_ENV === 'test',
});
