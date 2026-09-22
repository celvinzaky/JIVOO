/**
 * admin/js/clients.js (ES module) — extracted for CSP compliance, see login.js
 */
import { api } from './client.js';
import { requireAuthGuard } from '../../js/api.js';
import { renderAdminShell, setPageTitle, getContentEl } from './shell.js';
import { showToast } from '../../js/toast.js';
import { openModal } from '../../js/modal.js';

requireAuthGuard(api, { loginUrl: 'index.html', scope: 'system', role: 'super_admin' });
renderAdminShell('clients');
setPageTitle('Clients');

const content = getContentEl();
content.innerHTML = `
  <div class="flex-between mb-16">
    <div class="flex-gap-8">
      <input type="text" id="search-input" placeholder="Cari nama, email, atau kode client..." style="width:280px; padding:9px 11px; border:1px solid var(--color-border); border-radius:6px; font-size:13.5px;" />
      <select id="status-filter" style="padding:9px 11px; border:1px solid var(--color-border); border-radius:6px; font-size:13.5px;">
        <option value="">Semua Status</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="suspended">Suspended</option>
      </select>
    </div>
    <button class="btn btn-primary" id="new-client-btn">+ Client Baru</button>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Nama</th><th>Kode</th><th>Owner</th><th>Paket</th><th>Status</th><th>Dibuat</th><th></th>
        </tr>
      </thead>
      <tbody id="clients-body">
        <tr><td colspan="7"><div class="skeleton" style="height:20px;"></div></td></tr>
      </tbody>
    </table>
  </div>
  <div class="flex-between mt-16">
    <div class="text-sm text-muted" id="pagination-info"></div>
    <div class="flex-gap-8">
      <button class="btn btn-secondary btn-sm" id="prev-page">&larr; Sebelumnya</button>
      <button class="btn btn-secondary btn-sm" id="next-page">Selanjutnya &rarr;</button>
    </div>
  </div>
`;

let state = { q: '', status: '', page: 1, limit: 10 };
let debounceTimer = null;

function badge(status) {
  return `<span class="badge badge-${status}">${status}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function loadClients() {
  const tbody = document.getElementById('clients-body');
  tbody.innerHTML = `<tr><td colspan="7"><div class="skeleton" style="height:20px;"></div></td></tr>`;

  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.status) params.set('status', state.status);
  params.set('page', state.page);
  params.set('limit', state.limit);

  try {
    const res = await api.get(`/admin/clients?${params.toString()}`);
    if (!res.data.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">&#128193;</div>Belum ada client yang cocok</div></td></tr>`;
    } else {
      tbody.innerHTML = res.data
        .map(
          (c) => `
        <tr>
          <td><a href="client-detail.html?id=${c.client_id}" style="font-weight:600;">${escapeHtml(c.name)}</a></td>
          <td><code>${c.client_code}</code></td>
          <td>${escapeHtml(c.owner_email)}</td>
          <td style="text-transform:capitalize;">${c.package}</td>
          <td>${badge(c.status)}</td>
          <td class="text-sm text-muted">${new Date(c.created_at).toLocaleDateString('id-ID')}</td>
          <td>
            <a href="client-detail.html?id=${c.client_id}" class="btn btn-secondary btn-sm">Detail</a>
          </td>
        </tr>`
        )
        .join('');
    }

    document.getElementById('pagination-info').textContent =
      `Menampilkan ${res.data.length} dari ${res.pagination.total} client — Halaman ${res.pagination.page}/${res.pagination.total_pages || 1}`;
    document.getElementById('prev-page').disabled = res.pagination.page <= 1;
    document.getElementById('next-page').disabled = res.pagination.page >= res.pagination.total_pages;
  } catch (err) {
    showToast(err.message || 'Gagal memuat daftar client', 'error');
  }
}

document.getElementById('search-input').addEventListener('input', (e) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    state.q = e.target.value.trim();
    state.page = 1;
    loadClients();
  }, 350);
});

document.getElementById('status-filter').addEventListener('change', (e) => {
  state.status = e.target.value;
  state.page = 1;
  loadClients();
});

document.getElementById('prev-page').addEventListener('click', () => {
  if (state.page > 1) { state.page -= 1; loadClients(); }
});
document.getElementById('next-page').addEventListener('click', () => {
  state.page += 1; loadClients();
});

document.getElementById('new-client-btn').addEventListener('click', openCreateClientModal);

function openCreateClientModal() {
  const { backdrop, close } = openModal({
    title: 'Buat Client Baru',
    bodyHtml: `
      <form id="create-client-form" novalidate>
        <div class="field">
          <label>Nama Perusahaan / Toko *</label>
          <input type="text" name="company_name" required placeholder="Kopi Senja" />
        </div>
        <div class="field">
          <label>Nama Brand (opsional)</label>
          <input type="text" name="brand_name" placeholder="Kopi Senja Coffee Co." />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Nama Owner *</label>
            <input type="text" name="owner_name" required placeholder="Budi Santoso" />
          </div>
          <div class="field">
            <label>Jumlah Outlet</label>
            <input type="number" name="outlet_count" min="1" value="1" />
          </div>
        </div>
        <div class="field">
          <label>Email Owner *</label>
          <input type="email" name="email" required placeholder="owner@tokosaya.com" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Username Owner *</label>
            <input type="text" name="username" required placeholder="budi" />
          </div>
          <div class="field">
            <label>Password Sementara *</label>
            <input type="text" name="password" required placeholder="min. 8 karakter" />
          </div>
        </div>
        <div class="field">
          <label>Paket</label>
          <select name="package">
            <option value="starter">Starter</option>
            <option value="business">Business</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <div class="error-text" id="create-error"></div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-action="close">Batal</button>
      <button class="btn btn-primary" id="create-submit-btn">Buat Client</button>
    `,
  });

  backdrop.querySelector('#create-submit-btn').addEventListener('click', async () => {
    const form = backdrop.querySelector('#create-client-form');
    const errorEl = backdrop.querySelector('#create-error');
    if (!form.reportValidity()) return;

    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.outlet_count = parseInt(payload.outlet_count, 10) || 1;

    const btn = backdrop.querySelector('#create-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Membuat...';

    try {
      const result = await api.post('/admin/clients', payload);
      showToast(`Client "${result.client.name}" berhasil dibuat. Kode: ${result.client.client_code}`, 'success', 5000);
      close();
      state.page = 1;
      loadClients();
    } catch (err) {
      errorEl.textContent = err.message || 'Gagal membuat client';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Buat Client';
    }
  });
}

loadClients();
