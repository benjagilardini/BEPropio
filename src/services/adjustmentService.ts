import mongoose from 'mongoose';
import { RentAdjustment } from '../models/RentAdjustment.js';
import { IndexValue } from '../models/IndexValue.js';
import { Lease, type LeaseDocument } from '../models/Lease.js';
import { AppError } from '../utils/AppError.js';
import { toDecimal128, fromDecimal128, decimalToString } from '../utils/decimal.js';
import { addMonths, subtractMonths, formatPeriod, formatDateISO, daysBetween, getRequiredPeriods } from '../utils/dateUtils.js';
import { paginate, getSkip, type PaginatedResult } from '../utils/pagination.js';

// --- DTOs ---

interface AdjustmentDTO {
  id: string;
  leaseId: string;
  effectiveDate: string;
  previousRent: string;
  startIndexValue: string | null;
  endIndexValue: string | null;
  minCoefficient: string;
  maxCoefficient: string;
  minAmount: string;
  maxAmount: string;
  pendingPeriods: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

function toAdjustmentDTO(adj: any): AdjustmentDTO {
  return {
    id: adj._id.toString(),
    leaseId: adj.leaseId.toString(),
    effectiveDate: (adj.effectiveDate instanceof Date ? adj.effectiveDate : new Date(adj.effectiveDate)).toISOString(),
    previousRent: decimalToString(adj.previousRent),
    startIndexValue: adj.startIndexValue ? decimalToString(adj.startIndexValue) : null,
    endIndexValue: adj.endIndexValue ? decimalToString(adj.endIndexValue) : null,
    minCoefficient: decimalToString(adj.minCoefficient),
    maxCoefficient: decimalToString(adj.maxCoefficient),
    minAmount: decimalToString(adj.minAmount),
    maxAmount: decimalToString(adj.maxAmount),
    pendingPeriods: adj.pendingPeriods || [],
    status: adj.status,
    createdAt: adj.createdAt?.toISOString?.() ?? adj.createdAt,
    updatedAt: adj.updatedAt?.toISOString?.() ?? adj.updatedAt,
  };
}

// --- Coefficient Calculation ---

interface CoefficientResult {
  minCoefficient: number;
  maxCoefficient: number;
  startValue: mongoose.Types.Decimal128 | null;
  endValue: mongoose.Types.Decimal128 | null;
}

function calculateCoefficients(
  indexType: 'IPC' | 'ICL' | 'UVA',
  availableValues: any[],
  pendingPeriods: string[],
  periodStart: Date,
  periodEnd: Date,
): CoefficientResult {
  if (indexType === 'IPC') {
    return calculateIpcCoefficients(availableValues, pendingPeriods, periodStart, periodEnd);
  }
  return calculateDailyIndexCoefficients(availableValues, pendingPeriods, periodStart, periodEnd);
}

function calculateIpcCoefficients(
  availableValues: any[],
  pendingPeriods: string[],
  periodStart: Date,
  periodEnd: Date,
): CoefficientResult {
  const startPeriod = formatPeriod(periodStart);
  const endPeriod = formatPeriod(subtractMonths(periodEnd, 1));

  const startValue = availableValues.find((v: any) => v.period === startPeriod);
  const endValue = availableValues.find((v: any) => v.period === endPeriod);

  if (startValue && endValue) {
    const coefficient = fromDecimal128(endValue.value) / fromDecimal128(startValue.value);
    return {
      minCoefficient: coefficient,
      maxCoefficient: coefficient,
      startValue: startValue.value,
      endValue: endValue.value,
    };
  }

  const recentValues = availableValues
    .sort((a: any, b: any) => a.period.localeCompare(b.period))
    .slice(-6);

  if (recentValues.length < 2) {
    return { minCoefficient: 1, maxCoefficient: 1, startValue: startValue?.value ?? null, endValue: null };
  }

  const monthlyVariations: number[] = [];
  for (let i = 1; i < recentValues.length; i++) {
    const prev = fromDecimal128(recentValues[i - 1].value);
    const curr = fromDecimal128(recentValues[i].value);
    monthlyVariations.push(curr / prev - 1);
  }

  const maxVariation = Math.max(...monthlyVariations);
  const minVariation = Math.min(...monthlyVariations);
  const numPending = pendingPeriods.length;

  let knownCoefficient = 1;
  if (startValue) {
    const lastKnown = recentValues[recentValues.length - 1];
    knownCoefficient = fromDecimal128(lastKnown.value) / fromDecimal128(startValue.value);
  }

  return {
    minCoefficient: knownCoefficient * Math.pow(1 + minVariation, numPending),
    maxCoefficient: knownCoefficient * Math.pow(1 + maxVariation, numPending),
    startValue: startValue?.value ?? null,
    endValue: null,
  };
}

function calculateDailyIndexCoefficients(
  availableValues: any[],
  pendingPeriods: string[],
  periodStart: Date,
  periodEnd: Date,
): CoefficientResult {
  const startPeriod = formatDateISO(periodStart);
  const endPeriod = formatDateISO(periodEnd);

  const startValue = availableValues.find((v: any) => v.period === startPeriod);
  const endValue = availableValues.find((v: any) => v.period === endPeriod);

  if (startValue && endValue) {
    const coefficient = fromDecimal128(endValue.value) / fromDecimal128(startValue.value);
    return { minCoefficient: coefficient, maxCoefficient: coefficient, startValue: startValue.value, endValue: endValue.value };
  }

  const recentValues = availableValues
    .sort((a: any, b: any) => a.period.localeCompare(b.period))
    .slice(-30);

  if (recentValues.length < 2) {
    return { minCoefficient: 1, maxCoefficient: 1, startValue: startValue?.value ?? null, endValue: null };
  }

  const dailyVariations: number[] = [];
  for (let i = 1; i < recentValues.length; i++) {
    const prev = fromDecimal128(recentValues[i - 1].value);
    const curr = fromDecimal128(recentValues[i].value);
    dailyVariations.push(curr / prev - 1);
  }

  const maxDailyVar = Math.max(...dailyVariations);
  const minDailyVar = Math.min(...dailyVariations);

  const lastKnownDate = recentValues[recentValues.length - 1].period;
  const daysRemaining = daysBetween(new Date(lastKnownDate), periodEnd);

  let knownCoefficient = 1;
  if (startValue) {
    const lastKnown = recentValues[recentValues.length - 1];
    knownCoefficient = fromDecimal128(lastKnown.value) / fromDecimal128(startValue.value);
  }

  return {
    minCoefficient: knownCoefficient * Math.pow(1 + minDailyVar, daysRemaining),
    maxCoefficient: knownCoefficient * Math.pow(1 + maxDailyVar, daysRemaining),
    startValue: startValue?.value ?? null,
    endValue: null,
  };
}

// --- Service Functions ---

async function generateAdjustmentsForLease(lease: LeaseDocument): Promise<void> {
  const { startDate, endDate, adjustmentFrequencyMonths, initialRent, adjustmentIndex } = lease;

  const adjustments: any[] = [];
  let currentDate = addMonths(new Date(startDate), adjustmentFrequencyMonths);
  let previousRent = initialRent;

  while (currentDate <= endDate) {
    const periodStart = subtractMonths(currentDate, adjustmentFrequencyMonths);
    const requiredPeriods = getRequiredPeriods(adjustmentIndex, periodStart, currentDate);

    const availableValues = await IndexValue.find({
      indexType: adjustmentIndex,
      period: { $in: requiredPeriods },
    }).lean();

    const availablePeriodSet = new Set(availableValues.map((v) => v.period));
    const pendingPeriods = requiredPeriods.filter((p) => !availablePeriodSet.has(p));

    const { minCoefficient, maxCoefficient, startValue, endValue } =
      calculateCoefficients(adjustmentIndex, availableValues, pendingPeriods, periodStart, currentDate);

    const prevRentNum = typeof previousRent === 'number' ? previousRent : fromDecimal128(previousRent as any);
    const minAmount = prevRentNum * minCoefficient;
    const maxAmount = prevRentNum * maxCoefficient;
    const status = pendingPeriods.length === 0 ? 'confirmed' : 'estimated';

    adjustments.push({
      leaseId: lease._id,
      effectiveDate: new Date(currentDate),
      previousRent: typeof previousRent === 'number' ? toDecimal128(previousRent) : previousRent,
      startIndexValue: startValue,
      endIndexValue: status === 'confirmed' ? endValue : null,
      minCoefficient: toDecimal128(minCoefficient),
      maxCoefficient: toDecimal128(maxCoefficient),
      minAmount: toDecimal128(minAmount),
      maxAmount: toDecimal128(maxAmount),
      pendingPeriods,
      status,
    });

    previousRent = toDecimal128(maxAmount) as any;
    currentDate = addMonths(currentDate, adjustmentFrequencyMonths);
  }

  if (adjustments.length > 0) {
    await RentAdjustment.insertMany(adjustments);
  }
}

async function listByLease(
  userId: string,
  leaseId: string,
  role: string,
  query: { page?: number; limit?: number },
): Promise<PaginatedResult<AdjustmentDTO>> {
  const leaseQuery: Record<string, unknown> = { _id: leaseId };
  if (role === 'landlord') leaseQuery.landlordId = userId;
  else leaseQuery.tenantId = userId;

  const lease = await Lease.findOne(leaseQuery);
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = getSkip(page, limit);

  const [adjustments, total] = await Promise.all([
    RentAdjustment.find({ leaseId })
      .sort({ effectiveDate: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    RentAdjustment.countDocuments({ leaseId }),
  ]);

  return paginate(adjustments.map(toAdjustmentDTO), total, page, limit);
}

async function getById(userId: string, leaseId: string, adjustmentId: string, role: string): Promise<AdjustmentDTO> {
  const leaseQuery: Record<string, unknown> = { _id: leaseId };
  if (role === 'landlord') leaseQuery.landlordId = userId;
  else leaseQuery.tenantId = userId;

  const lease = await Lease.findOne(leaseQuery);
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  const adjustment = await RentAdjustment.findOne({ _id: adjustmentId, leaseId }).lean();
  if (!adjustment) throw AppError.notFound('Ajuste no encontrado', 'ADJUSTMENT_NOT_FOUND');

  return toAdjustmentDTO(adjustment);
}

export const adjustmentService = {
  generateAdjustmentsForLease,
  listByLease,
  getById,
  calculateCoefficients,
  toAdjustmentDTO,
};
