import { Unit } from '../models/Unit.js';
import { Lease } from '../models/Lease.js';
import { RentAdjustment } from '../models/RentAdjustment.js';
import { Expense } from '../models/Expense.js';
import { IndexValue } from '../models/IndexValue.js';
import { AppError } from '../utils/AppError.js';
import { fromDecimal128, decimalToString } from '../utils/decimal.js';
import { addMonths, subtractMonths, formatPeriod, daysBetween } from '../utils/dateUtils.js';
import { dollarService } from './dollarService.js';

interface Warning {
  code: string;
  message: string;
}

interface MonthlyRentEntry {
  month: string;
  rentArs: number;
  expensesArs: number;
  netArs: number;
  avgDolarOficialVenta: number | null;
  avgDolarBlueVenta: number | null;
  netUsdOficial: number | null;
  netUsdBlue: number | null;
  daysOccupied: number;
  totalDays: number;
  leaseIds: string[];
}

interface DollarComparison {
  rentIncreasePercent: number;
  devaluationOficialPercent: number;
  devaluationBluePercent: number;
  netVsOficialPercent: number;
  netVsBluePercent: number;
  beatsDollarOficial: boolean;
  beatsDollarBlue: boolean;
}

interface AnnualYieldResult {
  unitId: string;
  year: number;
  address: string;
  referenceValueUsd: number | null;
  calculatedUpToMonth: string;
  isIncompleteYear: boolean;
  occupiedMonths: number;
  vacantMonths: number;
  totalRentArs: number;
  monthlyRent: MonthlyRentEntry[];
  totalExpensesArs: number;
  hasExpenses: boolean;
  expensesByCategory: Array<{ category: string; total: number }>;
  netIncomeArs: number;
  netIncomeUsdOficial: number;
  netIncomeUsdBlue: number;
  dollarComparison: DollarComparison | null;
  ipcAdjustedVariation: number | null;
  inflationPercent: number | null;
  rentIncreasePercent: number | null;
  dollarRates: Array<{ month: string; avgOficialVenta: number | null; avgBlueVenta: number | null }>;
  warnings: Warning[];
}

function formatUnitAddress(unit: any): string {
  const a = unit.address;
  let addr = `${a.street} ${a.number}`;
  if (a.floor) addr += `, ${a.floor}.°`;
  if (a.apartment) addr += ` ${a.apartment}`;
  return addr;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

interface RentSegment {
  from: Date;
  to: Date;
  rent: number;
}

async function buildRentTimeline(lease: any): Promise<RentSegment[]> {
  const leaseStart = new Date(lease.startDate);
  const leaseEnd = new Date(lease.endDate);
  const effectiveEnd = lease.endedAt ? new Date(lease.endedAt) : leaseEnd;
  const initialRent = fromDecimal128(lease.initialRent);

  const adjustments = await RentAdjustment.find({ leaseId: lease._id })
    .sort({ effectiveDate: 1 })
    .lean();

  const segments: RentSegment[] = [];
  let currentRent = initialRent;
  let segmentStart = leaseStart;

  for (const adj of adjustments) {
    const adjDate = new Date(adj.effectiveDate);
    if (adjDate > effectiveEnd) break;
    if (adjDate <= segmentStart) {
      currentRent = fromDecimal128(adj.maxAmount);
      continue;
    }

    segments.push({
      from: segmentStart,
      to: new Date(adjDate.getTime() - 1),
      rent: currentRent,
    });

    currentRent = fromDecimal128(adj.maxAmount);
    segmentStart = adjDate;
  }

  if (segmentStart <= effectiveEnd) {
    segments.push({
      from: segmentStart,
      to: effectiveEnd,
      rent: currentRent,
    });
  }

  return segments;
}

function calculateMonthRent(
  year: number,
  month: number,
  allSegments: Array<{ leaseId: string; segments: RentSegment[] }>,
  warnings: Warning[],
): { rentArs: number; daysOccupied: number; leaseIds: string[] } {
  const totalDays = daysInMonth(year, month);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month - 1, totalDays, 23, 59, 59, 999));

  const dayRents: Array<{ day: number; rent: number; leaseId: string }[]> = [];
  for (let d = 1; d <= totalDays; d++) {
    dayRents.push([]);
  }

  for (const { leaseId, segments } of allSegments) {
    for (const seg of segments) {
      if (seg.to < monthStart || seg.from > monthEnd) continue;

      const startDay = seg.from <= monthStart ? 1 : seg.from.getUTCDate();
      const endDay = seg.to >= monthEnd ? totalDays : seg.to.getUTCDate();

      for (let d = startDay; d <= endDay; d++) {
        dayRents[d - 1].push({ day: d, rent: seg.rent, leaseId });
      }
    }
  }

  const leaseIdSet = new Set<string>();
  let hasOverlap = false;
  let totalRent = 0;
  let occupiedDays = 0;

  for (let d = 0; d < totalDays; d++) {
    const entries = dayRents[d];
    if (entries.length === 0) continue;

    occupiedDays++;

    if (entries.length > 1) {
      hasOverlap = true;
      const best = entries.reduce((a, b) => (a.rent > b.rent ? a : b));
      totalRent += best.rent / totalDays;
      leaseIdSet.add(best.leaseId);
    } else {
      totalRent += entries[0].rent / totalDays;
      leaseIdSet.add(entries[0].leaseId);
    }
  }

  if (hasOverlap) {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const existing = warnings.find((w) => w.code === 'OVERLAPPING_LEASES' && w.message.includes(monthStr));
    if (!existing) {
      warnings.push({
        code: 'OVERLAPPING_LEASES',
        message: `Se detectaron contratos superpuestos en ${monthStr}. Se usó el contrato con mayor alquiler para evitar duplicar ingresos.`,
      });
    }
  }

  return {
    rentArs: totalRent,
    daysOccupied: occupiedDays,
    leaseIds: [...leaseIdSet],
  };
}

