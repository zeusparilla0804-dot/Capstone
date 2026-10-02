import 'dotenv/config';

import app from './app.js';
import { environment } from './config/environment.js';
import { logger } from './utils/logger.js';

import {
  closeDatabase,
  connectDatabase
} from './config/database.js';
import { emailWorker } from './services/email-worker.service.js';

let server: ReturnType<typeof app.listen> | undefined;

async function bootstrap(): Promise<void> {
  try {
    await connectDatabase();
    emailWorker.start();

    server = app.listen(environment.port, () => {
      logger.info('server.started', `La-Chef API listening on port ${environment.port}.`);
    });
  } catch (error) {
    logger.error('server.start_failed', environment.isProduction ? 'Unable to start the server.' : String(error));

    process.exit(1);
  }
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('server.shutdown', `${signal} received. Shutting down.`);

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    }
    await emailWorker.stop();
    await closeDatabase();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

void bootstrap();
