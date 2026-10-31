import type { Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/authService.js';
import { catchAsync } from '../utils/catchAsync.js';

const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .regex(/[a-zA-Z]/, 'Debe contener al menos una letra')
  .regex(/[0-9]/, 'Debe contener al menos un número');

export const registerSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'Nombre requerido').trim(),
    lastName: z.string().min(1, 'Apellido requerido').trim(),
    dni: z.string().min(7, 'DNI inválido').max(8, 'DNI inválido').trim(),
    email: z.string().email('Email inválido').trim().toLowerCase(),
    password: passwordSchema,
    phone: z.string().trim().optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido').trim().toLowerCase(),
    password: z.string().min(1, 'Contraseña requerida'),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido').trim().toLowerCase(),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido').trim().toLowerCase(),
    token: z.string().min(1, 'Token requerido'),
    newPassword: passwordSchema,
  }),
});

export const acceptInvitationSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token requerido'),
    password: passwordSchema,
  }),
});

export const register = catchAsync(async (req: Request, res: Response) => {
  const { user, tokens } = await authService.register(req.body);
  authService.setAuthCookies(res, tokens);
  res.status(201).json({ data: user });
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const { user, tokens } = await authService.login(req.body);
  authService.setAuthCookies(res, tokens);
  res.json({ data: user });
});

export const refresh = catchAsync(async (req: Request, res: Response) => {
  const { user, tokens } = await authService.refresh(req.cookies?.refreshToken);
  authService.setAuthCookies(res, tokens);
  res.json({ data: user });
});

export const logout = catchAsync(async (req: Request, res: Response) => {
  await authService.logout(req.cookies?.refreshToken);
  authService.clearAuthCookies(res);
  res.status(204).send();
});

export const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  await authService.forgotPassword(req.body.email);
  res.json({ message: 'Si el correo está registrado, recibirá un enlace de recuperación' });
});

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body.email, req.body.token, req.body.newPassword);
  res.json({ message: 'Contraseña actualizada correctamente' });
});

export const acceptInvitation = catchAsync(async (req: Request, res: Response) => {
  const { user, tokens } = await authService.acceptInvitation(req.body.token, req.body.password);
  authService.setAuthCookies(res, tokens);
  res.json({ data: user });
});

export const getMe = catchAsync(async (req: Request, res: Response) => {
  const user = await authService.getMe(req.user!.userId);
  res.json({ data: user });
});
