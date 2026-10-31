import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { IndexValue } from '../src/models/IndexValue.js';
import { Lease } from '../src/models/Lease.js';
import { RentAdjustment } from '../src/models/RentAdjustment.js';
import { adjustmentService } from '../src/services/adjustmentService.js';

const toDecimal = (n: number) => mongoose.Types.Decimal128.fromString(n.toFixed(6));

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function seedIndexValues() {
  await IndexValue.deleteMany({});
  const docs: any[] = [];

  // IPC — monthly, 2024-01 to 2026-08 (published with ~2 month lag)
  let ipc = 3500;
  for (let year = 2024; year <= 2026; year++) {
    const maxMonth = year === 2026 ? 8 : 12;
    for (let m = 1; m <= maxMonth; m++) {
      ipc *= 1.035;
      docs.push({
        indexType: 'IPC',
        period: `${year}-${String(m).padStart(2, '0')}`,
        value: toDecimal(ipc),
        publishedAt: new Date(year, m - 1, 15),
      });
    }
  }

  // ICL — daily, 2024-01-01 to 2026-10-25
  let icl = 700;
  const endDate = new Date(2026, 9, 25);
  for (let d = new Date(2024, 0, 1); d <= endDate; d.setDate(d.getDate() + 1)) {
    icl *= 1.0012;
    docs.push({
      indexType: 'ICL',
      period: localDateStr(d),
      value: toDecimal(icl),
      publishedAt: new Date(d),
    });
  }

  // UVA — daily, 2024-01-01 to 2026-10-25
  let uva = 600;
  for (let d = new Date(2024, 0, 1); d <= endDate; d.setDate(d.getDate() + 1)) {
    uva *= 1.001;
    docs.push({
      indexType: 'UVA',
      period: localDateStr(d),
      value: toDecimal(uva),
      publishedAt: new Date(d),
    });
  }

  const batch = 1000;
  for (let i = 0; i < docs.length; i += batch) {
    await IndexValue.insertMany(docs.slice(i, i + batch));
  }
  console.log(`Seeded ${docs.length} IndexValue documents (IPC + ICL + UVA)`);
}

async function regenerateAdjustments() {
  const leases = await Lease.find({ status: 'active' });
  if (leases.length === 0) {
    console.log('No active leases found — skipping adjustment generation');
    return;
  }

  for (const lease of leases) {
    await RentAdjustment.deleteMany({ leaseId: lease._id });
    await adjustmentService.generateAdjustmentsForLease(lease);
    console.log(`  Regenerated adjustments for lease ${lease._id}`);
  }
  console.log(`Regenerated adjustments for ${leases.length} active lease(s)`);
}

async function main() {
  await connectDatabase();
  console.log('Connected to MongoDB\n');

  console.log('Seeding index values...');
  await seedIndexValues();

  console.log('\nRegenerating adjustments...');
  await regenerateAdjustments();

  await disconnectDatabase();
  console.log('\nDone');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
