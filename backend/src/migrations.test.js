import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runMigrations } from './migrations.js';

async function withMigrations(files, callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vecdim-migrations-'));
  for (const [name, sql] of Object.entries(files)) {
    await writeFile(path.join(directory, name), sql);
  }
  try {
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function createFakePool({ failOnSql } = {}) {
  const appliedVersions = new Set();
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT version FROM schema_migrations')) {
        const exists = appliedVersions.has(values[0]);
        return { rowCount: Number(exists), rows: exists ? [{ version: values[0] }] : [] };
      }
      if (sql.startsWith('INSERT INTO schema_migrations')) {
        appliedVersions.add(values[0]);
      }
      if (failOnSql && sql.includes(failOnSql)) throw new Error('simulated SQL error');
      return { rowCount: 0, rows: [] };
    },
    release() {
      calls.push({ sql: 'RELEASE' });
    }
  };

  return { pool: { connect: async () => client }, appliedVersions, calls };
}

test('runner applies numbered migrations in order and skips applied migrations', async () => {
  await withMigrations({
    '002_second.sql': 'SELECT 2;',
    '001_first.sql': 'SELECT 1;',
    'notes.txt': 'not a migration'
  }, async (migrationsDirectory) => {
    const fake = createFakePool();
    const applied = await runMigrations({ pool: fake.pool, migrationsDirectory });

    assert.deepEqual(applied, ['001_first.sql', '002_second.sql']);
    assert.deepEqual([...fake.appliedVersions], applied);
    assert.equal(fake.calls.filter(({ sql }) => sql === 'COMMIT').length, 2);
    assert.equal(fake.calls.at(-2).sql, 'SELECT pg_advisory_unlock($1)');
    assert.equal(fake.calls.at(-1).sql, 'RELEASE');

    const secondRun = await runMigrations({ pool: fake.pool, migrationsDirectory });
    assert.deepEqual(secondRun, []);
  });
});

test('runner rolls back and identifies a failed migration', async () => {
  await withMigrations({ '001_bad.sql': 'SELECT FAIL_ME;' }, async (migrationsDirectory) => {
    const fake = createFakePool({ failOnSql: 'FAIL_ME' });

    await assert.rejects(
      runMigrations({ pool: fake.pool, migrationsDirectory }),
      /Migration 001_bad\.sql failed: simulated SQL error/
    );
    assert.equal(fake.calls.some(({ sql }) => sql === 'ROLLBACK'), true);
    assert.equal(fake.calls.some(({ sql }) => sql === 'COMMIT'), false);
    assert.equal(fake.calls.at(-2).sql, 'SELECT pg_advisory_unlock($1)');
    assert.equal(fake.calls.at(-1).sql, 'RELEASE');
  });
});