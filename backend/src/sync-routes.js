import express from 'express';
import { syncFieldRecords } from './sync.js';

export function createSyncRouter({ query }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    try {
      const result = await syncFieldRecords(query, req.body?.records, { deviceId: req.body?.deviceId });
      return res.status(200).json(result);
    } catch (error) {
      if (error.code === 'VALIDATION_ERROR') {
        return res.status(400).json({
          error: 'validation_error',
          message: error.message,
          details: error.details
        });
      }
      console.error(error);
      return res.status(500).json({ error: 'internal_error', message: 'Unable to sync records.' });
    }
  });

  return router;
}
