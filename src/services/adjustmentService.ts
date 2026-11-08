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

    // When exact periods are missing, fetch recent values for estimation
    let valuesForCalculation = availableValues;
    if (pendingPeriods.length > 0) {
      const recentLimit = adjustmentIndex === 'IPC' ? 12 : 60;
      const recentValues = await IndexValue.find({ indexType: adjustmentIndex })
        .sort({ period: -1 })
        .limit(recentLimit)
        .lean();
      const existingPeriods = new Set(availableValues.map((v) => v.period));
      for (const rv of recentValues) {
        if (!existingPeriods.has(rv.period)) {
          valuesForCalculation.push(rv);
        }
      }
    }

    const { minCoefficient, maxCoefficient, startValue, endValue } =
      calculateCoefficients(adjustmentIndex, valuesForCalculation, pendingPeriods, periodStart, currentDate);

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

// --- Adjustment Summary ---

interface IndexStatsDTO {
  lastValue: string;
  lastDate: string;
  avgMonthlyVariation: number;
  last3MonthVariation: number;
  last6MonthVariation: number;
  trend: Array<{ period: string; value: number }>;
}

interface TimelineEntryDTO {
  effectiveDate: string;
  status: string;
  previousRent: string;
  minAmount: string;
  maxAmount: string;
  minCoefficient: string;
  maxCoefficient: string;
  pendingPeriods: string[];
  startIndexValue: string | null;
  endIndexValue: string | null;
  variation: number;
}

interface AdjustmentSummaryDTO {
  lease: {
    startDate: string;
    endDate: string;
    initialRent: string;
    adjustmentIndex: string;
    adjustmentFrequencyMonths: number;
  };
  nextAdjustment: AdjustmentDTO | null;
  daysUntilNext: number | null;
  currentRent: string;
  totalVariation: number;
  indexStats: IndexStatsDTO;
  timeline: TimelineEntryDTO[];
  contractProgress: number;
}

function computeMonthlyVariations(values: Array<{ period: string; value: any }>, isDaily: boolean): number[] {
  if (values.length < 2) return [];
  const sorted = [...values].sort((a, b) => a.period.localeCompare(b.period));

  if (!isDaily) {
    // Monthly index: variation between consecutive months
    const vars: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = fromDecimal128(sorted[i - 1].value);
      const curr = fromDecimal128(sorted[i].value);
      if (prev > 0) vars.push((curr / prev - 1) * 100);
    }
    return vars;
  }

  // Daily index: compute monthly variation by sampling ~30 day intervals
  const vars: number[] = [];
  const first = sorted[0];
  let refIdx = 0;
  for (let i = 1; i < sorted.length; i++) {
    const daysDiff = daysBetween(new Date(sorted[refIdx].period), new Date(sorted[i].period));
    if (daysDiff >= 28) {
      const prev = fromDecimal128(sorted[refIdx].value);
      const curr = fromDecimal128(sorted[i].value);
      if (prev > 0) vars.push((curr / prev - 1) * 100);
      refIdx = i;
    }
  }
  return vars;
}

function computePeriodVariation(values: Array<{ period: string; value: any }>, months: number): number {
  if (values.length < 2) return 0;
  const sorted = [...values].sort((a, b) => a.period.localeCompare(b.period));
  const last = sorted[sorted.length - 1];
  const lastDate = new Date(last.period);
  const targetDate = subtractMonths(lastDate, months);
  const targetStr = targetDate.toISOString().split('T')[0];

  // Find the value closest to targetDate
  let closest = sorted[0];
  for (const v of sorted) {
    if (v.period <= targetStr) closest = v;
    else break;
  }

  const startVal = fromDecimal128(closest.value);
  const endVal = fromDecimal128(last.value);
  if (startVal <= 0) return 0;
  return (endVal / startVal - 1) * 100;
}

