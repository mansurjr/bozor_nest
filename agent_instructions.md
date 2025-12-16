# Agent Instructions

This project is a NestJS 11 + Prisma service for managing bazaar stalls/stores, owners, contracts, daily attendances, and payment integrations (Click, Payme, manual). Everything is behind the `/api` prefix; Swagger is at `/api/docs`.

## Local run
- Install deps: `npm install`
- Ensure Postgres and `DATABASE_URL` are set; run Prisma migrations if needed.
- Start dev server: `npm run start:dev`
- Useful scripts: `npm run generate:stalls -- --saleTypeId=1 --area=12.5 --dry-run` to seed stalls; `npm run import:leases` imports lease data from `scripts/*.xlsx`.

## Configuration / env
- JWT: `ACCESS_SECRET`, `REFRESH_SECRET`, optional `ACCESS_TIME`/`REFRESH_TIME` (defaults 15m/7d).
- Payments:
  - Click: `PAYMENT_SERVICE_ID`/`CLICK_SERVICE_ID`, `PAYMENT_MERCHANT_ID`/`CLICK_MERCHANT_ID`.
  - Payme: `PAYME_LOGIN`, `PAYME_PASS`, `PAYME_MERCHANT_ID` (Payme flows only enabled when `TENANT_ID === "ipak_yuli"`).
- Other: `MY_DOMAIN` (extra CORS origin), `PORT`, `TENANT_ID`.

## Architecture & modules
- `src/main.ts`: sets global prefix `/api`, CORS whitelist (+ any `*.myrent.uz` and localhost), cookie parser, and a global `ValidationPipe` that returns `{message, errors:[{field, errors}]}` on 400.
- `src/app.service.ts`: on startup seeds a `SUPERADMIN` (`superadmin@example.com` / `SuperAdmin123!`) if missing.
- Auth (`src/auth`): email/password sign-in (bcrypt), refresh via cookie `refreshToken`, `JwtAuthGuard` for access tokens, `JwtRefresh` for refresh cookies. Roles are enforced via `RolesDecorator` + `RolesGuard`.
- Prisma (`src/prisma`): Postgres schema in `prisma/schema.prisma`; key models: `User (Roles)`, `Owner`, `Store`, `Section`, `SaleType`, `Stall` (dailyFee, saleType/section), `Attendance` (stall/day), `Contract` (store-owner, monthly fee, paymentType), `ContractPaymentPeriod` (monthly ledger), `Transaction` (generic payments, links to attendance/contract), `ClickTransaction`.
- Domain services/controllers (all under `/api`):
  - Users (`/users`): admin CRUD with role-based restrictions (only SUPERADMIN can create ADMIN; no SUPERADMIN deletion/role change).
  - Sales types (`/sale-types`), Sections (`/sections`), Stores (`/stores`), Stalls (`/stalls`): CRUD with pagination/search; stall daily fee = `area * saleType.tax`, builds Click payment URL on create/update, `/stalls/:id/history` for attendance summary, `/stalls/check-number/:stallNumber` to validate uniqueness.
  - Owners (`/owners`): CRUD; links contracts to owners.
  - Contracts (`/contracts`): create/update with overlap checks so a store cannot be double-booked; auto-syncs store Click/Payme links using monthly fee + storeNumber; cannot update if the current month is already paid. Exposes payment history, snapshots, and manual bank payments (`POST /contracts/:id/payments/manual`) which create transactions and mark sequential months paid.
  - Attendance (`/attendances`): per-stall daily entries; refuses edits/deletes once paid. `getPayUrl` builds Click/Payme link; `/attendances/:id/history` and `/attendances/:id/refresh` help review/refresh status.
  - Transactions (`/transactions`): generic list/search/update; when a contract transaction becomes `PAID`, `ContractPaymentPeriod` rows are generated.
  - Public payments (`/public/pay`): anonymous endpoints to fetch contract payment status by store number/TIN, fetch a contract by id, generate contract payment link, and query stall payment status for a date. Also ensures store payment links exist.
  - Statistics (`/statistics`): revenue/count rollups (daily/monthly), series, reconciliation ledgers for stalls/stores, contract/stall monthly status, and monthly rollups; optional filters for type, method, status, dates, section, etc.
  - Webhooks:
    - Click (`/click/prepare`, `/click/complete`): verifies signature per tenant config, prevents duplicates, creates pending transactions for store contracts (amount must be 1–12× monthly fee) or attendance (one per day), marks transactions/attendances paid and updates contract payment periods on completion.
    - Payme (`/payme`): Basic auth via `PAYME_LOGIN/PAYME_PASS`; supports Check/Create/Perform/Check/Cancel/GetStatement. Amount must match expected (contracts allow 1–12× monthly fee), handles attendance or contract payments, marks attendance paid and triggers contract payment periods on `Perform`.

## Business rules / gotchas
- Contract updates are blocked if a payment already exists for the current month (`ContractPaymentPeriodsService.hasPaidThisMonth`).
- Store occupancy: `ContractService.ensureStoreNotOccupied` prevents overlapping active contracts on the same store.
- Attendance uniqueness: one row per stall+date; recreate reuses an unpaid record instead of duplicating.
- Transactions: `attendanceId` is unique; `transactionId` is unique across gateways; contract payments in `PAID` state always feed `ContractPaymentPeriod`.
- Payment links are recomputed when monthly fee or store number changes; Payme URLs are only valid for `TENANT_ID === "ipak_yuli"` and must start with `https://checkout.paycom.uz/`.
- CORS allows any `*.myrent.uz` plus explicit whitelist and localhost; be mindful when adding new origins.

## Testing / quality
- Lint: `npm run lint`; Format: `npm run format`; Tests: `npm test` (Jest, no current specs).
- Prisma migration state lives in `prisma/migrations`; update `schema.prisma` and run `prisma migrate`/`prisma generate` when changing the DB.

