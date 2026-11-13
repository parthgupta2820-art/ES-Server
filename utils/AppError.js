/**
 * Expected application error with a safe HTTP status and client-facing message.
 * Unexpected errors are converted to a generic 500 by the error middleware.
 */
export class AppError extends Error {
  constructor(statusCode, message, reason) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    if (reason) this.reason = reason;
    Error.captureStackTrace?.(this, AppError);
  }
}
