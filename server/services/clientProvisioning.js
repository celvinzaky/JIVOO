/**
 * server/services/clientProvisioning.js
 *
 * Implements the mandatory "create client" flow (master prompt §8.3):
 * when Super Admin creates a client, the system MUST:
 *   1. Generate client_id
 *   2. Generate company_id
 *   3. Create owner account
 *   4. Create default roles
 *   5. Create default permissions
 *   6. Create default module access
 *   7. Create client data folder
 *   8. Create client JSON files
 *   9. Create default configuration (settings)
 *  10. Create initial audit log entry
 *
 * This is one transaction-like function so a client is never left
 * half-provisioned. If any step throws, nothing has been registered in
 * clients_registry.json yet (that write happens last), so a failed
 * provisioning attempt is easy to detect and retry — it just won't show
 * up as an active client.
 */
const storage = require('./jsonStorage');
const authService = require('./authService');
const auditLogger = require('./auditLogger');
const { generateId, generateClientId, generateCompanyId } = require('./idGenerator');
const { ROLES, CLIENT_STATUS } = require('../../shared/constants');

const SLUG_MAX_LEN = 16;

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, SLUG_MAX_LEN);
}

async function generateUniqueClientCode(companyName) {
  const registry = await storage.readSystemCollection('clients_registry.json');
  const existingCodes = new Set(registry.map((c) => c.client_code));
  const base = slugify(companyName) || 'client';

  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = Math.floor(100 + Math.random() * 900); // 3 digits
    const candidate = `${base}${suffix}`;
    if (!existingCodes.has(candidate)) return candidate;
  }
  // extremely unlikely fallback
  return `${base}${Date.now().toString(36)}`;
}

/**
 * @param {object} input
 * @param {string} input.company_name
 * @param {string} [input.brand_name]
 * @param {string} input.owner_name
 * @param {string} input.email
 * @param {string} input.username
 * @param {string} input.password
 * @param {string} [input.phone]
 * @param {number} [input.outlet_count]
 * @param {string} [input.package]
 * @param {string} [input.status] - defaults to 'active'
 * @param {object} actor - the super admin performing the action (for audit log)
 */
