import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/index.js';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { generalRateLimiter } from './middleware/rateLimiter.js';

const app = express();

// Security headers
app.use(helmet());

// CORS - frontend only
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));

// Parse JSON bodies
app.use(express.json({ limit: '1mb' }));

// Parse cookies
app.use(cookieParser());

// Global rate limiting (production only)
if (config.nodeEnv === 'production') {
  app.use(generalRateLimiter);
}

// API routes
app.use('/api', apiRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler (must be last middleware)
app.use(errorHandler);

export { app };
