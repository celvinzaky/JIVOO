/**
 * admin/js/login.js (ES module)
 * Extracted to an external file (not inline) so it loads under helmet's
 * default CSP, which sets script-src 'self' without 'unsafe-inline' —
 * inline <script> blocks would be silently blocked by the browser.
 */
import { api } from './client.js';
import { showToast } from '../../js/toast.js';

if (api.isAuthenticated()) {
  window.location.href = 'dashboard.html';
}

const form = document.getElementById('login-form');
const errorEl = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');
const submitLabel = document.getElementById('submit-label');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.style.display = 'none';
  submitBtn.disabled = true;
  submitLabel.innerHTML = '<span class="spinner"></span> Memproses...';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const result = await api.post('/auth/admin/login', { email, password });
    api.setAuth({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      actor: { scope: 'system', role: 'super_admin', email: result.admin.email, name: result.admin.name },
    });
    showToast(`Selamat datang, ${result.admin.name}`, 'success');
    setTimeout(() => (window.location.href = 'dashboard.html'), 300);
  } catch (err) {
    errorEl.textContent = err.status === 401 ? 'Email atau password salah.' : (err.message || 'Login gagal.');
    errorEl.style.display = 'block';
    submitBtn.disabled = false;
    submitLabel.textContent = 'Masuk';
  }
});
