import mongoose, { Schema, Document } from 'mongoose';

export interface IExpense {
  unitId: mongoose.Types.ObjectId;
  maintenanceRequestId: mongoose.Types.ObjectId | null;
  date: Date;
  category: 'tax' | 'insurance' | 'maintenance' | 'condominiumFees' | 'other';
  concept: string;
  amount: mongoose.Types.Decimal128;
  paidBy: 'landlord' | 'tenant';
}

export interface ExpenseDocument extends IExpense, Document {
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<ExpenseDocument>(
  {
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    maintenanceRequestId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest', default: null },
    date: { type: Date, required: true },
    category: { type: String, enum: ['tax', 'insurance', 'maintenance', 'condominiumFees', 'other'], required: true },
    concept: { type: String, required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
    paidBy: { type: String, enum: ['landlord', 'tenant'], default: 'landlord' },
  },
  { timestamps: true },
);

expenseSchema.index({ unitId: 1 });
expenseSchema.index({ unitId: 1, date: 1 });

export const Expense = mongoose.model<ExpenseDocument>('Expense', expenseSchema);
