import { Lease, type LeaseDocument } from '../models/Lease.js';
import { Unit } from '../models/Unit.js';
import { RentAdjustment } from '../models/RentAdjustment.js';
import { AppError } from '../utils/AppError.js';
import { toDecimal128, decimalToString } from '../utils/decimal.js';
import { paginate, getSkip, type PaginatedResult } from '../utils/pagination.js';
import { adjustmentService } from './adjustmentService.js';
import { fileService } from './fileService.js';

// --- DTOs ---

interface LeaseDTO {
  id: string;
  unitId: string;
  landlordId: string;
  tenantId: string | null;
  startDate: string;
  endDate: string;
  initialRent: string;
  adjustmentIndex: string;
  adjustmentFrequencyMonths: number;
  securityDeposit: string | null;
  status: string;
  document: {
    fileId: string;
    fileName: string;
    mimeType: string;
    pageCount: number | null;
  } | null;
  extractedFields: Array<{
    fieldName: string;
    value: unknown;
    sourceText: string | null;
    status: string;
    correctedValue: unknown | null;
  }>;
  paymentAccount: {
    holderName: string;
    bank: string;
    cbuOrCvu: string;
    alias: string | null;
  } | null;
  expenseResponsibility: Array<{
    category: string;
    paidBy: string;
  }>;
  endedAt: string | null;
  tenantName: string | null;
  tenantDni: string | null;
  tenantEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

function toLeaseDTO(lease: any): LeaseDTO {
  return {
    id: lease._id.toString(),
    unitId: lease.unitId.toString(),
    landlordId: lease.landlordId.toString(),
    tenantId: lease.tenantId?.toString() ?? null,
    startDate: (lease.startDate instanceof Date ? lease.startDate : new Date(lease.startDate)).toISOString(),
    endDate: (lease.endDate instanceof Date ? lease.endDate : new Date(lease.endDate)).toISOString(),
    initialRent: decimalToString(lease.initialRent),
    adjustmentIndex: lease.adjustmentIndex,
    adjustmentFrequencyMonths: lease.adjustmentFrequencyMonths,
    securityDeposit: lease.securityDeposit ? decimalToString(lease.securityDeposit) : null,
    status: lease.status,
    document: lease.document
      ? {
          fileId: lease.document.fileId.toString(),
          fileName: lease.document.fileName,
          mimeType: lease.document.mimeType,
          pageCount: lease.document.pageCount,
        }
      : null,
    extractedFields: lease.extractedFields || [],
    paymentAccount: lease.paymentAccount || null,
    expenseResponsibility: (lease.expenseResponsibility || []).map((er: any) => ({
      category: er.category,
      paidBy: er.paidBy,
    })),
    endedAt: lease.endedAt ? new Date(lease.endedAt).toISOString() : null,
    tenantName: lease.tenantName ?? null,
    tenantDni: lease.tenantDni ?? null,
    tenantEmail: lease.tenantEmail ?? null,
    createdAt: lease.createdAt?.toISOString?.() ?? lease.createdAt,
    updatedAt: lease.updatedAt?.toISOString?.() ?? lease.updatedAt,
  };
}

// --- Inputs ---

export interface CreateLeaseInput {
  startDate: string;
  endDate: string;
  initialRent: string;
  adjustmentIndex: 'IPC' | 'ICL' | 'UVA';
  adjustmentFrequencyMonths: number;
  securityDeposit?: string;
  tenantName?: string;
  tenantDni?: string;
  tenantEmail?: string;
}

// --- Service ---

async function createLease(
  landlordId: string,
  unitId: string,
  data: CreateLeaseInput,
  file?: { originalname: string; mimetype: string; buffer: Buffer },
): Promise<LeaseDTO> {
  const unit = await Unit.findOne({ _id: unitId, landlordId });
  if (!unit) throw AppError.notFound('Unidad no encontrada', 'UNIT_NOT_FOUND');

  const existingActive = await Lease.findOne({ unitId, status: 'active' });
  if (existingActive) {
    throw AppError.conflict('La unidad ya tiene un contrato activo', 'LEASE_ALREADY_ACTIVE');
  }

  // Upload file to GridFS if provided
  let documentData = null;
  if (file) {
    const fileId = await fileService.uploadFile(file.buffer, file.originalname, file.mimetype, {
      uploadedBy: landlordId,
      entityType: 'lease',
      originalName: file.originalname,
    });
    documentData = {
      fileId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      pageCount: null,
    };
  }

  const lease = await Lease.create({
    unitId,
    landlordId,
    startDate: new Date(data.startDate),
    endDate: new Date(data.endDate),
    initialRent: toDecimal128(data.initialRent),
    adjustmentIndex: data.adjustmentIndex,
    adjustmentFrequencyMonths: data.adjustmentFrequencyMonths,
    securityDeposit: data.securityDeposit ? toDecimal128(data.securityDeposit) : null,
    status: 'draft',
    document: documentData,
    tenantName: data.tenantName || null,
    tenantDni: data.tenantDni || null,
    tenantEmail: data.tenantEmail || null,
  });

  return toLeaseDTO(lease);
}

async function listByUnit(
  landlordId: string,
  unitId: string,
  query: { page?: number; limit?: number },
): Promise<PaginatedResult<LeaseDTO>> {
  const unit = await Unit.findOne({ _id: unitId, landlordId });
  if (!unit) throw AppError.notFound('Unidad no encontrada', 'UNIT_NOT_FOUND');

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = getSkip(page, limit);

  const [leases, total] = await Promise.all([
    Lease.find({ unitId, landlordId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Lease.countDocuments({ unitId, landlordId }),
  ]);

  return paginate(leases.map(toLeaseDTO), total, page, limit);
}

async function getById(userId: string, leaseId: string, role: string): Promise<LeaseDTO> {
  const query: Record<string, unknown> = { _id: leaseId };
  if (role === 'landlord') {
    query.landlordId = userId;
  } else {
    query.tenantId = userId;
  }

  const lease = await Lease.findOne(query).lean();
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');
  return toLeaseDTO(lease);
}

async function updateLease(
  landlordId: string,
  leaseId: string,
  data: Partial<CreateLeaseInput>,
): Promise<LeaseDTO> {
  const lease = await Lease.findOne({ _id: leaseId, landlordId, status: 'draft' });
  if (!lease) throw AppError.notFound('Contrato no encontrado o no está en borrador', 'LEASE_NOT_FOUND');

  if (data.startDate) lease.startDate = new Date(data.startDate);
  if (data.endDate) lease.endDate = new Date(data.endDate);
  if (data.initialRent) lease.initialRent = toDecimal128(data.initialRent);
  if (data.adjustmentIndex) lease.adjustmentIndex = data.adjustmentIndex;
  if (data.adjustmentFrequencyMonths) lease.adjustmentFrequencyMonths = data.adjustmentFrequencyMonths;
  if (data.securityDeposit !== undefined) {
    lease.securityDeposit = data.securityDeposit ? toDecimal128(data.securityDeposit) : null;
  }
  if (data.tenantName !== undefined) lease.tenantName = data.tenantName || null;
  if (data.tenantDni !== undefined) lease.tenantDni = data.tenantDni || null;
  if (data.tenantEmail !== undefined) lease.tenantEmail = data.tenantEmail || null;

  await lease.save();
  return toLeaseDTO(lease);
}

async function confirmField(
  landlordId: string,
  leaseId: string,
  fieldIndex: number,
) {
  const lease = await Lease.findOne({ _id: leaseId, landlordId, status: 'draft' });
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  if (fieldIndex < 0 || fieldIndex >= lease.extractedFields.length) {
    throw AppError.badRequest('Índice de campo inválido', 'FIELD_INDEX_INVALID');
  }

  lease.extractedFields[fieldIndex].status = 'confirmed';
  await lease.save();

  return lease.extractedFields[fieldIndex];
}

async function correctField(
  landlordId: string,
  leaseId: string,
  fieldIndex: number,
  correctedValue: unknown,
) {
  const lease = await Lease.findOne({ _id: leaseId, landlordId, status: 'draft' });
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  if (fieldIndex < 0 || fieldIndex >= lease.extractedFields.length) {
    throw AppError.badRequest('Índice de campo inválido', 'FIELD_INDEX_INVALID');
  }

  lease.extractedFields[fieldIndex].status = 'corrected';
  lease.extractedFields[fieldIndex].correctedValue = correctedValue;
  await lease.save();

  return lease.extractedFields[fieldIndex];
}

async function activateLease(landlordId: string, leaseId: string): Promise<LeaseDTO> {
  const lease = await Lease.findOne({ _id: leaseId, landlordId, status: 'draft' });
  if (!lease) throw AppError.notFound('Contrato no encontrado o ya activado', 'LEASE_NOT_DRAFT');

  if (lease.extractedFields.length > 0) {
    const allConfirmed = lease.extractedFields.every(
      (f) => f.status === 'confirmed' || f.status === 'corrected',
    );
    if (!allConfirmed) {
      const pending = lease.extractedFields
        .filter((f) => f.status === 'pending')
        .map((f) => f.fieldName);
      throw AppError.badRequest(
        'Todos los campos deben estar confirmados antes de activar',
        'FIELDS_PENDING',
        { pendingFields: pending },
      );
    }
  }

  // Apply confirmed/corrected extracted values to lease fields
  const fieldMap: Record<string, string> = {
    startDate: 'startDate',
    endDate: 'endDate',
    initialRent: 'initialRent',
    adjustmentIndex: 'adjustmentIndex',
    adjustmentFrequencyMonths: 'adjustmentFrequencyMonths',
    securityDeposit: 'securityDeposit',
    tenantName: 'tenantName',
    tenantDni: 'tenantDni',
    tenantEmail: 'tenantEmail',
  };

  for (const field of lease.extractedFields) {
    const val = field.status === 'corrected' ? field.correctedValue : field.value;
    if (val == null) continue;

    // Handle expenseResponsibility separately
    if (field.fieldName === 'expenseResponsibility') {
      const arr = Array.isArray(val) ? val : [];
      const validCategories = new Set(['tax', 'insurance', 'maintenance', 'condominiumFees', 'other']);
      const validPaidBy = new Set(['landlord', 'tenant']);
      lease.expenseResponsibility = arr
        .filter((e: any) => validCategories.has(e.category) && validPaidBy.has(e.paidBy))
        .map((e: any) => ({ category: e.category, paidBy: e.paidBy }));
      continue;
    }

    const leaseField = fieldMap[field.fieldName];
    if (!leaseField) continue;

    if (leaseField === 'startDate' || leaseField === 'endDate') {
      (lease as any)[leaseField] = new Date(val as string);
    } else if (leaseField === 'initialRent' || leaseField === 'securityDeposit') {
      (lease as any)[leaseField] = toDecimal128(String(val));
    } else if (leaseField === 'adjustmentFrequencyMonths') {
      (lease as any)[leaseField] = Number(val);
    } else {
      (lease as any)[leaseField] = val;
    }
  }

  lease.status = 'active';
  await lease.save();

  await adjustmentService.generateAdjustmentsForLease(lease);

  return toLeaseDTO(lease);
}

async function updatePaymentAccount(
  landlordId: string,
  leaseId: string,
  data: { holderName: string; bank: string; cbuOrCvu: string; alias?: string | null },
): Promise<LeaseDTO> {
  const lease = await Lease.findOne({ _id: leaseId, landlordId });
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  lease.paymentAccount = {
    holderName: data.holderName,
    bank: data.bank,
    cbuOrCvu: data.cbuOrCvu,
    alias: data.alias ?? null,
  };
  await lease.save();

  return toLeaseDTO(lease);
}

async function endLease(landlordId: string, leaseId: string): Promise<LeaseDTO> {
  const lease = await Lease.findOne({ _id: leaseId, landlordId, status: 'active' });
  if (!lease) throw AppError.notFound('Contrato no encontrado o no está activo', 'LEASE_NOT_ACTIVE');

  lease.status = 'ended';
  lease.endedAt = new Date();
  await lease.save();

  await RentAdjustment.deleteMany({
    leaseId,
    effectiveDate: { $gt: new Date() },
    status: 'estimated',
  });

  return toLeaseDTO(lease);
}

async function getUnitForTenant(tenantId: string, leaseId: string) {
  const lease = await Lease.findOne({ _id: leaseId, tenantId }).lean();
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');
  if (lease.status !== 'active') {
    throw AppError.forbidden('Acceso no disponible para contrato finalizado');
  }

  const unit = await Unit.findById(lease.unitId).lean();
  if (!unit) throw AppError.notFound('Unidad no encontrada', 'UNIT_NOT_FOUND');

  // Return tenant-safe view (no referenceValue, no propertyTaxAccount)
  return {
    id: unit._id.toString(),
    address: unit.address,
    unitType: unit.unitType,
    areaSqm: unit.areaSqm ?? null,
    functionalUnit: unit.functionalUnit ?? null,
    facilities: unit.facilities || {},
    utilityAccounts: unit.utilityAccounts || [],
  };
}

async function getTenantsLeases(tenantId: string) {
  const leases = await Lease.find({ tenantId })
    .populate('unitId', 'address')
    .sort({ createdAt: -1 })
    .lean();

  return leases.map((lease) => {
    const unit = lease.unitId as any;
    const addr = unit?.address;
    const address = addr
      ? `${addr.street} ${addr.number}${addr.floor ? `, ${addr.floor}` : ''}${addr.apartment ? `°${addr.apartment}` : ''}`
      : 'Dirección no disponible';

    return {
      id: lease._id.toString(),
      unitAddress: address,
      status: lease.status,
      startDate: lease.startDate.toISOString().split('T')[0],
      endDate: lease.endDate.toISOString().split('T')[0],
      initialRent: decimalToString(lease.initialRent),
      currentRent: decimalToString(lease.initialRent),
      adjustmentIndex: lease.adjustmentIndex,
      adjustmentFrequencyMonths: lease.adjustmentFrequencyMonths,
      paymentAccount: lease.paymentAccount
        ? {
            holderName: lease.paymentAccount.holderName,
            bank: lease.paymentAccount.bank,
            cbuOrCvu: lease.paymentAccount.cbuOrCvu,
            alias: lease.paymentAccount.alias ?? null,
          }
        : null,
    };
  });
}

export const leaseService = {
  createLease,
  listByUnit,
  getById,
  updateLease,
  confirmField,
  correctField,
  activateLease,
  updatePaymentAccount,
  endLease,
  getUnitForTenant,
  getTenantsLeases,
  toLeaseDTO,
};
