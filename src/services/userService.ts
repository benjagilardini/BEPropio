import bcrypt from 'bcrypt';
import { config } from '../config/index.js';
import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { AppError } from '../utils/AppError.js';
import { authService, type UserDTO } from './authService.js';

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

async function getProfile(userId: string): Promise<UserDTO> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  return authService.toUserDTO(user);
}

async function updateProfile(userId: string, data: UpdateProfileInput): Promise<UserDTO> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');

  if (data.firstName !== undefined) user.firstName = data.firstName;
  if (data.lastName !== undefined) user.lastName = data.lastName;
  if (data.phone !== undefined) user.phone = data.phone || null;

  await user.save();
  return authService.toUserDTO(user);
}

async function changePassword(userId: string, data: ChangePasswordInput): Promise<void> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');

  const isMatch = await bcrypt.compare(data.currentPassword, user.passwordHash);
  if (!isMatch) {
    throw AppError.unauthorized('Contraseña actual incorrecta', 'INVALID_CREDENTIALS');
  }

  user.passwordHash = await bcrypt.hash(data.newPassword, config.bcryptSaltRounds);
  await user.save();

  // Revokes all sessions; user must re-login
  await RefreshToken.deleteMany({ userId: user._id });
}

export const userService = {
  getProfile,
  updateProfile,
  changePassword,
};