async function calculateAnnualYield(
  landlordId: string,
  unitId: string,
  year: number,
): Promise<AnnualYieldResult> {
  const unit = await Unit.findOne({ _id: unitId, landlordId }).lean();
  if (!unit) throw AppError.notFound('Unidad no encontrada', 'UNIT_NOT_FOUND');

  const warnings: Warning[] = [];
  const now = new Date();
  const isIncompleteYear = year === now.getFullYear();
  const lastMonth = isIncompleteYear ? now.getMonth() : 12;

  if (isIncompleteYear) {
    warnings.push({
      code: 'INCOMPLETE_YEAR',
      message: `Año en curso. Datos calculados hasta ${new Date(year, lastMonth - 1).toLocaleDateString('es-AR', { month: 'long' })}.`,
    });
  }

  const calculatedUpToMonth = `${year}-${String(lastMonth).padStart(2, '0')}`;

  const referenceValueUsd = unit.referenceValue ? fromDecimal128(unit.referenceValue) : null;
  if (referenceValueUsd === null) {
    warnings.push({
      code: 'NO_REFERENCE_VALUE',
      message: 'No se cargó el valor de referencia de la propiedad. No se puede calcular la rentabilidad.',
    });
  }

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const leases = await Lease.find({
    unitId,
    status: { $in: ['active', 'ended'] },
    startDate: { $lte: yearEnd },
    endDate: { $gte: yearStart },
  }).lean();

  if (leases.length === 0) {
    warnings.push({
      code: 'NO_CONTRACTS',
      message: `No hubo contratos activos en ${year}.`,
    });
  }

  const allSegments: Array<{ leaseId: string; segments: RentSegment[] }> = [];
  for (const lease of leases) {
    const segments = await buildRentTimeline(lease);
    allSegments.push({ leaseId: lease._id.toString(), segments });
  }

  const expenses = await Expense.find({
    unitId,
    paidBy: 'landlord',
    date: { $gte: yearStart, $lte: yearEnd },
  }).lean();

  const hasExpenses = expenses.length > 0;
  if (!hasExpenses && leases.length > 0) {
    warnings.push({
      code: 'NO_EXPENSES',
      message: `No hay gastos cargados para esta propiedad en ${year}. El resumen muestra solo ingresos por alquiler.`,
    });
  }

  const dollarAverages = await dollarService.getMonthlyAverages(year);

  const monthlyRent: MonthlyRentEntry[] = [];
  let totalRentArs = 0;
  let totalExpensesArs = 0;
  let netUsdOficialAccum = 0;
  let netUsdBlueAccum = 0;
  let totalOccupiedDays = 0;
  let totalCalcDays = 0;

  for (let m = 1; m <= lastMonth; m++) {
    const monthStr = `${year}-${String(m).padStart(2, '0')}`;
    const totalDays = daysInMonth(year, m);
    totalCalcDays += totalDays;

    const { rentArs, daysOccupied, leaseIds } = calculateMonthRent(year, m, allSegments, warnings);
    totalOccupiedDays += daysOccupied;

    const monthExpenses = expenses.filter((e) => {
      const d = new Date(e.date);
      return d.getUTCFullYear() === year && d.getUTCMonth() === m - 1;
    });
    const expensesArs = monthExpenses.reduce((sum, e) => sum + fromDecimal128(e.amount), 0);

    const netArs = rentArs - expensesArs;
    totalRentArs += rentArs;
    totalExpensesArs += expensesArs;

    const dollarMonth = dollarAverages.find((d) => d.month === monthStr);
    const avgOficial = dollarMonth?.avgOficialVenta ?? null;
    const avgBlue = dollarMonth?.avgBlueVenta ?? null;

    let netUsdOficial: number | null = null;
    let netUsdBlue: number | null = null;

    if (avgOficial !== null && avgOficial > 0) {
      netUsdOficial = netArs / avgOficial;
      netUsdOficialAccum += netUsdOficial;
    }
    if (avgBlue !== null && avgBlue > 0) {
      netUsdBlue = netArs / avgBlue;
      netUsdBlueAccum += netUsdBlue;
    }

    if ((avgOficial === null || avgBlue === null) && (rentArs > 0 || expensesArs > 0)) {
      const existing = warnings.find((w) => w.code === 'MISSING_DOLLAR_RATE' && w.message.includes(monthStr));
      if (!existing) {
        warnings.push({
          code: 'MISSING_DOLLAR_RATE',
          message: `No se encontró cotización del dólar para ${monthStr}. Ese mes no se incluyó en las conversiones a USD.`,
        });
      }
    }

    monthlyRent.push({
      month: monthStr,
      rentArs: Math.round(rentArs * 100) / 100,
      expensesArs: Math.round(expensesArs * 100) / 100,
      netArs: Math.round(netArs * 100) / 100,
      avgDolarOficialVenta: avgOficial !== null ? Math.round(avgOficial * 100) / 100 : null,
      avgDolarBlueVenta: avgBlue !== null ? Math.round(avgBlue * 100) / 100 : null,
      netUsdOficial: netUsdOficial !== null ? Math.round(netUsdOficial * 100) / 100 : null,
      netUsdBlue: netUsdBlue !== null ? Math.round(netUsdBlue * 100) / 100 : null,
      daysOccupied,
      totalDays,
      leaseIds,
    });
  }

  const occupiedMonths = Math.round((totalOccupiedDays / Math.max(totalCalcDays, 1)) * lastMonth * 100) / 100;
  const vacantMonths = Math.round((lastMonth - occupiedMonths) * 100) / 100;

  const netIncomeArs = totalRentArs - totalExpensesArs;

  const catGroups: Record<string, number> = {};
  for (const e of expenses) {
    catGroups[e.category] = (catGroups[e.category] || 0) + fromDecimal128(e.amount);
  }
  const expensesByCategory = Object.entries(catGroups).map(([category, total]) => ({
    category,
    total: Math.round(total * 100) / 100,
  }));

  const dollarComparison = buildDollarComparison(monthlyRent, dollarAverages, warnings);
  const ipcResult = await buildIpcAdjustedVariation(monthlyRent, warnings);

  return {
    unitId: unit._id.toString(),
    year,
    address: formatUnitAddress(unit),
    referenceValueUsd,
    calculatedUpToMonth,
    isIncompleteYear,
    occupiedMonths,
    vacantMonths,
    totalRentArs: Math.round(totalRentArs * 100) / 100,
    monthlyRent,
    totalExpensesArs: Math.round(totalExpensesArs * 100) / 100,
    hasExpenses,
    expensesByCategory,
    netIncomeArs: Math.round(netIncomeArs * 100) / 100,
    netIncomeUsdOficial: Math.round(netUsdOficialAccum * 100) / 100,
    netIncomeUsdBlue: Math.round(netUsdBlueAccum * 100) / 100,
    dollarComparison,
    ipcAdjustedVariation: ipcResult?.ipcAdjustedVariation ?? null,
    inflationPercent: ipcResult?.inflationPercent ?? null,
    rentIncreasePercent: ipcResult?.rentIncreasePercent ?? null,
    dollarRates: dollarAverages.slice(0, lastMonth).map((d) => ({
      month: d.month,
      avgOficialVenta: d.avgOficialVenta !== null ? Math.round(d.avgOficialVenta * 100) / 100 : null,
      avgBlueVenta: d.avgBlueVenta !== null ? Math.round(d.avgBlueVenta * 100) / 100 : null,
    })),
    warnings,
  };
}

