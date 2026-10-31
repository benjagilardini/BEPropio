import mongoose, { Schema, Document } from 'mongoose';
import type { IndexType } from '../constants/index.js';

export interface IIndexValue {
  indexType: IndexType;
  period: string; // IPC: 'YYYY-MM'; ICL/UVA: 'YYYY-MM-DD'
  value: mongoose.Types.Decimal128;
  publishedAt: Date | null;
}

export interface IndexValueDocument extends IIndexValue, Document {}

const indexValueSchema = new Schema<IndexValueDocument>({
  indexType: { type: String, enum: ['IPC', 'ICL', 'UVA'], required: true },
  period: { type: String, required: true },
  value: { type: Schema.Types.Decimal128, required: true },
  publishedAt: { type: Date, default: null },
});

indexValueSchema.index({ indexType: 1, period: 1 }, { unique: true });

export const IndexValue = mongoose.model<IndexValueDocument>('IndexValue', indexValueSchema);
