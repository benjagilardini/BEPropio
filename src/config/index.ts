import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  mongodbUri: process.env.MONGODB_URI!,

  // JWT
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET!,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET!,
  jwtAccessExpiresIn: '15m' as const,
  jwtRefreshExpiresIn: '7d' as const,

  // Bcrypt
  bcryptSaltRounds: 12,

  // Rate limiting
  loginMaxAttempts: 5,
  loginLockMinutes: 15,

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-6.1-sol',

  // Email (SES)
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  emailFrom: process.env.EMAIL_FROM || 'noreply@mykey.com.ar',

  // URLs
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  apiUrl: process.env.API_URL || 'http://localhost:3000',

  // Upload limits
  maxFileSize: 10 * 1024 * 1024,
  maxImageSize: 5 * 1024 * 1024,

  // Invitation
  invitationExpiryDays: 7,

  // Password reset
  passwordResetExpiryMinutes: 60,
} as const;

const required = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}
