const state = { alerts: [], summary: null, section: 'overview' };

const $ = (id) => document.getElementById(id);
const roleEl = $('role');
const userEl = $('user-id');

function identityHeaders() {
  return { 'x-user-id': userEl.value.trim(), 'x-role': roleEl.value };
}

function showStatus(message, error = false) {
  const el = $('status');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.remove('hidden');
}

function clearStatus() { $('status').classList.add('hidden'); }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[char]);
}

function tierBadge(tier) {
  const safe = escapeHtml(tier || '');
  const cls = String(tier || '').toLowerCase();
  return `<span class="tier tier-${cls}">${safe}</span>`;
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...identityHeaders(), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || `Request failed (${response.status})`);
  return body;
}

function setSection(section) {
  state.section = section;
  document.querySelectorAll('.section').forEach((el) => el.classList.toggle('active', el.id === section));
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.section === section));
  $('page-title').textContent = section === 'overview' ? 'Overview' : section === 'alerts' ? 'Alerts' : 'Field records';
}

function renderSummary(summary) {
  $('scope').textContent = summary.state || 'All states';
  $('record-total').textContent = summary.records.total;
  $('record-breakdown').textContent = `${summary.records.synced} synced · ${summary.records.pending_sync} pending · ${summary.records.rejected} rejected`;
  $('alert-total').textContent = summary.alerts.total;
  $('tier-alert').textContent = summary.alerts.byTier.ALERT;
  $('tier-warning').textContent = summary.alerts.byTier.WARNING;
  $('tier-watch').textContent = summary.alerts.byTier.WATCH;
  $('last-updated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
  renderAlerts(summary.alerts.recent || [], $('recent-alerts'), true);
}

function renderAlerts(alerts, target, compact = false) {
  if (!alerts.length) {
    target.innerHTML = '<div class="empty">No alerts available for this scope.</div>';
    return;
  }
  const rows = alerts.map((item) => `<tr>
    <td>${escapeHtml(item.state)}</td>
    <td>${escapeHtml(item.lga)}</td>
    <td>${escapeHtml(item.month || '')}</td>
    <td>${tierBadge(item.tier)}</td>
    <td>${item.mean_risk == null ? '—' : Number(item.mean_risk).toFixed(3)}</td>
    <td class="resistance ${item.pyrethroid_resistance_flag ? 'yes' : 'no'}">${item.pyrethroid_resistance_flag ? 'Flagged' : 'No'}</td>
  </tr>`).join('');
  target.innerHTML = `<table class="table"><thead><tr><th>State</th><th>LGA</th><th>Month</th><th>Tier</th><th>Mean risk</th><th>Resistance</th></tr></thead><tbody>${compact ? rows.slice(0, 6) : rows}</tbody></table>`;
}

async function loadDashboard() {
  clearStatus();
  $('recent-alerts').innerHTML = '<div class="loading">Loading analysis data…</div>';
  try {
    const params = new URLSearchParams();
    if (roleEl.value === 'uniosun' && $('state-filter').value.trim()) params.set('state', $('state-filter').value.trim());
    const summary = await api(`/api/v1/dashboard/summary${params.toString() ? `?${params}` : ''}`);
    state.summary = summary;
    renderSummary(summary);
    if (state.section === 'alerts') await loadAlerts();
    if (state.section === 'records') await loadRecords();
  } catch (error) {
    showStatus(error.message, true);
    $('recent-alerts').innerHTML = '<div class="empty">Unable to load dashboard data.</div>';
  }
}

async function loadAlerts() {
  const params = new URLSearchParams();
  if ($('state-filter').value.trim()) params.set('state', $('state-filter').value.trim());
  if ($('lga-filter').value.trim()) params.set('lga', $('lga-filter').value.trim());
  const result = await api(`/api/v1/alerts${params.toString() ? `?${params}` : ''}`);
  const tier = $('tier-filter').value;
  state.alerts = tier ? result.alerts.filter((item) => item.tier === tier) : result.alerts;
  renderAlerts(state.alerts, $('alerts-table'));
}

async function loadRecords() {
  const target = $('records-table');
  target.innerHTML = '<div class="loading">Loading field records…</div>';
  try {
    const result = await api('/api/v1/dashboard/records?limit=100');
    if (!result.records.length) {
      target.innerHTML = '<div class="empty">No field records are available for this user.</div>';
      return;
    }
    target.innerHTML = `<table class="table"><thead><tr><th>Record</th><th>State</th><th>LGA</th><th>Date</th><th>Species</th><th>Mortality</th><th>GPS accuracy</th><th>Sync</th></tr></thead><tbody>${result.records.map((item) => `<tr>
      <td>${escapeHtml(item.id).slice(0, 8)}…</td><td>${escapeHtml(item.state)}</td><td>${escapeHtml(item.lga)}</td><td>${escapeHtml(item.collection_date)}</td><td>${escapeHtml(item.species)}</td><td>${escapeHtml(item.mortality_pct)}%</td><td>${escapeHtml(item.gps_accuracy_m)} m</td><td class="sync ${escapeHtml(item.sync_status)}">${escapeHtml(item.sync_status)}</td>
    </tr>`).join('')}</tbody></table>`;
  } catch (error) {
    target.innerHTML = '<div class="empty">Field records could not be loaded.</div>';
    showStatus(error.message, true);
  }
}

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', async () => {
  setSection(button.dataset.section);
  if (button.dataset.section === 'alerts') await loadAlerts().catch((error) => showStatus(error.message, true));
  if (button.dataset.section === 'records') await loadRecords();
}));
document.querySelectorAll('[data-section-target]').forEach((button) => button.addEventListener('click', () => setSection(button.dataset.sectionTarget)));
$('refresh').addEventListener('click', loadDashboard);
$('records-refresh').addEventListener('click', loadRecords);
$('apply-filters').addEventListener('click', () => loadAlerts().catch((error) => showStatus(error.message, true)));
roleEl.addEventListener('change', loadDashboard);

if (userEl.value === '') userEl.value = localStorage.getItem('vecdim_user_id') || '';
userEl.addEventListener('change', () => localStorage.setItem('vecdim_user_id', userEl.value.trim()));
setSection('overview');
