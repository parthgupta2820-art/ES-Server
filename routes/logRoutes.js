import { Router } from 'express';
import { requireAdminKey } from '../middleware/auth.js';
import { getLog, getLogs } from '../controllers/logController.js';

const router = Router();

router.use(requireAdminKey);

router.get('/', getLogs);
router.get('/:id', getLog);

export default router;
