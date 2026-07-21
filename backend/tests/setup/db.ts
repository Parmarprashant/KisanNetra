/**
 * In-memory MongoDB helper for integration tests.
 *
 * Spins up mongodb-memory-server and connects Mongoose to it. The first run
 * downloads a MongoDB binary (cached afterwards). Call connectTestDB() in a
 * beforeAll, clearTestDB() in afterEach, and disconnectTestDB() in afterAll.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | undefined;

export async function connectTestDB(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'krishi_test' });
}

export async function clearTestDB(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((c) => c.deleteMany({})),
  );
}

export async function disconnectTestDB(): Promise<void> {
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}
