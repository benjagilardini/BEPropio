import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { indexService } from '../src/services/indexService.js';

async function main() {
  await connectDatabase();
  console.log('Syncing index values from external APIs...');

  const results = await indexService.syncAll('2020-01-01');
  for (const [type, count] of Object.entries(results)) {
    console.log(`  ${type}: ${count} values synced`);
  }

  await disconnectDatabase();
  console.log('Done');
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
