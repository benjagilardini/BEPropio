import { Router } from 'express';
import * as unitController from '../controllers/unitController.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

router.use(authenticate);

router.post('/', requireRole('landlord'), validate(unitController.createUnitSchema), unitController.create);
router.get('/', requireRole('landlord'), unitController.list);
router.get('/:unitId', requireRole('landlord'), unitController.getById);
router.put('/:unitId', requireRole('landlord'), validate(unitController.updateUnitSchema), unitController.update);
router.delete('/:unitId', requireRole('landlord'), unitController.remove);

export { router as unitRoutes };
