import mongoose from 'mongoose';
import { MaintenanceRequest, type IMaintenanceRequest } from '../models/MaintenanceRequest.js';
import { Lease } from '../models/Lease.js';
import { AppError } from '../utils/AppError.js';
import { paginate, getSkip, DEFAULT_LIMIT, type PaginatedResult } from '../utils/pagination.js';
import { notificationService } from './notificationService.js';
import { fileService } from './fileService.js';

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
  data: { category: IMaintenanceRequest['category']; room: string; description: string },
  files?: Express.Multer.File[],
): Promise<MaintenanceDTO> {
  const lease = await Lease.findOne({ _id: leaseId, tenantId, status: 'active' });
  if (!lease) throw AppError.forbidden('No tiene acceso o contrato no activo');

  const lastRequest = await MaintenanceRequest.findOne().sort({ code: -1 }).lean();
  const nextNumber = lastRequest ? parseInt(lastRequest.code.split('-')[1]) + 1 : 1;
  const code = `MR-${String(nextNumber).padStart(4, '0')}`;

  const photos: Array<{ fileId: mongoose.Types.ObjectId; fileName: string }> = [];
  if (files?.length) {
    for (const file of files) {
      const fileId = await fileService.uploadFile(file.buffer, file.originalname, file.mimetype, { entity: 'maintenance' });
      photos.push({ fileId, fileName: file.originalname });
    }
  }

  const request = await MaintenanceRequest.create({
    leaseId,
    code,
    category: data.category,
    room: data.room,
    description: data.description,
    photos,
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
    relatedEntity: { entityType: 'maintenance', entityId: request._id },
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
  const limit = query.limit ?? DEFAULT_LIMIT;
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
  data: { status: IMaintenanceRequest['status']; comment?: string },
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

  request.status = data.status;
  request.statusHistory.push({
    status: data.status,
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

async function uploadPhotos(
  tenantId: string,
  leaseId: string,
  requestId: string,
  files: Express.Multer.File[],
): Promise<MaintenanceDTO> {
  const lease = await Lease.findOne({ _id: leaseId, tenantId });
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  const request = await MaintenanceRequest.findOne({ _id: requestId, leaseId });
  if (!request) throw AppError.notFound('Reclamo no encontrado', 'REQUEST_NOT_FOUND');

  if (request.photos.length + files.length > 5) {
    throw AppError.badRequest('Máximo 5 fotos por reclamo', 'MAX_PHOTOS_EXCEEDED');
  }

  for (const file of files) {
    const fileId = await fileService.uploadFile(file.buffer, file.originalname, file.mimetype, { entity: 'maintenance' });
    request.photos.push({ fileId, fileName: file.originalname });
  }
  await request.save();

  return toMaintenanceDTO(request);
}

async function getPhoto(
  userId: string,
  leaseId: string,
  requestId: string,
  photoIndex: number,
  role: string,
) {
  const leaseQuery: Record<string, unknown> = { _id: leaseId };
  if (role === 'landlord') leaseQuery.landlordId = userId;
  else leaseQuery.tenantId = userId;

  const lease = await Lease.findOne(leaseQuery);
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  const request = await MaintenanceRequest.findOne({ _id: requestId, leaseId }).lean();
  if (!request) throw AppError.notFound('Reclamo no encontrado', 'REQUEST_NOT_FOUND');

  const photo = request.photos[photoIndex];
  if (!photo) throw AppError.notFound('Foto no encontrada', 'PHOTO_NOT_FOUND');

  return fileService.downloadFile(photo.fileId);
}

export const maintenanceService = {
  createRequest,
  listByLease,
  getById,
  updateStatus,
  uploadPhotos,
  getPhoto,
};
