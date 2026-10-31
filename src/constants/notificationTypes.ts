export const NOTIFICATION_TYPES = {
  ADJUSTMENT_GENERATED: 'adjustmentGenerated',
  ADJUSTMENT_UPDATED: 'adjustmentUpdated',
  PAYMENT_SUBMITTED: 'paymentSubmitted',
  PAYMENT_CONFIRMED: 'paymentConfirmed',
  PAYMENT_FLAGGED: 'paymentFlagged',
  MAINTENANCE_CREATED: 'maintenanceCreated',
  MAINTENANCE_STATUS_CHANGED: 'maintenanceStatusChanged',
  LEASE_ENDING_SOON: 'leaseEndingSoon',
  INVITATION_SENT: 'invitationSent',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