async function createClient(input, actor) {
  const {
    company_name,
    brand_name,
    owner_name,
    email,
    username,
    password,
    phone = null,
    outlet_count = 1,
    package: pkg = 'starter',
    status = CLIENT_STATUS.ACTIVE,
  } = input;

  if (!company_name || !owner_name || !email || !username || !password) {
    const err = new Error('company_name, owner_name, email, username, and password are required');
    err.status = 400;
    err.code = 'bad_request';
    throw err;
  }

  // Guard against duplicate owner email across the whole platform login
  // surface for clients (email is only unique within its own client's
  // users.json by construction here, since each client is a fresh file -
  // but we still block obviously duplicate client registrations by email).
  const registry = await storage.readSystemCollection('clients_registry.json');
  if (registry.some((c) => c.owner_email?.toLowerCase() === email.toLowerCase())) {
    const err = new Error('A client with this owner email already exists');
    err.status = 409;
    err.code = 'conflict';
    throw err;
  }

  // ---- 1 & 2. Generate IDs -------------------------------------------
  const clientId = generateClientId();
  const companyId = generateCompanyId();
  const clientCode = await generateUniqueClientCode(company_name);
  const now = new Date().toISOString();

  // ---- 7. Create client data folder -----------------------------------
  await storage.createClientDirectory(clientId);

  // ---- 3. Create owner account ------------------------------------------
  const ownerId = generateId('user');
  const passwordHash = await authService.hashPassword(password);

  const outlets = Array.from({ length: Math.max(1, outlet_count) }, (_, i) => ({
    outlet_id: generateId('outlet'),
    name: i === 0 ? 'Outlet Pusat' : `Outlet ${i + 1}`,
    address: '',
    is_main: i === 0,
  }));

  // ---- 4. Default roles ------------------------------------------------
  const defaultRoles = [
    { id: generateId('role'), client_id: clientId, name: ROLES.OWNER, label: 'Owner', is_system: true },
    { id: generateId('role'), client_id: clientId, name: ROLES.MANAGER, label: 'Manager', is_system: true },
    { id: generateId('role'), client_id: clientId, name: ROLES.STAFF_BACK_OFFICE, label: 'Staff Back Office', is_system: true },
    { id: generateId('role'), client_id: clientId, name: ROLES.CASHIER, label: 'Kasir', is_system: true },
  ];

  // ---- 5 & 6. Default permissions / module access -----------------------
  const defaultPermissions = [
    { id: generateId('perm'), client_id: clientId, role: ROLES.OWNER, modules: ['*'] },
    {
      id: generateId('perm'),
      client_id: clientId,
      role: ROLES.MANAGER,
      modules: ['dashboard', 'reports', 'analytics', 'products', 'categories', 'inventory', 'suppliers', 'purchase_orders', 'customers', 'promotions', 'attendance', 'finance', 'settings'],
    },
    {
      id: generateId('perm'),
      client_id: clientId,
      role: ROLES.STAFF_BACK_OFFICE,
      modules: ['products', 'categories', 'customers', 'inventory'],
    },
    { id: generateId('perm'), client_id: clientId, role: ROLES.CASHIER, modules: ['cashier'] },
  ];

  // ---- 8. Create client JSON files --------------------------------------
  await storage.writeClientCollection(clientId, 'company', {
    company_id: companyId,
    client_id: clientId,
    name: company_name,
    brand: brand_name || company_name,
    phone,
    outlets,
    created_at: now,
    updated_at: now,
  });

  await storage.writeClientCollection(clientId, 'users', [
    {
      id: ownerId,
      client_id: clientId,
      username,
      email,
      name: owner_name,
      role: ROLES.OWNER,
      outlet_id: outlets[0].outlet_id,
      password_hash: passwordHash,
      pin_hash: null,
      status: 'active',
      last_login: null,
      created_at: now,
      updated_at: now,
    },
  ]);

  await storage.writeClientCollection(clientId, 'roles', defaultRoles);
  await storage.writeClientCollection(clientId, 'permissions', defaultPermissions);
  await storage.writeClientCollection(clientId, 'categories', []);
  await storage.writeClientCollection(clientId, 'products', []);
  await storage.writeClientCollection(clientId, 'customers', []);
  await storage.writeClientCollection(clientId, 'inventory', []);
  await storage.writeClientCollection(clientId, 'inventory_logs', []);
  await storage.writeClientCollection(clientId, 'suppliers', []);
  await storage.writeClientCollection(clientId, 'purchase_orders', []);
  await storage.writeClientCollection(clientId, 'promotions', []);
  await storage.writeClientCollection(clientId, 'attendance', []);
  await storage.writeClientCollection(clientId, 'cashier_sessions', []);
  await storage.writeClientCollection(clientId, 'transactions', []);
  await storage.writeClientCollection(clientId, 'transaction_items', []);
  await storage.writeClientCollection(clientId, 'finance', []);
  await storage.writeClientCollection(clientId, 'invoices', []);
  await storage.writeClientCollection(clientId, 'audit_logs', []);

  // ---- 9. Default configuration/settings ---------------------------------
  await storage.writeClientCollection(clientId, 'settings', {
    client_id: clientId,
    currency: 'IDR',
    tax_percent: 0,
    receipt_footer: 'Terima kasih atas kunjungan Anda',
    theme: { primary: '#1E5FBF', accent: '#17B8C4' },
    updated_at: now,
  });

  // ---- 10. Initial audit log entries -----------------------------------
  await auditLogger.logClientEvent(clientId, {
    actorId: ownerId,
    actorUsername: username,
    action: 'CLIENT_PROVISIONED',
    target: 'company',
    meta: { company_id: companyId },
  });

  await auditLogger.logSystemEvent({
    actorId: actor?.sub,
    actorEmail: actor?.email,
    action: 'CREATE_CLIENT',
    target: clientId,
    meta: { company_name, client_code: clientCode },
  });

  // ---- Register in system-level client registry (LAST — marks success) --
  const clientRecord = {
    client_id: clientId,
    client_code: clientCode,
    company_id: companyId,
    name: company_name,
    owner_email: email,
    status,
    package: pkg,
    created_at: now,
    updated_at: now,
  };
  registry.push(clientRecord);
  await storage.writeSystemCollection('clients_registry.json', registry);

  return {
    client: clientRecord,
    owner: authService.sanitizeUser({
      id: ownerId,
      username,
      email,
      name: owner_name,
      role: ROLES.OWNER,
    }),
  };
}

module.exports = { createClient, generateUniqueClientCode, slugify };
