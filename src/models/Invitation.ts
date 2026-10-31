import mongoose, { Schema, Document } from 'mongoose';

export interface IInvitation {
  leaseId: mongoose.Types.ObjectId;
  email: string;
  tenantName: string;
  tenantDni: string;
  tokenHash: string;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'expired';
}

export interface InvitationDocument extends IInvitation, Document {
  createdAt: Date;
}

const invitationSchema = new Schema<InvitationDocument>(
  {
    leaseId: { type: Schema.Types.ObjectId, ref: 'Lease', required: true },
    email: { type: String, required: true },
    tenantName: { type: String, required: true },
    tenantDni: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'expired'], default: 'pending' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

invitationSchema.index({ leaseId: 1 });
invitationSchema.index({ tokenHash: 1 });
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Invitation = mongoose.model<InvitationDocument>('Invitation', invitationSchema);
