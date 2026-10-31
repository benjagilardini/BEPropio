import { Router } from 'express';
import * as userController from '../controllers/userController.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

router.use(authenticate);

router.get('/me', userController.getProfile);
router.put('/me', validate(userController.updateProfileSchema), userController.updateProfile);
router.put('/me/password', validate(userController.changePasswordSchema), userController.changePassword);

export { router as userRoutes };
