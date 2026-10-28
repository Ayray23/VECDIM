import express from 'express';
import { z } from 'zod';
import { authenticate, scopeForUser } from './dashboard.js';
import { createFieldRecord, fieldRecordSchema, getFieldRecord, listFieldRecords } from './records.js';

const idSchema = z.string().uuid();

function authFailure(res, error) {
  if (error.code === 'UNAUTHORIZED') return res.status(401).json({ error: 'unauthorized', message: error.message });
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'forbidden', message: error.message });
  return null;
}

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

  // Reads are role-scoped exactly like the dashboard: VECDIM and Field users only
  // ever see their assigned state; UNIOSUN may see all states.
  router.get('/:id', async (req, res) => {
    try {
      const user = await authenticate(query, req.headers);
      const scopedState = scopeForUser(user, undefined);

      const parsed = idSchema.safeParse(req.params.id);
      if (!parsed.success) return res.status(400).json({ error: 'invalid_id', message: 'Record id must be a UUID.' });

      const record = await getFieldRecord(query, parsed.data);
      // A record outside the caller's scope is reported as missing, not forbidden.
      if (!record || (scopedState && record.state !== scopedState)) {
        return res.status(404).json({ error: 'not_found', message: 'Field record not found.' });
      }
      return res.json({ record });
    } catch (error) {
      if (authFailure(res, error)) return undefined;
      console.error(error);
      return res.status(500).json({ error: 'internal_error', message: 'Unable to load field record.' });
    }
  });

  router.get('/', async (req, res) => {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '50', 10) || 50, 1), 100);
    const offset = Math.max(Number.parseInt(req.query.offset ?? '0', 10) || 0, 0);
    const requestedState = typeof req.query.state === 'string' && req.query.state.trim() ? req.query.state.trim() : undefined;

    try {
      const user = await authenticate(query, req.headers);
      const state = scopeForUser(user, requestedState);
      const records = await listFieldRecords(query, { limit, offset, state });
      return res.json({ records, limit, offset });
    } catch (error) {
      if (authFailure(res, error)) return undefined;
      console.error(error);
      return res.status(500).json({ error: 'internal_error', message: 'Unable to list field records.' });
    }
  });

  return router;
}
