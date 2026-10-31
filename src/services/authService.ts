import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config/index.js';
import { User, type UserDocument } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { AppError } from '../utils/AppError.js';
import { invitationService } from './invitationService.js';
import { emailService } from './emailService.js';

// --- DTOs ---

export interface UserDTO {
  id: string;
  firstName: string;
  lastName: string;
  dni: string;
  email: string;
  phone: string | null;
  role: string;
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  dni: string;
  email: string;
  password: string;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

// --- Helpers ---

function toUserDTO(user: UserDocument): UserDTO {
  return {
    id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    dni: user.dni,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

async function generateTokenPair(user: UserDocument): Promise<TokenPair> {
  const accessToken = jwt.sign(
    { userId: user._id.toString(), role: user.role },
    config.jwtAccessSecret,
    { expiresIn: config.jwtAccessExpiresIn },
  );

  const refreshTokenId = new mongoose.Types.ObjectId();
  const refreshToken = jwt.sign(
    { userId: user._id.toString(), tokenId: refreshTokenId.toString() },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpiresIn },
  );

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await RefreshToken.create({
    _id: refreshTokenId,
    userId: user._id,
    tokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return { accessToken, refreshToken };
}

function setAuthCookies(res: { cookie: Function }, tokens: TokenPair): void {
  const isProduction = config.nodeEnv === 'production';

  res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000,
  });

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/auth/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res: { clearCookie: Function }): void {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
}

// --- Service Functions ---

async function register(data: RegisterInput) {
  const existingEmail = await User.findOne({ email: data.email });
  if (existingEmail) {
    throw AppError.conflict('El correo ya está registrado', 'EMAIL_EXISTS');
  }

  const existingDni = await User.findOne({ dni: data.dni });
  if (existingDni) {
    throw AppError.conflict('El DNI ya está registrado', 'DNI_EXISTS');
  }

  const passwordHash = await bcrypt.hash(data.password, config.bcryptSaltRounds);

  const user = await User.create({
    firstName: data.firstName,
    lastName: data.lastName,
    dni: data.dni,
    email: data.email,
    passwordHash,
    phone: data.phone || null,
    role: 'landlord',
  });

  const tokens = await generateTokenPair(user);
  return { user: toUserDTO(user), tokens };
}

async function login(data: LoginInput) {
  const user = await User.findOne({ email: data.email });
  if (!user) {
    throw AppError.unauthorized('Correo o contraseña incorrectos', 'INVALID_CREDENTIALS');
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    throw new AppError(
      'Cuenta bloqueada temporalmente. Intente en 15 minutos',
      429,
      'ACCOUNT_LOCKED',
    );
  }

  const isMatch = await bcrypt.compare(data.password, user.passwordHash);
  if (!isMatch) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= config.loginMaxAttempts) {
      user.lockUntil = new Date(Date.now() + config.loginLockMinutes * 60 * 1000);
    }
    await user.save();
    throw AppError.unauthorized('Correo o contraseña incorrectos', 'INVALID_CREDENTIALS');
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  const tokens = await generateTokenPair(user);
  return { user: toUserDTO(user), tokens };
}

async function refresh(refreshTokenCookie: string | undefined) {
  if (!refreshTokenCookie) {
    throw AppError.unauthorized('Sesión expirada. Ingrese nuevamente', 'REFRESH_TOKEN_INVALID');
  }

  let payload: { userId: string; tokenId: string };
  try {
    payload = jwt.verify(refreshTokenCookie, config.jwtRefreshSecret) as typeof payload;
  } catch {
    throw AppError.unauthorized('Sesión expirada. Ingrese nuevamente', 'REFRESH_TOKEN_INVALID');
  }

  const tokenHash = crypto.createHash('sha256').update(refreshTokenCookie).digest('hex');
  const storedToken = await RefreshToken.findOne({ tokenHash });
  if (!storedToken) {
    throw AppError.unauthorized('Sesión expirada. Ingrese nuevamente', 'REFRESH_TOKEN_INVALID');
  }

  // Rotation: delete the used token
  await RefreshToken.deleteOne({ _id: storedToken._id });

  const user = await User.findById(payload.userId);
  if (!user) {
    throw AppError.unauthorized('Sesión expirada. Ingrese nuevamente', 'REFRESH_TOKEN_INVALID');
  }

  const tokens = await generateTokenPair(user);
  return { user: toUserDTO(user), tokens };
}

async function logout(refreshTokenCookie: string | undefined) {
  if (refreshTokenCookie) {
    const tokenHash = crypto.createHash('sha256').update(refreshTokenCookie).digest('hex');
    await RefreshToken.deleteOne({ tokenHash });
  }
}

async function forgotPassword(email: string) {
  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal if email exists
    return;
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

  user.set('passwordResetToken', resetTokenHash);
  user.set('passwordResetExpires', new Date(Date.now() + config.passwordResetExpiryMinutes * 60 * 1000));
  await user.save();

  await emailService.sendPasswordReset(user.email, resetToken);
}

async function resetPassword(email: string, token: string, newPassword: string) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    email,
    passwordResetToken: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  });

  if (!user) {
    throw AppError.badRequest('Enlace de recuperación inválido o expirado', 'RESET_TOKEN_INVALID');
  }

  const passwordHash = await bcrypt.hash(newPassword, config.bcryptSaltRounds);
  user.passwordHash = passwordHash;
  user.set('passwordResetToken', undefined);
  user.set('passwordResetExpires', undefined);
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  // Revoke all refresh tokens (close all sessions)
  await RefreshToken.deleteMany({ userId: user._id });
}

async function acceptInvitation(token: string, password: string) {
  const user = await invitationService.acceptInvitation(token, password);
  const tokens = await generateTokenPair(user as UserDocument);
  return { user: toUserDTO(user as UserDocument), tokens };
}

async function getMe(userId: string) {
  const user = await User.findById(userId);
  if (!user) {
    throw AppError.notFound('Usuario no encontrado');
  }
  return toUserDTO(user);
}

export const authService = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  acceptInvitation,
  getMe,
  setAuthCookies,
  clearAuthCookies,
  toUserDTO,
};
