/**
 * js/api.js (ES module)
 * Thin fetch wrapper shared by admin/client/cashier apps. Each app
 * instantiates its own ApiClient with a distinct `namespace` so their
 * auth tokens never collide in localStorage (a browser could plausibly
 * have an admin session and a client session open at once).
 */

export class ApiClient {
  constructor(namespace) {
    this.namespace = namespace;
    this.base = '/api';
  }

  get authKey() {
    return `jivoo_${this.namespace}_auth`;
  }

  getAuth() {
    try {
      const raw = localStorage.getItem(this.authKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  setAuth(data) {
    localStorage.setItem(this.authKey, JSON.stringify(data));
  }

  clearAuth() {
    localStorage.removeItem(this.authKey);
  }

  isAuthenticated() {
    return !!this.getAuth()?.accessToken;
  }

  async _rawRequest(method, path, body, accessToken) {
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res;
  }

  async tryRefresh() {
    const auth = this.getAuth();
    if (!auth?.refreshToken) return null;
    try {
      const res = await this._rawRequest('POST', '/auth/refresh', { refreshToken: auth.refreshToken });
      if (!res.ok) {
        this.clearAuth();
        return null;
      }
      const data = await res.json();
      const merged = { ...auth, accessToken: data.accessToken };
      this.setAuth(merged);
      return merged;
    } catch {
      return null;
    }
  }

  /**
   * @param {string} method
   * @param {string} path - e.g. '/admin/clients'
   * @param {object} [body]
   * @param {{skipAuth?: boolean}} [opts]
   */
  async request(method, path, body, opts = {}) {
    const auth = this.getAuth();
    let res = await this._rawRequest(method, path, body, opts.skipAuth ? null : auth?.accessToken);

    if (res.status === 401 && !opts.skipAuth && auth?.refreshToken) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        res = await this._rawRequest(method, path, body, refreshed.accessToken);
      }
    }

    let data = {};
    try {
      data = await res.json();
    } catch {
      /* empty/non-JSON body (e.g. zip download) - caller should not use request() for those */
    }

    if (!res.ok) {
      const err = new Error(data.message || res.statusText || 'Request failed');
      err.status = res.status;
      err.code = data.error;
      err.data = data;
      if (res.status === 401) {
        this.clearAuth();
      }
      throw err;
    }
    return data;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  patch(path, body) { return this.request('PATCH', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  delete(path) { return this.request('DELETE', path); }

  /**
   * For binary downloads (zip export) — request() can't be used since the
   * response body isn't JSON. Opens the URL with the access token attached
   * via a short-lived approach: fetch as blob, then trigger a download.
   */
  async download(path, filenameFallback) {
    const auth = this.getAuth();
    const res = await this._rawRequest('GET', path, undefined, auth?.accessToken);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data.message || 'Download failed');
      err.status = res.status;
      throw err;
    }
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : filenameFallback || 'download.zip';
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

/**
 * Guards a page: redirects to `loginUrl` if not authenticated (or if the
 * stored actor's scope/role doesn't match what's required). Call this at
 * the top of every protected page's script.
 */
export function requireAuthGuard(api, { loginUrl, scope, role }) {
  const auth = api.getAuth();
  if (!auth?.accessToken) {
    window.location.href = loginUrl;
    return null;
  }
  if (scope && auth.actor?.scope !== scope) {
    window.location.href = loginUrl;
    return null;
  }
  if (role && auth.actor?.role !== role) {
    window.location.href = loginUrl;
    return null;
  }
  return auth;
}
