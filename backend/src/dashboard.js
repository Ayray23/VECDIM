import { getRequestUser, normalizeRole } from './alerts.js';

function httpError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function loadUser(query, requestUser) {
  const result = await query(
    'SELECT id, username, role, state FROM users WHERE id::text = $1 OR username = $1 LIMIT 1',
    [requestUser.userId]
  );
  const row = result.rows[0] ?? null;
  if (!row) return null;
  const storedRole = normalizeRole(row.role);
  if (!storedRole || storedRole !== requestUser.role) return null;
  return { ...row, role: storedRole };
}

export function scopeForUser(user, requestedState) {
  if (user.role === 'vecdim' || user.role === 'field') {
    if (!user.state) throw httpError('FORBIDDEN', 'No state is assigned to this user.');
    return user.state;
  }
  return requestedState || null;
}

export async function authenticate(query, headers) {
  const requestUser = getRequestUser(headers);
  if (!requestUser) throw httpError('UNAUTHORIZED', 'A valid x-user-id and x-role header are required.');
  const user = await loadUser(query, requestUser);
  if (!user) throw httpError('FORBIDDEN', 'Unknown user or role mismatch.');
  return user;
}

export async function getDashboardSummary(query, { headers = {}, state } = {}) {
  const user = await authenticate(query, headers);
  if (user.role === 'field') throw httpError('FORBIDDEN', 'Field users do not have access to the analytics dashboard.');

  const scopedState = scopeForUser(user, state);
  const params = scopedState ? [scopedState] : [];
  const stateWhere = scopedState ? 'WHERE state = $1' : '';

  const [records, alerts, tiers, recent] = await Promise.all([
    query(`SELECT COUNT(*)::integer AS total, COUNT(*) FILTER (WHERE sync_status = 'synced')::integer AS synced, COUNT(*) FILTER (WHERE sync_status = 'pending_sync')::integer AS pending_sync, COUNT(*) FILTER (WHERE sync_status = 'rejected')::integer AS rejected FROM field_records ${stateWhere}`, params),
    query(`SELECT COUNT(*)::integer AS total FROM alerts ${stateWhere}`, params),
    query(`SELECT alert_tier AS tier, COUNT(*)::integer AS count FROM alerts ${stateWhere}${scopedState ? ' AND' : 'WHERE'} alert_tier IN ('ALERT','WARNING','WATCH') GROUP BY alert_tier ORDER BY CASE alert_tier WHEN 'ALERT' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END`, params),
    query(`SELECT state, lga, month, n_records, mean_risk, alert_tier AS tier, resistance_flag AS pyrethroid_resistance_flag FROM alerts ${stateWhere} ORDER BY month DESC, state, lga LIMIT 10`, params)
  ]);

  const tierCounts = { ALERT: 0, WARNING: 0, WATCH: 0 };
  for (const row of tiers.rows) tierCounts[row.tier] = Number(row.count);
  return {
    role: user.role,
    state: scopedState,
    records: records.rows[0] ?? { total: 0, synced: 0, pending_sync: 0, rejected: 0 },
    alerts: { total: Number(alerts.rows[0]?.total ?? 0), byTier: tierCounts, recent: recent.rows }
  };
}

export async function listDashboardRecords(query, { headers = {}, state, limit = 100, offset = 0 } = {}) {
  const user = await authenticate(query, headers);
  const scopedState = scopeForUser(user, state);
  const params = scopedState ? [scopedState, limit, offset] : [limit, offset];
  const where = scopedState ? 'WHERE state = $1' : '';
  const limitParam = scopedState ? '$2' : '$1';
  const offsetParam = scopedState ? '$3' : '$2';
  const result = await query(
    `SELECT id, state, lga, ward, collection_date, species, mortality_pct, gps_accuracy_m, sync_status, rejection_reason, created_at, updated_at FROM field_records ${where} ORDER BY created_at DESC LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );
  return { role: user.role, state: scopedState, records: result.rows, limit, offset };
}
