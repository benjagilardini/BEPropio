import { Router } from 'express';
import * as leaseController from '../controllers/leaseController.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { uploadContract } from '../middleware/upload.js';

const router = Router();

router.use(authenticate);

// --- Landlord: nested under units ---
router.post('/units/:unitId/leases', requireRole('landlord'), uploadContract, leaseController.create);
router.get('/units/:unitId/leases', requireRole('landlord'), leaseController.listByUnit);

// --- Direct access by leaseId ---
router.get('/leases/:leaseId', leaseController.getById);
router.put('/leases/:leaseId', requireRole('landlord'), validate(leaseController.updateLeaseSchema), leaseController.update);

// Extraction
router.post('/leases/:leaseId/extract', requireRole('landlord'), leaseController.extract);

// Field confirmation
router.put('/leases/:leaseId/fields/:fieldIndex/confirm', requireRole('landlord'), leaseController.confirmField);
router.put('/leases/:leaseId/fields/:fieldIndex/correct', requireRole('landlord'), validate(leaseController.correctFieldSchema), leaseController.correctField);

// Activation
router.post('/leases/:leaseId/activate', requireRole('landlord'), leaseController.activate);

// Payment account
router.put('/leases/:leaseId/payment-account', requireRole('landlord'), validate(leaseController.paymentAccountSchema), leaseController.updatePaymentAccount);

// Invitation
router.post('/leases/:leaseId/invite', requireRole('landlord'), validate(leaseController.inviteSchema), leaseController.inviteTenant);
router.post('/leases/:leaseId/resend-invitation', requireRole('landlord'), leaseController.resendInvitation);

// End lease
router.post('/leases/:leaseId/end', requireRole('landlord'), leaseController.endLease);

// Document download
router.get('/leases/:leaseId/document', leaseController.downloadDocument);

// --- Tenant ---
router.get('/leases/:leaseId/unit', requireRole('tenant'), leaseController.getUnitForTenant);
router.get('/tenant/leases', requireRole('tenant'), leaseController.getTenantLeases);

export { router as leaseRoutes };
