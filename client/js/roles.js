/**
 * client/js/roles.js (ES module)
 */
import { api } from './client.js';
import { requireAuthGuard } from '../../js/api.js';
import { renderClientShell, setPageTitle, getContentEl } from './shell.js';
import { showToast } from '../../js/toast.js';
import { openModal, confirmDialog } from '../../js/modal.js';

requireAuthGuard(api, { loginUrl: 'index.html', scope: 'client' });

const perms = await renderClientShell('roles');
if (perms) {
  setPageTitle('Role & Izin');

  const content = getContentEl();
  content.innerHTML = `
    <div class="flex-between mb-16">
      <p class="text-sm" style="margin:0;">Role sistem (bertanda <em>default</em>) tidak dapat diubah atau dihapus — buat role kustom untuk kombinasi akses lain.</p>
      <button class="btn btn-primary" id="new-role-btn">+ Role Baru</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Role</th><th>Modul</th><th>Aksi Diizinkan</th><th>Pengguna</th><th></th></tr>
        </thead>
        <tbody id="roles-body">
          <tr><td colspan="5"><div class="skeleton" style="height:20px;"></div></td></tr>
        </tbody>
      </table>
    </div>
  `;

  let meta = { modules: [], actions: [] };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function listOrAll(arr) {
    if (arr.includes('*')) return '<em>Semua</em>';
    if (!arr.length) return '<span class="text-muted">—</span>';
    return arr.join(', ');
  }

  async function loadMeta() {
    meta = await api.get('/back-office/meta/modules');
  }

  async function loadRoles() {
    const tbody = document.getElementById('roles-body');
    tbody.innerHTML = `<tr><td colspan="5"><div class="skeleton" style="height:20px;"></div></td></tr>`;
    try {
      const res = await api.get('/back-office/roles');
      tbody.innerHTML = res.data
        .map(
          (r) => `
        <tr>
          <td>
            <div style="font-weight:600;">${escapeHtml(r.label)}</div>
            <div class="text-sm text-muted">${r.is_system ? 'default' : 'custom'}</div>
          </td>
          <td class="text-sm">${listOrAll(r.permission?.module_access || [])}</td>
          <td class="text-sm">${listOrAll(r.permission?.actions || [])}</td>
          <td>${r.user_count}</td>
          <td>
            <div class="flex-gap-8">
              ${!r.is_system ? `<button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}">Edit</button>` : ''}
              ${!r.is_system ? `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}" ${r.user_count > 0 ? 'disabled title="Masih dipakai pengguna"' : ''}>Hapus</button>` : ''}
            </div>
          </td>
        </tr>`
        )
        .join('');

      wireRowActions(res.data);
    } catch (err) {
      showToast(err.message || 'Gagal memuat role', 'error');
    }
  }

  function wireRowActions(roles) {
    document.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => openRoleModal(roles.find((r) => r.id === btn.dataset.id)));
    });
    document.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Hapus role ini?',
          message: 'Role yang sudah dihapus tidak dapat dikembalikan. Role ini harus tidak sedang dipakai pengguna manapun.',
          tone: 'danger',
          confirmLabel: 'Ya, hapus',
        });
        if (!ok) return;
        try {
          await api.delete(`/back-office/roles/${btn.dataset.id}`);
          showToast('Role berhasil dihapus', 'success');
          loadRoles();
        } catch (err) {
          showToast(err.message || 'Gagal menghapus role', 'error');
        }
      });
    });
  }

  function checkboxGrid(name, options, selected) {
    return options
      .map(
        (opt) => `
      <label style="display:flex; align-items:center; gap:6px; padding:4px 0; font-weight:400; font-size:13px;">
        <input type="checkbox" name="${name}" value="${opt}" ${selected.includes(opt) || selected.includes('*') ? 'checked' : ''} />
        ${opt}
      </label>`
      )
      .join('');
  }

  document.getElementById('new-role-btn').addEventListener('click', () => openRoleModal(null));

  function openRoleModal(role) {
    const isEdit = !!role;
    const selectedModules = role?.permission?.module_access || [];
    const selectedActions = role?.permission?.actions || [];

    const { backdrop, close } = openModal({
      title: isEdit ? `Edit Role — ${role.label}` : 'Role Baru',
      bodyHtml: `
        <form id="role-form" novalidate>
          <div class="field">
            <label>Nama Role *</label>
            <input type="text" name="label" required value="${isEdit ? escapeHtml(role.label) : ''}" placeholder="Barista Senior" />
          </div>
          <div class="field">
            <label>Modul yang Diizinkan</label>
            <div style="max-height:140px; overflow-y:auto; border:1px solid var(--color-border); border-radius:6px; padding:8px 12px;">
              ${checkboxGrid('modules', meta.modules, selectedModules)}
            </div>
          </div>
          <div class="field">
            <label>Aksi yang Diizinkan</label>
            <div style="border:1px solid var(--color-border); border-radius:6px; padding:8px 12px;">
              ${checkboxGrid('actions', meta.actions, selectedActions)}
            </div>
          </div>
          <div class="error-text" id="role-error"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="role-submit-btn">${isEdit ? 'Simpan' : 'Buat Role'}</button>
      `,
    });

    backdrop.querySelector('#role-submit-btn').addEventListener('click', async () => {
      const form = backdrop.querySelector('#role-form');
      const errorEl = backdrop.querySelector('#role-error');
      if (!form.reportValidity()) return;

      const label = form.elements['label'].value;
      const modules = Array.from(form.querySelectorAll('input[name="modules"]:checked')).map((el) => el.value);
      const actions = Array.from(form.querySelectorAll('input[name="actions"]:checked')).map((el) => el.value);

      const btn = backdrop.querySelector('#role-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

      try {
        if (isEdit) {
          await api.patch(`/back-office/roles/${role.id}`, { label, modules, actions });
        } else {
          await api.post('/back-office/roles', { label, modules, actions });
        }
        showToast('Role berhasil disimpan', 'success');
        close();
        loadRoles();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal menyimpan role';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = isEdit ? 'Simpan' : 'Buat Role';
      }
    });
  }

  await loadMeta();
  loadRoles();
}
