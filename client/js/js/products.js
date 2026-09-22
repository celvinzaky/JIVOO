/**
 * client/js/products.js (ES module)
 */
import { api } from './client.js';
import { requireAuthGuard } from '../../js/api.js';
import { renderClientShell, setPageTitle, getContentEl } from './shell.js';
import { showToast } from '../../js/toast.js';
import { openModal, confirmDialog } from '../../js/modal.js';
import { parseCsv, csvTemplate, downloadTextFile } from '../../js/csv.js';

requireAuthGuard(api, { loginUrl: 'index.html', scope: 'client' });

const perms = await renderClientShell('products');
if (perms) {
  setPageTitle('Produk');

  const content = getContentEl();
  content.innerHTML = `
    <div class="flex-between mb-16">
      <div class="flex-gap-8">
        <input type="text" id="search-input" placeholder="Cari nama, SKU, barcode..." style="width:240px; padding:9px 11px; border:1px solid var(--color-border); border-radius:6px; font-size:13.5px;" />
        <select id="category-filter" style="padding:9px 11px; border:1px solid var(--color-border); border-radius:6px; font-size:13.5px;"><option value="">Semua Kategori</option></select>
        <select id="sort-select" style="padding:9px 11px; border:1px solid var(--color-border); border-radius:6px; font-size:13.5px;">
          <option value="name-asc">Nama A-Z</option>
          <option value="name-desc">Nama Z-A</option>
          <option value="price-asc">Harga Terendah</option>
          <option value="price-desc">Harga Tertinggi</option>
        </select>
      </div>
      <div class="flex-gap-8">
        <button class="btn btn-secondary" id="import-btn">Import CSV</button>
        <button class="btn btn-primary" id="new-product-btn">+ Produk Baru</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Produk</th><th>Kategori</th><th>Harga</th><th>Stok</th><th>Status</th><th></th></tr></thead>
        <tbody id="products-body"><tr><td colspan="6"><div class="skeleton" style="height:20px;"></div></td></tr></tbody>
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

  let categoriesCache = [];
  let state = { q: '', category_id: '', sort: 'name', order: 'asc', page: 1, limit: 10 };
  let debounceTimer = null;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
  function formatIDR(n) {
    return 'Rp' + Number(n || 0).toLocaleString('id-ID');
  }
  function categoryName(id) {
    return categoriesCache.find((c) => c.id === id)?.name || '—';
  }

  async function loadCategories() {
    const res = await api.get('/back-office/categories');
    categoriesCache = res.data;
    const select = document.getElementById('category-filter');
    select.innerHTML = '<option value="">Semua Kategori</option>' + res.data.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }

  async function loadProducts() {
    const tbody = document.getElementById('products-body');
    tbody.innerHTML = `<tr><td colspan="6"><div class="skeleton" style="height:20px;"></div></td></tr>`;

    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category_id) params.set('category_id', state.category_id);
    params.set('sort', state.sort);
    params.set('order', state.order);
    params.set('page', state.page);
    params.set('limit', state.limit);

    try {
      const res = await api.get(`/back-office/products?${params.toString()}`);
      tbody.innerHTML = res.data.length
        ? res.data
            .map(
              (p) => `
        <tr>
          <td>
            <div style="font-weight:600;">${escapeHtml(p.name)}${p.is_bundle ? ' <span class="badge badge-active">bundle</span>' : ''}</div>
            <div class="text-sm text-muted">${p.sku ? 'SKU: ' + escapeHtml(p.sku) : ''}</div>
          </td>
          <td class="text-sm">${escapeHtml(categoryName(p.category_id))}</td>
          <td>${formatIDR(p.price)}</td>
          <td class="text-sm">${p.stock_qty !== null ? p.stock_qty : '<span class="text-muted">—</span>'}</td>
          <td><span class="badge badge-${p.status}">${p.status}</span></td>
          <td>
            <div class="flex-gap-8">
              <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${p.id}">Edit</button>
              <button class="btn ${p.status === 'active' ? 'btn-danger' : 'btn-success'} btn-sm" data-action="toggle" data-id="${p.id}" data-status="${p.status}">${p.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</button>
            </div>
          </td>
        </tr>`
            )
            .join('')
        : `<tr><td colspan="6"><div class="empty-state">Tidak ada produk yang cocok</div></td></tr>`;

      document.getElementById('pagination-info').textContent = `Menampilkan ${res.data.length} dari ${res.pagination.total} produk — Halaman ${res.pagination.page}/${res.pagination.total_pages}`;
      document.getElementById('prev-page').disabled = res.pagination.page <= 1;
      document.getElementById('next-page').disabled = res.pagination.page >= res.pagination.total_pages;

      wireRowActions(res.data);
    } catch (err) {
      showToast(err.message || 'Gagal memuat produk', 'error');
    }
  }

  function wireRowActions(products) {
    document.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => openProductModal(products.find((p) => p.id === btn.dataset.id)));
    });
    document.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const newStatus = btn.dataset.status === 'active' ? 'inactive' : 'active';
        const ok = await confirmDialog({
          title: `${newStatus === 'active' ? 'Aktifkan' : 'Nonaktifkan'} produk ini?`,
          message: newStatus === 'inactive' ? 'Produk tidak akan muncul di kasir sampai diaktifkan kembali.' : 'Produk akan muncul kembali di kasir.',
          tone: newStatus === 'inactive' ? 'danger' : 'default',
        });
        if (!ok) return;
        try {
          await api.patch(`/back-office/products/${btn.dataset.id}/status`, { status: newStatus });
          showToast('Status produk diperbarui', 'success');
          loadProducts();
        } catch (err) {
          showToast(err.message || 'Gagal mengubah status', 'error');
        }
      });
    });
  }

  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; loadProducts(); }, 350);
  });
  document.getElementById('category-filter').addEventListener('change', (e) => { state.category_id = e.target.value; state.page = 1; loadProducts(); });
  document.getElementById('sort-select').addEventListener('change', (e) => {
    const [sort, order] = e.target.value.split('-');
    state.sort = sort; state.order = order; state.page = 1; loadProducts();
  });
  document.getElementById('prev-page').addEventListener('click', () => { if (state.page > 1) { state.page -= 1; loadProducts(); } });
  document.getElementById('next-page').addEventListener('click', () => { state.page += 1; loadProducts(); });

  // ---- Create / edit modal, with dynamic add-ons and bundle toggle -----
  document.getElementById('new-product-btn').addEventListener('click', () => openProductModal(null));

  function categoryOptionsHtml(selectedId) {
    return categoriesCache.map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  }

  function addonRowHtml(addon = { name: '', price: '' }) {
    return `
      <div class="flex-gap-8 addon-row" style="margin-bottom:6px;">
        <input type="text" class="addon-name" placeholder="Nama (mis. Extra Keju)" value="${escapeHtml(addon.name)}" style="flex:2; padding:7px 9px; border:1px solid var(--color-border); border-radius:6px; font-size:13px;" />
        <input type="number" class="addon-price" placeholder="Harga" value="${addon.price}" style="flex:1; padding:7px 9px; border:1px solid var(--color-border); border-radius:6px; font-size:13px;" />
        <button type="button" class="btn btn-secondary btn-sm remove-addon">&times;</button>
      </div>`;
  }

  function openProductModal(product) {
    const isEdit = !!product;
    const { backdrop, close } = openModal({
      title: isEdit ? `Edit — ${product.name}` : 'Produk Baru',
      bodyHtml: `
        <form id="product-form" novalidate>
          <div class="field">
            <label>Nama Produk *</label>
            <input type="text" name="name" required value="${isEdit ? escapeHtml(product.name) : ''}" placeholder="Es Kopi Susu" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Kategori *</label>
              <select name="category_id" required>${categoryOptionsHtml(product?.category_id)}</select>
            </div>
            <div class="field">
              <label>Satuan</label>
              <input type="text" name="unit" value="${isEdit ? escapeHtml(product.unit || 'pcs') : 'pcs'}" placeholder="pcs / gelas / porsi" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Harga Jual *</label>
              <input type="number" name="price" required min="0" value="${isEdit ? product.price : ''}" placeholder="15000" />
            </div>
            <div class="field">
              <label>Harga Modal</label>
              <input type="number" name="cost" min="0" value="${isEdit && product.cost !== null ? product.cost : ''}" placeholder="6000" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>SKU</label>
              <input type="text" name="sku" value="${isEdit && product.sku ? escapeHtml(product.sku) : ''}" placeholder="MIN-001" />
            </div>
            <div class="field">
              <label>Barcode</label>
              <input type="text" name="barcode" value="${isEdit && product.barcode ? escapeHtml(product.barcode) : ''}" />
            </div>
          </div>
          <div class="field">
            <label style="display:flex; align-items:center; gap:6px; font-weight:400;">
              <input type="checkbox" name="is_bundle" id="is-bundle-check" ${isEdit && product.is_bundle ? 'checked' : ''} />
              Ini adalah paket/bundle
            </label>
            <div class="hint">Untuk bundle, harga di atas adalah harga paket. Item penyusun paket dapat diatur setelah dibuat.</div>
          </div>
          <div class="field">
            <label>Add-on / Extra / Topping (opsional)</label>
            <div id="addons-container">${(product?.addons || []).map((a) => addonRowHtml(a)).join('')}</div>
            <button type="button" class="btn btn-secondary btn-sm" id="add-addon-btn">+ Tambah Add-on</button>
          </div>
          <div class="error-text" id="product-error"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="product-submit-btn">${isEdit ? 'Simpan' : 'Buat Produk'}</button>
      `,
    });

    backdrop.querySelector('#add-addon-btn').addEventListener('click', () => {
      backdrop.querySelector('#addons-container').insertAdjacentHTML('beforeend', addonRowHtml());
      wireRemoveAddonButtons(backdrop);
    });
    wireRemoveAddonButtons(backdrop);

    backdrop.querySelector('#product-submit-btn').addEventListener('click', async () => {
      const form = backdrop.querySelector('#product-form');
      const errorEl = backdrop.querySelector('#product-error');
      if (!form.reportValidity()) return;

      const fd = new FormData(form);
      const payload = {
        name: fd.get('name'),
        category_id: fd.get('category_id'),
        unit: fd.get('unit') || 'pcs',
        price: Number(fd.get('price')),
        cost: fd.get('cost') ? Number(fd.get('cost')) : null,
        sku: fd.get('sku') || null,
        barcode: fd.get('barcode') || null,
        is_bundle: fd.get('is_bundle') === 'on',
      };
      const addons = Array.from(backdrop.querySelectorAll('.addon-row'))
        .map((row) => ({
          name: row.querySelector('.addon-name').value.trim(),
          price: Number(row.querySelector('.addon-price').value) || 0,
        }))
        .filter((a) => a.name);
      payload.addons = addons;

      if (payload.is_bundle && !isEdit) {
        errorEl.textContent = 'Untuk membuat produk bundle baru, buat dulu sebagai produk biasa lalu edit untuk menambah item paket (fitur penuh menyusul).';
        errorEl.style.display = 'block';
        return;
      }

      const btn = backdrop.querySelector('#product-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

      try {
        if (isEdit) {
          await api.patch(`/back-office/products/${product.id}`, payload);
        } else {
          await api.post('/back-office/products', payload);
        }
        showToast('Produk berhasil disimpan', 'success');
        close();
        loadProducts();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal menyimpan produk';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = isEdit ? 'Simpan' : 'Buat Produk';
      }
    });
  }

  function wireRemoveAddonButtons(backdrop) {
    backdrop.querySelectorAll('.remove-addon').forEach((btn) => {
      btn.onclick = () => btn.closest('.addon-row').remove();
    });
  }

  // ---- Bulk import via CSV ------------------------------------------------
  document.getElementById('import-btn').addEventListener('click', openImportModal);

  function openImportModal() {
    const { backdrop, close } = openModal({
      title: 'Import Produk dari CSV',
      bodyHtml: `
        <p class="text-sm">Kolom yang dibutuhkan: <code>name, category, price</code>. Opsional: <code>sku, unit, cost, barcode</code>. Nilai <code>category</code> harus sama persis dengan nama kategori yang sudah ada.</p>
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
      downloadTextFile('produk_template.csv', csvTemplate(['name', 'category', 'price', 'sku', 'unit', 'cost', 'barcode']));
    });

    backdrop.querySelector('#csv-file-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      parsedRows = parseCsv(text);
      const preview = backdrop.querySelector('#import-preview');
      preview.innerHTML = `<p class="text-sm">${parsedRows.length} baris terbaca. Contoh baris pertama: <code>${parsedRows[0] ? JSON.stringify(parsedRows[0]) : '-'}</code></p>`;
      backdrop.querySelector('#import-submit-btn').disabled = parsedRows.length === 0;
    });

    backdrop.querySelector('#import-submit-btn').addEventListener('click', async () => {
      const errorEl = backdrop.querySelector('#import-error');
      const btn = backdrop.querySelector('#import-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Mengimpor...';

      try {
        const result = await api.post('/back-office/products/bulk-import', { rows: parsedRows });
        showToast(`Import selesai: ${result.summary.success} berhasil, ${result.summary.failed} gagal`, result.summary.failed ? 'info' : 'success', 5000);
        close();
        loadProducts();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal mengimpor';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Import';
      }
    });
  }

  await loadCategories();
  loadProducts();
}
