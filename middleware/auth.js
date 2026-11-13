import { createHash, timingSafeEqual } from 'node:crypto';
import config from '../config/env.js';
import { closedBody } from '../utils/apiResponse.js';

/**
 * Compare API keys in constant time. Hashing first keeps both buffers the same
 * length, so the comparison does not leak the secret's length.
 */
function keysMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;

  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

function requireKey(expectedKey, failureMessage) {
  return function keyMiddleware(req, res, next) {
    if (!keysMatch(req.get('x-api-key'), expectedKey)) {
      return res.status(401).json(closedBody(req.requestId, failureMessage));
    }
    return next();
  };
}

/** ESP32-CAM key. It is accepted only by the detection route. */
export const requireDeviceKey = requireKey(
  config.esp32ApiKey,
  'Invalid or missing device API key',
);

/** Admin key. The ESP32 device key is intentionally not accepted here. */
export const requireAdminKey = requireKey(
  config.adminApiKey,
  'Invalid or missing admin API key',
);
