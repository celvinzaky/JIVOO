/**
 * admin/js/shell.js (ES module)
 * Renders the Super Admin sidebar + topbar into #app-shell-mount and
 * wires up logout + mobile sidebar toggle. Each admin page calls
 * renderAdminShell(activePage) once on load.
 */
import { api } from './client.js';
import { showToast } from '../../js/toast.js';

const NAV_ITEMS = [
  { key: 'dashboard', href: 'dashboard.html', icon: '&#9632;', label: 'Dashboard' },
  { key: 'clients', href: 'clients.html', icon: '&#9733;', label: 'Clients' },
];

export function renderAdminShell(activePage) {
  const mount = document.getElementById('app-shell-mount');
  const auth = api.getAuth();

  mount.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          <div class="logo-mark">J</div>
          <div>
            <div class="brand-name">JIVOO</div>
            <div class="brand-sub">Super Admin</div>
          </div>
        </div>
        <nav class="sidebar-nav">
          ${NAV_ITEMS.map(
            (item) => `
            <a href="${item.href}" class="${item.key === activePage ? 'active' : ''}">
              <span class="nav-icon">${item.icon}</span>${item.label}
            </a>`
          ).join('')}
        </nav>
        <div class="sidebar-footer">
          <div class="text-sm text-muted" style="margin-bottom:8px;">${auth?.actor?.email || ''}</div>
          <button class="btn btn-secondary w-full" id="logout-btn">Logout</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="menu-toggle btn btn-secondary btn-sm" id="menu-toggle">&#9776;</button>
          <h2 id="page-title" style="margin:0;"></h2>
          <div></div>
        </header>
        <main class="content" id="page-content"></main>
      </div>
    </div>
  `;

  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* logout is best-effort - proceed regardless */
    }
    api.clearAuth();
    showToast('Berhasil logout', 'info');
    setTimeout(() => (window.location.href = 'index.html'), 300);
  });
}

export function setPageTitle(title) {
  const el = document.getElementById('page-title');
  if (el) el.textContent = title;
}

export function getContentEl() {
  return document.getElementById('page-content');
}
