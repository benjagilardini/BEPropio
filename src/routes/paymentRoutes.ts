import { Router } from 'express';
import * as paymentController from '../controllers/paymentController.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { uploadReceipt } from '../middleware/upload.js';

const router = Router();

router.use(authenticate);

router.post('/leases/:leaseId/payments', requireRole('tenant'), uploadReceipt, validate(paymentController.createPaymentSchema), paymentController.create);
router.get('/leases/:leaseId/payments', paymentController.list);
router.get('/leases/:leaseId/payments/:paymentId', paymentController.getById);
router.post('/leases/:leaseId/payments/:paymentId/confirm', requireRole('landlord'), paymentController.confirm);
router.post('/leases/:leaseId/payments/:paymentId/flag', requireRole('landlord'), validate(paymentController.flagPaymentSchema), paymentController.flag);
router.get('/leases/:leaseId/payments/:paymentId/file', paymentController.downloadFile);

export { router as paymentRoutes };
