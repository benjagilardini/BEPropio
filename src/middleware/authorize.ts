import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw AppError.forbidden('No tiene permisos para esta acción');
    }
    next();
  };
}