async function buildIpcAdjustedVariation(
  monthlyRent: MonthlyRentEntry[],
  warnings: Warning[],
): Promise<{ ipcAdjustedVariation: number; inflationPercent: number; rentIncreasePercent: number } | null> {
  const occupied = monthlyRent.filter((m) => m.rentArs > 0);
  if (occupied.length < 2) return null;

  const first = occupied[0];
  const last = occupied[occupied.length - 1];

  const rentIncreasePercent = ((last.rentArs / first.rentArs) - 1) * 100;

  const firstPeriod = first.month;
  const lastPeriod = last.month;

  const [firstIpc, lastIpc] = await Promise.all([
    IndexValue.findOne({ indexType: 'IPC', period: firstPeriod }).lean(),
    IndexValue.findOne({ indexType: 'IPC', period: lastPeriod }).lean(),
  ]);

  if (!firstIpc || !lastIpc) {
    warnings.push({
      code: 'MISSING_IPC_DATA',
      message: 'No hay datos de IPC suficientes para calcular la variación real ajustada por inflación.',
    });
    return null;
  }

  const inflationPercent = (fromDecimal128(lastIpc.value) / fromDecimal128(firstIpc.value) - 1) * 100;
  const ipcAdjustedVariation = rentIncreasePercent - inflationPercent;

  return {
    ipcAdjustedVariation: Math.round(ipcAdjustedVariation * 100) / 100,
    inflationPercent: Math.round(inflationPercent * 100) / 100,
    rentIncreasePercent: Math.round(rentIncreasePercent * 100) / 100,
  };
}

