import mongoose from 'mongoose';

const { Decimal128 } = mongoose.Types;

export function toDecimal128(value: string | number): mongoose.Types.Decimal128 {
  return Decimal128.fromString(String(value));
}

export function fromDecimal128(value: mongoose.Types.Decimal128): number {
  return parseFloat(value.toString());
}

export function decimalToString(value: mongoose.Types.Decimal128): string {
  return value.toString();
}
