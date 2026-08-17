# Cash Drawers Directory — Design

## Context

New workspace view under MerchantFrame / Restaurant Operations, so Merchant Administrators, Store
Supervisors, and Head Cashiers can monitor active and closed cash drawer sessions, audit opening
and current balances, verify session operators, and track operational status.

The backend (`../x7-pos-back-end`, `src/restaurant-operations/cashdrawer/cash-drawers/`) is fully
built and wired (module registration verified — this is not the "orphaned module" bug seen with
`merchant-overtime-rule`/`merchant-payroll-rule`). This is a frontend-only feature: build the React
consumer for an existing, working API.

The menu entry is already reserved: `public/Applications.txt` has application `cash-drawers` under
category `Restaurant Operations`, and `public/Features.txt` has feature `cash-drawers` (`Cash
Drawers sessions`, `planId=1`, `isSaaS=0`) pointing at application `cash-drawers`. The only gap is
wiring `activeTab === 'cash-drawers'` in `MerchantFrame.tsx` and building the view.

## Discrepancies between the story and the real backend (resolved with user)

The story text does not exactly match the shipped backend. Three decisions were made explicitly:

1. **Status enum.** The story lists `OPEN, CLOSED, BALANCED, DISCREPANCY, AUDITING`. The real
   `CashDrawerStatus` enum (`constants/cash-drawer-status.enum.ts`) only has `OPEN = 'Open'`,
   `CLOSE = 'Close'`, `PAUSE = 'Pause'` — and `PAUSE` is unreachable through any current
   create/update code path (dead value, kept only as a valid filter value).
   **Decision: build the UI against the real 3-value enum.** No backend changes in scope.
2. **CRUD scope.** The story's business rules and acceptance criteria describe monitoring/auditing
   only — no Edit or Delete requirement anywhere in the AC. The backend's `DELETE /:id` is a real
   hard delete of a financial record (no soft-delete field).
   **Decision: ship a monitoring grid with `Open Cash Drawer` (create) and `Close Drawer` (update)
   actions only. No free-form Edit, no Delete exposed in the UI.**
3. **Shift/Staff selection.** `GET /shifts` and `GET /collaborators` (the endpoints needed to build
   nice dropdowns) are restricted to `MERCHANT_ADMIN` (`Roles(PORTAL_ADMIN, MERCHANT_ADMIN)`), not
   `MERCHANT_USER` — the role actually backing "Store Supervisor"/"Head Cashier" in this system
   (there are only two merchant-facing roles: `MERCHANT_ADMIN`, `MERCHANT_USER`). Building dropdowns
   would either 403 for non-admins or require restricting Open/Close to admins only.
   **Decision: use plain numeric ID inputs (Shift ID / Opened By / Closed By) in the Open/Close
   forms.** Works for every role, matches the DTO shapes 1:1. The read-only grid still resolves and
   displays real names — only the input controls use raw IDs.

## Backend contract (reference, already implemented — no backend changes)

- `GET /api/v1/cash-drawers` — merchant scope is implicit via JWT (`req.user.merchant.id`); there is
  **no `merchantId` query param**, contrary to the story's wording. Query params: `shiftId`,
  `openedBy`, `closedBy`, `status` (`Open|Close|Pause`), `createdDate` (`YYYY-MM-DD`), `page`,
  `limit` (default 10, max 100), `sortBy` (`id|openingBalance|closingBalance|status|createdAt|updatedAt`),
  `sortOrder` (`ASC|DESC`). Response is `PaginatedCashDrawersResponseDto` with `paginationMeta`.
- `POST /api/v1/cash-drawers` — `CreateCashDrawerDto`: `shiftId` (number, required), `openingBalance`
  (number, ≥0, required), `openedBy` (number, required), `closingBalance?`/`closedBy?` (optional,
  must be provided together). 409 if the shift already has an `Open` drawer.
- `PUT /api/v1/cash-drawers/:id` — `UpdateCashDrawerDto` (partial). Providing `closingBalance` +
  `closedBy` together auto-sets `status: Close` server-side. This is how "Close Drawer" works — no
  separate close endpoint.
