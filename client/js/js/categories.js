/**
 * client/js/categories.js (ES module)
 */
import { api } from './client.js';
import { requireAuthGuard } from '../../js/api.js';
import { renderClientShell, setPageTitle, getContentEl } from './shell.js';
import { showToast } from '../../js/toast.js';
import { openModal, confirmDialog } from '../../js/modal.js';

requireAuthGuard(api, { loginUrl: 'index.html', scope: 'client' });

const perms = await renderClientShell('categories');
if (perms) {
  setPageTitle('Kategori');

  const content = getContentEl();
  content.innerHTML = `
    <div class="flex-between mb-16">
      <input type="text" id="search-input" placeholder="Cari kategori..." style="width:240px; padding:9px 11px; border:1px solid var(--color-border); border-radius:6px; font-size:13.5px;" />
      <button class="btn btn-primary" id="new-cat-btn">+ Kategori Baru</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nama</th><th>Status</th><th></th></tr></thead>
        <tbody id="cat-body"><tr><td colspan="3"><div class="skeleton" style="height:20px;"></div></td></tr></tbody>
      </table>
    </div>
  `;

  let debounceTimer = null;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  async function loadCategories(q = '') {
    const tbody = document.getElementById('cat-body');
    tbody.innerHTML = `<tr><td colspan="3"><div class="skeleton" style="height:20px;"></div></td></tr>`;
    try {
      const params = q ? `?q=${encodeURIComponent(q)}` : '';
      const res = await api.get(`/back-office/categories${params}`);
      tbody.innerHTML = res.data.length
        ? res.data
            .map(
              (c) => `
        <tr>
          <td style="font-weight:600;">${escapeHtml(c.name)}</td>
          <td><span class="badge badge-${c.status}">${c.status}</span></td>
          <td>
            <div class="flex-gap-8">
              <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${c.id}" data-name="${escapeHtml(c.name)}">Edit</button>
              <button class="btn ${c.status === 'active' ? 'btn-danger' : 'btn-success'} btn-sm" data-action="toggle" data-id="${c.id}" data-status="${c.status}">${c.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</button>
            </div>
          </td>
        </tr>`
            )
            .join('')
        : `<tr><td colspan="3"><div class="empty-state">Belum ada kategori</div></td></tr>`;

      wireActions();
    } catch (err) {
      showToast(err.message || 'Gagal memuat kategori', 'error');
    }
  }

  function wireActions() {
    document.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => openCategoryModal({ id: btn.dataset.id, name: btn.dataset.name }));
    });
    document.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const newStatus = btn.dataset.status === 'active' ? 'inactive' : 'active';
        const ok = await confirmDialog({
          title: `${newStatus === 'active' ? 'Aktifkan' : 'Nonaktifkan'} kategori ini?`,
          message: newStatus === 'inactive' ? 'Produk dalam kategori ini tetap ada, hanya kategorinya yang disembunyikan dari pilihan baru.' : 'Kategori akan aktif kembali.',
          tone: newStatus === 'inactive' ? 'danger' : 'default',
        });
        if (!ok) return;
        try {
          await api.patch(`/back-office/categories/${btn.dataset.id}/status`, { status: newStatus });
          showToast('Status kategori diperbarui', 'success');
          loadCategories(document.getElementById('search-input').value.trim());
        } catch (err) {
          showToast(err.message || 'Gagal mengubah status', 'error');
        }
      });
    });
  }

  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => loadCategories(e.target.value.trim()), 300);
  });

  document.getElementById('new-cat-btn').addEventListener('click', () => openCategoryModal(null));

  function openCategoryModal(category) {
    const isEdit = !!category;
    const { backdrop, close } = openModal({
      title: isEdit ? 'Edit Kategori' : 'Kategori Baru',
      bodyHtml: `
        <form id="cat-form" novalidate>
          <div class="field">
            <label>Nama Kategori *</label>
            <input type="text" name="name" required value="${isEdit ? escapeHtml(category.name) : ''}" placeholder="Minuman" />
          </div>
          <div class="error-text" id="cat-error"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="cat-submit-btn">${isEdit ? 'Simpan' : 'Buat'}</button>
      `,
    });

    backdrop.querySelector('#cat-submit-btn').addEventListener('click', async () => {
      const form = backdrop.querySelector('#cat-form');
      const errorEl = backdrop.querySelector('#cat-error');
      if (!form.reportValidity()) return;
      const { name } = Object.fromEntries(new FormData(form).entries());

      const btn = backdrop.querySelector('#cat-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

      try {
        if (isEdit) {
          await api.patch(`/back-office/categories/${category.id}`, { name });
        } else {
          await api.post('/back-office/categories', { name });
        }
        showToast('Kategori berhasil disimpan', 'success');
        close();
        loadCategories();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal menyimpan kategori';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = isEdit ? 'Simpan' : 'Buat';
      }
    });
  }

  loadCategories();
}