function buildDollarComparison(
  monthlyRent: MonthlyRentEntry[],
  dollarAverages: Array<{ month: string; avgOficialVenta: number | null; avgBlueVenta: number | null }>,
  warnings: Warning[],
): DollarComparison | null {
  const occupied = monthlyRent.filter((m) => m.rentArs > 0);
  if (occupied.length < 2) return null;

  const first = occupied[0];
  const last = occupied[occupied.length - 1];

  const rentIncreasePercent = ((last.rentArs / first.rentArs) - 1) * 100;

  const firstDollar = dollarAverages.find((d) => d.month === first.month);
  const lastDollar = dollarAverages.find((d) => d.month === last.month);

  if (!firstDollar?.avgOficialVenta || !lastDollar?.avgOficialVenta ||
      !firstDollar?.avgBlueVenta || !lastDollar?.avgBlueVenta) {
    warnings.push({
      code: 'MISSING_DOLLAR_COMPARISON',
      message: 'No hay suficientes cotizaciones del dólar para calcular la comparación.',
    });
    return null;
  }

  const devaluationOficialPercent = ((lastDollar.avgOficialVenta / firstDollar.avgOficialVenta) - 1) * 100;
  const devaluationBluePercent = ((lastDollar.avgBlueVenta / firstDollar.avgBlueVenta) - 1) * 100;

  const netVsOficialPercent = rentIncreasePercent - devaluationOficialPercent;
  const netVsBluePercent = rentIncreasePercent - devaluationBluePercent;

  return {
    rentIncreasePercent: Math.round(rentIncreasePercent * 100) / 100,
    devaluationOficialPercent: Math.round(devaluationOficialPercent * 100) / 100,
    devaluationBluePercent: Math.round(devaluationBluePercent * 100) / 100,
    netVsOficialPercent: Math.round(netVsOficialPercent * 100) / 100,
    netVsBluePercent: Math.round(netVsBluePercent * 100) / 100,
    beatsDollarOficial: netVsOficialPercent >= 0,
    beatsDollarBlue: netVsBluePercent >= 0,
  };
}

