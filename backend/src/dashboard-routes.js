import { Router } from 'express';
import { getDashboardSummary, listDashboardRecords } from './dashboard.js';

function handleError(res, error, fallback) {
  if (error.code === 'UNAUTHORIZED') return res.status(401).json({ error: error.message });
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: error.message });
  return res.status(500).json({ error: fallback });
}

export function createDashboardRouter({ query }) {
  const router = Router();

  router.get('/summary', async (req, res) => {
    try {
      const summary = await getDashboardSummary(query, { headers: req.headers, state: req.query.state });
      res.json(summary);
    } catch (error) {
      return handleError(res, error, 'Unable to load dashboard summary.');
    }
  });

  router.get('/records', async (req, res) => {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '100', 10) || 100, 1), 100);
    const offset = Math.max(Number.parseInt(req.query.offset ?? '0', 10) || 0, 0);
    try {
      const result = await listDashboardRecords(query, {
        headers: req.headers,
        state: req.query.state,
        limit,
        offset
      });
      res.json(result);
    } catch (error) {
      return handleError(res, error, 'Unable to load dashboard records.');
    }
  });

  return router;
}
