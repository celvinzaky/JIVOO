/**
 * client/js/customers.js (ES module)
 */
import { api } from './client.js';
import { requireAuthGuard } from '../../js/api.js';
import { renderClientShell, setPageTitle, getContentEl } from './shell.js';
import { showToast } from '../../js/toast.js';
import { openModal, confirmDialog } from '../../js/modal.js';
import { parseCsv, csvTemplate, downloadTextFile } from '../../js/csv.js';

requireAuthGuard(api, { loginUrl: 'index.html', scope: 'client' });

const perms = await renderClientShell('customers');
if (perms) {
  setPageTitle('Pelanggan');

  const content = getContentEl();
  content.innerHTML = `
    <div class="flex-between mb-16">
      <div class="flex-gap-8">
        <input type="text" id="search-input" placeholder="Cari nama, telepon, email..." style="width:260px; padding:9px 11px; border:1px solid var(--color-border); border-radius:6px; font-size:13.5px;" />
        <select id="member-filter" style="padding:9px 11px; border:1px solid var(--color-border); border-radius:6px; font-size:13.5px;">
          <option value="">Semua</option>
          <option value="true">Member</option>
          <option value="false">Non-Member</option>
        </select>
      </div>
      <div class="flex-gap-8">
        <button class="btn btn-secondary" id="import-btn">Import CSV</button>
        <button class="btn btn-primary" id="new-customer-btn">+ Pelanggan Baru</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nama</th><th>Kontak</th><th>Member</th><th>Poin</th><th>Total Belanja</th><th></th></tr></thead>
        <tbody id="customers-body"><tr><td colspan="6"><div class="skeleton" style="height:20px;"></div></td></tr></tbody>
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

  let state = { q: '', is_member: '', page: 1, limit: 10 };
  let debounceTimer = null;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
  function formatIDR(n) {
    return 'Rp' + Number(n || 0).toLocaleString('id-ID');
  }

  async function loadCustomers() {
    const tbody = document.getElementById('customers-body');
    tbody.innerHTML = `<tr><td colspan="6"><div class="skeleton" style="height:20px;"></div></td></tr>`;

    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.is_member) params.set('is_member', state.is_member);
    params.set('page', state.page);
    params.set('limit', state.limit);

    try {
      const res = await api.get(`/back-office/customers?${params.toString()}`);
      tbody.innerHTML = res.data.length
        ? res.data
            .map(
              (c) => `
        <tr>
          <td style="font-weight:600;">${escapeHtml(c.name)}</td>
          <td class="text-sm">${escapeHtml(c.phone || '')}${c.email ? '<br>' + escapeHtml(c.email) : ''}</td>
          <td>${c.is_member ? '<span class="badge badge-active">Member</span>' : '<span class="text-muted text-sm">—</span>'}</td>
          <td>${c.points || 0}</td>
          <td>${formatIDR(c.total_spending)}</td>
          <td>
            <div class="flex-gap-8">
              <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${c.id}">Edit</button>
              <button class="btn btn-secondary btn-sm" data-action="points" data-id="${c.id}" data-name="${escapeHtml(c.name)}" data-points="${c.points || 0}">Poin</button>
            </div>
          </td>
        </tr>`
            )
            .join('')
        : `<tr><td colspan="6"><div class="empty-state">Tidak ada pelanggan yang cocok</div></td></tr>`;

      document.getElementById('pagination-info').textContent = `Menampilkan ${res.data.length} dari ${res.pagination.total} pelanggan — Halaman ${res.pagination.page}/${res.pagination.total_pages}`;
      document.getElementById('prev-page').disabled = res.pagination.page <= 1;
      document.getElementById('next-page').disabled = res.pagination.page >= res.pagination.total_pages;

      wireRowActions(res.data);
    } catch (err) {
      showToast(err.message || 'Gagal memuat pelanggan', 'error');
    }
  }

  function wireRowActions(customers) {
    document.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => openCustomerModal(customers.find((c) => c.id === btn.dataset.id)));
    });
    document.querySelectorAll('[data-action="points"]').forEach((btn) => {
      btn.addEventListener('click', () => openPointsModal(btn.dataset.id, btn.dataset.name, Number(btn.dataset.points)));
    });
  }

  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; loadCustomers(); }, 350);
  });
  document.getElementById('member-filter').addEventListener('change', (e) => { state.is_member = e.target.value; state.page = 1; loadCustomers(); });
  document.getElementById('prev-page').addEventListener('click', () => { if (state.page > 1) { state.page -= 1; loadCustomers(); } });
  document.getElementById('next-page').addEventListener('click', () => { state.page += 1; loadCustomers(); });

  document.getElementById('new-customer-btn').addEventListener('click', () => openCustomerModal(null));

  function openCustomerModal(customer) {
    const isEdit = !!customer;
    const { backdrop, close } = openModal({
      title: isEdit ? `Edit — ${customer.name}` : 'Pelanggan Baru',
      bodyHtml: `
        <form id="customer-form" novalidate>
          <div class="field">
            <label>Nama *</label>
            <input type="text" name="name" required value="${isEdit ? escapeHtml(customer.name) : ''}" placeholder="Andi Wijaya" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Telepon</label>
              <input type="text" name="phone" value="${isEdit && customer.phone ? escapeHtml(customer.phone) : ''}" placeholder="0812xxxxxxx" />
            </div>
            <div class="field">
              <label>Email</label>
              <input type="email" name="email" value="${isEdit && customer.email ? escapeHtml(customer.email) : ''}" />
            </div>
          </div>
          <div class="field">
            <label>Alamat</label>
            <input type="text" name="address" value="${isEdit && customer.address ? escapeHtml(customer.address) : ''}" />
          </div>
          <div class="field">
            <label style="display:flex; align-items:center; gap:6px; font-weight:400;">
              <input type="checkbox" name="is_member" ${isEdit && customer.is_member ? 'checked' : ''} />
              Jadikan member (harga khusus member & poin reward)
            </label>
          </div>
          <div class="error-text" id="customer-error"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="customer-submit-btn">${isEdit ? 'Simpan' : 'Buat'}</button>
      `,
    });

    backdrop.querySelector('#customer-submit-btn').addEventListener('click', async () => {
      const form = backdrop.querySelector('#customer-form');
      const errorEl = backdrop.querySelector('#customer-error');
      if (!form.reportValidity()) return;

      const fd = new FormData(form);
      const payload = {
        name: fd.get('name'),
        phone: fd.get('phone') || null,
        email: fd.get('email') || null,
        address: fd.get('address') || null,
        is_member: fd.get('is_member') === 'on',
      };

      const btn = backdrop.querySelector('#customer-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

      try {
        if (isEdit) {
          await api.patch(`/back-office/customers/${customer.id}`, payload);
        } else {
          await api.post('/back-office/customers', payload);
        }
        showToast('Pelanggan berhasil disimpan', 'success');
        close();
        loadCustomers();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal menyimpan pelanggan';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = isEdit ? 'Simpan' : 'Buat';
      }
    });
  }

  function openPointsModal(customerId, name, currentPoints) {
    const { backdrop, close } = openModal({
      title: `Sesuaikan Poin — ${name}`,
      bodyHtml: `
        <p class="text-sm">Poin saat ini: <strong>${currentPoints}</strong></p>
        <form id="points-form" novalidate>
          <div class="field">
            <label>Penyesuaian (gunakan angka negatif untuk mengurangi) *</label>
            <input type="number" name="delta" required placeholder="mis. 50 atau -20" />
          </div>
          <div class="field">
            <label>Alasan</label>
            <input type="text" name="reason" placeholder="mis. bonus promo ulang tahun" />
          </div>
          <div class="error-text" id="points-error"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="points-submit-btn">Simpan</button>
      `,
    });

    backdrop.querySelector('#points-submit-btn').addEventListener('click', async () => {
      const form = backdrop.querySelector('#points-form');
      const errorEl = backdrop.querySelector('#points-error');
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const delta = Number(fd.get('delta'));
      const reason = fd.get('reason') || null;

      const btn = backdrop.querySelector('#points-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

      try {
        await api.post(`/back-office/customers/${customerId}/adjust-points`, { delta, reason });
        showToast('Poin berhasil disesuaikan', 'success');
        close();
        loadCustomers();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal menyesuaikan poin';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Simpan';
      }
    });
  }

  // ---- Bulk import via CSV ------------------------------------------------
  document.getElementById('import-btn').addEventListener('click', openImportModal);

  function openImportModal() {
    const { backdrop, close } = openModal({
      title: 'Import Pelanggan dari CSV',
      bodyHtml: `
        <p class="text-sm">Kolom yang dibutuhkan: <code>name</code>. Opsional: <code>phone, email, address, is_member</code> (true/false).</p>
        <button type="button" class="btn btn-secondary btn-sm mb-16" id="download-template-btn">Unduh Template CSV</button>
        <div class="field">
          <label>Pilih File CSV</label>
          <input type="file" id="csv-file-input" accept=".csv,text/csv" />
        </div>
        <div id="import-preview"></div>
        <div class="error-text" id="import-error"></div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="import-submit-btn" disabled>Import</button>
      `,
    });

    let parsedRows = [];

    backdrop.querySelector('#download-template-btn').addEventListener('click', () => {
      downloadTextFile('pelanggan_template.csv', csvTemplate(['name', 'phone', 'email', 'address', 'is_member']));
    });

    backdrop.querySelector('#csv-file-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      parsedRows = parseCsv(text);
      backdrop.querySelector('#import-preview').innerHTML = `<p class="text-sm">${parsedRows.length} baris terbaca.</p>`;
      backdrop.querySelector('#import-submit-btn').disabled = parsedRows.length === 0;
    });

    backdrop.querySelector('#import-submit-btn').addEventListener('click', async () => {
      const errorEl = backdrop.querySelector('#import-error');
      const btn = backdrop.querySelector('#import-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Mengimpor...';

      try {
        const result = await api.post('/back-office/customers/bulk-import', { rows: parsedRows });
        showToast(`Import selesai: ${result.summary.success} berhasil, ${result.summary.failed} gagal`, result.summary.failed ? 'info' : 'success', 5000);
        close();
        loadCustomers();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal mengimpor';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Import';
      }
    });
  }

  loadCustomers();
}
