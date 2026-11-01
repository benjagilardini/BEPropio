import { createServer } from 'http';
import { app } from './app.js';
import { config } from './config/index.js';
import { connectDatabase } from './config/database.js';
import { initSocket } from './config/socket.js';

async function start() {
  await connectDatabase();
  console.log('Connected to MongoDB');

  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(config.port, () => {
    console.log(`Server running on port ${config.port} [${config.nodeEnv}]`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
