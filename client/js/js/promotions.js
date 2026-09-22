/**
 * client/js/promotions.js (ES module)
 */
import { api } from './client.js';
import { requireAuthGuard } from '../../js/api.js';
import { renderClientShell, setPageTitle, getContentEl } from './shell.js';
import { showToast } from '../../js/toast.js';
import { openModal, confirmDialog } from '../../js/modal.js';

requireAuthGuard(api, { loginUrl: 'index.html', scope: 'client' });

const perms = await renderClientShell('promotions');
if (perms) {
  setPageTitle('Promosi');

  const content = getContentEl();
  content.innerHTML = `
    <div class="flex-between mb-16">
      <div></div>
      <button class="btn btn-primary" id="new-promo-btn">+ Promosi Baru</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nama</th><th>Tipe</th><th>Diskon</th><th>Periode</th><th>Status</th><th></th></tr></thead>
        <tbody id="promo-body"><tr><td colspan="6"><div class="skeleton" style="height:20px;"></div></td></tr></tbody>
      </table>
    </div>
  `;

  const TYPE_LABELS = {
    basic: 'Basic', opening: 'Opening', total_purchase: 'Total Belanja', product: 'Produk',
    min_qty: 'Minimum Qty', coupon: 'Kupon', reward_point: 'Reward Poin',
  };

  let meta = { types: [], discount_types: [] };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
  function formatDiscount(p) {
    const value = p.discount_type === 'percent' ? `${p.discount_value}%` : `Rp${Number(p.discount_value).toLocaleString('id-ID')}`;
    return p.max_discount ? `${value} (maks. Rp${Number(p.max_discount).toLocaleString('id-ID')})` : value;
  }

  async function loadMeta() {
    meta = await api.get('/back-office/promotions/meta');
  }

  async function loadPromotions() {
    const tbody = document.getElementById('promo-body');
    tbody.innerHTML = `<tr><td colspan="6"><div class="skeleton" style="height:20px;"></div></td></tr>`;
    try {
      const res = await api.get('/back-office/promotions');
      tbody.innerHTML = res.data.length
        ? res.data
            .map(
              (p) => `
        <tr>
          <td style="font-weight:600;">${escapeHtml(p.name)}${p.type === 'coupon' && p.coupon_code ? `<div class="text-sm text-muted">Kode: ${escapeHtml(p.coupon_code)}</div>` : ''}</td>
          <td class="text-sm">${TYPE_LABELS[p.type] || p.type}</td>
          <td class="text-sm">${formatDiscount(p)}</td>
          <td class="text-sm">${p.start_date}${p.end_date ? ' – ' + p.end_date : ' (tanpa batas)'}</td>
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
        : `<tr><td colspan="6"><div class="empty-state">Belum ada promosi</div></td></tr>`;

      wireRowActions(res.data);
    } catch (err) {
      showToast(err.message || 'Gagal memuat promosi', 'error');
    }
  }

  function wireRowActions(promotions) {
    document.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => openPromoModal(promotions.find((p) => p.id === btn.dataset.id)));
    });
    document.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const newStatus = btn.dataset.status === 'active' ? 'inactive' : 'active';
        const ok = await confirmDialog({
          title: `${newStatus === 'active' ? 'Aktifkan' : 'Nonaktifkan'} promosi ini?`,
          message: newStatus === 'inactive' ? 'Promosi tidak akan berlaku di kasir sampai diaktifkan kembali.' : 'Promosi akan berlaku kembali di kasir.',
          tone: newStatus === 'inactive' ? 'danger' : 'default',
        });
        if (!ok) return;
        try {
          await api.patch(`/back-office/promotions/${btn.dataset.id}/status`, { status: newStatus });
          showToast('Status promosi diperbarui', 'success');
          loadPromotions();
        } catch (err) {
          showToast(err.message || 'Gagal mengubah status', 'error');
        }
      });
    });
  }

  document.getElementById('new-promo-btn').addEventListener('click', () => openPromoModal(null));

  function openPromoModal(promo) {
    const isEdit = !!promo;
    const { backdrop, close } = openModal({
      title: isEdit ? `Edit — ${promo.name}` : 'Promosi Baru',
      bodyHtml: `
        <form id="promo-form" novalidate>
          <div class="field">
            <label>Nama Promosi *</label>
            <input type="text" name="name" required value="${isEdit ? escapeHtml(promo.name) : ''}" placeholder="Diskon Akhir Pekan" />
          </div>
          <div class="field">
            <label>Tipe *</label>
            <select name="type" id="promo-type-select" required ${isEdit ? 'disabled' : ''}>
              ${meta.types.map((t) => `<option value="${t}" ${promo?.type === t ? 'selected' : ''}>${TYPE_LABELS[t] || t}</option>`).join('')}
            </select>
            ${isEdit ? '<div class="hint">Tipe promosi tidak dapat diubah setelah dibuat.</div>' : ''}
          </div>
          <div class="field-row">
            <div class="field">
              <label>Tanggal Mulai *</label>
              <input type="date" name="start_date" required value="${isEdit ? promo.start_date : ''}" />
            </div>
            <div class="field">
              <label>Tanggal Selesai</label>
              <input type="date" name="end_date" value="${isEdit && promo.end_date ? promo.end_date : ''}" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Tipe Diskon *</label>
              <select name="discount_type" required>
                ${meta.discount_types.map((d) => `<option value="${d}" ${promo?.discount_type === d ? 'selected' : ''}>${d === 'percent' ? 'Persen (%)' : 'Nominal (Rp)'}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Nilai Diskon *</label>
              <input type="number" name="discount_value" required min="0" value="${isEdit ? promo.discount_value : ''}" />
            </div>
          </div>
          <div class="field">
            <label>Maksimum Diskon (Rp, opsional)</label>
            <input type="number" name="max_discount" min="0" value="${isEdit && promo.max_discount ? promo.max_discount : ''}" placeholder="Kosongkan jika tidak dibatasi" />
          </div>
          <div class="field" id="coupon-code-field" style="display:${promo?.type === 'coupon' ? 'block' : 'none'};">
            <label>Kode Kupon *</label>
            <input type="text" name="coupon_code" value="${isEdit && promo.coupon_code ? escapeHtml(promo.coupon_code) : ''}" placeholder="LEBARAN2026" />
          </div>
          <div class="field">
            <label>Syarat / Catatan</label>
            <input type="text" name="condition" value="${isEdit && promo.condition ? escapeHtml(promo.condition) : ''}" placeholder="mis. minimal belanja Rp100.000" />
          </div>
          <div class="error-text" id="promo-error"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="promo-submit-btn">${isEdit ? 'Simpan' : 'Buat Promosi'}</button>
      `,
    });

    backdrop.querySelector('#promo-type-select').addEventListener('change', (e) => {
      backdrop.querySelector('#coupon-code-field').style.display = e.target.value === 'coupon' ? 'block' : 'none';
    });

    backdrop.querySelector('#promo-submit-btn').addEventListener('click', async () => {
      const form = backdrop.querySelector('#promo-form');
      const errorEl = backdrop.querySelector('#promo-error');
      if (!form.reportValidity()) return;

      const fd = new FormData(form);
      const payload = {
        name: fd.get('name'),
        start_date: fd.get('start_date'),
        end_date: fd.get('end_date') || null,
        discount_type: fd.get('discount_type'),
        discount_value: Number(fd.get('discount_value')),
        max_discount: fd.get('max_discount') ? Number(fd.get('max_discount')) : null,
        coupon_code: fd.get('coupon_code') || null,
        condition: fd.get('condition') || null,
      };
      if (!isEdit) payload.type = fd.get('type');

      const btn = backdrop.querySelector('#promo-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

      try {
        if (isEdit) {
          await api.patch(`/back-office/promotions/${promo.id}`, payload);
        } else {
          await api.post('/back-office/promotions', payload);
        }
        showToast('Promosi berhasil disimpan', 'success');
        close();
        loadPromotions();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal menyimpan promosi';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = isEdit ? 'Simpan' : 'Buat Promosi';
      }
    });
  }

  await loadMeta();
  loadPromotions();
}