- `DELETE /api/v1/cash-drawers/:id` — real hard delete, properly merchant-scoped server-side. **Not
  used by this feature** (see decision #2).
- Response shape (`CashDrawerResponseDto`, camelCase): `id, openingBalance, currentBalance,
  closingBalance, createdAt, updatedAt, status, merchant: {id,name}, shift: {id, name, startTime,
  endTime, status, merchant}, openedByCollaborator: {id, name, role}, closedByCollaborator: {id,
  name, role} | null`.
  - `shift.name` is synthesized server-side as `` `Shift ${id}` `` (the `Shift` entity itself has no
    `name` column) — safe to bind to directly, no client-side derivation needed.
  - `Collaborator` has a single `name` field (no `firstName`/`lastName` split, contrary to the
    story's wording).
- Roles: `MERCHANT_ADMIN`, `MERCHANT_USER` can call all `cash-drawers` endpoints. Feature-gated by
  `SUBSCRIPTION_FEATURE_IDS.CASH_DRAWERS` via `FeatureAccessGuard` — already enforced server-side,
  no frontend action needed.

## Frontend architecture

```
src/components/MerchantFrame/views/restaurant-operations/
  CashDrawersView.tsx        (+ CashDrawersView.test.tsx)
src/types/cash-drawer.ts
```

Single-file view (form modals, close-confirm dialog, detail drawer, and the list all colocated in
`CashDrawersView.tsx`), matching the dominant pattern in this codebase (`OvertimeRulesView.tsx`,
`PayrollRulesView.tsx`) rather than the multi-file split used by `LedgerAccountsView` (which only
splits out because of its tree view — not needed here).

No `CashDrawerQuickLinks.tsx` in this iteration. The Quick Links convention (`RuleConfigQuickLinks`,
`LedgerQuickLinks`) cross-links sibling views within a domain; the siblings implied by
`public/Features.txt` (`cash-drawer-history`, `cash-transactions`) don't exist yet, so a Quick Links
panel here would only contain dead links. Add it when those views are built.

`src/types/cash-drawer.ts` exports: `CashDrawer`, `CashDrawerStatus` (`'Open' | 'Close' | 'Pause'`),
`CreateCashDrawerDto`, `CloseCashDrawerDto` (`{ closingBalance: number; closedBy: number }`),
`CashDrawerQueryParams`, `PaginationMeta`.

### Wiring into the shell

`MerchantFrame.tsx`: import `CashDrawersView` and add
`if (activeTab === 'cash-drawers') { return <CashDrawersView />; }` alongside the other view
branches (~line 490). No changes needed to `public/Applications.txt`/`Features.txt` — the menu
entry already exists.

## List view

### Grid columns

| Column | Binding | Format |
|---|---|---|
| Session ID & Shift | `#CD-{id}` (bold) + badge with `shift.name` | plain text |
| Opening Balance | `openingBalance` | `$#,##0.00` |
| Current Balance | `currentBalance` | `$#,##0.00` |
| Closing Balance | `closingBalance` or `--` | `$#,##0.00` / placeholder |
| Opened By | `openedByCollaborator.name` + `createdAt` timestamp | name + time |
| Closed By | `closedByCollaborator.name`, or an "In Service" badge when `status === 'Open'` | name / badge |
| Status | color-coded pill: `Open`=green, `Close`=slate/gray, `Pause`=amber | uppercase pill |

No raw primary keys (`merchant_id`, `shift_id`, `opened_by`, `closed_by`) are ever rendered —
required by the "Relational Data Integrity" acceptance criterion.

### Search and filters

- **Search** (free text): client-side filter over the already-fetched batch, matching against
  `openedByCollaborator.name`, `closedByCollaborator.name`, `shift.name`, and `#CD-{id}`. The
  backend has no free-text search endpoint, so this mirrors the existing `OvertimeRulesView`/
  `LedgerAccountsView` convention of fetching a batch and filtering client-side.
- **Status** (`'' | Open | Close | Pause'`): sent as a real server query param (`?status=`),
  triggers a refetch — the backend supports this natively.
- **Shift ID** (numeric input): sent as a real server query param (`?shiftId=`), triggers a refetch.
- Base fetch: `GET /cash-drawers?limit=100&sortBy=createdAt&sortOrder=DESC`. No pagination controls
  in this iteration — same known 100-record ceiling already accepted in `OvertimeRulesView`/
  `LedgerAccountsView`; revisit with real pagination if a merchant's session volume outgrows it.

### Empty states

- **True empty** (zero records, no filters applied): icon + *"No cash drawer sessions found. Click
  'Open Cash Drawer' to initialize a new drawer session."* + `Open Cash Drawer` CTA button.
- **Filtered empty** (filters/search yield zero of a non-empty dataset): distinct "no matches"
  message + "Clear filters" action — same two-state pattern as `LedgerAccountsView`.

## Actions

- **Open Cash Drawer** (header button + empty-state CTA): modal with `Shift ID` (positive integer),
  `Opening Balance` (number ≥ 0, currency-formatted), `Opened By` (positive integer, collaborator
  ID). No closing fields in this form. `POST /cash-drawers`; surfaces the backend's 409 ("already an
  open cash drawer for this shift") inline on conflict.
- **Close Drawer** (row action, visible only when `status === 'Open'`): confirm dialog with
  `Closing Balance` (number ≥ 0) and `Closed By` (positive integer), required together.
  `PUT /cash-drawers/:id` with both fields — the backend auto-flips `status` to `Close`. On success
  the row's status badge and "Closed By" column update in place.
- **View Details** (row action): read-only drawer/modal showing the full record — merchant name,
  shift (`startTime`/`endTime`/`status`), both collaborators with `role`, `createdAt`/`updatedAt`.
  Supports the story's "audit"/"verify session operators" goals without adding an edit surface.
- **No Edit, no Delete** (decision #2 above).

`Shift ID`/`Opened By`/`Closed By` are plain numeric inputs in both forms (decision #3 above) — not
dropdowns fetched from `GET /shifts` / `GET /collaborators`, which are `MERCHANT_ADMIN`-only.

## Testing plan

Colocated `CashDrawersView.test.tsx`, RTL + mocked `fetch`, matching existing view test conventions:

- Initial hydration: correct fetch URL/params, loading skeleton, column rendering.
- True-empty vs. filtered-empty states render distinct copy/CTAs.
- Search filters by opener name, closer name, shift name, and session id string.
- Status filter and Shift ID filter each trigger a refetch with the right query param.
- Currency formatting: `$#,##0.00` on all three balance fields; `--` for null `closingBalance`.
- Status badge colors for all three states; "In Service" badge when `closedByCollaborator` is null.
- No raw FK values (`merchant_id`/`shift_id`/`opened_by`/`closed_by`) appear in the rendered DOM.
- Open Cash Drawer: field validation, successful submit, inline 409-conflict error handling.
- Close Drawer: only rendered for `Open` rows; joint validation of `closingBalance`+`closedBy`;
  post-success status/column update.
- View Details: renders full read-only record, no editable controls.
- 401/403/500 responses surface an inline error banner (existing pattern).
