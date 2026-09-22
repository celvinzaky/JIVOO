/**
 * client/js/login.js (ES module)
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

  const client_code = document.getElementById('client_code').value.trim();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    const result = await api.post('/auth/client/login', { client_code, username, password });
    api.setAuth({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      actor: {
        scope: 'client',
        name: result.user.name,
        username: result.user.username,
        clientName: result.client.name,
        clientCode: result.client.client_code,
      },
    });
    showToast(`Selamat datang, ${result.user.name}`, 'success');
    setTimeout(() => (window.location.href = 'dashboard.html'), 300);
  } catch (err) {
    errorEl.textContent = err.status === 401 ? 'Kode client, username, atau password salah.' : (err.message || 'Login gagal.');
    errorEl.style.display = 'block';
    submitBtn.disabled = false;
    submitLabel.textContent = 'Masuk';
  }
});
