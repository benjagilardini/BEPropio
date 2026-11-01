import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentReceipt {
  leaseId: mongoose.Types.ObjectId;
  period: string;
  amount: mongoose.Types.Decimal128;
  expectedAmount: mongoose.Types.Decimal128;
  paymentDate: Date;
  file: {
    fileId: mongoose.Types.ObjectId;
    fileName: string;
    mimeType: string;
  } | null;
  message: string | null;
  status: 'submitted' | 'confirmed' | 'flagged';
  reviewNote: string | null;
  reviewedAt: Date | null;
}

export interface PaymentReceiptDocument extends IPaymentReceipt, Document {
  createdAt: Date;
  updatedAt: Date;
}

const paymentReceiptSchema = new Schema<PaymentReceiptDocument>(
  {
    leaseId: { type: Schema.Types.ObjectId, ref: 'Lease', required: true },
    period: { type: String, required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
    expectedAmount: { type: Schema.Types.Decimal128, required: true },
    paymentDate: { type: Date, required: true },
    file: {
      fileId: { type: Schema.Types.ObjectId },
      fileName: { type: String },
      mimeType: { type: String },
    },
    message: { type: String, default: null },
    status: { type: String, enum: ['submitted', 'confirmed', 'flagged'], default: 'submitted' },
    reviewNote: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentReceiptSchema.index({ leaseId: 1 });
paymentReceiptSchema.index({ leaseId: 1, period: 1 });
paymentReceiptSchema.index({ status: 1 });

export const PaymentReceipt = mongoose.model<PaymentReceiptDocument>('PaymentReceipt', paymentReceiptSchema);
