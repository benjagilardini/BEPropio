import type { Request, Response } from 'express';
import { z } from 'zod';
import { leaseService } from '../services/leaseService.js';
import { extractionService } from '../services/extractionService.js';
import { invitationService } from '../services/invitationService.js';
import { fileService } from '../services/fileService.js';
import { catchAsync } from '../utils/catchAsync.js';

export const createLeaseSchema = z.object({
  body: z.object({
    startDate: z.string().date(),
    endDate: z.string().date(),
    initialRent: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Formato decimal inválido'),
    adjustmentIndex: z.enum(['IPC', 'ICL', 'UVA']),
    adjustmentFrequencyMonths: z.coerce.number().int().min(1).max(12),
    securityDeposit: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    tenantName: z.string().max(200).optional(),
    tenantDni: z.string().max(8).optional(),
    tenantEmail: z.string().email().optional(),
  }),
  params: z.object({ unitId: z.string() }),
});

export const updateLeaseSchema = z.object({
  body: z.object({
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    initialRent: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    adjustmentIndex: z.enum(['IPC', 'ICL', 'UVA']).optional(),
    adjustmentFrequencyMonths: z.coerce.number().int().min(1).max(12).optional(),
    securityDeposit: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
    tenantName: z.string().max(200).nullable().optional(),
    tenantDni: z.string().max(8).nullable().optional(),
    tenantEmail: z.string().email().nullable().optional(),
  }),
  params: z.object({ leaseId: z.string() }),
});

export const correctFieldSchema = z.object({
  body: z.object({
    correctedValue: z.unknown(),
  }),
  params: z.object({
    leaseId: z.string(),
    fieldIndex: z.coerce.number().int().min(0),
  }),
});

export const paymentAccountSchema = z.object({
  body: z.object({
    holderName: z.string().min(1).max(200),
    bank: z.string().min(1).max(100),
    cbuOrCvu: z.string().regex(/^\d{22}$/, 'CBU/CVU debe tener 22 dígitos'),
    alias: z.string().max(50).nullable().optional(),
  }),
  params: z.object({ leaseId: z.string() }),
});

export const inviteSchema = z.object({
  body: z.object({
    email: z.string().email(),
    tenantName: z.string().min(1).max(200),
    tenantDni: z.string().min(7).max(8),
  }),
  params: z.object({ leaseId: z.string() }),
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const file = (req as any).file as Express.Multer.File | undefined;

  // When using multipart/form-data, body fields may come as strings
  // Parse JSON fields if the body was sent as a 'data' field
  let body = req.body;
  if (typeof body.data === 'string') {
    body = JSON.parse(body.data);
  }

  const lease = await leaseService.createLease(
    req.user!.userId,
    req.params.unitId as string,
    body,
    file ? { originalname: file.originalname, mimetype: file.mimetype, buffer: file.buffer } : undefined,
  );
  res.status(201).json({ data: lease });
});

export const listByUnit = catchAsync(async (req: Request, res: Response) => {
  const result = await leaseService.listByUnit(
    req.user!.userId,
    req.params.unitId as string,
    req.query as any,
  );
  res.json(result);
});

export const getById = catchAsync(async (req: Request, res: Response) => {
  const lease = await leaseService.getById(
    req.user!.userId,
    req.params.leaseId as string,
    req.user!.role,
  );
  res.json({ data: lease });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const lease = await leaseService.updateLease(
    req.user!.userId,
    req.params.leaseId as string,
    req.body,
  );
  res.json({ data: lease });
});

export const confirmField = catchAsync(async (req: Request, res: Response) => {
  const field = await leaseService.confirmField(
    req.user!.userId,
    req.params.leaseId as string,
    parseInt(req.params.fieldIndex as string, 10),
  );
  res.json({ data: field });
});

export const correctField = catchAsync(async (req: Request, res: Response) => {
  const field = await leaseService.correctField(
    req.user!.userId,
    req.params.leaseId as string,
    parseInt(req.params.fieldIndex as string, 10),
    req.body.correctedValue,
  );
  res.json({ data: field });
});

export const extract = catchAsync(async (req: Request, res: Response) => {
  const lease = await extractionService.processLeaseDocument(
    req.user!.userId,
    req.params.leaseId as string,
  );
  res.json({ data: leaseService.toLeaseDTO(lease) });
});

export const activate = catchAsync(async (req: Request, res: Response) => {
  const lease = await leaseService.activateLease(
    req.user!.userId,
    req.params.leaseId as string,
  );
  res.json({ data: lease });
});

export const updatePaymentAccount = catchAsync(async (req: Request, res: Response) => {
  const lease = await leaseService.updatePaymentAccount(
    req.user!.userId,
    req.params.leaseId as string,
    req.body,
  );
  res.json({ data: lease });
});

export const endLease = catchAsync(async (req: Request, res: Response) => {
  const lease = await leaseService.endLease(
    req.user!.userId,
    req.params.leaseId as string,
  );
  res.json({ data: lease });
});

export const getUnitForTenant = catchAsync(async (req: Request, res: Response) => {
  const unit = await leaseService.getUnitForTenant(
    req.user!.userId,
    req.params.leaseId as string,
  );
  res.json({ data: unit });
});

export const inviteTenant = catchAsync(async (req: Request, res: Response) => {
  const result = await invitationService.inviteTenant(
    req.user!.userId,
    req.params.leaseId as string,
    req.body,
  );
  res.json(result);
});

export const resendInvitation = catchAsync(async (req: Request, res: Response) => {
  const result = await invitationService.resendInvitation(
    req.user!.userId,
    req.params.leaseId as string,
  );
  res.json(result);
});

export const downloadDocument = catchAsync(async (req: Request, res: Response) => {
  const lease = await leaseService.getById(
    req.user!.userId,
    req.params.leaseId as string,
    req.user!.role,
  );

  if (!lease.document?.fileId) {
    res.status(404).json({ message: 'El contrato no tiene documento adjunto' });
    return;
  }

  const { stream, filename, contentType, length } = await fileService.downloadFile(
    (await import('mongoose')).default.Types.ObjectId.createFromHexString(lease.document.fileId),
  );

  res.set({
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    'Content-Length': String(length),
  });

  stream.pipe(res);
});

export const getTenantLeases = catchAsync(async (req: Request, res: Response) => {
  const leases = await leaseService.getTenantsLeases(req.user!.userId);
  res.json({ data: leases });
});
