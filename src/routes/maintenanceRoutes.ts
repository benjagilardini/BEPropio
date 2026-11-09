import { Router } from 'express';
import * as maintenanceController from '../controllers/maintenanceController.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { uploadPhotos } from '../middleware/upload.js';

const router = Router();

router.use(authenticate);

router.post('/leases/:leaseId/maintenance', requireRole('tenant'), uploadPhotos, validate(maintenanceController.createMaintenanceSchema), maintenanceController.create);
router.get('/leases/:leaseId/maintenance', maintenanceController.list);
router.get('/leases/:leaseId/maintenance/:requestId', maintenanceController.getById);
router.post('/leases/:leaseId/maintenance/:requestId/status', requireRole('landlord'), validate(maintenanceController.updateStatusSchema), maintenanceController.updateStatus);
router.post('/leases/:leaseId/maintenance/:requestId/photos', requireRole('tenant'), uploadPhotos, maintenanceController.uploadPhotos);
router.get('/leases/:leaseId/maintenance/:requestId/photos/:photoIndex', maintenanceController.downloadPhoto);

export { router as maintenanceRoutes };
