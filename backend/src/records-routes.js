import express from 'express';
import { z } from 'zod';
import { createFieldRecord, fieldRecordSchema, getFieldRecord, listFieldRecords } from './records.js';

const idSchema = z.string().uuid();

function validationError(res, error) {
  return res.status(400).json({
    error: 'validation_error',
    message: 'The field record is invalid.',
    details: error.issues
  });
}

export function createRecordsRouter({ query }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const parsed = fieldRecordSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    try {
      const result = await createFieldRecord(query, parsed.data);
      if (!result.created) {
        return res.status(200).json({
          status: 'already_exists',
          record: result.record
        });
      }
      return res.status(201).json({
        status: 'created',
        record: result.record
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'internal_error', message: 'Unable to save field record.' });
    }
  });

  router.get('/:id', async (req, res) => {
    const parsed = idSchema.safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_id', message: 'Record id must be a UUID.' });

    try {
      const record = await getFieldRecord(query, parsed.data);
      if (!record) return res.status(404).json({ error: 'not_found', message: 'Field record not found.' });
      return res.json({ record });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'internal_error', message: 'Unable to load field record.' });
    }
  });

  router.get('/', async (req, res) => {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '50', 10) || 50, 1), 100);
    const offset = Math.max(Number.parseInt(req.query.offset ?? '0', 10) || 0, 0);

    try {
      const records = await listFieldRecords(query, { limit, offset });
      return res.json({ records, limit, offset });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'internal_error', message: 'Unable to list field records.' });
    }
  });

  return router;
}
