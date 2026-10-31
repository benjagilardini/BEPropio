export const UTILITY_TYPES = {
  ELECTRICITY: 'electricity',
  GAS: 'gas',
  WATER: 'water',
  CONDOMINIUM_FEES: 'condominiumFees',
  PROPERTY_TAX: 'propertyTax',
} as const;

export type UtilityType = (typeof UTILITY_TYPES)[keyof typeof UTILITY_TYPES];
