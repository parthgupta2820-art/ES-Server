import mongoose from 'mongoose';
import config from './env.js';

// Models set bufferCommands: false so queries fail quickly while disconnected.
// That lets the gate return a safe CLOSED response instead of waiting.

// True only after MongoDB is connected AND unique indexes are built. Without
// this flag, two requests could create duplicate plates before the unique index
// finishes building.
let indexesReady = false;

const stateNames = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/**
 * Connect to MongoDB and build the indexes of the models passed by the caller.
 * Models are injected so this configuration module does not depend on the model
 * layer. The HTTP server may start first; API routes return 503 and the gate
 * stays CLOSED until the database is ready.
 */
export async function connectDB(models = []) {
  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });

    // Build unique indexes before accepting API traffic.
    await Promise.all(models.map((model) => model.init()));
    indexesReady = true;
    console.log('[db] MongoDB connected and indexes ready.');
  } catch (error) {
    indexesReady = false;
    console.error(`[db] MongoDB connection failed: ${error.message}`);
    console.error(
      '[db] Start MongoDB, check MONGODB_URI in .env, then restart the server.',
    );
    console.error('[db] Retrying in 10 seconds...');

    // If the connection opened but index creation failed, close it so the next
    // retry starts from a clean state.
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }

    // Keep retrying so the server recovers after MongoDB is started.
    setTimeout(() => connectDB(models), 10000).unref();
  }
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1 && indexesReady;
}

export function dbState() {
  if (mongoose.connection.readyState === 1 && !indexesReady) return 'initializing';
  return stateNames[mongoose.connection.readyState] || 'unknown';
}

export async function disconnectDB() {
  indexesReady = false;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
