import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AppError } from '../utils/AppError.js';

export interface AuthPayload {
  userId: string;
  role: 'landlord' | 'tenant';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      leaseAccess?: 'full' | 'readonly';
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.accessToken;
  if (!token) {
    throw AppError.unauthorized('Token de acceso no proporcionado');
  }

  try {
    const payload = jwt.verify(token, config.jwtAccessSecret) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    throw AppError.unauthorized('Token de acceso inválido o expirado');
  }
}
