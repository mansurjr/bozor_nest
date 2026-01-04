# Bozor NestJS Service - Codebase Analysis

This document captures the backend architecture, data model, business rules, and API surface for the NestJS + Prisma service in this repo. It is intended as a handoff artifact for downstream analysis and frontend alignment.

## Project Summary
- Runtime: NestJS 11, TypeScript, Prisma ORM, PostgreSQL.
- Global API prefix: `/api`.
- Swagger: `/api/docs`.
- Auth: JWT access tokens (Bearer) + refresh token via httpOnly cookie.
- Payments: Click + Payme integrations, plus manual/bank payments for contracts.
- Domain: sections (pavilions), stalls (daily fee), stores (monthly fee), owners, contracts, attendances, transactions, payment periods.

## Runtime + Configuration
- `src/main.ts`
  - Global prefix `/api`.
  - CORS: allowlist of `*.myrent.uz`, explicit tenants, localhost, and `MY_DOMAIN` env. Credentials enabled.
  - ValidationPipe: whitelist + forbidNonWhitelisted, returns `{ message, errors: [{field, errors[]}] }` on 400.
  - Swagger builder with bearer auth.
- Env vars (primary):
  - JWT: `ACCESS_SECRET`, `REFRESH_SECRET`, optional `ACCESS_TIME`, `REFRESH_TIME`.
  - Click: `PAYMENT_SERVICE_ID`/`CLICK_SERVICE_ID`, `PAYMENT_MERCHANT_ID`/`CLICK_MERCHANT_ID`.
  - Payme: `PAYME_LOGIN`, `PAYME_PASS`, `PAYME_MERCHANT_ID` (Payme flows only active when `TENANT_ID=ipak_yuli`).
  - Other: `TENANT_ID`, `MY_DOMAIN`, `PORT`.

## Application Modules
`src/app.module.ts` registers:
- Auth (`src/auth`), JWT (`src/jwt`), Users
- Sales types, Sections, Owners, Stores, Stalls
- Attendances, Contracts, Transactions
- Click webhook, Payme, Public payments
- Statistics
- Prisma

## Data Model (Prisma)
See `prisma/schema.prisma`.

### Core Entities
- `User`: auth accounts with roles (`SUPERADMIN`, `ADMIN`, `CHECKER`), refresh token, created contracts/owners.
- `Owner`: personal details + `tin` (unique), links to contracts.
- `Section`: pavilion; required `assignedCheckerId` (User).
- `SaleType`: name + tax (used to compute stall daily fee).
- `Stall`: daily-fee entity (area * saleType.tax), with optional payment URLs.
- `Store`: monthly-fee entity (storeNumber unique), optional payment URLs.
- `Contract`: links Owner + Store, monthly fee, payment type, active date window.
- `ContractPaymentPeriod`: monthly ledger for contracts (one row per month paid), linked to transactions.
- `Attendance`: per-stall daily record, one per stall+date, linked to transaction when paid.
- `Transaction`: generic payment record (contract or attendance), includes payment method and status.
- `ClickTransaction`: Click gateway tracking record.

### Key Constraints / Uniques
- `Owner.tin` unique.
- `Stall.stallNumber` unique; `Store.storeNumber` unique.
- `Attendance` unique by `(stallId, date)`; `attendanceId` unique in `Transaction`.
- `Transaction.transactionId` unique.
- `ContractPaymentPeriod` unique by `(contractId, periodStart)`.

## Auth + Security
- Access tokens: Bearer JWT (strategy `jwt`).
- Refresh tokens: cookie `refreshToken` via strategy `jwt-refresh`.
- Roles: `RolesDecorator` + `RolesGuard`.
- `AuthService`:
  - `signin`: bcrypt compare; sets refresh cookie.
  - `refresh`: verifies refresh token, rotates cookie.
  - `signout`: clears stored refresh token + cookie.
- Startup seed: `src/app.service.ts` creates a default SUPERADMIN if missing.

## Business Rules (Global Highlights)
- Contract updates blocked if a payment exists for current month.
- Store occupancy is exclusive during contract date ranges (no overlaps).
- Attendance can be created once per day per stall; paid attendance cannot be modified or deleted.
- Contract payments can cover 1..12 months in one transaction (Click/Payme). Manual payments enforce multiples of monthly fee.
- Transaction status `PAID` drives contract payment period creation.
- Payme flows only when `TENANT_ID=ipak_yuli`.

## Payment URL Generation
- Click: `https://my.click.uz/services/pay?service_id=...&merchant_id=...&amount=...&transaction_param=...`
- Payme: `https://checkout.paycom.uz/<base64>` with contract or attendance account params.
- Contracts:
  - URLs are synced at contract creation and on update if fee/store changes.
