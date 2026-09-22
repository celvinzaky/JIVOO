/**
 * client/js/inventory.js (ES module)
 */
import { api } from './client.js';
import { requireAuthGuard } from '../../js/api.js';
import { renderClientShell, setPageTitle, getContentEl } from './shell.js';
import { showToast } from '../../js/toast.js';
import { openModal } from '../../js/modal.js';

requireAuthGuard(api, { loginUrl: 'index.html', scope: 'client' });

const perms = await renderClientShell('inventory');
if (perms) {
  setPageTitle('Inventory');

  const content = getContentEl();
  content.innerHTML = `
    <div class="flex-between mb-16">
      <div class="flex-gap-8">
        <input type="text" id="search-input" placeholder="Cari produk atau SKU..." style="width:240px; padding:9px 11px; border:1px solid var(--color-border); border-radius:6px; font-size:13.5px;" />
        <label style="display:flex; align-items:center; gap:6px; font-size:13px;">
          <input type="checkbox" id="low-stock-only" /> Stok menipis saja
        </label>
      </div>
      <button class="btn btn-primary" id="opname-btn">Stock Opname</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Produk</th><th>Stok</th><th>Ambang Batas</th><th></th></tr></thead>
        <tbody id="inventory-body"><tr><td colspan="4"><div class="skeleton" style="height:20px;"></div></td></tr></tbody>
      </table>
    </div>
  `;

  let allInventory = [];
  let debounceTimer = null;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  async function loadInventory() {
    const tbody = document.getElementById('inventory-body');
    tbody.innerHTML = `<tr><td colspan="4"><div class="skeleton" style="height:20px;"></div></td></tr>`;

    const params = new URLSearchParams();
    const q = document.getElementById('search-input').value.trim();
    const lowOnly = document.getElementById('low-stock-only').checked;
    if (q) params.set('q', q);
    if (lowOnly) params.set('low_stock_only', 'true');

    try {
      const res = await api.get(`/back-office/inventory?${params.toString()}`);
      allInventory = res.data;
      const isLow = (r) => r.stock_qty <= r.low_stock_threshold;

      tbody.innerHTML = res.data.length
        ? res.data
            .map(
              (r) => `
        <tr>
          <td>
            <div style="font-weight:600;">${escapeHtml(r.product_name)}</div>
            <div class="text-sm text-muted">${r.sku ? 'SKU: ' + escapeHtml(r.sku) : ''}</div>
          </td>
          <td>${r.stock_qty} ${escapeHtml(r.unit)} ${isLow(r) ? '<span class="badge badge-suspended">menipis</span>' : ''}</td>
          <td class="text-sm text-muted">${r.low_stock_threshold} ${escapeHtml(r.unit)}</td>
          <td>
            <div class="flex-gap-8">
              <button class="btn btn-secondary btn-sm" data-action="history" data-id="${r.product_id}" data-name="${escapeHtml(r.product_name)}">Riwayat</button>
              <button class="btn btn-secondary btn-sm" data-action="adjust" data-id="${r.product_id}" data-name="${escapeHtml(r.product_name)}" data-stock="${r.stock_qty}" data-unit="${escapeHtml(r.unit)}">Sesuaikan</button>
              <button class="btn btn-danger btn-sm" data-action="waste" data-id="${r.product_id}" data-name="${escapeHtml(r.product_name)}" data-unit="${escapeHtml(r.unit)}">Waste</button>
            </div>
          </td>
        </tr>`
            )
            .join('')
        : `<tr><td colspan="4"><div class="empty-state">Tidak ada data inventory</div></td></tr>`;

      wireRowActions();
    } catch (err) {
      showToast(err.message || 'Gagal memuat inventory', 'error');
    }
  }

  function wireRowActions() {
    document.querySelectorAll('[data-action="history"]').forEach((btn) => {
      btn.addEventListener('click', () => openHistoryModal(btn.dataset.id, btn.dataset.name));
    });
    document.querySelectorAll('[data-action="adjust"]').forEach((btn) => {
      btn.addEventListener('click', () => openAdjustModal(btn.dataset.id, btn.dataset.name, Number(btn.dataset.stock), btn.dataset.unit));
    });
    document.querySelectorAll('[data-action="waste"]').forEach((btn) => {
      btn.addEventListener('click', () => openWasteModal(btn.dataset.id, btn.dataset.name, btn.dataset.unit));
    });
  }

  document.getElementById('search-input').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadInventory, 300);
  });
  document.getElementById('low-stock-only').addEventListener('change', loadInventory);

  const MOVEMENT_LABELS = { stock_in: 'Stok Masuk', sold: 'Terjual', adjustment: 'Penyesuaian', opname: 'Stock Opname', waste: 'Waste' };

  async function openHistoryModal(productId, name) {
    const { backdrop } = openModal({
      title: `Riwayat — ${name}`,
      bodyHtml: `<div id="history-list"><div class="skeleton" style="height:100px;"></div></div>`,
    });
    try {
      const res = await api.get(`/back-office/inventory/${productId}/logs`);
      backdrop.querySelector('#history-list').innerHTML = res.data.length
        ? `<div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Tipe</th><th>Perubahan</th><th>Sebelum→Sesudah</th><th>Catatan</th></tr></thead><tbody>${res.data
            .map(
              (l) => `<tr>
              <td class="text-sm">${new Date(l.created_at).toLocaleString('id-ID')}</td>
              <td class="text-sm">${MOVEMENT_LABELS[l.type] || l.type}</td>
              <td class="text-sm" style="color:${l.qty_change >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${l.qty_change >= 0 ? '+' : ''}${l.qty_change}</td>
              <td class="text-sm">${l.qty_before} &rarr; ${l.qty_after}</td>
              <td class="text-sm text-muted">${escapeHtml(l.notes || '')}</td>
            </tr>`
            )
            .join('')}</tbody></table></div>`
        : `<div class="empty-state">Belum ada riwayat pergerakan stok</div>`;
    } catch (err) {
      backdrop.querySelector('#history-list').innerHTML = `<div class="empty-state">Gagal memuat riwayat</div>`;
    }
  }

  function openAdjustModal(productId, name, currentStock, unit) {
    const { backdrop, close } = openModal({
      title: `Sesuaikan Stok — ${name}`,
      bodyHtml: `
        <p class="text-sm">Stok saat ini: <strong>${currentStock} ${unit}</strong></p>
        <form id="adjust-form" novalidate>
          <div class="field">
            <label>Perubahan (gunakan angka negatif untuk mengurangi) *</label>
            <input type="number" name="delta" required placeholder="mis. 10 atau -5" />
          </div>
          <div class="field">
            <label>Catatan *</label>
            <input type="text" name="notes" required placeholder="mis. koreksi hitung ulang gudang" />
          </div>
          <div class="error-text" id="adjust-error"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="adjust-submit-btn">Simpan</button>
      `,
    });

    backdrop.querySelector('#adjust-submit-btn').addEventListener('click', async () => {
      const form = backdrop.querySelector('#adjust-form');
      const errorEl = backdrop.querySelector('#adjust-error');
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const delta = Number(fd.get('delta'));
      if (!delta) { errorEl.textContent = 'Perubahan tidak boleh 0'; errorEl.style.display = 'block'; return; }

      const btn = backdrop.querySelector('#adjust-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

      try {
        await api.post('/back-office/inventory/adjust', { product_id: productId, delta, notes: fd.get('notes') });
        showToast('Stok berhasil disesuaikan', 'success');
        close();
        loadInventory();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal menyesuaikan stok';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Simpan';
      }
    });
  }

  function openWasteModal(productId, name, unit) {
    const { backdrop, close } = openModal({
      title: `Catat Waste — ${name}`,
      bodyHtml: `
        <form id="waste-form" novalidate>
          <div class="field">
            <label>Jumlah (${unit}) *</label>
            <input type="number" name="qty" required min="1" placeholder="1" />
          </div>
          <div class="field">
            <label>Kategori *</label>
            <select name="category" required>
              <option value="expired">Expired</option>
              <option value="damaged">Damaged</option>
              <option value="lost">Lost</option>
              <option value="not_sellable">Not Sellable</option>
            </select>
          </div>
          <div class="field">
            <label>Catatan</label>
            <input type="text" name="notes" placeholder="opsional" />
          </div>
          <div class="error-text" id="waste-error"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-danger" id="waste-submit-btn">Catat Waste</button>
      `,
    });

    backdrop.querySelector('#waste-submit-btn').addEventListener('click', async () => {
      const form = backdrop.querySelector('#waste-form');
      const errorEl = backdrop.querySelector('#waste-error');
      if (!form.reportValidity()) return;
      const fd = new FormData(form);

      const btn = backdrop.querySelector('#waste-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

      try {
        await api.post('/back-office/inventory/waste', {
          product_id: productId, qty: Number(fd.get('qty')), category: fd.get('category'), notes: fd.get('notes') || null,
        });
        showToast('Waste berhasil dicatat', 'success');
        close();
        loadInventory();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal mencatat waste';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Catat Waste';
      }
    });
  }

  // ---- Stock Opname: full list with editable actual-stock inputs --------
  document.getElementById('opname-btn').addEventListener('click', async () => {
    let items;
    try {
      items = (await api.get('/back-office/inventory')).data;
    } catch (err) {
      showToast('Gagal memuat data untuk opname', 'error');
      return;
    }

    const { backdrop, close } = openModal({
      title: 'Stock Opname',
      bodyHtml: `
        <p class="text-sm">Masukkan jumlah fisik aktual untuk tiap produk. Selisih akan otomatis dihitung dan stok disesuaikan saat disimpan.</p>
        <div class="table-wrap" style="max-height:320px; overflow-y:auto;">
          <table>
            <thead><tr><th>Produk</th><th>Sistem</th><th>Aktual</th><th>Selisih</th></tr></thead>
            <tbody id="opname-rows">
              ${items
                .map(
                  (i) => `
                <tr data-product-id="${i.product_id}">
                  <td class="text-sm">${escapeHtml(i.product_name)}</td>
                  <td class="text-sm">${i.stock_qty}</td>
                  <td><input type="number" class="opname-actual" value="${i.stock_qty}" min="0" style="width:80px; padding:5px 7px; border:1px solid var(--color-border); border-radius:5px;" /></td>
                  <td class="opname-diff text-sm text-muted">0</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <div class="field mt-16">
          <label>Catatan Umum</label>
          <input type="text" id="opname-notes" placeholder="mis. opname bulanan September" />
        </div>
        <div class="error-text" id="opname-error"></div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="opname-submit-btn">Simpan Opname</button>
      `,
    });

    backdrop.querySelectorAll('.opname-actual').forEach((input) => {
      input.addEventListener('input', () => {
        const row = input.closest('tr');
        const system = Number(row.children[1].textContent);
        const actual = Number(input.value) || 0;
        const diff = actual - system;
        const diffCell = row.querySelector('.opname-diff');
        diffCell.textContent = diff > 0 ? `+${diff}` : diff;
        diffCell.style.color = diff === 0 ? '' : diff > 0 ? 'var(--color-success)' : 'var(--color-danger)';
      });
    });

    backdrop.querySelector('#opname-submit-btn').addEventListener('click', async () => {
      const errorEl = backdrop.querySelector('#opname-error');
      const lines = Array.from(backdrop.querySelectorAll('#opname-rows tr')).map((row) => ({
        product_id: row.dataset.productId,
        actual_stock: Number(row.querySelector('.opname-actual').value),
      }));
      const notes = backdrop.querySelector('#opname-notes').value || null;

      const btn = backdrop.querySelector('#opname-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

      try {
        const result = await api.post('/back-office/inventory/stock-opname', { lines, notes });
        showToast(`Opname disimpan — ${result.adjustments_applied} produk disesuaikan`, 'success', 4000);
        close();
        loadInventory();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal menyimpan opname';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Simpan Opname';
      }
    });
  });

  loadInventory();
}
