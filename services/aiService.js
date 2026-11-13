import fs from 'node:fs/promises';
import axios from 'axios';
import config from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const RECOGNITION_URL = `${config.aiServiceUrl}${config.aiRecognitionEndpoint}`;

function recognitionError(statusCode, reason) {
  return new AppError(statusCode, 'Number plate recognition failed', reason);
}

/**
 * Validate the Python service's response before it can influence access.
 * A malformed response is always an error, never an authorization.
 */
function parseRecognitionResponse(data) {
  if (!data || typeof data !== 'object' || typeof data.success !== 'boolean') {
    throw recognitionError(502, 'AI service returned an invalid response');
  }

  if (!data.success) {
    return {
      success: false,
      numberPlate: null,
      confidence: null,
      reason: 'AI service could not detect a number plate',
    };
  }

  if (typeof data.numberPlate !== 'string' || data.numberPlate.trim() === '') {
    return {
      success: false,
      numberPlate: null,
      confidence: null,
      reason: 'Number plate not detected',
    };
  }

  if (
    typeof data.confidence !== 'number' ||
    !Number.isFinite(data.confidence) ||
    data.confidence < 0 ||
    data.confidence > 1
  ) {
    throw recognitionError(502, 'AI service returned an invalid confidence score');
  }

  return {
    success: true,
    numberPlate: data.numberPlate,
    confidence: data.confidence,
  };
}

/**
 * Send one image to the external ANPR service and return a validated result.
 * This service does not check MongoDB or decide whether the gate should open.
 */
export async function recognizePlate(file) {
  let imageBuffer;

  try {
    imageBuffer = await fs.readFile(file.path);
  } catch {
    throw recognitionError(500, 'Temporary image could not be read');
  }

  // Node 20+ provides FormData and Blob globally. Axios adds the multipart
  // boundary automatically for a FormData body.
  const form = new FormData();
  form.append('image', new Blob([imageBuffer], { type: file.mimetype }), file.filename);

  let response;
  try {
    response = await axios.post(RECOGNITION_URL, form, {
      timeout: config.aiTimeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: 1024 * 1024,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ERR_CANCELED'
    ) {
      throw recognitionError(504, 'AI service timed out');
    }

    if (error.response) {
      const statusCode = error.response.status >= 500 ? 503 : 502;
      const reason = statusCode === 503 ? 'AI service is unavailable' : 'AI service rejected the image';
      throw recognitionError(statusCode, reason);
    }

    if (/json/i.test(error.message || '')) {
      throw recognitionError(502, 'AI service returned invalid JSON');
    }

    throw recognitionError(503, 'AI service is unavailable');
  }

  return parseRecognitionResponse(response.data);
}
