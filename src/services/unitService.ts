import mongoose from 'mongoose';
import { Unit, type UnitDocument } from '../models/Unit.js';
import { Lease } from '../models/Lease.js';
import { AppError } from '../utils/AppError.js';
import { toDecimal128, decimalToString } from '../utils/decimal.js';
import { paginate, getSkip, DEFAULT_LIMIT, type PaginatedResult } from '../utils/pagination.js';

interface AddressDTO {
  street: string;
  number: string;
  floor: string | null;
  apartment: string | null;
  neighborhood: string | null;
  city: string;
  province: string;
}

interface PaymentAccountDTO {
  holderName: string;
  bank: string;
  cbuOrCvu: string;
  alias: string | null;
}

interface UnitDTO {
  id: string;
  address: AddressDTO;
  unitType: string;
  areaSqm: number | null;
  propertyTaxAccount: string | null;
  functionalUnit: string | null;
  referenceValue: string | null;
  facilities: Record<string, string | null>;
  utilityAccounts: Array<{
    utilityType: string;
    provider: string;
    accountId: string;
    paidBy: string;
  }>;
  paymentAccount: PaymentAccountDTO | null;
  createdAt: string;
  updatedAt: string;
}

interface UnitListDTO {
  id: string;
  address: AddressDTO;
  unitType: string;
  isOccupied: boolean;
  tenant: { name: string } | null;
  currentRent: string | null;
}

function toUnitDTO(unit: any): UnitDTO {
  return {
    id: unit._id.toString(),
    address: unit.address,
    unitType: unit.unitType,
    areaSqm: unit.areaSqm ?? null,
    propertyTaxAccount: unit.propertyTaxAccount ?? null,
    functionalUnit: unit.functionalUnit ?? null,
    referenceValue: unit.referenceValue ? decimalToString(unit.referenceValue) : null,
    facilities: unit.facilities || {},
    utilityAccounts: unit.utilityAccounts || [],
    paymentAccount: unit.paymentAccount
      ? {
          holderName: unit.paymentAccount.holderName,
          bank: unit.paymentAccount.bank,
          cbuOrCvu: unit.paymentAccount.cbuOrCvu,
          alias: unit.paymentAccount.alias ?? null,
        }
      : null,
    createdAt: unit.createdAt?.toISOString?.() ?? unit.createdAt,
    updatedAt: unit.updatedAt?.toISOString?.() ?? unit.updatedAt,
  };
}

function toUnitListDTO(unit: any): Omit<UnitListDTO, 'isOccupied' | 'tenant' | 'currentRent'> {
  return {
    id: unit._id.toString(),
    address: unit.address,
    unitType: unit.unitType,
  };
}

export interface CreateUnitInput {
  address: {
    street: string;
    number: string;
    floor?: string | null;
    apartment?: string | null;
    neighborhood?: string | null;
    city: string;
    province: string;
  };
  unitType: 'apartment' | 'house';
  areaSqm?: number;
  propertyTaxAccount?: string | null;
  functionalUnit?: string | null;
  referenceValue?: string | null;
  facilities?: Record<string, string | null>;
  utilityAccounts?: Array<{
    utilityType: 'electricity' | 'gas' | 'water' | 'condominiumFees' | 'propertyTax';
    provider: string;
    accountId: string;
    paidBy: 'tenant' | 'landlord';
  }>;
  paymentAccount?: {
    holderName: string;
    bank: string;
    cbuOrCvu: string;
    alias?: string | null;
  } | null;
}

export interface ListQuery {
  page?: number;
  limit?: number;
}

async function createUnit(landlordId: string, data: CreateUnitInput): Promise<UnitDTO> {
  const unit = await Unit.create({
    landlordId,
    address: data.address,
    unitType: data.unitType,
    areaSqm: data.areaSqm ?? null,
    propertyTaxAccount: data.propertyTaxAccount ?? null,
    functionalUnit: data.functionalUnit ?? null,
    referenceValue: data.referenceValue ? toDecimal128(data.referenceValue) : null,
    facilities: data.facilities || {},
    utilityAccounts: data.utilityAccounts || [],
    paymentAccount: data.paymentAccount || null,
  });

  return toUnitDTO(unit);
}

async function listUnits(landlordId: string, query: ListQuery): Promise<PaginatedResult<UnitListDTO>> {
  const page = query.page ?? 1;
  const limit = query.limit ?? DEFAULT_LIMIT;
  const skip = getSkip(page, limit);

  const [units, total] = await Promise.all([
    Unit.find({ landlordId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Unit.countDocuments({ landlordId }),
  ]);

  const unitIds = units.map((u) => u._id);
  const activeLeases = await Lease.find({
    unitId: { $in: unitIds },
    status: 'active',
  }).populate('tenantId', 'firstName lastName').lean();

  interface PopulatedTenant { firstName: string; lastName: string }
  type LeaseWithPopulatedTenant = typeof activeLeases[number] & {
    tenantId: PopulatedTenant | mongoose.Types.ObjectId | null;
  };

  const leaseByUnitId = new Map<string, LeaseWithPopulatedTenant>();
  for (const lease of activeLeases) {
    leaseByUnitId.set(lease.unitId.toString(), lease as LeaseWithPopulatedTenant);
  }

  const enriched: UnitListDTO[] = units.map((unit) => {
    const activeLease = leaseByUnitId.get(unit._id.toString());
    const tenant = activeLease?.tenantId != null && typeof activeLease.tenantId === 'object' && 'firstName' in activeLease.tenantId
      ? activeLease.tenantId as PopulatedTenant
      : null;
    return {
      ...toUnitListDTO(unit),
      isOccupied: !!activeLease,
      tenant: tenant
        ? { name: `${tenant.firstName} ${tenant.lastName}` }
        : null,
      currentRent: activeLease?.initialRent
        ? decimalToString(activeLease.initialRent)
        : null,
    };
  });

  return paginate(enriched, total, page, limit);
}

async function getUnitById(landlordId: string, unitId: string): Promise<UnitDTO> {
  const unit = await Unit.findOne({ _id: unitId, landlordId }).lean();
  if (!unit) throw AppError.notFound('Unidad no encontrada', 'UNIT_NOT_FOUND');
  return toUnitDTO(unit);
}

async function updateUnit(landlordId: string, unitId: string, data: Partial<CreateUnitInput>): Promise<UnitDTO> {
  const updateData: Record<string, unknown> = { ...data };

  if (data.referenceValue !== undefined) {
    updateData.referenceValue = data.referenceValue ? toDecimal128(data.referenceValue) : null;
  }

  const unit = await Unit.findOneAndUpdate(
    { _id: unitId, landlordId },
    { $set: updateData },
    { new: true, runValidators: true },
  ).lean();

  if (!unit) throw AppError.notFound('Unidad no encontrada', 'UNIT_NOT_FOUND');
  return toUnitDTO(unit);
}

async function deleteUnit(landlordId: string, unitId: string): Promise<void> {
  const activeLease = await Lease.findOne({ unitId, status: 'active' });
  if (activeLease) {
    throw AppError.conflict('No se puede eliminar una unidad con un contrato activo', 'UNIT_HAS_ACTIVE_LEASE');
  }

  const result = await Unit.deleteOne({ _id: unitId, landlordId });
  if (result.deletedCount === 0) {
    throw AppError.notFound('Unidad no encontrada', 'UNIT_NOT_FOUND');
  }
}

export const unitService = {
  createUnit,
  listUnits,
  getUnitById,
  updateUnit,
  deleteUnit,
  toUnitDTO,
};
