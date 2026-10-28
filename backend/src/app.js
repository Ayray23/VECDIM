import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDatabaseConnection as defaultDatabaseCheck, pool } from './db.js';
import { createRecordsRouter } from './records-routes.js';
import { createSyncRouter } from './sync-routes.js';
import { createAlertsRouter } from './alerts-routes.js';
import { createDashboardRouter } from './dashboard-routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardPath = path.resolve(__dirname, '../../dashboard');

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
  const dashboardRouter = createDashboardRouter({ query });

  app.use('/api/v1/records', recordsRouter);
  app.use('/api/v1/sync', syncRouter);
  app.use('/api/v1/alerts', alertsRouter);
  app.use('/api/v1/dashboard', dashboardRouter);

  app.use('/api/records', recordsRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/dashboard', dashboardRouter);

  app.use('/dashboard', express.static(dashboardPath));

  // Return JSON errors (no stack traces) for malformed or oversized request bodies.
  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid_json', message: 'Request body is not valid JSON.' });
    }
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'payload_too_large', message: 'Request body is too large.' });
    }
    console.error(error);
    return res.status(500).json({ error: 'internal_error', message: 'Unexpected server error.' });
  });

  return app;
}

export default createApp();
