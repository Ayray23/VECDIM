import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool as defaultPool } from './db.js';

const MIGRATION_LOCK_ID = 74120318;
const DEFAULT_MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../migrations/', import.meta.url));

export async function runMigrations({ pool = defaultPool, migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY } = {}) {
  const client = await pool.connect();
  let lockAcquired = false;
  const applied = [];

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    lockAcquired = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await readdir(migrationsDirectory))
      .filter((file) => /^\d+.*\.sql$/i.test(file))
      .sort((left, right) => left.localeCompare(right));

    for (const file of files) {
      const existing = await client.query(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [file]
      );
      if (existing.rowCount > 0) continue;

      const sql = await readFile(path.join(migrationsDirectory, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${error.message}`, { cause: error });
      }
    }

    return applied;
  } finally {
    try {
      if (lockAcquired) {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
      }
    } finally {
      client.release();
    }
  }
}