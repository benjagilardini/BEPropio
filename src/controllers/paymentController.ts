import type { Request, Response } from 'express';
import { z } from 'zod';
import { paymentService } from '../services/paymentService.js';
import { catchAsync } from '../utils/catchAsync.js';

export const createPaymentSchema = z.object({
  body: z.object({
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Formato YYYY-MM'),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Monto decimal válido'),
    paymentDate: z.string().datetime(),
  }),
  params: z.object({ leaseId: z.string() }),
});

export const flagPaymentSchema = z.object({
  body: z.object({
    reviewNote: z.string().min(1).max(500),
  }),
  params: z.object({ leaseId: z.string(), paymentId: z.string() }),
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const payment = await paymentService.createPayment(req.user!.userId, req.params.leaseId as string, req.body);
  res.status(201).json({ data: payment });
});

export const list = catchAsync(async (req: Request, res: Response) => {
  const result = await paymentService.listByLease(req.user!.userId, req.params.leaseId as string, req.user!.role, req.query as any);
  res.json(result);
});

export const getById = catchAsync(async (req: Request, res: Response) => {
  const payment = await paymentService.getById(req.user!.userId, req.params.leaseId as string, req.params.paymentId as string, req.user!.role);
  res.json({ data: payment });
});

export const confirm = catchAsync(async (req: Request, res: Response) => {
  const payment = await paymentService.confirmPayment(req.user!.userId, req.params.leaseId as string, req.params.paymentId as string);
  res.json({ data: payment });
});

export const flag = catchAsync(async (req: Request, res: Response) => {
  const payment = await paymentService.flagPayment(req.user!.userId, req.params.leaseId as string, req.params.paymentId as string, req.body.reviewNote);
  res.json({ data: payment });
});

export const downloadFile = catchAsync(async (_req: Request, res: Response) => {
  res.status(501).json({ message: 'Not yet implemented' });
});
