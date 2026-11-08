import { Router } from 'express';
import * as expenseController from '../controllers/expenseController.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = Router();

router.use(authenticate, requireRole('landlord'));

router.get('/yield/annual', expenseController.getAnnualYield);
router.post('/units/:unitId/expenses', validate(expenseController.createExpenseSchema), expenseController.create);
router.get('/units/:unitId/expenses', expenseController.list);
router.get('/units/:unitId/expenses/:id', expenseController.getById);
router.put('/units/:unitId/expenses/:id', validate(expenseController.updateExpenseSchema), expenseController.update);
router.delete('/units/:unitId/expenses/:id', expenseController.remove);
router.get('/units/:unitId/yield', expenseController.calculateYield);

export { router as expenseRoutes };
