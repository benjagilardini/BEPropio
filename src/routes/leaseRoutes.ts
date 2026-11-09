import { Router } from 'express';
import * as leaseController from '../controllers/leaseController.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { uploadContract } from '../middleware/upload.js';

const router = Router();

router.use(authenticate);

router.post('/units/:unitId/leases', requireRole('landlord'), uploadContract, leaseController.create);
router.get('/units/:unitId/leases', requireRole('landlord'), leaseController.listByUnit);

router.get('/leases/:leaseId', leaseController.getById);
router.put('/leases/:leaseId', requireRole('landlord'), validate(leaseController.updateLeaseSchema), leaseController.update);
router.post('/leases/:leaseId/extract', requireRole('landlord'), leaseController.extract);
router.put('/leases/:leaseId/fields/:fieldIndex/confirm', requireRole('landlord'), leaseController.confirmField);
router.put('/leases/:leaseId/fields/:fieldIndex/correct', requireRole('landlord'), validate(leaseController.correctFieldSchema), leaseController.correctField);
router.post('/leases/:leaseId/activate', requireRole('landlord'), leaseController.activate);
router.put('/leases/:leaseId/payment-account', requireRole('landlord'), validate(leaseController.paymentAccountSchema), leaseController.updatePaymentAccount);
router.post('/leases/:leaseId/invite', requireRole('landlord'), validate(leaseController.inviteSchema), leaseController.inviteTenant);
router.post('/leases/:leaseId/resend-invitation', requireRole('landlord'), leaseController.resendInvitation);
router.post('/leases/:leaseId/end', requireRole('landlord'), validate(leaseController.endLeaseSchema), leaseController.endLease);
router.get('/leases/:leaseId/document', leaseController.downloadDocument);

router.get('/leases/:leaseId/unit', requireRole('tenant'), leaseController.getUnitForTenant);
router.get('/tenant/leases', requireRole('tenant'), leaseController.getTenantLeases);

export { router as leaseRoutes };
