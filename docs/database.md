# Database

DineEasy uses PostgreSQL 16 as the single system of record, modeled with Prisma (`services/api/prisma/schema.prisma`). This document explains the schema's shape and the conventions behind it; for the "why Postgres/Prisma" reasoning see `docs/architecture.md` §2.

## Conventions

- **IDs**: every table has a `TEXT` primary key holding an application-generated UUID v4 (`@default(uuid())` in Prisma). IDs are never auto-increment integers — they're safe to expose in URLs and are never guessable, which matters for e.g. `orderId` appearing in QR/customer-facing tracking links.
- **Money**: every monetary column is `DECIMAL(12,2)` (`NUMERIC` in Postgres). Percentages (tax rates, service charge, discount %) are `DECIMAL(5,2)`. The application layer uses `decimal.js` end-to-end — money is never represented as a JS/TS `number`.
- **Tenancy**: tenant-scoped tables carry `organizationId` and, where relevant, `outletId`, both required (`NOT NULL`) foreign keys. See `docs/architecture.md` §3 for how the application enforces that every query is scoped by these.
- **Timestamps**: `createdAt` defaults to `CURRENT_TIMESTAMP`; `updatedAt` is set by the application on every write (Prisma's `@updatedAt`), not by a DB trigger — this keeps "who/what changed a row" explainable from application code and audit logs rather than hidden in DB triggers.
- **Soft delete**: used only where it's actually load-bearing — currently `Organization.deletedAt` (an org's historical financial data must remain queryable even if the account is closed). Everything else uses `isActive` boolean flags (menu items, users, tables, etc.) since "hidden from new orders" and "deleted" are different concepts for restaurant data — see spec §19 ("soft deletion only where justified").
- **Snapshots**: `OrderItem`, `OrderItemModifier`, `InvoiceItem` freeze `nameSnapshot`/`priceOverride`/`priceDeltaSnapshot` at transaction time. A menu price change tomorrow must never alter yesterday's invoice.
- **Column naming**: fields are camelCase (not snake_case) to match the Prisma models 1:1 without `@map` noise; raw SQL against this schema must double-quote identifiers (`"organizationId"`), which is standard for Prisma-managed Postgres schemas.

## Entity groups

| Group | Tables |
|---|---|
| Identity & tenancy | `organizations`, `outlets`, `users`, `refresh_tokens`, `roles`, `permissions`, `role_permissions`, `user_roles` |
| Floors/tables/QR | `floors`, `tables`, `table_qr_codes`, `dining_sessions` |
| Menu | `menus`, `menu_categories`, `menu_items`, `menu_item_variants`, `modifier_groups`, `modifiers`, `menu_item_modifier_groups` |
| Tax | `tax_groups`, `tax_group_components` |
| Orders | `orders`, `order_items`, `order_item_modifiers`, `order_events`, `discount_applications` |
| Kitchen | `kitchen_stations`, `kitchen_orders`, `kitchen_order_items` |
| Billing | `invoices`, `invoice_items`, `invoice_taxes` |
| Payments | `payments`, `payment_transactions`, `refunds` |
| Printing | `printers`, `printer_jobs` |
| Audit | `audit_logs` |
| Sequencing | `outlet_daily_counters` (backs human-friendly order/KOT/invoice numbers, see below) |

Full column-level detail lives in `services/api/prisma/schema.prisma` — it is heavily commented and is the source of truth; this document explains the *shape*, not a duplicate of every column.

### Why a reusable `ModifierGroup` instead of nesting it under `MenuItem`

The spec shows `Item → ModifierGroup → Modifier`. In practice a group like "Toppings" or "Spice Level" is reused across many items, so `ModifierGroup` belongs to the `Outlet` and `MenuItemModifierGroup` is a join table. This avoids duplicating "Spice Level: Mild/Medium/Hot" for every dish while keeping per-item `displayOrder`.

### Why `TaxGroup` + `TaxGroupComponent` instead of a flat tax rate

Indian GST on a menu item is typically CGST + SGST (e.g. 2.5% + 2.5% = 5%), and IGST for interstate cases doesn't apply to dine-in but the schema stays honest to the domain either way. A `TaxGroup` ("GST 5%") is a named bundle of `TaxGroupComponent` rows so an invoice can show the CGST/SGST breakdown lines (`invoice_taxes`) required by Indian billing norms, while the menu item just references one `taxGroupId`.

### Order numbering (`outlet_daily_counters`)

Order/KOT/invoice numbers need to be short, sequential-per-day, and collision-free under concurrent POS terminals — a raw UUID is not something a cashier reads off a receipt. `outlet_daily_counters` holds one row per `(outletId, type, date)` with `lastValue`; the service layer increments it inside the same transaction that creates the order/KOT/invoice (`SELECT ... FOR UPDATE` then increment), so two terminals creating an order in the same second still get distinct sequential numbers, formatted as e.g. `DED-20260908-0007`.

## Migrations

Migrations live in `services/api/prisma/migrations/`. The initial migration (`20260908000000_init`) was authored by hand against `schema.prisma` — `prisma migrate dev` needs to download its schema-engine binary from `binaries.prisma.sh`, which this development sandbox's network policy blocks (see `docs/troubleshooting.md`). It has been validated by applying it directly to a real PostgreSQL 16 instance (39 tables, 18 enum types, 56 foreign keys created with zero errors). On a machine with normal internet access, regenerate it the standard way and diff:

```bash
cd services/api
npx prisma migrate dev --name init   # only if you need to regenerate/verify against schema.prisma
```

Going forward, schema changes should go through `prisma migrate dev --name <change>` as normal; only fall back to hand-writing SQL if engine downloads are blocked in your environment, and always keep `schema.prisma` as the source of truth to diff against.

## Seed data

`services/api/prisma/seed.ts` creates a demo organization ("DineEasy Demo Restaurant"), one outlet, default roles/permissions, demo staff users, 3 menu categories with 15–25 items (with variants and modifiers), 10 tables across 2 floors with QR codes, and a handful of sample orders in different states. See `docs/local-development.md` to run it.
