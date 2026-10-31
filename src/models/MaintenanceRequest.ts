import mongoose, { Schema, Document } from 'mongoose';

export interface IStatusHistoryEntry {
  status: 'open' | 'inProgress' | 'resolved' | 'closed';
  comment: string | null;
  changedBy: mongoose.Types.ObjectId;
  changedAt: Date;
}

export interface IMaintenanceRequest {
  leaseId: mongoose.Types.ObjectId;
  code: string;
  category: 'plumbing' | 'electrical' | 'gas' | 'structural' | 'appliance' | 'other';
  room: string;
  description: string;
  photos: Array<{
    fileId: mongoose.Types.ObjectId;
    fileName: string;
  }>;
  status: 'open' | 'inProgress' | 'resolved' | 'closed';
  statusHistory: IStatusHistoryEntry[];
}

export interface MaintenanceRequestDocument extends IMaintenanceRequest, Document {
  createdAt: Date;
  updatedAt: Date;
}

const statusHistoryEntrySchema = new Schema<IStatusHistoryEntry>(
  {
    status: { type: String, enum: ['open', 'inProgress', 'resolved', 'closed'], required: true },
    comment: { type: String, default: null },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const maintenanceRequestSchema = new Schema<MaintenanceRequestDocument>(
  {
    leaseId: { type: Schema.Types.ObjectId, ref: 'Lease', required: true },
    code: { type: String, required: true, unique: true },
    category: { type: String, enum: ['plumbing', 'electrical', 'gas', 'structural', 'appliance', 'other'], required: true },
    room: { type: String, required: true },
    description: { type: String, required: true },
    photos: [{
      fileId: { type: Schema.Types.ObjectId, required: true },
      fileName: { type: String, required: true },
    }],
    status: { type: String, enum: ['open', 'inProgress', 'resolved', 'closed'], default: 'open' },
    statusHistory: { type: [statusHistoryEntrySchema], default: [] },
  },
  { timestamps: true },
);

maintenanceRequestSchema.index({ leaseId: 1 });
maintenanceRequestSchema.index({ status: 1 });

export const MaintenanceRequest = mongoose.model<MaintenanceRequestDocument>('MaintenanceRequest', maintenanceRequestSchema);
