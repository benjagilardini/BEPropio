import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { loginRateLimiter, forgotPasswordRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', validate(authController.registerSchema), authController.register);
router.post('/login', loginRateLimiter, validate(authController.loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/forgot-password', forgotPasswordRateLimiter, validate(authController.forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validate(authController.resetPasswordSchema), authController.resetPassword);
router.post('/accept-invitation', validate(authController.acceptInvitationSchema), authController.acceptInvitation);
router.get('/me', authenticate, authController.getMe);

export { router as authRoutes };
