import rateLimit from 'express-rate-limit';

// General: 100 requests per minute per IP
export const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMIT', message: 'Demasiadas solicitudes' },
});

// Login: 10 attempts per 15 minutes per IP
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMIT', message: 'Demasiados intentos de ingreso' },
});

// Forgot password: 3 per hour per IP
export const forgotPasswordRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMIT', message: 'Demasiadas solicitudes de recuperación' },
});