async function getAdjustmentSummary(userId: string, leaseId: string, role?: string): Promise<AdjustmentSummaryDTO> {
  const query: Record<string, unknown> = { _id: leaseId };
  if (role === 'landlord') query.landlordId = userId;
  else query.tenantId = userId;
  const lease = await Lease.findOne(query);
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  const adjustments = await RentAdjustment.find({ leaseId })
    .sort({ effectiveDate: 1 })
    .lean();

  const now = new Date();
  const nextAdj = adjustments.find((a) => a.effectiveDate > now) ?? null;
  const daysUntilNext = nextAdj ? daysBetween(now, nextAdj.effectiveDate) : null;

  // Current rent = previousRent of next adjustment, or maxAmount of last past adjustment, or initialRent
  const pastAdjs = adjustments.filter((a) => a.effectiveDate <= now);
  const lastPast = pastAdjs[pastAdjs.length - 1];
  const currentRent = nextAdj
    ? decimalToString(nextAdj.previousRent)
    : lastPast
      ? decimalToString(lastPast.maxAmount)
      : decimalToString(lease.initialRent);

  const initialRentNum = fromDecimal128(lease.initialRent);
  const currentRentNum = parseFloat(currentRent);
  const totalVariation = initialRentNum > 0 ? (currentRentNum / initialRentNum - 1) * 100 : 0;

  // Index stats: fetch recent values
  const isDaily = lease.adjustmentIndex !== 'IPC';
  const recentLimit = isDaily ? 365 : 12;
  const recentValues = await IndexValue.find({ indexType: lease.adjustmentIndex })
    .sort({ period: -1 })
    .limit(recentLimit)
    .lean();

  const monthlyVars = computeMonthlyVariations(recentValues, isDaily);
  const avgMonthlyVariation = monthlyVars.length > 0
    ? monthlyVars.reduce((s, v) => s + v, 0) / monthlyVars.length
    : 0;

  const last3MonthVariation = computePeriodVariation(recentValues, 3);
  const last6MonthVariation = computePeriodVariation(recentValues, 6);

  const sortedRecent = [...recentValues].sort((a, b) => a.period.localeCompare(b.period));
  const lastVal = sortedRecent[sortedRecent.length - 1];

  // Trend: sample ~12 points for the chart
  const trendSource = isDaily
    ? sortedRecent.filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 12)) === 0 || i === arr.length - 1)
    : sortedRecent;
  const trend = trendSource.slice(-12).map((v) => ({
    period: v.period,
    value: fromDecimal128(v.value),
  }));

  const indexStats: IndexStatsDTO = {
    lastValue: lastVal ? fromDecimal128(lastVal.value).toFixed(2) : '0',
    lastDate: lastVal?.period ?? '',
    avgMonthlyVariation: Math.round(avgMonthlyVariation * 100) / 100,
    last3MonthVariation: Math.round(last3MonthVariation * 100) / 100,
    last6MonthVariation: Math.round(last6MonthVariation * 100) / 100,
    trend,
  };

  // Timeline
  const timeline: TimelineEntryDTO[] = adjustments.map((a) => {
    const minCoef = fromDecimal128(a.minCoefficient);
    const maxCoef = fromDecimal128(a.maxCoefficient);
    const avgVariation = ((minCoef + maxCoef) / 2 - 1) * 100;
    return {
      effectiveDate: a.effectiveDate.toISOString(),
      status: a.status,
      previousRent: decimalToString(a.previousRent),
      minAmount: decimalToString(a.minAmount),
      maxAmount: decimalToString(a.maxAmount),
      minCoefficient: decimalToString(a.minCoefficient),
      maxCoefficient: decimalToString(a.maxCoefficient),
      pendingPeriods: a.pendingPeriods || [],
      startIndexValue: a.startIndexValue ? decimalToString(a.startIndexValue) : null,
      endIndexValue: a.endIndexValue ? decimalToString(a.endIndexValue) : null,
      variation: Math.round(avgVariation * 100) / 100,
    };
  });

  // Contract progress
  const totalDays = daysBetween(lease.startDate, lease.endDate);
  const elapsed = daysBetween(lease.startDate, now);
  const contractProgress = totalDays > 0 ? Math.max(0, Math.min(100, Math.round((elapsed / totalDays) * 100))) : 0;

  return {
    lease: {
      startDate: lease.startDate.toISOString(),
      endDate: lease.endDate.toISOString(),
      initialRent: decimalToString(lease.initialRent),
      adjustmentIndex: lease.adjustmentIndex,
      adjustmentFrequencyMonths: lease.adjustmentFrequencyMonths,
    },
    nextAdjustment: nextAdj ? toAdjustmentDTO(nextAdj) : null,
    daysUntilNext,
    currentRent,
    totalVariation: Math.round(totalVariation * 100) / 100,
    indexStats,
    timeline,
    contractProgress,
  };
}

// --- Index Comparison ---

interface IndexEvolutionDTO {
  currentRent: string;
  totalVariation: string;
  totalCollected: string;
  history: Array<{ date: string; rent: string }>;
}

interface IndexComparisonDTO {
  contractedIndex: string;
  frequencyMonths: number;
  startDate: string;
  IPC: IndexEvolutionDTO;
  ICL: IndexEvolutionDTO;
  UVA: IndexEvolutionDTO;
}

/**
 * Simulate the rent evolution for one index over a window of adjustment dates.
 * `baseRent` is the rent at the start of the window (same for all indices).
 * `adjustmentDates` are the lease-frequency-aligned dates that fall within the window.
 */
