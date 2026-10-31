import mongoose, { Schema, Document } from 'mongoose';
import type { Role } from '../constants/index.js';

export interface IUser {
  firstName: string;
  lastName: string;
  dni: string;
  email: string;
  passwordHash: string;
  phone: string | null;
  role: Role;
  failedLoginAttempts: number;
  lockUntil: Date | null;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
}

export interface UserDocument extends IUser, Document {
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    dni: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, trim: true, default: null },
    role: { type: String, enum: ['landlord', 'tenant'], required: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    passwordResetToken: { type: String, default: undefined },
    passwordResetExpires: { type: Date, default: undefined },
  },
  { timestamps: true },
);

userSchema.index({ role: 1 });

export const User = mongoose.model<UserDocument>('User', userSchema);