- Stalls:
  - Click URL generated on create/update; Payme URL generated in public services only (tenant gated).

## API Surface (Routes)
All routes are prefixed by `/api`.

### Auth (`/auth`)
- `POST /auth/signin` - email/password login, sets refresh cookie.
- `POST /auth/refresh` - refresh access token (requires refresh cookie).
- `GET /auth/me` - current user.
- `POST /auth/signout` - clears refresh token cookie.

### Users (`/users`) [JWT + Roles]
- `POST /users` - create user (SUPERADMIN only).
- `GET /users` - list users (SUPERADMIN, ADMIN). Query: `search`, `role`, `page`, `limit`.
- `GET /users/:id` - get user by id.
- `PUT /users/:id` - update user (role updates restricted).
- `DELETE /users/:id` - delete user (SUPERADMIN only; ADMIN can delete CHECKER only).

### Sale Types (`/sale-types`) [JWT]
- `POST /sale-types` - create (ADMIN, SUPERADMIN).
- `GET /sale-types` - list with `search`, `page`, `limit`.
- `GET /sale-types/:id` - get by id.
- `PUT /sale-types/:id` - update (ADMIN, SUPERADMIN).
- `DELETE /sale-types/:id` - delete (ADMIN, SUPERADMIN).

### Sections (`/sections`) [JWT]
- `POST /sections` - create (ADMIN, SUPERADMIN).
- `GET /sections` - list.
- `GET /sections/:id` - get by id.
- `PATCH /sections/:id` - update (ADMIN, SUPERADMIN).
- `DELETE /sections/:id` - delete (ADMIN, SUPERADMIN).

### Owners (`/owners`) [JWT]
- `POST /owners` - create (ADMIN, SUPERADMIN).
- `GET /owners` - list with `search`, `page`, `limit`.
- `GET /owners/:id` - get by id.
- `PATCH /owners/:id` - update (ADMIN, SUPERADMIN).
- `DELETE /owners/:id` - delete (ADMIN, SUPERADMIN).

### Stores (`/stores`) [JWT]
- `POST /stores` - create (ADMIN, SUPERADMIN).
- `GET /stores` - list with `search`, `page`, `limit`, `onlyFree`, `withContracts`, `asOf`.
- `GET /stores/:id` - get by id.
- `PATCH /stores/:id` - update (ADMIN, SUPERADMIN).
- `DELETE /stores/:id` - delete (ADMIN, SUPERADMIN).

### Stalls (`/stalls`) [JWT]
- `POST /stalls` - create (ADMIN, SUPERADMIN).
- `GET /stalls` - list with `search`, `page`, `limit`.
- `GET /stalls/check-number/:stallNumber` - validate stallNumber uniqueness.
- `GET /stalls/:id` - get by id.
- `GET /stalls/:id/history` - attendance history summary for the stall.
- `PATCH /stalls/:id` - update (ADMIN, SUPERADMIN).
- `DELETE /stalls/:id` - delete (ADMIN, SUPERADMIN).

### Attendances (`/attendances`) [JWT]
- `POST /attendances` - create (ADMIN, SUPERADMIN).
- `GET /attendances` - list with `page`, `limit`, `stallId`, `dateFrom`, `dateTo`.
- `GET /attendances/:id` - get by id.
- `GET /attendances/:id/history` - history for the same stall.
- `GET /attendances/:id/refresh` - refresh payment status from transactions.
- `GET /attendances/:id/pay?type=click|payme` - get payment URL.
- `PUT /attendances/:id` - update (blocked if paid).
- `DELETE /attendances/:id` - delete (blocked if paid).

### Contracts (`/contracts`) [JWT]
- `POST /contracts` - create contract.
- `GET /contracts` - list with `page`, `limit`, `isActive`, `paid` (paid/unpaid current month), `paymentType`.
- `GET /contracts/:id` - get by id with payment snapshot.
- `GET /contracts/:id/history` - transaction history summary.
- `GET /contracts/:id/refresh` - refresh payment snapshot.
- `GET /contracts/:id/payments` - list monthly payment periods.
- `POST /contracts/:id/payments/manual` - manual bank payment (creates transaction + periods).
- `PUT /contracts/:id` - update (blocked if already paid this month).
- `DELETE /contracts/:id` - soft delete (sets `isActive=false`).

### Transactions (`/transactions`) [JWT]
- `POST /transactions` - create.
- `GET /transactions` - list with `search`, `page`, `limit`, `status`, `paymentMethod`, `source`, `dateFrom`, `dateTo`, `contractId`, `attendanceId`.
- `GET /transactions/:id` - get by id.
- `PUT /transactions/:id` - update; if status becomes `PAID`, contract periods are generated.
- `DELETE /transactions/:id` - delete.

