export const MAINTENANCE_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'inProgress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const;

export type MaintenanceStatus = (typeof MAINTENANCE_STATUS)[keyof typeof MAINTENANCE_STATUS];
