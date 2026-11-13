import AccessLog from '../models/AccessLog.js';
import { AppError } from '../utils/AppError.js';

/** GET /api/v1/logs?limit=50 */
export async function getLogs(req, res, next) {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 200)
      : 50;

    const logs = await AccessLog.find().sort({ timestamp: -1 }).limit(limit);

    return res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    return next(error);
  }
}

/** GET /api/v1/logs/:id */
export async function getLog(req, res, next) {
  try {
    const log = await AccessLog.findById(req.params.id);
    if (!log) throw new AppError(404, 'Access log not found');

    return res.status(200).json({ success: true, data: log });
  } catch (error) {
    return next(error);
  }
}
