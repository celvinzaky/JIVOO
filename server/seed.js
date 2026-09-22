/**
 * server/seed.js
 * Run with: npm run seed
 *
 * Creates:
 *  - data/system/super_admins.json      (1 super admin, password hashed)
 *  - data/system/clients_registry.json  (1 demo client, status active)
 *  - data/system/system_audit_logs.json (empty array, initialized)
 *  - data/clients/{client_id}/*.json    (all 19 entity files with sample data)
 *
 * Safe to re-run: it will NOT overwrite existing files unless --force is
 * passed, so you don't accidentally wipe real data by re-running seed.
 */
const path = require('path');
const fs = require('fs');
const config = require('./config/config');
const storage = require('./services/jsonStorage');
const authService = require('./services/authService');
const { generateId, generateClientId, generateCompanyId } = require('./services/idGenerator');

const FORCE = process.argv.includes('--force');

function fileExists(p) {
  return fs.existsSync(p);
}

async function writeIfAbsent(absPath, data) {
  if (!FORCE && fileExists(absPath)) {
    console.log(`  skip (exists): ${path.relative(config.dataRoot, absPath)}`);
    return;
  }
  await storage.writeJsonFile(absPath, data);
  console.log(`  wrote: ${path.relative(config.dataRoot, absPath)}`);
}

