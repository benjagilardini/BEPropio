export const PAYMENT_STATUS = {
  SUBMITTED: 'submitted',
  CONFIRMED: 'confirmed',
  FLAGGED: 'flagged',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
