import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDashboardSummary } from './dashboard.js';

function queryFor(user) {
  return async (sql) => {
    if (sql.includes('FROM users')) return { rows: [user] };
    if (sql.includes('COUNT(*)::integer AS total') && sql.includes('field_records')) {
      return { rows: [{ total: 12, synced: 10, pending_sync: 1, rejected: 1 }] };
    }
    if (sql.includes('COUNT(*)::integer AS total') && sql.includes('alerts')) {
      return { rows: [{ total: 6 }] };
    }
    if (sql.includes('alert_tier AS tier')) {
      return { rows: [{ tier: 'ALERT', count: 2 }, { tier: 'WARNING', count: 1 }, { tier: 'WATCH', count: 3 }] };
    }
    if (sql.includes('n_records, mean_risk')) {
      return { rows: [{ state: 'Osun', lga: 'Iwo', month: '2026-10', n_records: 4, mean_risk: 0.72, tier: 'ALERT', pyrethroid_resistance_flag: false }] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
}

test('UNIOSUN dashboard summary includes all analytics', async () => {
  const result = await getDashboardSummary(queryFor({ id: 'u1', role: 'UNIOSUN', state: null }), {
    headers: { 'x-user-id': 'u1', 'x-role': 'uniosun' }
  });
  assert.equal(result.records.total, 12);
  assert.equal(result.alerts.total, 6);
  assert.deepEqual(result.alerts.byTier, { ALERT: 2, WARNING: 1, WATCH: 3 });
});

test('VECDIM dashboard is restricted to assigned state', async () => {
  let seenParams = [];
  const base = queryFor({ id: 'u2', role: 'VECDIM', state: 'Osun' });
  const query = async (sql, params) => {
    if (sql.includes('FROM field_records') || sql.includes('FROM alerts')) seenParams.push(params);
    return base(sql, params);
  };
  const result = await getDashboardSummary(query, {
    headers: { 'x-user-id': 'u2', 'x-role': 'vecdim' },
    state: 'Lagos'
  });
  assert.equal(result.state, 'Osun');
  assert.ok(seenParams.every((params) => params[0] === 'Osun'));
});

test('Field users cannot access analytics dashboard', async () => {
  await assert.rejects(
    () => getDashboardSummary(queryFor({ id: 'u3', role: 'Field', state: 'Osun' }), {
      headers: { 'x-user-id': 'u3', 'x-role': 'field' }
    }),
    (error) => error.code === 'FORBIDDEN'
  );
});
