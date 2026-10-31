import mongoose from 'mongoose';
import { MaintenanceRequest } from '../models/MaintenanceRequest.js';
import { Lease } from '../models/Lease.js';
import { AppError } from '../utils/AppError.js';
import { paginate, getSkip, type PaginatedResult } from '../utils/pagination.js';
import { notificationService } from './notificationService.js';

interface MaintenanceDTO {
  id: string;
  leaseId: string;
  code: string;
  category: string;
  room: string;
  description: string;
  photos: Array<{ fileName: string; index: number }>;
  status: string;
  statusHistory: Array<{
    status: string;
    comment: string | null;
    changedBy: string;
    changedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

function toMaintenanceDTO(r: any): MaintenanceDTO {
  return {
    id: r._id.toString(),
    leaseId: r.leaseId.toString(),
    code: r.code,
    category: r.category,
    room: r.room,
    description: r.description,
    photos: (r.photos || []).map((p: any, i: number) => ({
      fileName: p.fileName,
      index: i,
    })),
    status: r.status,
    statusHistory: (r.statusHistory || []).map((h: any) => ({
      status: h.status,
      comment: h.comment ?? null,
      changedBy: h.changedBy.toString(),
      changedAt: (h.changedAt instanceof Date ? h.changedAt : new Date(h.changedAt)).toISOString(),
    })),
    createdAt: r.createdAt?.toISOString?.() ?? r.createdAt,
    updatedAt: r.updatedAt?.toISOString?.() ?? r.updatedAt,
  };
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ['inProgress'],
  inProgress: ['resolved'],
  resolved: ['closed'],
};

async function createRequest(
  tenantId: string,
  leaseId: string,
  data: { category: string; room: string; description: string },
): Promise<MaintenanceDTO> {
  const lease = await Lease.findOne({ _id: leaseId, tenantId, status: 'active' });
  if (!lease) throw AppError.forbidden('No tiene acceso o contrato no activo');

  const lastRequest = await MaintenanceRequest.findOne().sort({ code: -1 }).lean();
  const nextNumber = lastRequest ? parseInt(lastRequest.code.split('-')[1]) + 1 : 1;
  const code = `MR-${String(nextNumber).padStart(4, '0')}`;

  const request = await MaintenanceRequest.create({
    leaseId,
    code,
    category: data.category as any,
    room: data.room,
    description: data.description,
    photos: [],
    status: 'open',
    statusHistory: [{
      status: 'open' as const,
      comment: 'Reclamo registrado',
      changedBy: new mongoose.Types.ObjectId(tenantId),
      changedAt: new Date(),
    }],
  });

  await notificationService.create({
    userId: lease.landlordId.toString(),
    type: 'maintenance_update',
    title: `Nuevo reclamo: ${code}`,
    message: `${data.category} - ${data.room}: ${data.description.substring(0, 100)}`,
    relatedEntity: { entityType: 'maintenance', entityId: (request as any)._id },
  });

  return toMaintenanceDTO(request);
}

async function listByLease(
  userId: string,
  leaseId: string,
  role: string,
  query: { page?: number; limit?: number },
): Promise<PaginatedResult<MaintenanceDTO>> {
  const leaseQuery: Record<string, unknown> = { _id: leaseId };
  if (role === 'landlord') leaseQuery.landlordId = userId;
  else leaseQuery.tenantId = userId;

  const lease = await Lease.findOne(leaseQuery);
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = getSkip(page, limit);

  const [requests, total] = await Promise.all([
    MaintenanceRequest.find({ leaseId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    MaintenanceRequest.countDocuments({ leaseId }),
  ]);

  return paginate(requests.map(toMaintenanceDTO), total, page, limit);
}

async function getById(
  userId: string,
  leaseId: string,
  requestId: string,
  role: string,
): Promise<MaintenanceDTO> {
  const leaseQuery: Record<string, unknown> = { _id: leaseId };
  if (role === 'landlord') leaseQuery.landlordId = userId;
  else leaseQuery.tenantId = userId;

  const lease = await Lease.findOne(leaseQuery);
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  const request = await MaintenanceRequest.findOne({ _id: requestId, leaseId }).lean();
  if (!request) throw AppError.notFound('Reclamo no encontrado', 'REQUEST_NOT_FOUND');

  return toMaintenanceDTO(request);
}

async function updateStatus(
  landlordId: string,
  leaseId: string,
  requestId: string,
  data: { status: string; comment?: string },
): Promise<MaintenanceDTO> {
  const lease = await Lease.findOne({ _id: leaseId, landlordId });
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  const request = await MaintenanceRequest.findOne({ _id: requestId, leaseId });
  if (!request) throw AppError.notFound('Reclamo no encontrado', 'REQUEST_NOT_FOUND');

  if (!VALID_TRANSITIONS[request.status]?.includes(data.status)) {
    throw AppError.badRequest(
      `No se puede pasar de '${request.status}' a '${data.status}'`,
      'INVALID_STATUS_TRANSITION',
    );
  }

  request.status = data.status as any;
  request.statusHistory.push({
    status: data.status as any,
    comment: data.comment || null,
    changedBy: new mongoose.Types.ObjectId(landlordId),
    changedAt: new Date(),
  });
  await request.save();

  if (lease.tenantId) {
    await notificationService.create({
      userId: lease.tenantId.toString(),
      type: 'maintenance_update',
      title: `Reclamo ${request.code} actualizado`,
      message: `Estado: ${data.status}${data.comment ? ` - ${data.comment}` : ''}`,
      relatedEntity: { entityType: 'maintenance', entityId: request._id },
    });
  }

  return toMaintenanceDTO(request);
}

export const maintenanceService = {
  createRequest,
  listByLease,
  getById,
  updateStatus,
};