async function calculateYield(landlordId: string, unitId: string) {
  const { PaymentReceipt } = await import('../models/PaymentReceipt.js');
  const unit = await Unit.findOne({ _id: unitId, landlordId });
  if (!unit) throw AppError.notFound('Unidad no encontrada', 'UNIT_NOT_FOUND');
  if (!unit.referenceValue) {
    throw AppError.badRequest(
      'Debe definir un valor de referencia de la propiedad para calcular el rendimiento',
      'NO_REFERENCE_VALUE',
    );
  }

  const referenceValue = fromDecimal128(unit.referenceValue);
  const now = new Date();
  const twelveMonthsAgo = subtractMonths(now, 12);

  const leases = await Lease.find({ unitId }).lean();
  const leaseIds = leases.map((l) => l._id);

  const confirmedPayments = await PaymentReceipt.find({
    leaseId: { $in: leaseIds },
    status: 'confirmed',
    paymentDate: { $gte: twelveMonthsAgo, $lte: now },
  }).lean();

  const grossIncome = confirmedPayments.reduce((sum: number, p: any) => sum + fromDecimal128(p.amount), 0);

  const expenses = await Expense.find({
    unitId,
    date: { $gte: twelveMonthsAgo, $lte: now },
  }).lean();

  const totalExpenses = expenses.reduce((sum, e) => sum + fromDecimal128(e.amount), 0);
  const netIncome = grossIncome - totalExpenses;
  const grossYield = referenceValue > 0 ? (grossIncome / referenceValue) * 100 : 0;
  const netYield = referenceValue > 0 ? (netIncome / referenceValue) * 100 : 0;

  const inflationRate = await calculateInflationRate(twelveMonthsAgo, now);
  const realYield = inflationRate !== 0
    ? ((1 + netYield / 100) / (1 + inflationRate / 100) - 1) * 100
    : netYield;

  const vacancyMonths = calculateVacancyMonths(leases, twelveMonthsAgo, now);
  const monthlyBreakdown = buildMonthlyBreakdown(confirmedPayments, expenses, twelveMonthsAgo, now);
  const expensesByCategory = groupExpensesByCategory(expenses);

  return {
    unitId: unit._id.toString(),
    period: { from: twelveMonthsAgo.toISOString(), to: now.toISOString() },
    referenceValue: decimalToString(unit.referenceValue),
    grossIncome: grossIncome.toFixed(2),
    totalExpenses: totalExpenses.toFixed(2),
    netIncome: netIncome.toFixed(2),
    grossYield: grossYield.toFixed(2),
    netYield: netYield.toFixed(2),
    realYield: realYield.toFixed(2),
    inflationRate: inflationRate.toFixed(2),
    monthlyBreakdown,
    expensesByCategory,
    vacancyMonths,
  };
}

async function calculateInflationRate(from: Date, to: Date): Promise<number> {
  const fromPeriod = formatPeriod(from);
  const toPeriod = formatPeriod(subtractMonths(to, 1));
  const [startIpc, endIpc] = await Promise.all([
    IndexValue.findOne({ indexType: 'IPC', period: fromPeriod }).lean(),
    IndexValue.findOne({ indexType: 'IPC', period: toPeriod }).lean(),
  ]);
  if (!startIpc || !endIpc) return 0;
  return (fromDecimal128(endIpc.value) / fromDecimal128(startIpc.value) - 1) * 100;
}

function calculateVacancyMonths(leases: any[], from: Date, to: Date): number {
  let coveredDays = 0;
  const totalDays = daysBetween(from, to);
  for (const lease of leases) {
    if (lease.status === 'draft') continue;
    const leaseStart = new Date(Math.max(new Date(lease.startDate).getTime(), from.getTime()));
    const leaseEnd = lease.endedAt
      ? new Date(Math.min(new Date(lease.endedAt).getTime(), to.getTime()))
      : new Date(Math.min(new Date(lease.endDate).getTime(), to.getTime()));
    if (leaseEnd > leaseStart) coveredDays += daysBetween(leaseStart, leaseEnd);
  }
  return Math.round(Math.max(0, totalDays - coveredDays) / 30);
}

function buildMonthlyBreakdown(payments: any[], expenses: any[], from: Date, to: Date) {
  const months: Array<{ month: string; income: string; expenses: string; net: string }> = [];
  const current = new Date(from);
  while (current <= to) {
    const month = formatPeriod(current);
    const monthIncome = payments
      .filter((p: any) => p.period === month || formatPeriod(new Date(p.paymentDate)) === month)
      .reduce((sum: number, p: any) => sum + fromDecimal128(p.amount), 0);
    const monthExpenses = expenses
      .filter((e) => formatPeriod(new Date(e.date)) === month)
      .reduce((sum, e) => sum + fromDecimal128(e.amount), 0);
    months.push({
      month,
      income: monthIncome.toFixed(2),
      expenses: monthExpenses.toFixed(2),
      net: (monthIncome - monthExpenses).toFixed(2),
    });
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

function groupExpensesByCategory(expenses: any[]): Array<{ category: string; total: string }> {
  const groups: Record<string, number> = {};
  for (const e of expenses) {
    groups[e.category] = (groups[e.category] || 0) + fromDecimal128(e.amount);
  }
  return Object.entries(groups).map(([category, total]) => ({
    category,
    total: total.toFixed(2),
  }));
}

export const yieldService = {
  calculateYield,
  calculateAnnualYield,
};
