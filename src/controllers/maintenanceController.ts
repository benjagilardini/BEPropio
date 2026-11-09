import type { Request, Response } from 'express';
import { z } from 'zod';
import { maintenanceService } from '../services/maintenanceService.js';
import { AppError } from '../utils/AppError.js';
import { catchAsync } from '../utils/catchAsync.js';

export const createMaintenanceSchema = z.object({
  body: z.object({
    category: z.enum(['plumbing', 'electrical', 'gas', 'structural', 'appliance', 'other']),
    room: z.string().min(1).max(100),
    description: z.string().min(10).max(2000),
  }),
  params: z.object({ leaseId: z.string() }),
});

export const updateStatusSchema = z.object({
  body: z.object({
    status: z.enum(['inProgress', 'resolved', 'closed']),
    comment: z.string().max(500).optional(),
  }),
  params: z.object({ leaseId: z.string(), requestId: z.string() }),
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  const request = await maintenanceService.createRequest(req.user!.userId, req.params.leaseId as string, req.body, files);
  res.status(201).json({ data: request });
});

export const list = catchAsync(async (req: Request, res: Response) => {
  const result = await maintenanceService.listByLease(req.user!.userId, req.params.leaseId as string, req.user!.role, req.query as any);
  res.json(result);
});

export const getById = catchAsync(async (req: Request, res: Response) => {
  const request = await maintenanceService.getById(req.user!.userId, req.params.leaseId as string, req.params.requestId as string, req.user!.role);
  res.json({ data: request });
});

export const updateStatus = catchAsync(async (req: Request, res: Response) => {
  const request = await maintenanceService.updateStatus(req.user!.userId, req.params.leaseId as string, req.params.requestId as string, req.body);
  res.json({ data: request });
});

export const uploadPhotos = catchAsync(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) {
    throw AppError.badRequest('No se enviaron fotos');
  }
  const request = await maintenanceService.uploadPhotos(
    req.user!.userId, req.params.leaseId as string, req.params.requestId as string, files,
  );
  res.json({ data: request });
});

export const downloadPhoto = catchAsync(async (req: Request, res: Response) => {
  const photoIndex = parseInt(req.params.photoIndex as string, 10);
  if (isNaN(photoIndex) || photoIndex < 0) {
    throw AppError.badRequest('Índice de foto inválido');
  }
  const file = await maintenanceService.getPhoto(
    req.user!.userId, req.params.leaseId as string, req.params.requestId as string, photoIndex, req.user!.role,
  );
  res.set('Content-Type', file.contentType);
  res.set('Content-Length', String(file.length));
  res.set('Content-Disposition', `inline; filename="${file.filename}"`);
  file.stream.pipe(res);
});
