import { Router } from 'express';
import { requireAdminKey } from '../middleware/auth.js';
import {
  createVehicle,
  deleteVehicle,
  getVehicle,
  getVehicles,
  updateVehicle,
} from '../controllers/vehicleController.js';

const router = Router();

// Every vehicle management endpoint requires the admin API key.
router.use(requireAdminKey);

router.route('/').get(getVehicles).post(createVehicle);
router.route('/:id').get(getVehicle).put(updateVehicle).delete(deleteVehicle);

export default router;
