import type { Request, Response } from 'express';
import { z } from 'zod';
import { userService } from '../services/userService.js';
import { catchAsync } from '../utils/catchAsync.js';

const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .regex(/[a-zA-Z]/, 'Debe contener al menos una letra')
  .regex(/[0-9]/, 'Debe contener al menos un número');

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).trim().optional(),
    lastName: z.string().min(1).trim().optional(),
    phone: z.string().trim().optional(),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Contraseña actual requerida'),
    newPassword: passwordSchema,
  }),
});

export const getProfile = catchAsync(async (req: Request, res: Response) => {
  const user = await userService.getProfile(req.user!.userId);
  res.json({ data: user });
});

export const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const user = await userService.updateProfile(req.user!.userId, req.body);
  res.json({ data: user });
});

export const changePassword = catchAsync(async (req: Request, res: Response) => {
  await userService.changePassword(req.user!.userId, req.body);
  res.json({ message: 'Contraseña actualizada correctamente' });
});
