import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load .env from the project root, regardless of where node is started from.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

// These two keys have safe local defaults. API keys do not.
const mongoUri = process.env.MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017/smart_gate';
const aiServiceUrl = process.env.AI_SERVICE_URL?.trim() || 'http://127.0.0.1:8000';

const esp32ApiKey = process.env.ESP32_API_KEY?.trim();
const adminApiKey = process.env.ADMIN_API_KEY?.trim();

const missing = [
  ['ESP32_API_KEY', esp32ApiKey],
  ['ADMIN_API_KEY', adminApiKey],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(', ')}.\n` +
      'Copy .env.example to .env and set both API keys before starting the server.',
  );
}

if (esp32ApiKey === adminApiKey) {
  throw new Error('ESP32_API_KEY and ADMIN_API_KEY must be different values.');
}

const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a number between 1 and 65535.');
}

const minOcrConfidence = Number(process.env.MIN_OCR_CONFIDENCE || 0.8);
if (!Number.isFinite(minOcrConfidence) || minOcrConfidence < 0 || minOcrConfidence > 1) {
  throw new Error('MIN_OCR_CONFIDENCE must be a number between 0 and 1.');
}

const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB || 5);
if (!Number.isFinite(maxFileSizeMb) || maxFileSizeMb <= 0) {
  throw new Error('MAX_FILE_SIZE_MB must be a positive number.');
}

const aiTimeoutMs = Number(process.env.AI_TIMEOUT_MS || 15000);
if (!Number.isFinite(aiTimeoutMs) || aiTimeoutMs < 500) {
  throw new Error('AI_TIMEOUT_MS must be a number of at least 500 milliseconds.');
}

try {
  // Fail at startup with a clear message instead of on the first request.
  const parsedAiUrl = new URL(aiServiceUrl);
  if (!['http:', 'https:'].includes(parsedAiUrl.protocol)) {
    throw new Error('unsupported protocol');
  }
} catch {
  throw new Error('AI_SERVICE_URL must be a valid HTTP/HTTPS URL, for example http://127.0.0.1:8000.');
}

const aiRecognitionEndpoint = process.env.AI_RECOGNITION_ENDPOINT?.trim() || '/recognize';

const config = Object.freeze({
  port,
  mongoUri,
  aiServiceUrl: aiServiceUrl.replace(/\/+$/, ''),
  aiRecognitionEndpoint: aiRecognitionEndpoint.startsWith('/')
    ? aiRecognitionEndpoint
    : `/${aiRecognitionEndpoint}`,
  aiTimeoutMs,
  esp32ApiKey,
  adminApiKey,
  minOcrConfidence,
  maxFileSizeMb,
  maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
});

if (/change_this|dev_only/i.test(`${esp32ApiKey} ${adminApiKey}`)) {
  console.warn(
    '[config] Development API key placeholder detected. Replace ESP32_API_KEY and ADMIN_API_KEY before deployment.',
  );
}

export default config;
