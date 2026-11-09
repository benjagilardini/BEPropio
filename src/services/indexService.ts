import axios from 'axios';
import * as XLSX from 'xlsx';
import { IndexValue } from '../models/IndexValue.js';
import { toDecimal128 } from '../utils/decimal.js';
import type { IndexType } from '../constants/index.js';

interface IndexEntry {
  indexType: IndexType;
  period: string;
  value: number;
  publishedAt: Date | null;
}

const IPC_SERIES_ID = '193.2_NIVEL_GENERAL_2021_0_13_2';

async function fetchIpc(fromDate: string): Promise<IndexEntry[]> {
  const url = 'https://apis.datos.gob.ar/series/api/series/';
  const { data } = await axios.get(url, {
    params: {
      ids: IPC_SERIES_ID,
      start_date: fromDate,
      format: 'json',
      limit: 1000,
    },
    timeout: 15_000,
  });

  const entries: IndexEntry[] = [];
  for (const [dateStr, value] of data.data ?? []) {
    if (value == null) continue;
    const period = dateStr.substring(0, 7);
    entries.push({
      indexType: 'IPC',
      period,
      value: Number(value),
      publishedAt: new Date(dateStr),
    });
  }
  return entries;
}

async function fetchUva(fromDate: string): Promise<IndexEntry[]> {
  const url = 'https://api.argentinadatos.com/v1/finanzas/indices/uva';
  const { data } = await axios.get<Array<{ fecha: string; valor: number }>>(url, {
    timeout: 30_000,
  });

  const entries: IndexEntry[] = [];
  for (const item of data) {
    if (item.fecha < fromDate) continue;
    entries.push({
      indexType: 'UVA',
      period: item.fecha,
      value: item.valor,
      publishedAt: new Date(item.fecha),
    });
  }
  return entries;
}

const ICL_XLS_URL = 'https://www.bcra.gob.ar/Pdfs/PublicacionesEstadisticas/diar_icl.xls';

function parseIclDate(raw: string): string | null {
  const parts = raw.split('/');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!yyyy || yyyy.length !== 4) return null;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

async function fetchIcl(fromDate: string): Promise<IndexEntry[]> {
  const { data } = await axios.get(ICL_XLS_URL, {
    responseType: 'arraybuffer',
    timeout: 30_000,
  });

  const workbook = XLSX.read(data, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const entries: IndexEntry[] = [];
  for (const row of rows) {
    if (!row[0] || typeof row[0] !== 'string') continue;
    const period = parseIclDate(row[0]);
    if (!period) continue;
    const value = Number(row[1]);
    if (isNaN(value) || value <= 0) continue;
    if (period < fromDate) continue;

    entries.push({
      indexType: 'ICL',
      period,
      value,
      publishedAt: new Date(period),
    });
  }
  return entries;
}

async function upsertEntries(entries: IndexEntry[]): Promise<number> {
  if (entries.length === 0) return 0;

  const ops = entries.map((e) => ({
    updateOne: {
      filter: { indexType: e.indexType, period: e.period },
      update: {
        $set: {
          value: toDecimal128(e.value),
          publishedAt: e.publishedAt,
        },
      },
      upsert: true,
    },
  }));

  const batchSize = 1000;
  let modified = 0;
  for (let i = 0; i < ops.length; i += batchSize) {
    const result = await IndexValue.bulkWrite(ops.slice(i, i + batchSize));
    modified += result.upsertedCount + result.modifiedCount;
  }
  return modified;
}

async function syncIndex(indexType: IndexType, fromDate: string): Promise<number> {
  const fetchers: Record<IndexType, (from: string) => Promise<IndexEntry[]>> = {
    IPC: fetchIpc,
    UVA: fetchUva,
    ICL: fetchIcl,
  };

  const entries = await fetchers[indexType](fromDate);
  return upsertEntries(entries);
}

async function syncAll(fromDate = '2020-01-01'): Promise<Record<IndexType, number>> {
  const results: Record<string, number> = {};

  for (const indexType of ['IPC', 'UVA', 'ICL'] as IndexType[]) {
    try {
      results[indexType] = await syncIndex(indexType, fromDate);
    } catch (err: any) {
      console.error(`Failed to sync ${indexType}:`, err.message);
      results[indexType] = 0;
    }
  }

  return results as Record<IndexType, number>;
}

export const indexService = {
  fetchIpc,
  fetchUva,
  fetchIcl,
  syncIndex,
  syncAll,
};
