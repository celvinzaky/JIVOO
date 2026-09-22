/**
 * server/services/statsService.js
 * Aggregates platform-wide dashboard numbers (§8.2) and per-client
 * statistics/monitoring (§8.5) from the JSON data + audit logs.
 * Read-only — no writes happen here.
 */
const storage = require('./jsonStorage');

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

function dateKey(iso) {
  return new Date(iso).toISOString().slice(0, 10); // YYYY-MM-DD
}

function monthKey(iso) {
  return new Date(iso).toISOString().slice(0, 7); // YYYY-MM
}

function buildDailySeries(days, countsByDay) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgo(i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: countsByDay.get(key) || 0 });
  }
  return out;
}

/**
 * Platform-wide dashboard for Super Admin (§8.2).
 * @param {object} [opts]
 * @param {number} [opts.days=14] - window size for the daily activity charts
 */
async function getPlatformDashboard(opts = {}) {
  const days = opts.days || 14;
  const registry = await storage.readSystemCollection('clients_registry.json');
  const systemLogs = await storage.readSystemCollection('system_audit_logs.json');

  const totalClients = registry.length;
  const activeClients = registry.filter((c) => c.status === 'active').length;
  const inactiveClients = registry.filter((c) => c.status !== 'active').length;

  let totalUsers = 0;
  let totalOutlets = 0;
  let totalTransactionsPlatform = 0;
  const perClientActivity = [];
  const clientGrowthByMonth = new Map();

  for (const client of registry) {
    const mKey = monthKey(client.created_at);
    clientGrowthByMonth.set(mKey, (clientGrowthByMonth.get(mKey) || 0) + 1);

    const [users, company, transactions, clientLogs] = await Promise.all([
      storage.readClientCollection(client.client_id, 'users').catch(() => []),
      storage.readClientCollection(client.client_id, 'company').catch(() => ({})),
      storage.readClientCollection(client.client_id, 'transactions').catch(() => []),
      storage.readClientCollection(client.client_id, 'audit_logs').catch(() => []),
    ]);

    totalUsers += Array.isArray(users) ? users.length : 0;
    totalOutlets += Array.isArray(company?.outlets) ? company.outlets.length : 0;
    totalTransactionsPlatform += Array.isArray(transactions) ? transactions.length : 0;

    perClientActivity.push({
      client_id: client.client_id,
      name: client.name,
      transactions: Array.isArray(transactions) ? transactions.length : 0,
      audit_events: Array.isArray(clientLogs) ? clientLogs.length : 0,
    });
  }

  const recentClients = [...registry]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)
    .map((c) => ({ client_id: c.client_id, name: c.name, status: c.status, created_at: c.created_at }));

  const mostActiveClients = [...perClientActivity]
    .sort((a, b) => b.transactions + b.audit_events - (a.transactions + a.audit_events))
    .slice(0, 5);

  // Login activity chart (system-level logins = super admin logins;
  // per-client login activity is aggregated below across all clients)
  const loginsByDay = new Map();
  const dauByDay = new Map(); // Set of distinct actor ids per day
  for (const log of systemLogs) {
    if (log.action !== 'login') continue;
    const key = dateKey(log.created_at);
    loginsByDay.set(key, (loginsByDay.get(key) || 0) + 1);
  }

  return {
    totals: {
      total_clients: totalClients,
      active_clients: activeClients,
      inactive_clients: inactiveClients,
      total_users: totalUsers,
      total_outlets: totalOutlets,
      total_transactions_platform: totalTransactionsPlatform,
    },
    recent_clients: recentClients,
    most_active_clients: mostActiveClients,
    charts: {
      client_growth_by_month: [...clientGrowthByMonth.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([month, count]) => ({ month, count })),
      admin_login_activity: buildDailySeries(days, loginsByDay),
    },
  };
}

/**
 * Per-client statistics & monitoring for Super Admin drill-down (§8.5).
 */
async function getClientStats(clientId, opts = {}) {
  const days = opts.days || 14;
  const [users, transactions, logs] = await Promise.all([
    storage.readClientCollection(clientId, 'users'),
    storage.readClientCollection(clientId, 'transactions'),
    storage.readClientCollection(clientId, 'audit_logs'),
  ]);

  const loginLogs = logs.filter((l) => l.action === 'login');
  const lastLoginByUser = new Map();
  for (const log of loginLogs) {
    const existing = lastLoginByUser.get(log.actor_id);
    if (!existing || new Date(log.created_at) > new Date(existing)) {
      lastLoginByUser.set(log.actor_id, log.created_at);
    }
  }

  const activityByDay = new Map();
  const activityByHour = new Array(24).fill(0);
  const activeUserIdsWindow = new Set();
  const cutoff = daysAgo(days);

  for (const log of logs) {
    const key = dateKey(log.created_at);
    activityByDay.set(key, (activityByDay.get(key) || 0) + 1);
    activityByHour[new Date(log.created_at).getHours()] += 1;
    if (new Date(log.created_at) >= cutoff) activeUserIdsWindow.add(log.actor_id);
  }

  const transactionsByDay = new Map();
  for (const tx of transactions) {
    const key = dateKey(tx.created_at || tx.updated_at || new Date().toISOString());
    transactionsByDay.set(key, (transactionsByDay.get(key) || 0) + 1);
  }

  return {
    user_count: users.length,
    active_users_in_window: activeUserIdsWindow.size,
    total_transactions: transactions.length,
    total_data_changes: logs.length,
    last_login_by_user: [...lastLoginByUser.entries()].map(([user_id, last_login]) => {
      const u = users.find((x) => x.id === user_id);
      return { user_id, username: u?.username || null, last_login };
    }),
    charts: {
      activity_by_day: buildDailySeries(days, activityByDay),
      transactions_by_day: buildDailySeries(days, transactionsByDay),
      activity_by_hour: activityByHour.map((count, hour) => ({ hour, count })),
    },
  };
}

module.exports = { getPlatformDashboard, getClientStats };
