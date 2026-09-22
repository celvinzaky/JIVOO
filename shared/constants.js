/**
 * shared/constants.js
 * Central constants shared conceptually across Super Admin, Client Back Office,
 * and Cashier PWA. This file uses CommonJS export for the Node server.
 */

// Matches master spec section 10 "ROLE BASED ACCESS CONTROL" exactly.
// SUPER_ADMIN lives at system scope (data/system/super_admins.json) and is
// never one of a client's own roles.json entries - it's listed here only
// because the spec enumerates it alongside the client-scoped roles.
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CLIENT_OWNER: 'CLIENT_OWNER',
  CLIENT_ADMIN: 'CLIENT_ADMIN',
  MANAGER: 'MANAGER',
  SUPERVISOR: 'SUPERVISOR',
  CASHIER: 'CASHIER',
  INVENTORY_STAFF: 'INVENTORY_STAFF',
  FINANCE_STAFF: 'FINANCE_STAFF',
  CUSTOM_ROLE: 'CUSTOM_ROLE',
};

// Permission actions (spec section 10). '*' (used inside a role's `actions`
// array) means "every action below is granted".
const PERMISSION_ACTIONS = ['view', 'create', 'update', 'delete', 'export', 'approve', 'void', 'manage_settings'];

// Full module list (spec section 11). Navigation follows this list filtered
// by the user's effective module_access - but the API re-validates on every
// request too (§11: "keamanan tidak boleh hanya berdasarkan hidden menu").
const MODULES = [
  'dashboard',
  'reports',
  'analytics',
  'products',
  'categories',
  'inventory',
  'suppliers',
  'purchase_orders',
  'customers',
  'promotions',
  'commissions',
  'invoices',
  'finance',
  'accounts',
  'employees',
  'attendance',
  'cashier',
  'users',
  'roles',
  'settings',
];

// Default permission template applied to each system role at client-creation
// time (spec §8.3 steps 5/6) and shown as the starting point when a client
// creates a CUSTOM_ROLE. Each entry is { modules, actions }; '*' in either
// array means "all". A user's own `module_access` (on the user record) can
// further customize which of the role's modules they personally see -
// Part 3's User management lets an owner grant/revoke individual modules
// without creating a whole new role.
const DEFAULT_ROLE_PERMISSIONS = {
  CLIENT_OWNER: { modules: ['*'], actions: ['*'] },
  CLIENT_ADMIN: { modules: ['*'], actions: ['*'] },
  MANAGER: {
    modules: [
      'dashboard', 'reports', 'analytics', 'products', 'categories', 'customers',
      'promotions', 'inventory', 'suppliers', 'purchase_orders', 'attendance',
      'finance', 'invoices', 'employees',
    ],
    actions: ['view', 'create', 'update', 'export', 'approve'],
  },
  SUPERVISOR: {
    modules: ['dashboard', 'products', 'categories', 'inventory', 'customers', 'attendance', 'cashier'],
    actions: ['view', 'create', 'update'],
  },
  CASHIER: {
    modules: ['cashier', 'dashboard', 'customers'],
    actions: ['view', 'create'],
  },
  INVENTORY_STAFF: {
    modules: ['inventory', 'suppliers', 'purchase_orders', 'products', 'categories'],
    actions: ['view', 'create', 'update'],
  },
  FINANCE_STAFF: {
    modules: ['finance', 'invoices', 'accounts', 'reports', 'dashboard'],
    actions: ['view', 'create', 'update', 'export'],
  },
  CUSTOM_ROLE: { modules: [], actions: ['view'] },
};

const CLIENT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
};

const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
};

const TRANSACTION_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  VOID: 'void',
  REFUNDED: 'refunded',
};

const PAYMENT_METHODS = {
  CASH: 'cash',
  DEBIT: 'debit',
  CREDIT: 'credit',
  QRIS: 'qris',
  INVOICE: 'invoice',
};

const ENTITY_FILES = [
  'company',
  'users',
  'roles',
  'permissions',
  'products',
  'categories',
  'customers',
  'transactions',
  'transaction_items',
  'inventory',
  'inventory_logs',
  'suppliers',
  'purchase_orders',
  'promotions',
  'attendance',
  'cashier_sessions',
  'finance',
  'invoices',
  'audit_logs',
  'settings',
];

module.exports = {
  ROLES,
  PERMISSION_ACTIONS,
  MODULES,
  DEFAULT_ROLE_PERMISSIONS,
  CLIENT_STATUS,
  USER_STATUS,
  TRANSACTION_STATUS,
  PAYMENT_METHODS,
  ENTITY_FILES,
};
