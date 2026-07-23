# Journal Entries Workspace — Design

## Context

Ticket: centralized Journal Entries workspace embedded in the merchant shell, so a Merchant
Administrator or Finance Manager can view the company's `JournalEntry` directory, check
`total_debit` vs `total_credit` balance, and track posting status (`DRAFT` / `POSTED` /
`VOIDED`).

The backend module (`src/core/financial-engine/journal-entry/`) already exists, is registered
in `FinancialEngineModule` → `CoreModule` → `AppModule`, and is fully functional. The ticket's
literal endpoint (`GET /api/v1/accounting/journal-entries?companyId={id}`) does not match the
real API; the real API follows the same convention as every other merchant-scoped feature in
this codebase (Ledger Accounts, Tax/Tip/Overtime/Payroll Rules): scoping is automatic via the
JWT (`user.merchant.id` → `company_id`), no `companyId` query param.

Real endpoints (global prefix `/api`):

- `GET /api/journal-entry?page&limit&status&reference_type` → paginated
  `{ data: JournalEntryResponseDto[], page, limit, total, totalPages, hasNext, hasPrev }`
- `GET /api/journal-entry/:id` → single entry with lines
- `POST /api/journal-entry` → create (lines required, must balance)
- `PATCH /api/journal-entry/:id` → update, **DRAFT only**, replaces all lines if `lines` provided
- `DELETE /api/journal-entry/:id` → hard delete, **DRAFT only**
- `POST /api/journal-entry/:id/post` → DRAFT → POSTED (re-validates balance)
- `POST /api/journal-entry/:id/void` → POSTED → VOIDED

`JournalEntryResponseDto` fields used by the UI: `id, entry_number, entry_date, description,
status, total_debit, total_credit, is_balanced, reference_type, reference_id, created_at,
updated_at, company, lines[]`. `is_balanced` is computed server-side
(`abs(total_debit - total_credit) < 0.001`) — the frontend does not recompute it.

`JournalEntryStatus`: `DRAFT | POSTED | VOIDED`.
`JournalEntryReferenceType`: `ORDER | PAYMENT | PAYROLL | TAX | INVENTORY | ADJUSTMENT | MANUAL`.

Ledger accounts (`GET /api/ledger-accounts?limit=100`) are the account picker source for
journal entry lines (`CreateJournalEntryLineDto = { account_id, debit, credit, description? }`).

## Scope decisions (confirmed with user)

1. Build against the real `/api/journal-entry` endpoint, not the ticket's literal path.
2. "New Journal Entry" ships a full create form in this iteration: header fields + a
   multi-line debit/credit builder against ledger accounts, matching backend capability.
3. Post and Void actions are included in this iteration (not deferred), so the status badge
   isn't permanently stuck on DRAFT.
4. Edit and Delete (both DRAFT-only, per backend rules) are included to complete the CRUD,
   consistent with every other module already built in this project (Ledger Accounts, Tax
   Rules, Tip Rules, Overtime Rules, Payroll Rules).
5. Reference type filter/select shows all 7 real enum values (ticket only lists
   Order/Payment/Payroll/Manual as examples — hiding TAX/INVENTORY/ADJUSTMENT would hide real
   data).
6. `reference_id` is displayed as plain text (`#{id}`), not a hyperlink — there is no target
   view to link to yet for Orders/Payments/Payroll records.

## Files

- `src/types/accounting.ts` — extend with `JournalEntry`, `JournalEntryLine`,
  `JournalEntryStatus`, `JournalEntryReferenceType`, `CreateJournalEntryDto`,
  `CreateJournalEntryLineDto`, `UpdateJournalEntryDto`.
- `src/components/MerchantFrame/views/financial-engine/JournalEntriesView.tsx` — main view:
  fetch/state, filters, grid, empty states, FAB, toast, create/edit/detail drawers, Post/Void/
  Delete confirm dialog.
