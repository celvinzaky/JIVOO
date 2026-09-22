/**
 * client/js/users.js (ES module)
 */
import { api } from './client.js';
import { requireAuthGuard } from '../../js/api.js';
import { renderClientShell, setPageTitle, getContentEl } from './shell.js';
import { showToast } from '../../js/toast.js';
import { openModal, confirmDialog } from '../../js/modal.js';

requireAuthGuard(api, { loginUrl: 'index.html', scope: 'client' });

const perms = await renderClientShell('users');
if (perms) {
  setPageTitle('Pengguna');

  const content = getContentEl();
  content.innerHTML = `
    <div class="flex-between mb-16">
      <div></div>
      <button class="btn btn-primary" id="new-user-btn">+ Pengguna Baru</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Nama</th><th>Username</th><th>Role</th><th>Status</th><th>Login Terakhir</th><th></th></tr>
        </thead>
        <tbody id="users-body">
          <tr><td colspan="6"><div class="skeleton" style="height:20px;"></div></td></tr>
        </tbody>
      </table>
    </div>
  `;

  let rolesCache = [];
  let currentUserId = null; // to prevent self-status-change in the UI too

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function roleLabel(roleId) {
    const role = rolesCache.find((r) => r.id === roleId);
    return role ? role.label : roleId;
  }

  async function loadRoles() {
    const res = await api.get('/back-office/roles');
    rolesCache = res.data;
  }

  async function loadUsers() {
    const tbody = document.getElementById('users-body');
    tbody.innerHTML = `<tr><td colspan="6"><div class="skeleton" style="height:20px;"></div></td></tr>`;
    try {
      const res = await api.get('/back-office/users');
      const me = await api.get('/auth/me');
      currentUserId = me.actor.sub;

      tbody.innerHTML = res.data.length
        ? res.data
            .map(
              (u) => `
        <tr>
          <td style="font-weight:600;">${escapeHtml(u.name)}${u.id === currentUserId ? ' <span class="text-sm text-muted">(Anda)</span>' : ''}</td>
          <td>${escapeHtml(u.username)}</td>
          <td>${escapeHtml(roleLabel(u.role_id))}</td>
          <td><span class="badge badge-${u.status}">${u.status}</span></td>
          <td class="text-sm text-muted">${u.last_login ? new Date(u.last_login).toLocaleString('id-ID') : 'Belum pernah'}</td>
          <td>
            <div class="flex-gap-8">
              <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${u.id}">Edit</button>
              <button class="btn btn-secondary btn-sm" data-action="reset-password" data-id="${u.id}">Reset Password</button>
              ${
                u.id !== currentUserId
                  ? `<button class="btn ${u.status === 'active' ? 'btn-danger' : 'btn-success'} btn-sm" data-action="toggle-status" data-id="${u.id}" data-status="${u.status}">${u.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</button>`
                  : ''
              }
            </div>
          </td>
        </tr>`
            )
            .join('')
        : `<tr><td colspan="6"><div class="empty-state">Belum ada pengguna</div></td></tr>`;

      wireRowActions(res.data);
    } catch (err) {
      showToast(err.message || 'Gagal memuat pengguna', 'error');
    }
  }

  function wireRowActions(users) {
    document.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => openEditUserModal(users.find((u) => u.id === btn.dataset.id)));
    });
    document.querySelectorAll('[data-action="reset-password"]').forEach((btn) => {
      btn.addEventListener('click', () => openResetPasswordModal(btn.dataset.id));
    });
    document.querySelectorAll('[data-action="toggle-status"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const newStatus = btn.dataset.status === 'active' ? 'inactive' : 'active';
        const ok = await confirmDialog({
          title: `${newStatus === 'active' ? 'Aktifkan' : 'Nonaktifkan'} pengguna ini?`,
          message:
            newStatus === 'inactive'
              ? 'Pengguna tidak akan bisa login sampai diaktifkan kembali.'
              : 'Pengguna akan bisa login kembali.',
          tone: newStatus === 'inactive' ? 'danger' : 'default',
          confirmLabel: 'Ya, lanjutkan',
        });
        if (!ok) return;
        try {
          await api.patch(`/back-office/users/${btn.dataset.id}/status`, { status: newStatus });
          showToast('Status pengguna diperbarui', 'success');
          loadUsers();
        } catch (err) {
          showToast(err.message || 'Gagal mengubah status', 'error');
        }
      });
    });
  }

  document.getElementById('new-user-btn').addEventListener('click', openCreateUserModal);

  function roleOptionsHtml(selectedId) {
    return rolesCache
      .map((r) => `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>${escapeHtml(r.label)}${r.is_system ? '' : ' (custom)'}</option>`)
      .join('');
  }

  function openCreateUserModal() {
    const { backdrop, close } = openModal({
      title: 'Pengguna Baru',
      bodyHtml: `
        <form id="create-user-form" novalidate>
          <div class="field">
            <label>Nama Lengkap *</label>
            <input type="text" name="name" required placeholder="Dedi Supervisor" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Username *</label>
              <input type="text" name="username" required placeholder="dedi" />
            </div>
            <div class="field">
              <label>Role *</label>
              <select name="role_id" required>${roleOptionsHtml()}</select>
            </div>
          </div>
          <div class="field">
            <label>Email *</label>
            <input type="email" name="email" required placeholder="dedi@tokosaya.com" />
          </div>
          <div class="field">
            <label>Password Sementara *</label>
            <input type="text" name="password" required placeholder="min. 6 karakter" />
          </div>
          <div class="error-text" id="create-error"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="create-submit-btn">Buat Pengguna</button>
      `,
    });

    backdrop.querySelector('#create-submit-btn').addEventListener('click', async () => {
      const form = backdrop.querySelector('#create-user-form');
      const errorEl = backdrop.querySelector('#create-error');
      if (!form.reportValidity()) return;

      const payload = Object.fromEntries(new FormData(form).entries());
      const btn = backdrop.querySelector('#create-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Membuat...';

      try {
        await api.post('/back-office/users', payload);
        showToast('Pengguna berhasil dibuat', 'success');
        close();
        loadUsers();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal membuat pengguna';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Buat Pengguna';
      }
    });
  }

  function openEditUserModal(user) {
    if (!user) return;
    const { backdrop, close } = openModal({
      title: `Edit — ${user.name}`,
      bodyHtml: `
        <form id="edit-user-form" novalidate>
          <div class="field">
            <label>Nama Lengkap *</label>
            <input type="text" name="name" required value="${user.name}" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Email *</label>
              <input type="email" name="email" required value="${user.email || ''}" />
            </div>
            <div class="field">
              <label>Role *</label>
              <select name="role_id" required>${roleOptionsHtml(user.role_id)}</select>
            </div>
          </div>
          <div class="error-text" id="edit-error"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="edit-submit-btn">Simpan</button>
      `,
    });

    backdrop.querySelector('#edit-submit-btn').addEventListener('click', async () => {
      const form = backdrop.querySelector('#edit-user-form');
      const errorEl = backdrop.querySelector('#edit-error');
      if (!form.reportValidity()) return;

      const payload = Object.fromEntries(new FormData(form).entries());
      const btn = backdrop.querySelector('#edit-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

      try {
        await api.patch(`/back-office/users/${user.id}`, payload);
        showToast('Pengguna berhasil diperbarui', 'success');
        close();
        loadUsers();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal menyimpan';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Simpan';
      }
    });
  }

  function openResetPasswordModal(userId) {
    const { backdrop, close } = openModal({
      title: 'Reset Password',
      bodyHtml: `
        <form id="reset-password-form" novalidate>
          <div class="field">
            <label>Password Baru *</label>
            <input type="text" name="new_password" required placeholder="min. 6 karakter" />
          </div>
          <div class="error-text" id="reset-error"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-action="close">Batal</button>
        <button class="btn btn-primary" id="reset-submit-btn">Reset</button>
      `,
    });

    backdrop.querySelector('#reset-submit-btn').addEventListener('click', async () => {
      const form = backdrop.querySelector('#reset-password-form');
      const errorEl = backdrop.querySelector('#reset-error');
      if (!form.reportValidity()) return;
      const { new_password } = Object.fromEntries(new FormData(form).entries());

      const btn = backdrop.querySelector('#reset-submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Memproses...';

      try {
        await api.post(`/back-office/users/${userId}/reset-password`, { new_password });
        showToast('Password berhasil direset', 'success');
        close();
      } catch (err) {
        errorEl.textContent = err.message || 'Gagal reset password';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Reset';
      }
    });
  }

  await loadRoles();
  loadUsers();
}
