/**
 * admin/js/client-detail.js (ES module) — extracted for CSP compliance, see login.js
 */
import { api } from './client.js';
import { requireAuthGuard } from '../../js/api.js';
import { renderAdminShell, setPageTitle, getContentEl } from './shell.js';
import { showToast } from '../../js/toast.js';
import { confirmDialog } from '../../js/modal.js';
import { renderBarChart } from '../../js/charts.js';

requireAuthGuard(api, { loginUrl: 'index.html', scope: 'system', role: 'super_admin' });
renderAdminShell('clients');
setPageTitle('Detail Client');

const clientId = new URLSearchParams(window.location.search).get('id');
const content = getContentEl();

if (!clientId) {
  content.innerHTML = `<div class="empty-state">Client ID tidak ditemukan. <a href="clients.html">Kembali ke daftar client</a></div>`;
  throw new Error('missing client id');
}

content.innerHTML = `
  <a href="clients.html" class="text-sm">&larr; Kembali ke daftar client</a>
  <div class="card mt-16" id="detail-header">
    <div class="skeleton" style="height:60px;"></div>
  </div>
  <div class="stat-grid mt-16" id="stat-grid"></div>
  <div class="card mt-16">
    <div class="card-title-row"><h3>Aktivitas Harian (14 hari)</h3></div>
    <canvas class="mini-chart" id="activity-chart" height="150"></canvas>
  </div>
  <div class="card mt-16">
    <div class="card-title-row"><h3>Pengguna</h3></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Status</th><th>Login Terakhir</th></tr></thead>
        <tbody id="users-body"></tbody>
      </table>
    </div>
  </div>
`;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function statCard(label, value, sub) {
  return `<div class="stat-card">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
  </div>`;
}

async function loadDetail() {
  try {
    const detail = await api.get(`/admin/clients/${clientId}`);
    const c = detail.client;

    document.getElementById('detail-header').innerHTML = `
      <div class="flex-between">
        <div>
          <h1>${escapeHtml(c.name)}</h1>
          <div class="text-sm text-muted">Kode: <code>${c.client_code}</code> &middot; Owner: ${escapeHtml(c.owner_email)} &middot; Paket: <span style="text-transform:capitalize;">${c.package}</span></div>
          <div class="mt-8"><span class="badge badge-${c.status}">${c.status}</span></div>
        </div>
        <div class="flex-gap-8">
          <button class="btn btn-secondary" id="export-btn">Download Backup</button>
          ${statusActionButtons(c.status)}
        </div>
      </div>
    `;

    document.getElementById('stat-grid').innerHTML =
      statCard('Outlet', detail.outlet_count) +
      statCard('Total User', detail.user_count) +
      statCard('Dibuat', new Date(c.created_at).toLocaleDateString('id-ID')) +
      statCard('Terakhir Diupdate', new Date(c.updated_at).toLocaleDateString('id-ID'));

    document.getElementById('users-body').innerHTML = detail.users.length
      ? detail.users
          .map(
            (u) => `
        <tr>
          <td>${escapeHtml(u.name)}</td>
          <td>${escapeHtml(u.username)}</td>
          <td style="text-transform:capitalize;">${u.role.replace(/_/g, ' ')}</td>
          <td><span class="badge badge-${u.status}">${u.status}</span></td>
          <td class="text-sm text-muted">${u.last_login ? new Date(u.last_login).toLocaleString('id-ID') : 'Belum pernah'}</td>
        </tr>`
          )
          .join('')
      : `<tr><td colspan="5" class="empty-state">Belum ada pengguna</td></tr>`;

    wireActionButtons();
    wireExportButton();
  } catch (err) {
    showToast(err.message || 'Gagal memuat detail client', 'error');
  }
}

function statusActionButtons(currentStatus) {
  const buttons = [];
  if (currentStatus !== 'active') buttons.push(`<button class="btn btn-success" data-status="active">Aktifkan</button>`);
  if (currentStatus === 'active') buttons.push(`<button class="btn btn-secondary" data-status="inactive">Nonaktifkan</button>`);
  if (currentStatus !== 'suspended') buttons.push(`<button class="btn btn-danger" data-status="suspended">Suspend</button>`);
  return buttons.join('');
}

function wireActionButtons() {
  document.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const newStatus = btn.getAttribute('data-status');
      const tone = newStatus === 'suspended' ? 'danger' : 'default';
      const ok = await confirmDialog({
        title: `Ubah status ke "${newStatus}"?`,
        message:
          newStatus === 'suspended'
            ? 'Seluruh user client ini tidak akan bisa login sampai diaktifkan kembali. Data tidak akan dihapus.'
            : `Status client akan diubah menjadi ${newStatus}.`,
        tone,
        confirmLabel: 'Ya, lanjutkan',
      });
      if (!ok) return;

      try {
        await api.patch(`/admin/clients/${clientId}/status`, { status: newStatus });
        showToast('Status client berhasil diubah', 'success');
        loadDetail();
      } catch (err) {
        showToast(err.message || 'Gagal mengubah status', 'error');
      }
    });
  });
}

function wireExportButton() {
  const btn = document.getElementById('export-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'Menyiapkan...';
    api
      .download(`/admin/clients/${clientId}/export`, `${clientId}_backup.zip`)
      .then(() => showToast('Backup berhasil diunduh', 'success'))
      .catch((err) => showToast(err.message || 'Gagal mengunduh backup', 'error'))
      .finally(() => {
        btn.disabled = false;
        btn.textContent = 'Download Backup';
      });
  });
}

async function loadStats() {
  try {
    const stats = await api.get(`/admin/clients/${clientId}/stats?days=14`);
    renderBarChart(
      document.getElementById('activity-chart'),
      stats.charts.activity_by_day.map((p) => ({ label: p.date.slice(5), count: p.count })),
      { color: '#17b8c4' }
    );
  } catch (err) {
    showToast(err.message || 'Gagal memuat statistik', 'error');
  }
}

loadDetail();
loadStats();
window.addEventListener('resize', loadStats);
