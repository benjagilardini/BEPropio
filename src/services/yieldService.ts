import { Unit } from '../models/Unit.js';
import { Lease } from '../models/Lease.js';
import { PaymentReceipt } from '../models/PaymentReceipt.js';
import { Expense } from '../models/Expense.js';
import { IndexValue } from '../models/IndexValue.js';
import { AppError } from '../utils/AppError.js';
import { fromDecimal128, decimalToString } from '../utils/decimal.js';
import { subtractMonths, formatPeriod, daysBetween } from '../utils/dateUtils.js';

interface MonthlyBreakdownEntry {
  month: string;
  income: string;
  expenses: string;
  net: string;
}

interface YieldResult {
  unitId: string;
  period: { from: string; to: string };
  referenceValue: string;
  grossIncome: string;
  totalExpenses: string;
  netIncome: string;
  grossYield: string;
  netYield: string;
  realYield: string;
  inflationRate: string;
  monthlyBreakdown: MonthlyBreakdownEntry[];
  expensesByCategory: Array<{ category: string; total: string }>;
  vacancyMonths: number;
}

async function calculateYield(landlordId: string, unitId: string): Promise<YieldResult> {
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

  // Get confirmed payments
  const leases = await Lease.find({ unitId }).lean();
  const leaseIds = leases.map((l) => l._id);

  const confirmedPayments = await PaymentReceipt.find({
    leaseId: { $in: leaseIds },
    status: 'confirmed',
    paymentDate: { $gte: twelveMonthsAgo, $lte: now },
  }).lean();

  const grossIncome = confirmedPayments.reduce((sum, p) => sum + fromDecimal128(p.amount), 0);

  // Get expenses
  const expenses = await Expense.find({
    unitId,
    date: { $gte: twelveMonthsAgo, $lte: now },
  }).lean();

  const totalExpenses = expenses.reduce((sum, e) => sum + fromDecimal128(e.amount), 0);

  // Calculate yields
  const netIncome = grossIncome - totalExpenses;
  const grossYield = referenceValue > 0 ? (grossIncome / referenceValue) * 100 : 0;
  const netYield = referenceValue > 0 ? (netIncome / referenceValue) * 100 : 0;

  // Inflation from IPC
  const inflationRate = await calculateInflationRate(twelveMonthsAgo, now);
  const realYield = inflationRate !== 0
    ? ((1 + netYield / 100) / (1 + inflationRate / 100) - 1) * 100
    : netYield;

  // Vacancy months
  const vacancyMonths = calculateVacancyMonths(leases, twelveMonthsAgo, now);

  // Monthly breakdown
  const monthlyBreakdown = buildMonthlyBreakdown(confirmedPayments, expenses, twelveMonthsAgo, now);

  // Expenses by category
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

    if (leaseEnd > leaseStart) {
      coveredDays += daysBetween(leaseStart, leaseEnd);
    }
  }

  const vacantDays = Math.max(0, totalDays - coveredDays);
  return Math.round(vacantDays / 30);
}

function buildMonthlyBreakdown(payments: any[], expenses: any[], from: Date, to: Date): MonthlyBreakdownEntry[] {
  const months: MonthlyBreakdownEntry[] = [];
  const current = new Date(from);

  while (current <= to) {
    const month = formatPeriod(current);

    const monthIncome = payments
      .filter((p) => p.period === month || formatPeriod(new Date(p.paymentDate)) === month)
      .reduce((sum, p) => sum + fromDecimal128(p.amount), 0);

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
};
