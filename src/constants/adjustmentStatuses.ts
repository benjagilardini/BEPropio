export const ADJUSTMENT_STATUS = {
  ESTIMATED: 'estimated',
  FINAL: 'final',
} as const;

export type AdjustmentStatus = (typeof ADJUSTMENT_STATUS)[keyof typeof ADJUSTMENT_STATUS];
