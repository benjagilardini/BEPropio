import mongoose, { Schema, Document } from 'mongoose';

export interface IRefreshToken {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
}

export interface RefreshTokenDocument extends IRefreshToken, Document {
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model<RefreshTokenDocument>('RefreshToken', refreshTokenSchema);
