import crypto from 'node:crypto';
import express from 'express';
import config from './config/env.js';
import { connectDB, dbState, disconnectDB, isDbConnected } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import AccessLog from './models/AccessLog.js';
import Vehicle from './models/Vehicle.js';
import detectionRoutes from './routes/detectionRoutes.js';
import logRoutes from './routes/logRoutes.js';
import vehicleRoutes from './routes/vehicleRoutes.js';
import { closedBody } from './utils/apiResponse.js';

const app = express();

app.disable('x-powered-by');

// Give every request an ID for responses and access logs. This runs before
// JSON parsing so malformed-body errors still receive an ID.
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

app.use(express.json({ limit: '100kb' }));

// The server can run without MongoDB, but API requests fail closed until the
// database and its unique indexes are ready.
app.get('/health', (req, res) => {
  const connected = isDbConnected();
  res.status(connected ? 200 : 503).json({
    success: connected,
    status: connected ? 'ok' : 'degraded',
    database: dbState(),
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', (req, res, next) => {
  if (!isDbConnected()) {
    return res
      .status(503)
      .json(closedBody(req.requestId, 'Database is unavailable. Access denied.'));
  }
  return next();
});

app.use('/api/v1/vehicle', detectionRoutes);
app.use('/api/v1/vehicles', vehicleRoutes);
app.use('/api/v1/logs', logRoutes);

app.use((req, res) => {
  res.status(404).json(closedBody(req.requestId, 'Route not found'));
});

app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`[server] Smart gate backend running on http://localhost:${config.port}`);
  console.log(`[server] AI service: ${config.aiServiceUrl}${config.aiRecognitionEndpoint}`);
  console.log(`[server] Minimum OCR confidence: ${config.minOcrConfidence}`);
});

// Stop requests that hang longer than 30 seconds.
server.requestTimeout = 30000;

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[server] Port ${config.port} is already in use. Change PORT in .env.`);
  } else {
    console.error('[server] HTTP server error:', error.message);
  }
  process.exit(1);
});

// Listen first, then connect. API routes stay closed until MongoDB is ready.
connectDB([Vehicle, AccessLog]);

async function shutdown(signal) {
  console.log(`\n[server] ${signal} received. Shutting down...`);

  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();

  server.close(async () => {
    try {
      await disconnectDB();
    } finally {
      clearTimeout(forceExit);
      process.exit(0);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
