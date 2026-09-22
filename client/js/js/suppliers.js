/**
 * client/js/suppliers.js (ES module)
 */
import { api } from './client.js';
import { requireAuthGuard } from '../../js/api.js';
import { renderClientShell, setPageTitle, getContentEl } from './shell.js';
import { showToast } from '../../js/toast.js';
import { openModal, confirmDialog } from '../../js/modal.js';

requireAuthGuard(api, { loginUrl: 'index.html', scope: 'client' });

const perms = await renderClientShell('suppliers');
if (perms) {
  setPageTitle('Supplier');

  const content = getContentEl();
  content.innerHTML = `
    <div class="flex-between mb-16">
      <input type="text" id="search-input" placeholder="Cari nama atau telepon..." style="width:260px; padding:9px 11px; border:1px solid var(--color-border); border-radius:6px; font-size:13.5px;" />
      <button class="btn btn-primary" id="new-supplier-btn">+ Supplier Baru</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nama</th><th>Kontak</th><th>Alamat</th><th>Status</th><th></th></tr></thead>
        <tbody id="supplier-body"><tr><td colspan="5"><div class="skeleton" style="height:20px;"></div></td></tr></tbody>
      </table>
    </div>
  `;

  let debounceTimer = null;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  async function loadSuppliers(q = '') {
    const tbody = document.getElementById('supplier-body');
    tbody.innerHTML = `<tr><td colspan="5"><div class="skeleton" style="height:20px;"></div></td></tr>`;
    try {
      const params = q ? `?q=${encodeURIComponent(q)}` : '';
      const res = await api.get(`/back-office/suppliers${params}`);
      tbody.innerHTML = res.data.length
        ? res.data
            .map(
              (s) => `
        <tr>
          <td style="font-weight:600;">${escapeHtml(s.name)}</td>
          <td class="text-sm">${escapeHtml(s.phone || '')}${s.email ? '<br>' + escapeHtml(s.email) : ''}</td>
          <td class="text-sm">${escapeHtml(s.address || '—')}</td>
          <td><span class="badge badge-${s.status}">${s.status}</span></td>
          <td>
            <div class="flex-gap-8">
              <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${s.id}">Edit</button>
              <button class="btn ${s.status === 'active' ? 'btn-danger' : 'btn-success'} btn-sm" data-action="toggle" data-id="${s.id}" data-status="${s.status}">${s.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</button>
            </div>
          </td>
        </tr>`
            )
            .join('')
        : `<tr><td colspan="5"><div class="empty-state">Belum ada supplier</div></td></tr>`;

      wireActions(res.data);
    } catch (err) {
      showToast(err.message || 'Gagal memuat supplier', 'error');
    }
  }

  function wireActions(suppliers) {
    document.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => openSupplierModal(suppliers.find((s) => s.id === btn.dataset.id)));
    });
    document.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const newStatus = btn.dataset.status === 'active' ? 'inactive' : 'active';
        const ok = await confirmDialog({ title: `${newStatus === 'active' ? 'Aktifkan' : 'Nonaktifkan'} supplier ini?`, message: 'Perubahan ini dapat dibatalkan kapan saja.' });
        if (!ok) return;
        try {
          await api.patch(`/back-office/suppliers/${btn.dataset.id}/status`, { status: newStatus });
          showToast('Status supplier diperbarui', 'success');
          loadSuppliers();
        } catch (err) {
          showToast(err.message || 'Gagal mengubah status', 'error');
        }
      });
    });
  }

  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => loadSuppliers(e.target.value.trim()), 300);
  });
  document.getElementById('new-supplier-btn').addEventListener('click', () => openSupplierModal(null));

  function openSupplierModal(supplier) {
    const isEdit = !!supplier;
    const { backdrop, close } = openModal({
      title: isEdit ? `Edit — ${supplier.name}` : 'Supplier Baru',
      bodyHtml: `
        <form id="supplier-form" novalidate>
          <div class="field">
            <label>Nama *</label>
            <input type="text" name="name" required value="${isEdit ? escapeHtml(supplier.name) : ''}" placeholder="CV Sumber Kopi Nusantara" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Telepon</label>
              <input type="text" name="phone" value="${isEdit && supplier.phone ? escapeHtml(supplier.phone) : ''}" />
            </div>
            <div class="field">
              <label>Email</label>
              <input type="email" name="email" value="${isEdit && supplier.email ? escapeHtml(supplier.email) : ''}" />
            </div>
          </div>
          <div class="field">
            <label>Alamat</label>
            <input type="text" name="address" value="${isEdit && supplier.address ? escapeHtml(supplier.address) : ''}" />
          </div>
          <div class="error-text" id="supplier-error"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="supplier-submit-btn">${isEdit ? 'Simpan' : 'Buat'}</button>
      `,
    });

    backdrop.querySelector('#supplier-submit-btn').addEventListener('click', async () => {
      const form = backdrop.querySelector('#supplier-form');
      const errorEl = backdrop.querySelector('#supplier-error');
      if (!form.reportValidity()) return;
      const payload = Object.fromEntries(new FormData(form).entries());

      const btn = backdrop.querySelector('#supplier-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

      try {
        if (isEdit) {
          await api.patch(`/back-office/suppliers/${supplier.id}`, payload);
        } else {
          await api.post('/back-office/suppliers', payload);
        }
        showToast('Supplier berhasil disimpan', 'success');
        close();
        loadSuppliers();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal menyimpan supplier';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = isEdit ? 'Simpan' : 'Buat';
      }
    });
  }

  loadSuppliers();
}
