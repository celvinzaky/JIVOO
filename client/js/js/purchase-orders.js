/**
 * client/js/purchase-orders.js (ES module)
 */
import { api } from './client.js';
import { requireAuthGuard } from '../../js/api.js';
import { renderClientShell, setPageTitle, getContentEl } from './shell.js';
import { showToast } from '../../js/toast.js';
import { openModal, confirmDialog } from '../../js/modal.js';

requireAuthGuard(api, { loginUrl: 'index.html', scope: 'client' });

const perms = await renderClientShell('purchase-orders');
if (perms) {
  setPageTitle('Purchase Order');

  const content = getContentEl();
  content.innerHTML = `
    <div class="flex-between mb-16">
      <select id="status-filter" style="padding:9px 11px; border:1px solid var(--color-border); border-radius:6px; font-size:13.5px;">
        <option value="">Semua Status</option>
        <option value="draft">Draft</option>
        <option value="ordered">Ordered</option>
        <option value="received">Received</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <button class="btn btn-primary" id="new-po-btn">+ Purchase Order Baru</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>No. PO</th><th>Supplier</th><th>Total</th><th>Status</th><th>Pembayaran</th><th></th></tr></thead>
        <tbody id="po-body"><tr><td colspan="6"><div class="skeleton" style="height:20px;"></div></td></tr></tbody>
      </table>
    </div>
  `;

  let suppliersCache = [];
  let productsCache = [];

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
  function formatIDR(n) {
    return 'Rp' + Number(n || 0).toLocaleString('id-ID');
  }
  function supplierName(id) {
    return suppliersCache.find((s) => s.id === id)?.name || '—';
  }

  async function loadRefData() {
    const [supRes, prodRes] = await Promise.all([api.get('/back-office/suppliers'), api.get('/back-office/products?limit=100')]);
    suppliersCache = supRes.data;
    productsCache = prodRes.data;
  }

  async function loadPOs() {
    const tbody = document.getElementById('po-body');
    tbody.innerHTML = `<tr><td colspan="6"><div class="skeleton" style="height:20px;"></div></td></tr>`;
    const status = document.getElementById('status-filter').value;
    const params = status ? `?status=${status}` : '';
    try {
      const res = await api.get(`/back-office/purchase-orders${params}`);
      tbody.innerHTML = res.data.length
        ? res.data
            .map(
              (po) => `
        <tr>
          <td style="font-weight:600;">${po.po_number}</td>
          <td class="text-sm">${escapeHtml(supplierName(po.supplier_id))}</td>
          <td>${formatIDR(po.total_amount)}</td>
          <td><span class="badge badge-${po.status === 'received' ? 'active' : po.status === 'cancelled' ? 'suspended' : 'inactive'}">${po.status}</span></td>
          <td><span class="badge badge-${po.payment_status === 'paid' ? 'active' : po.payment_status === 'partial' ? 'inactive' : 'suspended'}">${po.payment_status}</span></td>
          <td>
            <div class="flex-gap-8">
              <button class="btn btn-secondary btn-sm" data-action="detail" data-id="${po.id}">Detail</button>
            </div>
          </td>
        </tr>`
            )
            .join('')
        : `<tr><td colspan="6"><div class="empty-state">Belum ada purchase order</div></td></tr>`;

      document.querySelectorAll('[data-action="detail"]').forEach((btn) => {
        btn.addEventListener('click', () => openDetailModal(res.data.find((p) => p.id === btn.dataset.id)));
      });
    } catch (err) {
      showToast(err.message || 'Gagal memuat purchase order', 'error');
    }
  }

  document.getElementById('status-filter').addEventListener('change', loadPOs);
  document.getElementById('new-po-btn').addEventListener('click', openCreateModal);

  function itemRowHtml(item = {}) {
    const productOptions = productsCache.map((p) => `<option value="${p.id}" ${item.product_id === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
    return `
      <div class="flex-gap-8 po-item-row" style="margin-bottom:6px;">
        <select class="po-item-product" style="flex:2; padding:7px 9px; border:1px solid var(--color-border); border-radius:6px; font-size:13px;">${productOptions}</select>
        <input type="number" class="po-item-qty" placeholder="Qty" min="1" value="${item.qty || ''}" style="flex:1; padding:7px 9px; border:1px solid var(--color-border); border-radius:6px; font-size:13px;" />
        <input type="number" class="po-item-cost" placeholder="Harga satuan" min="0" value="${item.unit_cost || ''}" style="flex:1; padding:7px 9px; border:1px solid var(--color-border); border-radius:6px; font-size:13px;" />
        <button type="button" class="btn btn-secondary btn-sm remove-po-item">&times;</button>
      </div>`;
  }

  function openCreateModal() {
    const { backdrop, close } = openModal({
      title: 'Purchase Order Baru',
      bodyHtml: `
        <form id="po-form" novalidate>
          <div class="field">
            <label>Supplier *</label>
            <select name="supplier_id" required>
              ${suppliersCache.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Item Pembelian *</label>
            <div id="po-items-container">${itemRowHtml()}</div>
            <button type="button" class="btn btn-secondary btn-sm" id="add-po-item-btn">+ Tambah Item</button>
          </div>
          <div class="field">
            <label>Catatan</label>
            <input type="text" name="notes" placeholder="opsional" />
          </div>
          <p class="text-sm"><strong>Total: <span id="po-total">Rp0</span></strong></p>
          <div class="error-text" id="po-error"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="po-submit-btn">Buat PO (Draft)</button>
      `,
    });

    function recalcTotal() {
      let total = 0;
      backdrop.querySelectorAll('.po-item-row').forEach((row) => {
        const qty = Number(row.querySelector('.po-item-qty').value) || 0;
        const cost = Number(row.querySelector('.po-item-cost').value) || 0;
        total += qty * cost;
      });
      backdrop.querySelector('#po-total').textContent = formatIDR(total);
    }

    function wireItemRow() {
      backdrop.querySelectorAll('.po-item-qty, .po-item-cost').forEach((el) => (el.oninput = recalcTotal));
      backdrop.querySelectorAll('.remove-po-item').forEach((btn) => {
        btn.onclick = () => {
          if (backdrop.querySelectorAll('.po-item-row').length > 1) {
            btn.closest('.po-item-row').remove();
            recalcTotal();
          }
        };
      });
    }
    wireItemRow();

    backdrop.querySelector('#add-po-item-btn').addEventListener('click', () => {
      backdrop.querySelector('#po-items-container').insertAdjacentHTML('beforeend', itemRowHtml());
      wireItemRow();
    });

    backdrop.querySelector('#po-submit-btn').addEventListener('click', async () => {
      const form = backdrop.querySelector('#po-form');
      const errorEl = backdrop.querySelector('#po-error');
      if (!form.reportValidity()) return;

      const items = Array.from(backdrop.querySelectorAll('.po-item-row')).map((row) => ({
        product_id: row.querySelector('.po-item-product').value,
        qty: Number(row.querySelector('.po-item-qty').value),
        unit_cost: Number(row.querySelector('.po-item-cost').value),
      }));
      if (items.some((i) => !i.qty || i.unit_cost === undefined || isNaN(i.unit_cost))) {
        errorEl.textContent = 'Setiap item harus memiliki qty dan harga satuan yang valid';
        errorEl.style.display = 'block';
        return;
      }

      const payload = { supplier_id: form.elements['supplier_id'].value, items, notes: form.elements['notes'].value || null };
      const btn = backdrop.querySelector('#po-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

      try {
        await api.post('/back-office/purchase-orders', payload);
        showToast('Purchase order berhasil dibuat sebagai draft', 'success');
        close();
        loadPOs();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal membuat purchase order';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Buat PO (Draft)';
      }
    });
  }

  function productName(id) {
    return productsCache.find((p) => p.id === id)?.name || id;
  }

  function openDetailModal(po) {
    const canReceive = po.status === 'draft' || po.status === 'ordered';
    const canCancel = po.status === 'draft' || po.status === 'ordered';
    const canPay = po.payment_status !== 'paid';

    const { backdrop, close } = openModal({
      title: `${po.po_number} — ${supplierName(po.supplier_id)}`,
      bodyHtml: `
        <div class="table-wrap mb-16">
          <table>
            <thead><tr><th>Produk</th><th>Qty</th><th>Harga Satuan</th><th>Subtotal</th></tr></thead>
            <tbody>
              ${po.items.map((i) => `<tr><td class="text-sm">${escapeHtml(productName(i.product_id))}</td><td class="text-sm">${i.qty}</td><td class="text-sm">${formatIDR(i.unit_cost)}</td><td class="text-sm">${formatIDR(i.subtotal)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="text-sm"><strong>Total: ${formatIDR(po.total_amount)}</strong> &middot; Dibayar: ${formatIDR(po.paid_amount)} &middot; Status: <span class="badge badge-${po.payment_status === 'paid' ? 'active' : 'inactive'}">${po.payment_status}</span></p>
        ${po.notes ? `<p class="text-sm text-muted">Catatan: ${escapeHtml(po.notes)}</p>` : ''}
        <div id="po-action-error" class="error-text"></div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Tutup</button>
        ${canPay ? `<button class="btn btn-secondary" id="po-pay-btn">Catat Pembayaran</button>` : ''}
        ${canCancel ? `<button class="btn btn-danger" id="po-cancel-btn">Batalkan</button>` : ''}
        ${canReceive ? `<button class="btn btn-primary" id="po-receive-btn">Terima Barang</button>` : ''}
      `,
    });

    backdrop.querySelector('#po-receive-btn')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Terima barang dari PO ini?',
        message: 'Stok produk akan otomatis bertambah sesuai item PO ini. Aksi ini tidak dapat dibatalkan.',
        confirmLabel: 'Ya, terima barang',
      });
      if (!ok) return;
      try {
        await api.post(`/back-office/purchase-orders/${po.id}/receive`);
        showToast('Barang diterima, stok telah diperbarui', 'success');
        close();
        loadPOs();
      } catch (err) {
        backdrop.querySelector('#po-action-error').textContent = err.message || 'Gagal menerima barang';
        backdrop.querySelector('#po-action-error').style.display = 'block';
      }
    });

    backdrop.querySelector('#po-cancel-btn')?.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Batalkan PO ini?', message: 'PO yang dibatalkan tidak dapat diaktifkan kembali.', tone: 'danger' });
      if (!ok) return;
      try {
        await api.post(`/back-office/purchase-orders/${po.id}/cancel`);
        showToast('Purchase order dibatalkan', 'success');
        close();
        loadPOs();
      } catch (err) {
        backdrop.querySelector('#po-action-error').textContent = err.message || 'Gagal membatalkan PO';
        backdrop.querySelector('#po-action-error').style.display = 'block';
      }
    });

    backdrop.querySelector('#po-pay-btn')?.addEventListener('click', () => {
      close();
      openPaymentModal(po);
    });
  }

  function openPaymentModal(po) {
    const remaining = po.total_amount - po.paid_amount;
    const { backdrop, close } = openModal({
      title: `Catat Pembayaran — ${po.po_number}`,
      bodyHtml: `
        <p class="text-sm">Sisa tagihan: <strong>${formatIDR(remaining)}</strong></p>
        <form id="payment-form" novalidate>
          <div class="field">
            <label>Jumlah Bayar *</label>
            <input type="number" name="amount" required min="1" max="${remaining}" value="${remaining}" />
          </div>
          <div class="error-text" id="payment-error"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="payment-submit-btn">Simpan</button>
      `,
    });

    backdrop.querySelector('#payment-submit-btn').addEventListener('click', async () => {
      const form = backdrop.querySelector('#payment-form');
      const errorEl = backdrop.querySelector('#payment-error');
      if (!form.reportValidity()) return;
      const amount = Number(form.elements['amount'].value);

      const btn = backdrop.querySelector('#payment-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

      try {
        await api.post(`/back-office/purchase-orders/${po.id}/payment`, { amount });
        showToast('Pembayaran berhasil dicatat', 'success');
        close();
        loadPOs();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal mencatat pembayaran';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Simpan';
      }
    });
  }

  await loadRefData();
  loadPOs();
}
