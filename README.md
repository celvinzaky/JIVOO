# JIVOO — Multi-Tenant POS Web + Cashier PWA

> **Status: PART 1 of 10 — Foundation.** This README covers only what's
> been built so far (server, JSON storage layer, authentication,
> multi-tenant isolation, sample data). Super Admin UI, Client Back
> Office UI, Cashier PWA, receipt printing, offline sync, and reports
> are not implemented yet — see "Roadmap" below.

## 1. Overview

JIVOO is a Point of Sale platform with three access levels:

1. **Super Admin Web** (`/admin`) — JIVOO platform operator: creates and
   manages client (tenant) accounts.
2. **Client Back Office Web** (`/client`) — owner/manager/staff of a
   business: products, inventory, reports, etc.
3. **Cashier PWA** (`/cashier`) — installable, offline-capable
   front-of-house app for cashiers.

Tech constraint: **no frontend framework** — HTML5/CSS3/vanilla JS ES6+
only. **JSON files are the database.** A minimal Express API layer
exists only because a static browser page cannot safely be a shared
multi-device data store.

## 2. Architecture

```
Browser (admin / client / cashier)
        │  fetch() → REST JSON
        ▼
Express API (server/)
        │  all reads/writes go through
        ▼
server/services/jsonStorage.js   ← the ONLY module that touches disk
        │
        ▼
data/system/*.json               ← platform-level (super admin scope)
data/clients/{client_id}/*.json  ← one isolated folder per tenant
```

Multi-tenant hierarchy: `Super Admin → Client/Company → Brand → Outlet
→ User → Role/Permission/Module access → Back Office | Cashier PWA`.

**Isolation guarantee:** `server/middleware/tenantContext.js` derives
`req.clientId` **only** from the verified JWT payload — never from a
URL param, query string, or request body. Every future client-scoped
route must use this middleware, so Client A can never read Client B's
files by manipulating a request.

## 3. Folder structure (current)

```
JIVOO/
├── admin/                  # Super Admin frontend (Part 2)
├── client/                 # Client Back Office frontend (Part 3+)
├── cashier/                # Cashier PWA (Part 6+)
├── server/
│   ├── server.js           # Express entrypoint
│   ├── seed.js              # generates sample data
│   ├── config/config.js
│   ├── services/
│   │   ├── jsonStorage.js   # data service layer (swap-safe)
│   │   ├── authService.js   # bcrypt + JWT
│   │   ├── idGenerator.js
│   │   └── auditLogger.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   ├── tenantContext.js # <-- isolation guarantee
│   │   └── errorHandler.js
│   └── routes/
│       └── authRoutes.js
├── shared/constants.js      # roles, statuses, module list
├── assets/{logo,icons,images}/   # empty — no logo file was supplied yet
├── css/ js/                 # for the vanilla-JS frontends (Part 2+)
├── data/
│   ├── system/               # super_admins, clients_registry, audit
│   └── clients/{client_id}/  # 19 entity files per tenant
├── package.json
├── .env.example
└── README.md
```

## 4. Requirements

- Node.js 18+ (tested on Node 22)
- npm

## 5. Installation

```bash
cd JIVOO
npm install
cp .env.example .env
# edit .env — set a real JWT_SECRET before anything but local testing
```

## 6. Seed demo data

```bash
npm run seed
```

This creates one Super Admin and one demo client ("Toko Contoh JIVOO",
client_code `demo001`) with sample products, categories, customers,
and inventory. It will **not** overwrite existing data unless you pass
`--force`:

```bash
node server/seed.js --force
```

### Demo credentials (change before any real deployment)

| Actor | Login | Password |
|---|---|---|
| Super Admin | `superadmin@jivoo.local` | `ChangeMe123!` |
| Owner | client_code `demo001`, username `owner` | `Owner123!` |
| Manager | client_code `demo001`, username `manager` | `Manager123!` |
| Cashier | client_code `demo001`, username `cashier1` | `Cashier123!` |

## 7. Run

```bash
npm start          # production-style run
npm run dev         # auto-restart on file change (node --watch)
```

Server listens on `http://localhost:3000` by default.

