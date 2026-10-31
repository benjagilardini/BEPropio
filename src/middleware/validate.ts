import type { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

export function validate(schema: z.ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        throw new AppError('Error de validación', 400, 'VALIDATION_ERROR', details);
      }
      throw error;
    }
  };
}
