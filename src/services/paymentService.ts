import mongoose from 'mongoose';
import { PaymentReceipt } from '../models/PaymentReceipt.js';
import { Lease } from '../models/Lease.js';
import { RentAdjustment } from '../models/RentAdjustment.js';
import { AppError } from '../utils/AppError.js';
import { toDecimal128, fromDecimal128, decimalToString } from '../utils/decimal.js';
import { paginate, getSkip, type PaginatedResult } from '../utils/pagination.js';
import { notificationService } from './notificationService.js';
import { fileService } from './fileService.js';

interface PaymentDTO {
  id: string;
  leaseId: string;
  period: string;
  amount: string;
  expectedAmount: string;
  paymentDate: string;
  file: { fileName: string; mimeType: string } | null;
  message: string | null;
  status: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

function toPaymentDTO(p: any): PaymentDTO {
  return {
    id: p._id.toString(),
    leaseId: p.leaseId.toString(),
    period: p.period,
    amount: decimalToString(p.amount),
    expectedAmount: decimalToString(p.expectedAmount),
    paymentDate: (p.paymentDate instanceof Date ? p.paymentDate : new Date(p.paymentDate)).toISOString(),
    file: p.file?.fileName ? { fileName: p.file.fileName, mimeType: p.file.mimeType } : null,
    message: p.message ?? null,
    status: p.status,
    reviewNote: p.reviewNote ?? null,
    reviewedAt: p.reviewedAt ? new Date(p.reviewedAt).toISOString() : null,
    createdAt: p.createdAt?.toISOString?.() ?? p.createdAt,
  };
}

async function calculateExpectedAmount(lease: any, period: string): Promise<number> {
  const periodDate = new Date(period + '-01');
  const lastAdjustment = await RentAdjustment.findOne({
    leaseId: lease._id,
    effectiveDate: { $lte: periodDate },
    status: { $in: ['confirmed', 'final'] },
  } as any).sort({ effectiveDate: -1 }).lean() as any;

  if (lastAdjustment) {
    return fromDecimal128(lastAdjustment.maxAmount);
  }
  return fromDecimal128(lease.initialRent);
}

async function createPayment(
  tenantId: string,
  leaseId: string,
  data: { period: string; amount?: string; paymentDate: string; message?: string },
  file?: { buffer: Buffer; originalname: string; mimetype: string },
): Promise<PaymentDTO> {
  const lease = await Lease.findOne({ _id: leaseId, tenantId, status: 'active' });
  if (!lease) {
    throw AppError.forbidden('No tiene acceso a este contrato o no está activo', 'LEASE_NOT_ACTIVE_FOR_PAYMENT');
  }

  const expectedAmount = await calculateExpectedAmount(lease, data.period);

  let fileRef = null;
  if (file) {
    const fileId = await fileService.uploadFile(file.buffer, file.originalname, file.mimetype, { leaseId });
    fileRef = { fileId, fileName: file.originalname, mimeType: file.mimetype };
  }

  const finalAmount = data.amount || String(expectedAmount);

  const payment = await PaymentReceipt.create({
    leaseId,
    period: data.period,
    amount: toDecimal128(finalAmount),
    expectedAmount: toDecimal128(expectedAmount),
    paymentDate: new Date(data.paymentDate),
    file: fileRef,
    message: data.message || null,
    status: 'submitted',
  });

  const notifMsg = data.message
    ? `Se cargó un comprobante de pago para el período ${data.period}: "${data.message}"`
    : `Se cargó un comprobante de pago para el período ${data.period}`;

  await notificationService.create({
    userId: lease.landlordId.toString(),
    type: 'payment_submitted',
    title: 'Nuevo comprobante de pago',
    message: notifMsg,
    relatedEntity: { entityType: 'payment', entityId: payment._id },
  });

  return toPaymentDTO(payment);
}

async function listByLease(
  userId: string,
  leaseId: string,
  role: string,
  query: { page?: number; limit?: number },
): Promise<PaginatedResult<PaymentDTO>> {
  const leaseQuery: Record<string, unknown> = { _id: leaseId };
  if (role === 'landlord') leaseQuery.landlordId = userId;
  else leaseQuery.tenantId = userId;

  const lease = await Lease.findOne(leaseQuery);
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = getSkip(page, limit);

  const [payments, total] = await Promise.all([
    PaymentReceipt.find({ leaseId }).sort({ paymentDate: -1 }).skip(skip).limit(limit).lean(),
    PaymentReceipt.countDocuments({ leaseId }),
  ]);

  return paginate(payments.map(toPaymentDTO), total, page, limit);
}

async function getById(userId: string, leaseId: string, paymentId: string, role: string): Promise<PaymentDTO> {
  const leaseQuery: Record<string, unknown> = { _id: leaseId };
  if (role === 'landlord') leaseQuery.landlordId = userId;
  else leaseQuery.tenantId = userId;

  const lease = await Lease.findOne(leaseQuery);
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  const payment = await PaymentReceipt.findOne({ _id: paymentId, leaseId }).lean();
  if (!payment) throw AppError.notFound('Comprobante no encontrado', 'PAYMENT_NOT_FOUND');

  return toPaymentDTO(payment);
}

async function confirmPayment(landlordId: string, leaseId: string, paymentId: string): Promise<PaymentDTO> {
  const lease = await Lease.findOne({ _id: leaseId, landlordId });
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  const payment = await PaymentReceipt.findOneAndUpdate(
    { _id: paymentId, leaseId, status: 'submitted' },
    { $set: { status: 'confirmed', reviewedAt: new Date() } },
    { new: true },
  );
  if (!payment) throw AppError.conflict('Comprobante no encontrado o ya revisado', 'PAYMENT_ALREADY_REVIEWED');

  if (lease.tenantId) {
    await notificationService.create({
      userId: lease.tenantId.toString(),
      type: 'payment_confirmed',
      title: 'Pago confirmado',
      message: `Tu pago del período ${payment.period} fue confirmado.`,
      relatedEntity: { entityType: 'payment', entityId: payment._id },
    });
  }

  return toPaymentDTO(payment);
}

async function flagPayment(
  landlordId: string,
  leaseId: string,
  paymentId: string,
  reviewNote: string,
): Promise<PaymentDTO> {
  const lease = await Lease.findOne({ _id: leaseId, landlordId });
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  const payment = await PaymentReceipt.findOneAndUpdate(
    { _id: paymentId, leaseId, status: 'submitted' },
    { $set: { status: 'flagged', reviewNote, reviewedAt: new Date() } },
    { new: true },
  );
  if (!payment) throw AppError.conflict('Comprobante no encontrado o ya revisado', 'PAYMENT_ALREADY_REVIEWED');

  if (lease.tenantId) {
    await notificationService.create({
      userId: lease.tenantId.toString(),
      type: 'payment_flagged',
      title: 'Comprobante observado',
      message: `Tu comprobante del período ${payment.period} fue observado: ${reviewNote}`,
      relatedEntity: { entityType: 'payment', entityId: payment._id },
    });
  }

  return toPaymentDTO(payment);
}

async function downloadFile(userId: string, leaseId: string, paymentId: string, role: string) {
  const leaseQuery: Record<string, unknown> = { _id: leaseId };
  if (role === 'landlord') leaseQuery.landlordId = userId;
  else leaseQuery.tenantId = userId;

  const lease = await Lease.findOne(leaseQuery);
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  const payment = await PaymentReceipt.findOne({ _id: paymentId, leaseId }).lean();
  if (!payment) throw AppError.notFound('Comprobante no encontrado', 'PAYMENT_NOT_FOUND');
  if (!payment.file?.fileId) throw AppError.notFound('No hay archivo adjunto', 'FILE_NOT_FOUND');

  return fileService.downloadFile(payment.file.fileId as mongoose.Types.ObjectId);
}

export const paymentService = {
  createPayment,
  listByLease,
  getById,
  confirmPayment,
  flagPayment,
  downloadFile,
};
