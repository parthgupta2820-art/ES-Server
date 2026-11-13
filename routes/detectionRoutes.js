import { Router } from 'express';
import { requireDeviceKey } from '../middleware/auth.js';
import { uploadImage } from '../middleware/upload.js';
import { detectVehicle } from '../controllers/detectionController.js';

const router = Router();

// POST /api/v1/vehicle/detect
router.post('/detect', requireDeviceKey, uploadImage, detectVehicle);

export default router;
