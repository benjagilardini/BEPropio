import mongoose, { Schema, Document } from 'mongoose';

export interface IRentAdjustment {
  leaseId: mongoose.Types.ObjectId;
  effectiveDate: Date;
  previousRent: mongoose.Types.Decimal128;
  startIndexValue: mongoose.Types.Decimal128 | null;
  endIndexValue: mongoose.Types.Decimal128 | null;
  minCoefficient: mongoose.Types.Decimal128;
  maxCoefficient: mongoose.Types.Decimal128;
  minAmount: mongoose.Types.Decimal128;
  maxAmount: mongoose.Types.Decimal128;
  pendingPeriods: string[];
  status: 'pending' | 'estimated' | 'confirmed';
}

export interface RentAdjustmentDocument extends IRentAdjustment, Document {
  createdAt: Date;
  updatedAt: Date;
}

const rentAdjustmentSchema = new Schema<RentAdjustmentDocument>(
  {
    leaseId: { type: Schema.Types.ObjectId, ref: 'Lease', required: true },
    effectiveDate: { type: Date, required: true },
    previousRent: { type: Schema.Types.Decimal128, required: true },
    startIndexValue: { type: Schema.Types.Decimal128, default: null },
    endIndexValue: { type: Schema.Types.Decimal128, default: null },
    minCoefficient: { type: Schema.Types.Decimal128, required: true },
    maxCoefficient: { type: Schema.Types.Decimal128, required: true },
    minAmount: { type: Schema.Types.Decimal128, required: true },
    maxAmount: { type: Schema.Types.Decimal128, required: true },
    pendingPeriods: { type: [String], default: [] },
    status: { type: String, enum: ['pending', 'estimated', 'confirmed'], default: 'pending' },
  },
  { timestamps: true },
);

rentAdjustmentSchema.index({ leaseId: 1, effectiveDate: 1 });
rentAdjustmentSchema.index({ status: 1 });

export const RentAdjustment = mongoose.model<RentAdjustmentDocument>('RentAdjustment', rentAdjustmentSchema);
