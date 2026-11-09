import mongoose, { Schema, Document } from 'mongoose';
import type { IndexType } from '../constants/index.js';

export interface ILeaseDocument {
  fileId: mongoose.Types.ObjectId;
  fileName: string;
  mimeType: string;
  pageCount: number | null;
}

export interface IExtractedField {
  fieldName: string;
  value: unknown;
  sourceText: string | null;
  status: 'pending' | 'confirmed' | 'corrected';
  correctedValue: unknown | null;
}

export interface IPaymentAccount {
  holderName: string;
  bank: string;
  cbuOrCvu: string;
  alias: string | null;
}

export interface IExpenseResponsibility {
  category: 'tax' | 'insurance' | 'maintenance' | 'condominiumFees' | 'other';
  paidBy: 'landlord' | 'tenant';
}

export interface ILease {
  unitId: mongoose.Types.ObjectId;
  landlordId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId | null;
  startDate: Date;
  endDate: Date;
  initialRent: mongoose.Types.Decimal128;
  adjustmentIndex: IndexType;
  adjustmentFrequencyMonths: number;
  securityDeposit: mongoose.Types.Decimal128 | null;
  status: 'draft' | 'active' | 'ended';
  document: ILeaseDocument | null;
  extractedFields: IExtractedField[];
  paymentAccount: IPaymentAccount | null;
  expenseResponsibility: IExpenseResponsibility[];
  endedAt: Date | null;
  restitutionDate: Date | null;
  unitDestination: 'vacant' | 'renew' | null;
  tenantName: string | null;
  tenantDni: string | null;
  tenantEmail: string | null;
}

export interface LeaseDocument extends ILease, Document {
  createdAt: Date;
  updatedAt: Date;
}

const leaseDocumentSchema = new Schema<ILeaseDocument>(
  {
    fileId: { type: Schema.Types.ObjectId, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    pageCount: { type: Number, default: null },
  },
  { _id: false },
);

const extractedFieldSchema = new Schema<IExtractedField>(
  {
    fieldName: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    sourceText: { type: String, default: null },
    status: { type: String, enum: ['pending', 'confirmed', 'corrected'], default: 'pending' },
    correctedValue: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const paymentAccountSchema = new Schema<IPaymentAccount>(
  {
    holderName: { type: String, required: true },
    bank: { type: String, required: true },
    cbuOrCvu: { type: String, required: true },
    alias: { type: String, default: null },
  },
  { _id: false },
);

const expenseResponsibilitySchema = new Schema<IExpenseResponsibility>(
  {
    category: { type: String, enum: ['tax', 'insurance', 'maintenance', 'condominiumFees', 'other'], required: true },
    paidBy: { type: String, enum: ['landlord', 'tenant'], required: true },
  },
  { _id: false },
);

const leaseSchema = new Schema<LeaseDocument>(
  {
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    landlordId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    initialRent: { type: Schema.Types.Decimal128, required: true },
    adjustmentIndex: { type: String, enum: ['IPC', 'ICL', 'UVA'], required: true },
    adjustmentFrequencyMonths: { type: Number, required: true, min: 1 },
    securityDeposit: { type: Schema.Types.Decimal128, default: null },
    status: { type: String, enum: ['draft', 'active', 'ended'], default: 'draft' },
    document: { type: leaseDocumentSchema, default: null },
    extractedFields: { type: [extractedFieldSchema], default: [] },
    paymentAccount: { type: paymentAccountSchema, default: null },
    expenseResponsibility: { type: [expenseResponsibilitySchema], default: [] },
    endedAt: { type: Date, default: null },
    restitutionDate: { type: Date, default: null },
    unitDestination: { type: String, enum: ['vacant', 'renew'], default: null },
    tenantName: { type: String, default: null },
    tenantDni: { type: String, default: null },
    tenantEmail: { type: String, default: null },
  },
  { timestamps: true },
);

leaseSchema.index({ unitId: 1 });
leaseSchema.index({ landlordId: 1 });
leaseSchema.index({ tenantId: 1 });
leaseSchema.index({ status: 1 });
leaseSchema.index({ unitId: 1, status: 1 });

export const Lease = mongoose.model<LeaseDocument>('Lease', leaseSchema);
