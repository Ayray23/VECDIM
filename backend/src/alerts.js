const ROLES = new Set(['field', 'vecdim', 'uniosun']);

function normalizeRole(value) {
  if (typeof value !== 'string') return null;
  const role = value.trim().toLowerCase();
  return ROLES.has(role) ? role : null;
}

export function getRequestUser(query, headers = {}) {
  const userId = typeof headers['x-user-id'] === 'string' ? headers['x-user-id'].trim() : '';
  const role = normalizeRole(headers['x-role']);
  if (!userId || !role) return null;
  return { userId, role };
}

async function loadUser(query, user) {
  if (!user) return null;
  const result = await query(
    'SELECT id, username, role, state FROM users WHERE id::text = $1 OR username = $1 LIMIT 1',
    [user.userId]
  );
  const row = result.rows[0] ?? null;
  if (!row) return null;
  if (String(row.role).toLowerCase() !== user.role) return null;
  return row;
}

export async function listAlerts(query, { headers = {}, state, lga, from, to } = {}) {
  const requestUser = getRequestUser(query, headers);
  if (!requestUser) {
    const error = new Error('A valid x-user-id and x-role header are required.');
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  const user = await loadUser(query, requestUser);
  if (!user) {
    const error = new Error('Unknown user or role mismatch.');
    error.code = 'FORBIDDEN';
    throw error;
  }

  const conditions = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    conditions.push(sql.replace('?', `$${params.length}`));
  };

  if (user.role === 'field') {
    const error = new Error('Field users do not have access to alerts.');
    error.code = 'FORBIDDEN';
    throw error;
  }

  if (user.role === 'vecdim') add('state = ?', user.state);
  else if (state) add('state = ?', state);

  if (lga) add('lga = ?', lga);
  if (from) add('month >= ?', from);
  if (to) add('month <= ?', to);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(`
    SELECT
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
    ORDER BY month DESC, state, lga
  `, params);

  return result.rows;
}

export { normalizeRole };
