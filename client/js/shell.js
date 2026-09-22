/**
 * client/js/shell.js (ES module)
 * Renders the Client Back Office sidebar + topbar into #app-shell-mount.
 * Unlike the Super Admin shell (which has a fixed nav), this one fetches
 * the current user's effective permissions and only shows nav items for
 * modules they actually have (§11: "Navigation harus otomatis mengikuti
 * akses user"). This is cosmetic only — every route is independently
 * re-validated server-side by requirePermission(), so a hidden nav item
 * is never the real security boundary.
 */
import { api } from './client.js';
import { showToast } from '../../js/toast.js';

const NAV_ITEMS = [
  { key: 'dashboard', href: 'dashboard.html', icon: '&#9632;', label: 'Dashboard', module: 'dashboard' },
  { key: 'users', href: 'users.html', icon: '&#128100;', label: 'Pengguna', module: 'users' },
  { key: 'roles', href: 'roles.html', icon: '&#128272;', label: 'Role & Izin', module: 'roles' },
];

let cachedPermissions = null;

async function fetchPermissions() {
  if (cachedPermissions) return cachedPermissions;
  cachedPermissions = await api.get('/back-office/me/permissions');
  return cachedPermissions;
}

function hasModule(modules, module) {
  return modules.includes('*') || modules.includes(module);
}

/**
 * @param {string} activePage - matches a NAV_ITEMS[].key
 * @returns {Promise<object>} the effective permissions object, in case the
 *   calling page needs it too (avoids a second fetch)
 */
export async function renderClientShell(activePage) {
  const mount = document.getElementById('app-shell-mount');
  const auth = api.getAuth();

  let perms;
  try {
    perms = await fetchPermissions();
  } catch (err) {
    // Token invalid/expired and refresh failed - api.js already cleared
    // auth in that case, so just bounce to login.
    window.location.href = 'index.html';
    return null;
  }

  const visibleItems = NAV_ITEMS.filter((item) => hasModule(perms.modules, item.module));

  mount.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          <div class="logo-mark">J</div>
          <div>
            <div class="brand-name">JIVOO</div>
            <div class="brand-sub">${auth?.actor?.clientName || 'Back Office'}</div>
          </div>
        </div>
        <nav class="sidebar-nav">
          ${visibleItems
            .map(
              (item) => `
            <a href="${item.href}" class="${item.key === activePage ? 'active' : ''}">
              <span class="nav-icon">${item.icon}</span>${item.label}
            </a>`
            )
            .join('')}
        </nav>
        <div class="sidebar-footer">
          <div style="font-weight:600; font-size:13px;">${auth?.actor?.name || auth?.actor?.username || ''}</div>
          <div class="text-sm text-muted" style="margin-bottom:8px;">${perms.role?.label || ''}</div>
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
      /* logout is best-effort */
    }
    api.clearAuth();
    showToast('Berhasil logout', 'info');
    setTimeout(() => (window.location.href = 'index.html'), 300);
  });

  // If the current page isn't actually in the user's visible items (e.g.
  // they bookmarked users.html but their role was downgraded since), send
  // them to a proper 403 page instead of a half-rendered screen.
  const activeItem = NAV_ITEMS.find((i) => i.key === activePage);
  if (activeItem && !hasModule(perms.modules, activeItem.module)) {
    window.location.href = '403.html';
    return null;
  }

  return perms;
}

export function setPageTitle(title) {
  const el = document.getElementById('page-title');
  if (el) el.textContent = title;
}

export function getContentEl() {
  return document.getElementById('page-content');
}
