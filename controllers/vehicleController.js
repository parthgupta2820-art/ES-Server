import Vehicle from '../models/Vehicle.js';
import { AppError } from '../utils/AppError.js';
import { normalizePlate } from '../utils/normalizePlate.js';

const EDITABLE_FIELDS = [
  'numberPlate',
  'ownerName',
  'vehicleType',
  'ownerType',
  'isAuthorized',
  'validUntil',
];

function notFound() {
  return new AppError(404, 'Vehicle not found');
}

function pickEditableFields(data) {
  const fields = {};
  for (const field of EDITABLE_FIELDS) {
    if (data[field] !== undefined) fields[field] = data[field];
  }
  return fields;
}

/** POST /api/v1/vehicles */
export async function createVehicle(req, res, next) {
  try {
    const data = pickEditableFields(req.body);
    const vehicle = await Vehicle.create({
      ...data,
      numberPlate: normalizePlate(req.body.numberPlate),
    });

    return res.status(201).json({
      success: true,
      message: 'Vehicle registered successfully',
      data: vehicle,
    });
  } catch (error) {
    return next(error);
  }
}

/** GET /api/v1/vehicles */
export async function getVehicles(req, res, next) {
  try {
    const vehicles = await Vehicle.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: vehicles.length,
      data: vehicles,
    });
  } catch (error) {
    return next(error);
  }
}

/** GET /api/v1/vehicles/:id */
export async function getVehicle(req, res, next) {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) throw notFound();
    return res.status(200).json({ success: true, data: vehicle });
  } catch (error) {
    return next(error);
  }
}

/** PUT /api/v1/vehicles/:id */
export async function updateVehicle(req, res, next) {
  try {
    const updates = pickEditableFields(req.body);
    if (updates.numberPlate !== undefined) {
      updates.numberPlate = normalizePlate(updates.numberPlate);
    }

    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true,
      context: 'query',
    });

    if (!vehicle) throw notFound();

    return res.status(200).json({
      success: true,
      message: 'Vehicle updated successfully',
      data: vehicle,
    });
  } catch (error) {
    return next(error);
  }
}

/** DELETE /api/v1/vehicles/:id */
export async function deleteVehicle(req, res, next) {
  try {
    const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
    if (!vehicle) throw notFound();

    return res.status(200).json({
      success: true,
      message: 'Vehicle deleted successfully',
      data: vehicle,
    });
  } catch (error) {
    return next(error);
  }
}
