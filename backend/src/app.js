import cors from 'cors';
import express from 'express';
import { checkDatabaseConnection as defaultDatabaseCheck } from './db.js';

export function createApp({ checkDatabaseConnection = defaultDatabaseCheck } = {}) {
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

  return app;
}

export default createApp();
