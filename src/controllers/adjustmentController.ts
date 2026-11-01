import type { Request, Response } from 'express';
import { adjustmentService } from '../services/adjustmentService.js';
import { catchAsync } from '../utils/catchAsync.js';

export const list = catchAsync(async (req: Request, res: Response) => {
  const result = await adjustmentService.listByLease(
    req.user!.userId,
    req.params.leaseId as string,
    req.user!.role,
    req.query as any,
  );
  res.json(result);
});

export const getById = catchAsync(async (req: Request, res: Response) => {
  const adjustment = await adjustmentService.getById(
    req.user!.userId,
    req.params.leaseId as string,
    req.params.adjustmentId as string,
    req.user!.role,
  );
  res.json({ data: adjustment });
});

export const notify = catchAsync(async (_req: Request, res: Response) => {
  // Will be implemented with notificationService
  res.status(501).json({ message: 'Not yet implemented' });
});

export const compareIndices = catchAsync(async (req: Request, res: Response) => {
  const data = await adjustmentService.compareIndices(
    req.user!.userId,
    req.params.leaseId as string,
  );
  res.json({ data });
});

export const getSummary = catchAsync(async (req: Request, res: Response) => {
  const summary = await adjustmentService.getAdjustmentSummary(
    req.user!.userId,
    req.params.leaseId as string,
    req.user!.role,
  );
  res.json({ data: summary });
});
