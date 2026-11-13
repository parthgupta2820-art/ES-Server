/**
 * Build the single response shape used by completed detection requests.
 * Keeping this in one place prevents controllers from drifting apart.
 */
export function detectionBody(result) {
  return {
    success: result.success,
    requestId: result.requestId,
    numberPlate: result.numberPlate,
    authorized: result.authorized,
    gateAction: result.gateAction,
    message: result.message,
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

/**
 * One consistent response shape for every rejected request. Keeping this in a
 * single place guarantees the gate can never accidentally return OPEN on error.
 */
export function closedBody(requestId, message, reason) {
  return detectionBody({
    success: false,
    requestId,
    numberPlate: null,
    authorized: false,
    gateAction: 'CLOSED',
    message,
    reason,
  });
}
