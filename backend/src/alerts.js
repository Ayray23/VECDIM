const ROLES = new Set(['field', 'vecdim', 'uniosun']);

function httpError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function normalizeRole(value) {
  if (typeof value !== 'string') return null;
  const role = value.trim().toLowerCase();
  return ROLES.has(role) ? role : null;
}

export function getRequestUser(headers = {}) {
  const rawId = headers['x-user-id'];
  const userId = typeof rawId === 'string' ? rawId.trim() : '';
  const role = normalizeRole(headers['x-role']);
  if (!userId || !role) return null;
  return { userId, role };
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

export async function listAlerts(query, { headers = {}, state, lga, from, to } = {}) {
  const requestUser = getRequestUser(headers);
  if (!requestUser) {
    throw httpError('UNAUTHORIZED', 'A valid x-user-id and x-role header are required.');
  }

  const user = await loadUser(query, requestUser);
  if (!user) {
    throw httpError('FORBIDDEN', 'Unknown user or role mismatch.');
  }

  if (user.role === 'field') {
    throw httpError('FORBIDDEN', 'Field users do not have access to alerts.');
  }

  const conditions = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    conditions.push(sql.replace('?', `$${params.length}`));
  };

  if (user.role === 'vecdim') {
    // State-scoped users may only see their own state, never a caller-supplied one.
    if (!user.state) {
      throw httpError('FORBIDDEN', 'No state is assigned to this user.');
    }
    add('state = ?', user.state);
  } else if (state) {
    // 'uniosun' (unrestricted) may filter by any state.
    add('state = ?', state);
  }

  if (lga) add('lga = ?', lga);
  if (from) add('month >= ?', from);
  if (to) add('month <= ?', to);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT
       CONCAT(state, '|', lga, '|', month) AS id,
       state,
       lga,
       month,
       n_records,
       mean_risk,
       alert_tier AS tier,
       resistance_flag AS pyrethroid_resistance_flag
     FROM alerts
     ${where}
     ORDER BY month DESC, state, lga`,
    params
  );

  return result.rows;
}
