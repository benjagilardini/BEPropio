import mongoose, { Schema, Document } from 'mongoose';

export interface IDollarRate {
  type: 'oficial' | 'blue';
  date: string;
  compra: number;
  venta: number;
}

export interface DollarRateDocument extends IDollarRate, Document {
  createdAt: Date;
  updatedAt: Date;
}

const dollarRateSchema = new Schema<DollarRateDocument>(
  {
    type: { type: String, enum: ['oficial', 'blue'], required: true },
    date: { type: String, required: true },
    compra: { type: Number, required: true },
    venta: { type: Number, required: true },
  },
  { timestamps: true },
);

dollarRateSchema.index({ type: 1, date: 1 }, { unique: true });

export const DollarRate = mongoose.model<DollarRateDocument>('DollarRate', dollarRateSchema);