## 8. API implemented so far

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness check |
| POST | `/api/auth/admin/login` | Super Admin login → JWT |
| POST | `/api/auth/client/login` | Client user login (`client_code` + `username` + `password`) → JWT |
| POST | `/api/auth/refresh` | exchange refresh token for new access token |
| POST | `/api/auth/logout` | audit-logs the logout (JWTs are stateless — see Security Notes) |
| GET | `/api/auth/me` | returns the decoded actor from the Bearer token |

All future protected routes will sit under `/api/admin/*` (super admin
scope, guarded by `assertSuperAdmin`) or `/api/back-office/*` and
`/api/cashier/*` (client scope, guarded by `requireAuth` +
`attachTenantContext`).

## 9. How JSON storage works

Every entity (`products`, `transactions`, `inventory`, …) is one JSON
array file per client: `data/clients/{client_id}/{entity}.json`.
Writes go through `jsonStorage.writeJsonFile`, which:

1. Acquires an in-process per-file lock (prevents two concurrent
   requests from corrupting the same file).
2. Writes to a temp file, then renames it over the target — reduces
   the chance of a half-written file if the process crashes mid-write.

`jsonStorage.js` is the **only** file that touches the filesystem.
Route handlers only ever call its exported functions
(`findAll`, `findById`, `insert`, `update`, `softDelete`, …). This is
what lets JIVOO move to a real database later without rewriting the
frontend or route logic.

## 10. Security notes (Part 1 scope)

- Passwords hashed with bcrypt (12 salt rounds) — never stored plain.
- JWT access tokens expire in 8h, refresh tokens in 7d (configurable).
- `helmet`, `cors`, and a rate limiter (`express-rate-limit`) are
  applied to all `/api` routes.
- **Known limitation:** JWTs are stateless, so `/api/auth/logout` only
  records an audit entry — it does not invalidate the token. A token
  blocklist (e.g. a `revoked_tokens` system file, checked in
  `authMiddleware`) is planned as a later hardening pass; document
  this to users if going to production before then.
- `JWT_SECRET` in `.env.example` is a placeholder — **must** be
  replaced with a long random value before any non-local use.

## 11. Troubleshooting

- **"Missing required environment variable"** — copy `.env.example`
  to `.env`.
- **Login returns 401 for correct-looking credentials** — re-run
  `npm run seed` (without `--force` it won't overwrite, so check
  `data/system/clients_registry.json` for the actual `client_code`
  it generated).
- **Port already in use** — change `PORT` in `.env`.

## 12. Roadmap (remaining parts, per the master build prompt)

- **Part 2** — Super Admin complete: client creation flow (auto
  generate client_id/company_id/owner account/default
  roles-permissions/data folder), client management (search, filter,
  activate/deactivate — never hard delete), client statistics, data
  export.
- **Part 3** — Client Back Office core: dashboard, user management,
  role management, permission system.
- **Part 4** — Products, categories, customers, promotions.
- **Part 5** — Inventory, suppliers, purchase orders, stock opname,
  waste stock, recipe/BOM.
- **Part 6** — Cashier PWA: login, open cashier, attendance, product
  selection, cart, payment, transaction.
- **Part 7** — Receipt printing (58mm/80mm print CSS), reprint, close
  cashier.
- **Part 8** — Offline mode: IndexedDB, service worker, sync queue,
  online/offline indicator, `manifest.json`.
- **Part 9** — Reports, analytics, finance, invoices, chart of
  accounts.
- **Part 10** — Final manifest/PWA validation, full README, testing
  checklist, file audit.

## 13. Note on branding assets

The master prompt calls for the JIVOO logo to be used across login,
splash, sidebar, header, and PWA icon, with a blue/cyan/white theme
derived from it. **No logo file was included in this upload** — only
the master prompt (.md) and the requirements document (.docx, which
contained three flowchart diagrams, not a logo). `assets/logo/` is
scaffolded but empty. Part 2+ will use a placeholder blue
(`#1E5FBF`)/cyan (`#17B8C4`)/white/light-gray theme per the spec's
color guidance until the real logo is supplied.
