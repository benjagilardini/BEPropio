import type { Request, Response } from 'express';
import { z } from 'zod';
import { expenseService } from '../services/expenseService.js';
import { yieldService } from '../services/yieldService.js';
import { AppError } from '../utils/AppError.js';
import { catchAsync } from '../utils/catchAsync.js';

export const createExpenseSchema = z.object({
  body: z.object({
    date: z.string().datetime(),
    category: z.enum(['tax', 'insurance', 'maintenance', 'condominiumFees', 'other']),
    concept: z.string().min(1).max(200),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    paidBy: z.enum(['landlord', 'tenant']).optional(),
    maintenanceRequestId: z.string().optional(),
  }),
  params: z.object({ unitId: z.string() }),
});

export const updateExpenseSchema = z.object({
  body: z.object({
    date: z.string().datetime().optional(),
    category: z.enum(['tax', 'insurance', 'maintenance', 'condominiumFees', 'other']).optional(),
    concept: z.string().min(1).max(200).optional(),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    paidBy: z.enum(['landlord', 'tenant']).optional(),
  }),
  params: z.object({ unitId: z.string(), id: z.string() }),
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const expense = await expenseService.createExpense(req.user!.userId, req.params.unitId as string, req.body);
  res.status(201).json({ data: expense });
});

export const list = catchAsync(async (req: Request, res: Response) => {
  const result = await expenseService.listExpenses(req.user!.userId, req.params.unitId as string, req.query as any);
  res.json(result);
});

export const getById = catchAsync(async (req: Request, res: Response) => {
  const expense = await expenseService.getExpenseById(req.user!.userId, req.params.unitId as string, req.params.id as string);
  res.json({ data: expense });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const expense = await expenseService.updateExpense(req.user!.userId, req.params.unitId as string, req.params.id as string, req.body);
  res.json({ data: expense });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  await expenseService.deleteExpense(req.user!.userId, req.params.unitId as string, req.params.id as string);
  res.status(204).send();
});

export const calculateYield = catchAsync(async (req: Request, res: Response) => {
  const result = await yieldService.calculateYield(req.user!.userId, req.params.unitId as string);
  res.json({ data: result });
});

const annualYieldQuerySchema = z.object({
  unitId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
});

export const getAnnualYield = catchAsync(async (req: Request, res: Response) => {
  const parsed = annualYieldQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw AppError.badRequest('unitId y year son obligatorios', 'VALIDATION_ERROR', parsed.error.flatten());
  }
  const { unitId, year } = parsed.data;
  const result = await yieldService.calculateAnnualYield(req.user!.userId, unitId, year);
  res.json({ data: result });
});
