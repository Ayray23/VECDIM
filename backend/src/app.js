import cors from 'cors';
import express from 'express';
import { checkDatabaseConnection as defaultDatabaseCheck, pool } from './db.js';
import { createRecordsRouter } from './records-routes.js';
import { createSyncRouter } from './sync-routes.js';

export function createApp({ checkDatabaseConnection = defaultDatabaseCheck, query = pool.query.bind(pool) } = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', async (_req, res) => {
    try {
      const connected = await checkDatabaseConnection();
      const status = connected ? 200 : 503;
      res.status(status).json({
        status: connected ? 'ok' : 'error',
        service: 'vecdim-backend',
        database: connected ? 'connected' : 'disconnected'
      });
    } catch {
      res.status(503).json({
        status: 'error',
        service: 'vecdim-backend',
        database: 'disconnected'
      });
    }
  });

  app.use('/api/records', createRecordsRouter({ query }));
  app.use('/api/sync', createSyncRouter({ query }));

  return app;
}

export default createApp();
