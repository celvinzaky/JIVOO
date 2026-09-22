/**
 * admin/js/dashboard.js (ES module) — extracted for CSP compliance, see login.js
 */
import { api } from './client.js';
import { requireAuthGuard } from '../../js/api.js';
import { renderAdminShell, setPageTitle, getContentEl } from './shell.js';
import { showToast } from '../../js/toast.js';
import { renderBarChart } from '../../js/charts.js';

requireAuthGuard(api, { loginUrl: 'index.html', scope: 'system', role: 'super_admin' });
renderAdminShell('dashboard');
setPageTitle('Dashboard');

const content = getContentEl();
content.innerHTML = `
  <div class="stat-grid" id="stat-grid">
    ${skeletonStatCards(4)}
  </div>
  <div class="card-grid" style="display:grid; grid-template-columns: 2fr 1fr; gap:16px;">
    <div class="card">
      <div class="card-title-row"><h3>Aktivitas Login Admin (14 hari)</h3></div>
      <div class="chart-canvas-wrap"><canvas class="mini-chart" id="login-chart" height="160"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title-row"><h3>Client Terbaru</h3></div>
      <div id="recent-clients-list"></div>
    </div>
  </div>
  <div class="card mt-16">
    <div class="card-title-row"><h3>Client Paling Aktif</h3></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nama Client</th><th>Transaksi</th><th>Aktivitas (audit)</th></tr></thead>
        <tbody id="most-active-body"></tbody>
      </table>
    </div>
  </div>
`;

function skeletonStatCards(n) {
  return Array.from({ length: n })
    .map(() => `<div class="stat-card"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:26px;width:40%;"></div></div>`)
    .join('');
}

function statCard(label, value, sub) {
  return `<div class="stat-card">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
  </div>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function load() {
  try {
    const d = await api.get('/admin/dashboard?days=14');

    document.getElementById('stat-grid').innerHTML =
      statCard('Total Client', d.totals.total_clients, `${d.totals.active_clients} aktif`) +
      statCard('Total User', d.totals.total_users) +
      statCard('Total Outlet', d.totals.total_outlets) +
      statCard('Total Transaksi', d.totals.total_transactions_platform.toLocaleString('id-ID'));

    const canvas = document.getElementById('login-chart');
    renderBarChart(
      canvas,
      d.charts.admin_login_activity.map((p) => ({ label: p.date.slice(5), count: p.count })),
      { color: '#1e5fbf' }
    );

    const recentEl = document.getElementById('recent-clients-list');
    recentEl.innerHTML = d.recent_clients.length
      ? d.recent_clients
          .map(
            (c) => `
        <div class="flex-between" style="padding:8px 0; border-bottom:1px solid var(--color-border);">
          <div>
            <div style="font-weight:600;">${escapeHtml(c.name)}</div>
            <div class="text-sm text-muted">${new Date(c.created_at).toLocaleDateString('id-ID')}</div>
          </div>
          <span class="badge badge-${c.status}">${c.status}</span>
        </div>`
          )
          .join('')
      : `<div class="empty-state text-sm">Belum ada client</div>`;

    const mostActiveBody = document.getElementById('most-active-body');
    mostActiveBody.innerHTML = d.most_active_clients.length
      ? d.most_active_clients
          .map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${c.transactions}</td><td>${c.audit_events}</td></tr>`)
          .join('')
      : `<tr><td colspan="3" class="empty-state">Belum ada data aktivitas</td></tr>`;
  } catch (err) {
    showToast(err.message || 'Gagal memuat dashboard', 'error');
  }
}

load();
window.addEventListener('resize', load);
