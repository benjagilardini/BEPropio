import mongoose, { Schema, Document } from 'mongoose';

export interface IAddress {
  street: string;
  number: string;
  floor: string | null;
  apartment: string | null;
  neighborhood: string | null;
  city: string;
  province: string;
}

export interface IFacilities {
  waterShutoff: string | null;
  gasShutoff: string | null;
  electricalPanel: string | null;
  meters: string | null;
  notes: string | null;
}

export interface IUtilityAccount {
  utilityType: 'electricity' | 'gas' | 'water' | 'condominiumFees' | 'propertyTax';
  provider: string;
  accountId: string;
  paidBy: 'tenant' | 'landlord';
}

export interface IPaymentAccount {
  holderName: string;
  bank: string;
  cbuOrCvu: string;
  alias: string | null;
}

export interface IUnit {
  landlordId: mongoose.Types.ObjectId;
  address: IAddress;
  unitType: 'apartment' | 'house';
  areaSqm: number | null;
  propertyTaxAccount: string | null;
  functionalUnit: string | null;
  referenceValue: mongoose.Types.Decimal128 | null;
  facilities: IFacilities;
  utilityAccounts: IUtilityAccount[];
  paymentAccount: IPaymentAccount | null;
}

export interface UnitDocument extends IUnit, Document {
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<IAddress>(
  {
    street: { type: String, required: true },
    number: { type: String, required: true },
    floor: { type: String, default: null },
    apartment: { type: String, default: null },
    neighborhood: { type: String, default: null },
    city: { type: String, required: true },
    province: { type: String, required: true },
  },
  { _id: false },
);

const facilitiesSchema = new Schema<IFacilities>(
  {
    waterShutoff: { type: String, default: null },
    gasShutoff: { type: String, default: null },
    electricalPanel: { type: String, default: null },
    meters: { type: String, default: null },
    notes: { type: String, default: null },
  },
  { _id: false },
);

const utilityAccountSchema = new Schema<IUtilityAccount>(
  {
    utilityType: {
      type: String,
      enum: ['electricity', 'gas', 'water', 'condominiumFees', 'propertyTax'],
      required: true,
    },
    provider: { type: String, required: true },
    accountId: { type: String, required: true },
    paidBy: { type: String, enum: ['tenant', 'landlord'], required: true },
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

const unitSchema = new Schema<UnitDocument>(
  {
    landlordId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    address: { type: addressSchema, required: true },
    unitType: { type: String, enum: ['apartment', 'house'], required: true },
    areaSqm: { type: Number, min: 1, default: null },
    propertyTaxAccount: { type: String, default: null },
    functionalUnit: { type: String, default: null },
    referenceValue: { type: Schema.Types.Decimal128, default: null },
    facilities: { type: facilitiesSchema, default: () => ({}) },
    utilityAccounts: { type: [utilityAccountSchema], default: [] },
    paymentAccount: { type: paymentAccountSchema, default: null },
  },
  { timestamps: true },
);

unitSchema.index({ landlordId: 1 });

export const Unit = mongoose.model<UnitDocument>('Unit', unitSchema);
