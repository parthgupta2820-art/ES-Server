import fs from 'node:fs/promises';
import multer from 'multer';
import config from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { closedBody } from '../utils/apiResponse.js';

const DB_ERROR_NAMES = [
  'MongoNotConnectedError',
  'MongoServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongooseServerSelectionError',
];

function isDatabaseError(error) {
  return (
    DB_ERROR_NAMES.includes(error.name) ||
    ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code) ||
    (error.name === 'MongooseError' && /buffering|not connected/i.test(error.message || ''))
  );
}

/**
 * Convert known errors into a safe status/message. Internal stack traces and
 * dependency response bodies are never sent to the client.
 */
function translateError(error) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return {
        statusCode: 413,
        message: `Image is too large. Maximum size is ${config.maxFileSizeMb} MB`,
      };
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return {
        statusCode: 400,
        message: "Unexpected file field. Use one file named 'image'",
      };
    }
    return { statusCode: 400, message: 'Invalid image upload' };
  }

  if (error.type === 'entity.parse.failed') {
    return { statusCode: 400, message: 'Invalid JSON body' };
  }
  if (error.type === 'entity.too.large') {
    return { statusCode: 413, message: 'Request body is too large' };
  }

  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      reason: error.reason,
    };
  }

  if (error.name === 'ValidationError') {
    return { statusCode: 400, message: error.message };
  }
  if (error.name === 'CastError') {
    return { statusCode: 400, message: 'Invalid ID or data format' };
  }
  if (error.code === 11000) {
    return { statusCode: 409, message: 'Vehicle with this number plate already exists' };
  }
  if (isDatabaseError(error)) {
    return { statusCode: 503, message: 'Database is unavailable. Access denied.' };
  }

  return { statusCode: 500, message: 'Internal server error' };
}

/** Final Express error middleware. Every error response is CLOSED. */
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  // Safety net: the detection controller normally removes the file in finally.
  if (req.file?.path) {
    fs.unlink(req.file.path).catch(() => {});
  }

  const { statusCode, message, reason } = translateError(error);

  if (statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl.split('?')[0]}:`, error);
  }

  return res.status(statusCode).json(closedBody(req.requestId, message, reason));
}
