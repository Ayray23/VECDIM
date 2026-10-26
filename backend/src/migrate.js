import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { pool } from './db.js';
import { runMigrations } from './migrations.js';

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  try {
    const applied = await runMigrations();
    console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Database is up to date.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}