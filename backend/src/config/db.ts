/**
 * MongoDB connection via Mongoose.
 */
import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
mongoose.connection.on('disconnected', () =>
  logger.warn('MongoDB disconnected'),
);
mongoose.connection.on('error', (err) =>
  logger.error('MongoDB connection error', { error: err.message }),
);

export async function connectMongoDB(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
  });
}

export async function disconnectMongoDB(): Promise<void> {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
}