- `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesEditor.tsx` — reusable
  debit/credit line-builder component (ledger account combobox per line, running totals,
  balanced/unbalanced indicator), used by both create and edit modes.
- `src/components/MerchantFrame/views/financial-engine/LedgerQuickLinks.tsx` — generalized to
  accept a `current` prop (default `'chart-of-accounts'`) so the active anchor is computed
  (`anchor.target === current`) instead of hardcoded per item. `'journal-entries'` becomes a
  real, clickable-from-elsewhere / active-when-here anchor.
- `src/components/MerchantFrame/MerchantFrame.tsx` — import `JournalEntriesView`; add
  `if (activeTab === 'journal-entries') return <JournalEntriesView onNavigate={(view) => setActiveTab(view)} />;`
  next to the existing `ledger-accounts` branch.
- Tests: `JournalEntriesView.test.tsx`, `JournalEntryLinesEditor.test.tsx`; existing
  `LedgerAccountsView.test.tsx` / `LedgerQuickLinks` assertions must keep passing unchanged
  (default `current` preserves current behavior).

## Data & state

- Initial fetch: `GET /api/journal-entry?limit=100`, take `.data`, then filter/search entirely
  client-side (search, status, reference_type, date range) — same convention as
  `LedgerAccountsView` (no server-side pagination UI in this iteration).
- Ledger accounts for the line editor: `GET /api/ledger-accounts?limit=100`, filtered to
  `is_active: true`, fetched once when a create/edit drawer opens.
- Same auth conventions as every other view: `getAccessToken()`, `Authorization: Bearer`
  header, `401` → `clearAuthSession()` + redirect to `/login`, error messages surfaced via
  `json.message` in a toast.
- Create: `POST /api/journal-entry` with
  `{ entry_number, entry_date, description?, reference_type?, reference_id?, lines }`. The
  frontend never computes/sends `total_debit`/`total_credit`/`is_balanced` — the backend owns
  those.
- Edit: `PATCH /api/journal-entry/:id`, same shape, always sends `lines` (full replace) —
  only reachable when `status === 'DRAFT'`.
- Delete: `DELETE /api/journal-entry/:id` — only reachable when `status === 'DRAFT'`.
- Post: `POST /api/journal-entry/:id/post` — only reachable when `status === 'DRAFT'`.
- Void: `POST /api/journal-entry/:id/void` — only reachable when `status === 'POSTED'`.

## Grid layout

Columns, in order:

1. **Entry Number & Date** — `entry_number` bold + formatted `entry_date`.
2. **Description & Reference** — `description` + badge showing `reference_type` (or "Manual"
   when null) and, if present, `#{reference_id}` as plain text next to the badge.
3. **Debit** / **Credit** — `total_debit` / `total_credit` formatted as currency
   (`Intl.NumberFormat`, e.g. `$1,500.00`).
4. **Balanced status** — green "BALANCED" badge when `is_balanced`, red "UNBALANCED" badge
   otherwise.
5. **Posting status** — DRAFT (amber), POSTED (green), VOIDED (gray).
6. **Actions** — View (opens detail drawer); Edit + Delete only when DRAFT; Post only when
   DRAFT; Void only when POSTED.

Row click opens the detail drawer (same as `LedgerAccountsView` row click behavior).

### Empty states

- **True empty** (zero records from the API): card with the exact copy —
  *"No journal entries recorded for this company profile. Click 'New Journal Entry' to create
  a manual accounting record."* — plus a "New Journal Entry" CTA button.
- **Filtered empty** (records exist, filters exclude all): "No journal entries match your
  active filters" + "Clear filters" link, same pattern as Ledger Accounts.

## Filters

- Free-text search over `entry_number` + `description`.
- Status select: All Statuses / Draft / Posted / Voided.
- Reference type select: All References / Order / Payment / Payroll / Tax / Inventory /
  Adjustment / Manual.
