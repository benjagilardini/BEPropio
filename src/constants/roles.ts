export const ROLES = {
  LANDLORD: 'landlord',
  TENANT: 'tenant',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
