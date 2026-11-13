import fs from 'node:fs/promises';
import config from '../config/env.js';
import AccessLog from '../models/AccessLog.js';
import Vehicle from '../models/Vehicle.js';
import { recognizePlate } from '../services/aiService.js';
import { AppError } from '../utils/AppError.js';
import { closedBody, detectionBody } from '../utils/apiResponse.js';
import { normalizePlate } from '../utils/normalizePlate.js';

/** Save one audit row per request. Upsert makes retries idempotent. */
async function saveAccessLog(entry) {
  await AccessLog.updateOne(
    { requestId: entry.requestId },
    { $setOnInsert: { ...entry, timestamp: new Date() } },
    { upsert: true },
  );
}

/**
 * A completed decision is only returned after its log is stored. If the log
 * write fails, the request fails closed instead of losing the audit record.
 */
async function saveDecisionLog(entry) {
  try {
    await saveAccessLog(entry);
  } catch {
    throw new AppError(
      503,
      'Access attempt could not be recorded. Access denied.',
      'Access log write failed',
    );
  }
}

/** Error paths already return an error, so their audit log is best effort. */
async function saveFailureLog(entry) {
  try {
    await saveAccessLog(entry);
  } catch (error) {
    console.warn(`[log] Could not save failure log: ${error.message}`);
  }
}

async function deleteTempImage(file) {
  if (!file?.path) return;

  try {
    await fs.unlink(file.path);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[upload] Could not delete temporary image: ${error.message}`);
    }
  }
}

/**
 * POST /api/v1/vehicle/detect
 *
 * Flow: recognize plate -> check confidence -> find vehicle -> apply
 * authorization/expiry rules -> save log -> respond -> delete temporary image.
 */
export async function detectVehicle(req, res, next) {
  const requestId = req.requestId;
  const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';

  let numberPlate = null;
  let confidence = null;

  if (!req.file) {
    return next(new AppError(400, 'Image file is required'));
  }

  if (!deviceId || deviceId.length > 120) {
    await deleteTempImage(req.file);
    return next(
      new AppError(400, 'deviceId is required and must be at most 120 characters'),
    );
  }

  try {
    const recognition = await recognizePlate(req.file);
    confidence = recognition.confidence;

    // The AI could not find a plate. Deny access and record the attempt.
    if (!recognition.success) {
      await saveDecisionLog({
        requestId,
        deviceId,
        numberPlate: null,
        authorized: false,
        gateAction: 'CLOSED',
        reason: recognition.reason,
        confidence: null,
      });

      return res
        .status(200)
        .json(closedBody(requestId, 'Number plate recognition failed', recognition.reason));
    }

    numberPlate = normalizePlate(recognition.numberPlate);

    if (!numberPlate) {
      const reason = 'Empty number plate after normalization';
      await saveDecisionLog({
        requestId,
        deviceId,
        numberPlate: null,
        authorized: false,
        gateAction: 'CLOSED',
        reason,
        confidence,
      });

      return res
        .status(200)
        .json(closedBody(requestId, 'Number plate recognition failed', reason));
    }

    // Low-confidence OCR must never be authorized.
    if (confidence < config.minOcrConfidence) {
      const reason = 'OCR confidence is below the configured threshold';
      await saveDecisionLog({
        requestId,
        deviceId,
        numberPlate,
        authorized: false,
        gateAction: 'CLOSED',
        reason,
        confidence,
      });

      return res
        .status(200)
        .json(closedBody(requestId, 'Number plate recognition failed', reason));
    }

    const vehicle = await Vehicle.findOne({ numberPlate });

    let authorized = false;
    let reason = 'Vehicle not registered';

    if (vehicle) {
      const expired = vehicle.validUntil && vehicle.validUntil.getTime() <= Date.now();

      if (!vehicle.isAuthorized) {
        reason = 'Vehicle is not authorized';
      } else if (expired) {
        reason = 'Vehicle authorization expired';
      } else {
        authorized = true;
        reason = 'Vehicle is registered and authorized';
      }
    }

    await saveDecisionLog({
      requestId,
      deviceId,
      numberPlate,
      authorized,
      gateAction: authorized ? 'OPEN' : 'CLOSED',
      reason,
      confidence,
    });

    return res.status(200).json(
      detectionBody({
        success: true,
        requestId,
        numberPlate,
        authorized,
        gateAction: authorized ? 'OPEN' : 'CLOSED',
        message: authorized ? 'Access Granted' : 'Access Denied',
        reason,
      }),
    );
  } catch (error) {
    await saveFailureLog({
      requestId,
      deviceId,
      numberPlate,
      authorized: false,
      gateAction: 'CLOSED',
      reason: error.reason || 'Access processing failed',
      confidence,
    });

    return next(error);
  } finally {
    await deleteTempImage(req.file);
  }
}