- Date range: two native `<input type="date">` (from/to), inclusive filter on `entry_date`, no
  external date-picker dependency (none exists elsewhere in this codebase).

## Create / Edit drawer

Same visual shell as `LedgerAccountFormDrawer` (right-side drawer, black header, Cancel/Save
footer):

- **Entry Number** — text, required, client-side duplicate check against the loaded list
  (mirrors the `code` duplicate check in Ledger Accounts).
- **Entry Date** — `<input type="date">`, required.
- **Description** — textarea, optional.
- **Reference Type** — select, defaults to `MANUAL`.
- **Reference ID** — numeric input, shown and required only when `reference_type` is set and
  is not `MANUAL` (mirrors the backend's `ValidateIf` rule).
- **Lines** (`JournalEntryLinesEditor`) — dynamic rows: ledger-account combobox (search by
  code/name, active accounts only), Debit input, Credit input, optional description, remove-row
  button, "Add Line" button. A totals bar recalculates Total Debit / Total Credit / Balanced-
  Unbalanced live as rows change.
- **Save** disabled until: entry number valid & unique, entry date set, at least one line has an
  account selected and a positive amount, and `totalDebit === totalCredit` (0.001 tolerance,
  matching backend).
- Edit mode preloads existing header fields and lines; only reachable from rows/details in
  `DRAFT` status.

## Detail drawer & lifecycle actions

`JournalEntryDetailDrawer`: entry number, date, description, balanced badge, status badge,
totals, reference type/id, a read-only lines table (account code + name, debit, credit,
description), created/updated timestamps.

Contextual action buttons by status:

- **DRAFT** → Edit, Delete, Post
- **POSTED** → Void
- **VOIDED** → read-only, no actions

A single local `ConfirmJournalActionDialog` (title/body/confirm-label vary by action: Post /
Void / Delete) handles all three confirmations. It is **not** added to `shared/` — its
three-state DRAFT→POSTED→VOIDED semantics and permanent-delete wording don't fit the existing
binary active/inactive `shared/StatusToggle.tsx`, and forcing a shared abstraction across
unrelated lifecycles would be premature (matches this project's existing decision to not
extract a shared CRUD hook across modules).

## Feedback states

Loading skeleton rows (pulsing gray blocks), error banner with a retry button, and a toast
(green success / red error, 3s auto-dismiss) — all copied from `LedgerAccountsView`'s existing
implementation for visual and behavioral consistency.

## Navigation wiring

- `LedgerQuickLinks` gains a `current` prop; `LedgerAccountsView` passes
  `current="chart-of-accounts"` (unchanged behavior, default), `JournalEntriesView` passes
  `current="journal-entries"`. The `'journal-entries'` anchor stops being permanently
  `active: false` and instead becomes active only when rendered from within
  `JournalEntriesView`.
- `MerchantFrame.tsx` adds the `journal-entries` tab branch next to `ledger-accounts`.
- `journal-entries-lines` (Journal Entry Line Items as its own listing) and `merchant-tax-rules`
  remain out of scope / already wired elsewhere — untouched by this change.

## Testing plan

- `JournalEntriesView.test.tsx`: fetch/render, true-empty state copy, filtered-empty state,
  search/status/reference-type/date-range filtering, currency formatting, balanced/unbalanced
  badge logic, status badge colors, create flow (validation + POST + optimistic list update),
  edit flow (DRAFT-only visibility + PATCH), delete flow (DRAFT-only + confirm + DELETE), post
  flow (DRAFT-only + confirm + POST .../post), void flow (POSTED-only + confirm + POST
  .../void), 401 handling, error toast on failure.
- `JournalEntryLinesEditor.test.tsx`: add/remove rows, account combobox search, debit/credit
  mutual exclusivity per row, live totals recompute, balanced/unbalanced indicator.
- Existing `LedgerAccountsView.test.tsx` quick-links assertions must pass unchanged (default
  `current` prop preserves current active-anchor behavior).
