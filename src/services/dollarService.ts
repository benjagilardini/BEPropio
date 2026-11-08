import axios from 'axios';
import { DollarRate } from '../models/DollarRate.js';

interface DailyRate {
  fecha: string;
  compra: number;
  venta: number;
}

interface MonthlyAverage {
  month: string;          // "2025-01"
  avgOficialVenta: number | null;
  avgBlueVenta: number | null;
}

/**
 * Sync dollar rates from ArgentinaDatos API into DB.
 * Only inserts days not already stored.
 */
async function syncRates(type: 'oficial' | 'blue'): Promise<number> {
  const lastStored = await DollarRate.findOne({ type }).sort({ date: -1 }).lean();
  const sinceDate = lastStored?.date || '2018-01-01';

  const url = `https://api.argentinadatos.com/v1/cotizaciones/dolares/${type}`;
  const { data } = await axios.get<DailyRate[]>(url, { timeout: 15_000 });

  if (!data || data.length === 0) return 0;

  const newEntries = data.filter((d) => d.fecha > sinceDate && d.venta > 0);
  if (newEntries.length === 0) return 0;

  const ops = newEntries.map((d) => ({
    updateOne: {
      filter: { type, date: d.fecha },
      update: { $setOnInsert: { type, date: d.fecha, compra: d.compra, venta: d.venta } },
      upsert: true,
    },
  }));

  const result = await DollarRate.bulkWrite(ops, { ordered: false });
  return result.upsertedCount;
}

/**
 * Sync both oficial and blue rates.
 */
async function syncAll(): Promise<{ oficial: number; blue: number }> {
  const [oficial, blue] = await Promise.all([syncRates('oficial'), syncRates('blue')]);
  return { oficial, blue };
}

/**
 * Get monthly average venta rates for a given year.
 * Returns 12 entries (jan-dec), with null if no data for a month.
 */
async function getMonthlyAverages(year: number): Promise<MonthlyAverage[]> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const rates = await DollarRate.find({
    date: { $gte: startDate, $lte: endDate },
  }).lean();

  const result: MonthlyAverage[] = [];

  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, '0')}`;
    const monthPrefix = month; // "2025-01"

    const oficialRates = rates.filter(
      (r) => r.type === 'oficial' && r.date.startsWith(monthPrefix),
    );
    const blueRates = rates.filter(
      (r) => r.type === 'blue' && r.date.startsWith(monthPrefix),
    );

    const avgOficial = oficialRates.length > 0
      ? oficialRates.reduce((sum, r) => sum + r.venta, 0) / oficialRates.length
      : null;
    const avgBlue = blueRates.length > 0
      ? blueRates.reduce((sum, r) => sum + r.venta, 0) / blueRates.length
      : null;

    result.push({ month, avgOficialVenta: avgOficial, avgBlueVenta: avgBlue });
  }

  return result;
}

/**
 * Get monthly averages for a specific set of months (e.g. for previous year comparison).
 * Accepts months as ["2024-01", "2024-02", ...].
 */
async function getMonthlyAveragesForMonths(months: string[]): Promise<Map<string, { oficial: number | null; blue: number | null }>> {
  if (months.length === 0) return new Map();

  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const dateConditions = years.map((y) => ({
    date: { $gte: `${y}-01-01`, $lte: `${y}-12-31` },
  }));

  const rates = await DollarRate.find({ $or: dateConditions }).lean();

  const result = new Map<string, { oficial: number | null; blue: number | null }>();

  for (const month of months) {
    const oficialRates = rates.filter(
      (r) => r.type === 'oficial' && r.date.startsWith(month),
    );
    const blueRates = rates.filter(
      (r) => r.type === 'blue' && r.date.startsWith(month),
    );

    result.set(month, {
      oficial: oficialRates.length > 0
        ? oficialRates.reduce((sum, r) => sum + r.venta, 0) / oficialRates.length
        : null,
      blue: blueRates.length > 0
        ? blueRates.reduce((sum, r) => sum + r.venta, 0) / blueRates.length
        : null,
    });
  }

  return result;
}

export const dollarService = {
  syncRates,
  syncAll,
  getMonthlyAverages,
  getMonthlyAveragesForMonths,
};