async function simulateIndexEvolution(
  baseRent: number,
  windowStart: Date,
  windowEnd: Date,
  adjustmentDates: Date[],
  frequencyMonths: number,
  indexType: 'IPC' | 'ICL' | 'UVA',
): Promise<IndexEvolutionDTO> {
  const history: Array<{ date: string; rent: string }> = [
    { date: windowStart.toISOString(), rent: baseRent.toFixed(2) },
  ];

  let currentRent = baseRent;
  let totalCollected = 0;
  let previousDate = windowStart;

  for (const adjDate of adjustmentDates) {
    // Accumulate income for period before this adjustment
    const periodEnd = adjDate < windowEnd ? adjDate : windowEnd;
    if (periodEnd > previousDate) {
      const months = (periodEnd.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
      totalCollected += currentRent * months;
    }

    if (adjDate > windowEnd) break;

    // Calculate coefficient for this adjustment period
    const periodStart = subtractMonths(adjDate, frequencyMonths);
    const requiredPeriods = getRequiredPeriods(indexType, periodStart, adjDate);
    const availableValues = await IndexValue.find({
      indexType,
      period: { $in: requiredPeriods },
    }).lean();

    let valuesForCalculation = [...availableValues];
    const availablePeriodSet = new Set(availableValues.map((v) => v.period));
    const pendingPeriods = requiredPeriods.filter((p) => !availablePeriodSet.has(p));

    if (pendingPeriods.length > 0) {
      const recentLimit = indexType === 'IPC' ? 12 : 60;
      const recentValues = await IndexValue.find({ indexType })
        .sort({ period: -1 })
        .limit(recentLimit)
        .lean();
      const existingPeriods = new Set(valuesForCalculation.map((v) => v.period));
      for (const rv of recentValues) {
        if (!existingPeriods.has(rv.period)) valuesForCalculation.push(rv);
      }
    }

    const { maxCoefficient } = calculateCoefficients(
      indexType, valuesForCalculation, pendingPeriods, periodStart, adjDate,
    );

    currentRent = currentRent * maxCoefficient;
    history.push({ date: adjDate.toISOString(), rent: currentRent.toFixed(2) });
    previousDate = adjDate;
  }

  // Remaining income from last adjustment to window end
  if (windowEnd > previousDate) {
    const months = (windowEnd.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    totalCollected += currentRent * months;
    // Add closing point so the chart extends to the contract end
    history.push({ date: windowEnd.toISOString(), rent: currentRent.toFixed(2) });
  }

  const totalVariation = baseRent > 0 ? (currentRent / baseRent - 1) * 100 : 0;

  return {
    currentRent: currentRent.toFixed(2),
    totalVariation: totalVariation.toFixed(2),
    totalCollected: Math.round(totalCollected).toFixed(2),
    history,
  };
}

async function compareIndices(userId: string, leaseId: string): Promise<IndexComparisonDTO> {
  const lease = await Lease.findOne({ _id: leaseId, landlordId: userId });
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  const now = new Date();
  const leaseStart = new Date(lease.startDate);
  const leaseEnd = new Date(lease.endDate);

  // Window: full contract life (up to today if still active)
  const windowStart = leaseStart;
  const windowEnd = leaseEnd < now ? leaseEnd : now;

  const initialRentNum = fromDecimal128(lease.initialRent);

  // All adjustment dates within the contract period up to now
  const adjustmentDates: Date[] = [];
  let adjDate = addMonths(leaseStart, lease.adjustmentFrequencyMonths);
  while (adjDate <= leaseEnd && adjDate <= windowEnd) {
    adjustmentDates.push(new Date(adjDate));
    adjDate = addMonths(adjDate, lease.adjustmentFrequencyMonths);
  }

  const indices = ['IPC', 'ICL', 'UVA'] as const;
  const results = await Promise.all(
    indices.map((idx) =>
      simulateIndexEvolution(initialRentNum, windowStart, windowEnd, adjustmentDates, lease.adjustmentFrequencyMonths, idx),
    ),
  );

  return {
    contractedIndex: lease.adjustmentIndex,
    frequencyMonths: lease.adjustmentFrequencyMonths,
    startDate: windowStart.toISOString(),
    IPC: results[0],
    ICL: results[1],
    UVA: results[2],
  };
}

export const adjustmentService = {
  generateAdjustmentsForLease,
  listByLease,
  getById,
  getAdjustmentSummary,
  compareIndices,
  calculateCoefficients,
  simulateIndexEvolution,
  toAdjustmentDTO,
};