async function seed() {
  console.log('JIVOO seed starting...');
  console.log(`Data root: ${config.dataRoot}`);

  // ---- 1. Super Admin ------------------------------------------------
  const superAdminId = generateId('sadmin');
  const superAdminPasswordHash = await authService.hashPassword(config.superAdminSeed.password);
  await writeIfAbsent(storage.systemFilePath('super_admins.json'), [
    {
      id: superAdminId,
      name: 'JIVOO Super Admin',
      email: config.superAdminSeed.email,
      password_hash: superAdminPasswordHash,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  // ---- 2. Demo client registry entry ---------------------------------
  const clientId = generateClientId();
  const companyId = generateCompanyId();
  const clientCode = 'demo001';

  await writeIfAbsent(storage.systemFilePath('clients_registry.json'), [
    {
      client_id: clientId,
      client_code: clientCode,
      company_id: companyId,
      name: 'Toko Contoh JIVOO',
      owner_email: 'owner@demo.jivoo.local',
      status: 'active',
      package: 'starter',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  await writeIfAbsent(storage.systemFilePath('system_audit_logs.json'), []);

  // ---- 3. Demo client data directory ----------------------------------
  await storage.createClientDirectory(clientId);

  const now = new Date().toISOString();

  await writeIfAbsent(storage.clientFilePath(clientId, 'company'), {
    company_id: companyId,
    client_id: clientId,
    name: 'Toko Contoh JIVOO',
    brand: 'JIVOO Demo Brand',
    outlets: [{ outlet_id: generateId('outlet'), name: 'Outlet Pusat', address: 'Jakarta', is_main: true }],
    created_at: now,
    updated_at: now,
  });

  const ownerId = generateId('user');
  const managerId = generateId('user');
  const cashierId = generateId('user');
  const ownerPasswordHash = await authService.hashPassword('Owner123!');
  const managerPasswordHash = await authService.hashPassword('Manager123!');
  const cashierPasswordHash = await authService.hashPassword('Cashier123!');

  await writeIfAbsent(storage.clientFilePath(clientId, 'users'), [
    {
      id: ownerId,
      client_id: clientId,
      username: 'owner',
      email: 'owner@demo.jivoo.local',
      name: 'Demo Owner',
      role: 'owner',
      password_hash: ownerPasswordHash,
      status: 'active',
      created_at: now,
      updated_at: now,
    },
    {
      id: managerId,
      client_id: clientId,
      username: 'manager',
      email: 'manager@demo.jivoo.local',
      name: 'Demo Manager',
      role: 'manager',
      password_hash: managerPasswordHash,
      status: 'active',
      created_at: now,
      updated_at: now,
    },
    {
      id: cashierId,
      client_id: clientId,
      username: 'cashier1',
      email: 'cashier1@demo.jivoo.local',
      name: 'Demo Cashier',
      role: 'cashier',
      password_hash: cashierPasswordHash,
      status: 'active',
      created_at: now,
      updated_at: now,
    },
  ]);

  await writeIfAbsent(storage.clientFilePath(clientId, 'roles'), [
    { id: generateId('role'), client_id: clientId, name: 'owner', label: 'Owner', is_system: true },
    { id: generateId('role'), client_id: clientId, name: 'manager', label: 'Manager', is_system: true },
    { id: generateId('role'), client_id: clientId, name: 'staff_back_office', label: 'Staff Back Office', is_system: true },
    { id: generateId('role'), client_id: clientId, name: 'cashier', label: 'Kasir', is_system: true },
  ]);

  await writeIfAbsent(storage.clientFilePath(clientId, 'permissions'), [
    { id: generateId('perm'), client_id: clientId, role: 'owner', modules: ['*'] },
    { id: generateId('perm'), client_id: clientId, role: 'manager', modules: ['dashboard', 'products', 'categories', 'customers', 'promotions', 'inventory', 'suppliers', 'purchase_orders', 'attendance', 'reports', 'settings'] },
    { id: generateId('perm'), client_id: clientId, role: 'staff_back_office', modules: ['products', 'categories', 'customers', 'inventory'] },
    { id: generateId('perm'), client_id: clientId, role: 'cashier', modules: ['cashier'] },
  ]);

  const categoryId1 = generateId('cat');
  const categoryId2 = generateId('cat');
  await writeIfAbsent(storage.clientFilePath(clientId, 'categories'), [
    { id: categoryId1, client_id: clientId, name: 'Minuman', status: 'active', created_at: now, updated_at: now },
    { id: categoryId2, client_id: clientId, name: 'Makanan', status: 'active', created_at: now, updated_at: now },
  ]);

  const productId1 = generateId('prod');
  const productId2 = generateId('prod');
  const productId3 = generateId('prod');
  await writeIfAbsent(storage.clientFilePath(clientId, 'products'), [
    { id: productId1, client_id: clientId, category_id: categoryId1, sku: 'MIN-001', name: 'Es Teh Manis', price: 8000, cost: 3000, status: 'active', created_at: now, updated_at: now },
    { id: productId2, client_id: clientId, category_id: categoryId1, sku: 'MIN-002', name: 'Kopi Susu', price: 15000, cost: 6000, status: 'active', created_at: now, updated_at: now },
    { id: productId3, client_id: clientId, category_id: categoryId2, sku: 'MAK-001', name: 'Nasi Goreng', price: 22000, cost: 9000, status: 'active', created_at: now, updated_at: now },
  ]);

  await writeIfAbsent(storage.clientFilePath(clientId, 'customers'), [
    { id: generateId('cust'), client_id: clientId, name: 'Pelanggan Umum', phone: null, is_member: false, points: 0, created_at: now, updated_at: now },
  ]);

  await writeIfAbsent(storage.clientFilePath(clientId, 'inventory'), [
    { id: generateId('inv'), client_id: clientId, product_id: productId1, stock_qty: 100, unit: 'gelas', low_stock_threshold: 10, updated_at: now },
    { id: generateId('inv'), client_id: clientId, product_id: productId2, stock_qty: 50, unit: 'gelas', low_stock_threshold: 10, updated_at: now },
    { id: generateId('inv'), client_id: clientId, product_id: productId3, stock_qty: 30, unit: 'porsi', low_stock_threshold: 5, updated_at: now },
  ]);

  await writeIfAbsent(storage.clientFilePath(clientId, 'inventory_logs'), []);
  await writeIfAbsent(storage.clientFilePath(clientId, 'suppliers'), []);
  await writeIfAbsent(storage.clientFilePath(clientId, 'purchase_orders'), []);
  await writeIfAbsent(storage.clientFilePath(clientId, 'promotions'), []);
  await writeIfAbsent(storage.clientFilePath(clientId, 'attendance'), []);
  await writeIfAbsent(storage.clientFilePath(clientId, 'cashier_sessions'), []);
  await writeIfAbsent(storage.clientFilePath(clientId, 'transactions'), []);
  await writeIfAbsent(storage.clientFilePath(clientId, 'transaction_items'), []);
  await writeIfAbsent(storage.clientFilePath(clientId, 'finance'), []);
  await writeIfAbsent(storage.clientFilePath(clientId, 'invoices'), []);
  await writeIfAbsent(storage.clientFilePath(clientId, 'audit_logs'), []);
  await writeIfAbsent(storage.clientFilePath(clientId, 'settings'), {
    client_id: clientId,
    currency: 'IDR',
    tax_percent: 0,
    receipt_footer: 'Terima kasih telah berbelanja di JIVOO Demo',
    updated_at: now,
  });

  console.log('\nSeed complete.\n');
  console.log('=== DEMO CREDENTIALS ===');
  console.log(`Super Admin  : ${config.superAdminSeed.email} / ${config.superAdminSeed.password}`);
  console.log(`Client code  : ${clientCode}`);
  console.log(`Owner login  : owner / Owner123!`);
  console.log(`Manager login: manager / Manager123!`);
  console.log(`Cashier login: cashier1 / Cashier123!`);
  console.log('\nChange these before any real deployment.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
