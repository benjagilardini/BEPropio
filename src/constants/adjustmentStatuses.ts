export const ADJUSTMENT_STATUS = {
  PENDING: 'pending',
  ESTIMATED: 'estimated',
  CONFIRMED: 'confirmed',
} as const;

export type AdjustmentStatus = (typeof ADJUSTMENT_STATUS)[keyof typeof ADJUSTMENT_STATUS];
