import cors from 'cors';
import express from 'express';
import { checkDatabaseConnection as defaultDatabaseCheck, pool } from './db.js';
import { createRecordsRouter } from './records-routes.js';
import { createSyncRouter } from './sync-routes.js';
import { createAlertsRouter } from './alerts-routes.js';

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

  const recordsRouter = createRecordsRouter({ query });
  const syncRouter = createSyncRouter({ query });
  const alertsRouter = createAlertsRouter({ query });

  // Required candidate-pack API namespace.
  app.use('/api/v1/records', recordsRouter);
  app.use('/api/v1/sync', syncRouter);
  app.use('/api/v1/alerts', alertsRouter);

  // Keep the existing paths temporarily so the mobile client and earlier tests
  // remain compatible while the client migrates to the required v1 namespace.
  app.use('/api/records', recordsRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/alerts', alertsRouter);

  return app;
}

export default createApp();
