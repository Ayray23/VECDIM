import { Router } from 'express';
import { listAlerts } from './alerts.js';

export function createAlertsRouter({ query }) {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const alerts = await listAlerts(query, {
        headers: req.headers,
        state: req.query.state,
        lga: req.query.lga,
        from: req.query.from,
        to: req.query.to
      });
      res.json({ alerts });
    } catch (error) {
      if (error.code === 'UNAUTHORIZED') return res.status(401).json({ error: error.message });
      if (error.code === 'FORBIDDEN') return res.status(403).json({ error: error.message });
      return res.status(500).json({ error: 'Unable to load alerts.' });
    }
  });

  return router;
}
