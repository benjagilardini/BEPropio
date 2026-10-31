export const LEASE_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  ENDED: 'ended',
} as const;

export type LeaseStatus = (typeof LEASE_STATUS)[keyof typeof LEASE_STATUS];
