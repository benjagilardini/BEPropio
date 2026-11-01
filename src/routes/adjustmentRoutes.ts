import { Router } from 'express';
import * as adjustmentController from '../controllers/adjustmentController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

router.use(authenticate);

router.get('/leases/:leaseId/adjustments', adjustmentController.list);
router.get('/leases/:leaseId/adjustment-summary', adjustmentController.getSummary);
router.get('/leases/:leaseId/adjustments/:adjustmentId', adjustmentController.getById);
router.post('/leases/:leaseId/adjustments/:adjustmentId/notify', requireRole('landlord'), adjustmentController.notify);
router.get('/leases/:leaseId/index-comparison', requireRole('landlord'), adjustmentController.compareIndices);

export { router as adjustmentRoutes };
