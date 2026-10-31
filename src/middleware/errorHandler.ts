import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.entries(err.errors).map(([field, e]) => ({
      field,
      message: e.message,
    }));
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Error de validación',
      details,
    });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      code: 'INVALID_ID',
      message: 'Identificador inválido',
    });
    return;
  }

  if (
    err.name === 'MongoServerError' &&
    (err as Error & { code?: number }).code === 11000
  ) {
    const keyPattern = (err as Error & { keyPattern?: Record<string, unknown> })
      .keyPattern;
    const field = keyPattern ? Object.keys(keyPattern)[0] : 'campo';
    res.status(409).json({
      code: 'DUPLICATE_KEY',
      message: `El valor de '${field}' ya existe`,
    });
    return;
  }

  if (err.name === 'MulterError') {
    const multerErr = err as Error & { code?: string };
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      res
        .status(400)
        .json({
          code: 'FILE_TOO_LARGE',
          message: 'El archivo excede el tamaño máximo',
        });
      return;
    }
    res.status(400).json({ code: 'FILE_UPLOAD_ERROR', message: err.message });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'Error interno del servidor',
  });
}