### Public Payments (`/public/pay`)
- `GET /public/pay/contracts?storeNumber=...&tin=...`
  - Search active contracts; returns payment status and links.
- `GET /public/pay/contracts/:id` - contract details + payment info.
- `POST /public/pay/contracts/:id/pay` - ensure payment links exist and return payment info.
- `GET /public/pay/stalls/:id?date=YYYY-MM-DD` - find stalls by number, include attendance + payment status for date.

### Click Webhook (`/click`)
- `POST /click/prepare` - validate signature, create pending transaction + ClickTransaction.
- `POST /click/complete` - finalize payment, mark transaction/attendance paid, create contract payment periods.

### Payme (`/payme`)
- `POST /payme` - Payme method gateway; requires Basic auth.
  - Methods: CheckPerformTransaction, CreateTransaction, PerformTransaction, CheckTransaction, CancelTransaction, GetStatement.

### Statistics (`/statistics`) [JWT]
- `GET /statistics/daily` - daily totals.
- `GET /statistics/monthly` - monthly totals.
- `GET /statistics/monthly/:year/:month` - totals for specific month.
- `GET /statistics/monthly/:year/:month/details` - breakdown by method.
- `GET /statistics/current` - current month income.
- `GET /statistics/totals` - totals with filters.
- `GET /statistics/series` - time series (daily/weekly/monthly).
- `GET /statistics/series/monthly` - recent monthly series.
- `GET /statistics/reconciliation/ledger` - combined ledger with filters.
- `GET /statistics/reconciliation/ledger/totals` - totals for all matching ledger rows grouped by method.
- `GET /statistics/reconciliation/ledger/export` - full ledger export (no pagination).
- `GET /statistics/reconciliation/contracts` - contract summary (paid/unpaid/overpaid).
- `GET /statistics/reconciliation/monthly` - monthly rollup.
- `GET /statistics/reconciliation/contracts/monthly-status` - contract monthly status.
- `GET /statistics/reconciliation/stalls/monthly-status` - stall monthly status.

## Domain Flow Details

### Contract Lifecycle
1. Create contract (owner + store required).
2. Store occupancy checked against overlapping active contracts.
3. Store payment links synced from monthly fee and storeNumber.
4. Payments create `Transaction` records. When marked `PAID`, contract payment periods are generated.
5. Manual payments create a transaction with `paymentMethod=CASH` and populate periods.
6. Contract update blocked if current month is already paid.

### Attendance Lifecycle
1. Create attendance for stall + date (one per day). If existing unpaid, it is updated.
2. If attendance already paid, creation is rejected.
3. Payment URLs can be generated via `/attendances/:id/pay`.
4. Paid attendance cannot be edited or deleted.

### Transaction Lifecycle
- Transactions can be created directly or via Payme/Click.
- When status transitions to `PAID` for a contract transaction, payment periods are generated.
- Attendance-linked transactions update attendance status to `PAID`.

### Click Flow
- Prepare (`/click/prepare`)
  - Validate signature.
  - Detect store vs attendance via `merchant_trans_id` (storeNumber or attendanceId).
  - For contracts, enforce amount is exact multiple (1..12) of monthly fee.
  - Create `Transaction` + `ClickTransaction`.
- Complete (`/click/complete`)
  - Validate signature and prepare record.
  - Mark transaction paid and propagate to attendance/contract periods.

### Payme Flow
- Auth: HTTP Basic with `PAYME_LOGIN`/`PAYME_PASS`.
- Amounts are in tiyin (amount * 100).
- Contracts allow multiples (1..12) of monthly fee.
- Attendance allows only exact fee for that day.
- PerformTransaction updates transaction status to `PAID`, updates attendance, and generates contract periods.

## Scripts + Seed Helpers
- `npm run generate:stalls` - bulk create stalls per section (see README for flags).
- `npm run import:leases` - import from `scripts/*.xlsx`.

## Notes / Known Behaviors
- CORS allows any `*.myrent.uz` plus explicit list and `MY_DOMAIN`.
- Payme URLs are only valid when `TENANT_ID=ipak_yuli` and must start with `https://checkout.paycom.uz/`.
- Some rules rely on current month boundaries in UTC (payment periods).
- Access/refresh token expiration is configurable with `ACCESS_TIME`, `REFRESH_TIME`.

## Suggested Handoff Structure for Frontend Fixes
- Entities + relationships (sections, stalls, stores, owners, contracts).
- Payment states (attendance and contract snapshot).
- Payment URL selection rules (Click vs Payme).
- Stats endpoints for dashboard/reconciliation.
