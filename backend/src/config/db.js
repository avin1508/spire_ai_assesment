import mongoose from 'mongoose';
import { buildMongoUri, describeMongoTarget, getMongoConfig } from './env.js';

const STATE_NAMES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

// Error text without any credential-bearing URI.
const safeMessage = (error) =>
  String(error?.message ?? error).replace(/mongodb(\+srv)?:\/\/[^@\s]+@/g, 'mongodb$1://<redacted>@');

let listenersAdded = false;
function logConnectionEvents() {
  if (listenersAdded) return;
  listenersAdded = true;
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
  mongoose.connection.on('error', (error) => console.error(`MongoDB error: ${safeMessage(error)}`));
}

// Connects to MongoDB Atlas using the DB_* variables from backend/.env and
// verifies the connection with a ping. Throws a credential-free error on failure.
export async function connectDB() {
  const config = getMongoConfig();
  logConnectionEvents();
  console.log(`Connecting to MongoDB (${describeMongoTarget(config)})…`);
  try {
    await mongoose.connect(buildMongoUri(config), { serverSelectionTimeoutMS: 15000 });
    await mongoose.connection.db.admin().command({ ping: 1 });
  } catch (error) {
    throw new Error(`MongoDB connection failed: ${safeMessage(error)}`);
  }
  console.log(`MongoDB connected (database: ${mongoose.connection.name})`);
  return mongoose.connection;
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

export const getDbState = () => STATE_NAMES[mongoose.connection.readyState] ?? 'unknown';
