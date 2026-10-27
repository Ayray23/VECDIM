import { Router } from 'express';
import { getDashboardSummary } from './dashboard.js';

export function createDashboardRouter({ query }) {
  const router = Router();

  router.get('/summary', async (req, res) => {
    try {
      const summary = await getDashboardSummary(query, {
        headers: req.headers,
        state: req.query.state
      });
      res.json(summary);
    } catch (error) {
      if (error.code === 'UNAUTHORIZED') return res.status(401).json({ error: error.message });
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: error.message });
      return res.status(500).json({ error: 'Unable to load dashboard summary.' });
    }
  });

  return router;
}
