export const INDEX_TYPES = {
  IPC: 'IPC',
  ICL: 'ICL',
  UVA: 'UVA',
} as const;

export type IndexType = (typeof INDEX_TYPES)[keyof typeof INDEX_TYPES];
