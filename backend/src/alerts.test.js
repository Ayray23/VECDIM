import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listAlerts } from './alerts.js';

function queryFor({ user, alerts = [] }) {
  return async (sql) => {
    if (sql.includes('FROM users')) return { rows: user ? [user] : [] };
    if (sql.includes('FROM alerts')) return { rows: alerts };
    throw new Error(`Unexpected query: ${sql}`);
  };
}

test('UNIOSUN can read all alerts', async () => {
  const query = queryFor({
    user: { id: 'u1', username: 'uniosun', role: 'UNIOSUN', state: null },
    alerts: [{ id: 'Osun|Osogbo|2026-06', state: 'Osun', lga: 'Osogbo', month: '2026-06', n_records: 4, mean_risk: 0.74, tier: 'ALERT', pyrethroid_resistance_flag: true }]
  });

  const result = await listAlerts(query, {
    headers: { 'x-user-id': 'u1', 'x-role': 'uniosun' }
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].tier, 'ALERT');
});

test('VECDIM users are restricted to their assigned state', async () => {
  let alertSql = '';
  const query = async (sql, params) => {
    if (sql.includes('FROM users')) return { rows: [{ id: 'u2', username: 'osun-user', role: 'VECDIM', state: 'Osun' }] };
    if (sql.includes('FROM alerts')) {
      alertSql = sql;
      assert.deepEqual(params, ['Osun']);
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  await listAlerts(query, {
    headers: { 'x-user-id': 'u2', 'x-role': 'vecdim' }
  });

  assert.match(alertSql, /state = \$1/);
});

test('Field users cannot read alerts', async () => {
  const query = queryFor({
    user: { id: 'u3', username: 'field', role: 'Field', state: 'Osun' }
  });

  await assert.rejects(
    () => listAlerts(query, { headers: { 'x-user-id': 'u3', 'x-role': 'field' } }),
    (error) => error.code === 'FORBIDDEN'
  );
});

test('missing identity headers are rejected', async () => {
  const query = queryFor({ user: null });

  await assert.rejects(
    () => listAlerts(query, { headers: {} }),
    (error) => error.code === 'UNAUTHORIZED'
  );
});
