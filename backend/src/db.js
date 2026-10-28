import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// A pooled connection can be dropped while idle (database restart, network blip).
// Without a listener Node treats that as an unhandled error and the whole API exits.
// Log it instead: the pool discards the dead connection and reconnects on the next query.
pool.on('error', (error) => {
  console.error(`Database connection error (will reconnect on the next query): ${error.message}`);
});

export async function checkDatabaseConnection() {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rows[0]?.ok === 1;
}
