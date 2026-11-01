import type { Request, Response } from 'express';
import { z } from 'zod';
import { unitService } from '../services/unitService.js';
import { catchAsync } from '../utils/catchAsync.js';
import { paginationSchema } from '../utils/pagination.js';

const addressSchema = z.object({
  street: z.string().min(1).max(200),
  number: z.string().min(1).max(20),
  floor: z.string().max(10).nullable().optional(),
  apartment: z.string().max(10).nullable().optional(),
  neighborhood: z.string().max(100).nullable().optional(),
  city: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
});

const facilitiesSchema = z.object({
  waterShutoff: z.string().max(500).nullable().optional(),
  gasShutoff: z.string().max(500).nullable().optional(),
  electricalPanel: z.string().max(500).nullable().optional(),
  meters: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
}).optional();

const utilityAccountSchema = z.object({
  utilityType: z.enum(['electricity', 'gas', 'water', 'condominiumFees', 'propertyTax']),
  provider: z.string().min(1).max(100),
  accountId: z.string().min(1).max(100),
  paidBy: z.enum(['tenant', 'landlord']),
});

const paymentAccountInputSchema = z.object({
  holderName: z.string().min(1).max(200),
  bank: z.string().min(1).max(100),
  cbuOrCvu: z.string().min(1).max(30),
  alias: z.string().max(50).nullable().optional(),
}).nullable().optional();

export const createUnitSchema = z.object({
  body: z.object({
    address: addressSchema,
    unitType: z.enum(['apartment', 'house']),
    areaSqm: z.number().positive().optional(),
    propertyTaxAccount: z.string().max(50).nullable().optional(),
    functionalUnit: z.string().max(20).nullable().optional(),
    referenceValue: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Formato decimal inválido').nullable().optional(),
    facilities: facilitiesSchema,
    utilityAccounts: z.array(utilityAccountSchema).optional(),
    paymentAccount: paymentAccountInputSchema,
  }),
});

export const updateUnitSchema = z.object({
  body: createUnitSchema.shape.body.partial(),
  params: z.object({ unitId: z.string() }),
});

export const listUnitsSchema = z.object({
  query: paginationSchema,
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const unit = await unitService.createUnit(req.user!.userId, req.body);
  res.status(201).json({ data: unit });
});

export const list = catchAsync(async (req: Request, res: Response) => {
  const result = await unitService.listUnits(req.user!.userId, req.query as any);
  res.json(result);
});

export const getById = catchAsync(async (req: Request, res: Response) => {
  const unit = await unitService.getUnitById(req.user!.userId, req.params.unitId as string);
  res.json({ data: unit });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const unit = await unitService.updateUnit(req.user!.userId, req.params.unitId as string, req.body);
  res.json({ data: unit });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  await unitService.deleteUnit(req.user!.userId, req.params.unitId as string);
  res.status(204).send();
});
