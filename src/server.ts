import { createServer } from 'http';
import cron from 'node-cron';
import { app } from './app.js';
import { config } from './config/index.js';
import { connectDatabase } from './config/database.js';
import { initSocket } from './config/socket.js';
import { indexService } from './services/indexService.js';

async function start() {
  await connectDatabase();
  console.log('Connected to MongoDB');

  const httpServer = createServer(app);
  initSocket(httpServer);

  cron.schedule('0 9 * * *', async () => {
    console.log('[cron] Starting daily index sync...');
    try {
      const results = await indexService.syncAll();
      console.log('[cron] Index sync complete:', results);
    } catch (err) {
      console.error('[cron] Index sync failed:', err);
    }
  });

  httpServer.listen(config.port, () => {
    console.log(`Server running on port ${config.port} [${config.nodeEnv}]`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
