# Journal Entry Lines Workspace — Design Spec

**Date:** 2026-07-27
**Branch:** rafaalejandro_subscription
**Area:** MerchantFrame / financial-engine (sibling of Journal Entries and Ledger Accounts)

> **Superseded 2026-07-28:** the read-only scope decided here (§1, §7) was reversed at
> the user's explicit request. See
> `docs/superpowers/specs/2026-07-28-journal-entry-lines-crud-design.md` for the full
> CRUD (Create/View Details/Update/Soft-Delete) design that now applies to this
> workspace. This document is kept for the backend investigation in §1, which is still
> accurate.

## 1. Problem & Origin Story

As an authenticated Merchant Administrator or Finance Manager, I want a centralized
workspace to view, search, and inspect individual posting line items
(`JournalEntryLine`), so I can analyze granular ledger account movements, verify
specific debit/credit postings, and audit transactional detail across all journal
entries.

The original request specified a flat `GET /api/v1/accounting/journal-entry-lines?companyId={id}`
endpoint with a per-line `is_active` status filter. Investigation of the actual
backend (`x7-pos-back-end/src/core/financial-engine/journal-entry-line/`) found:

- The only real lines endpoint is nested and always scoped to one entry:
  `GET /journal-entries/:entryId/lines`. There is no company-wide "all lines"
  endpoint.
- `is_active` exists on the `JournalEntryLine` entity but is **never returned** to
  the client (`JournalEntryLineResponseDto` omits it), and every read path
  (the dedicated endpoint and the nested `lines[]` on `GET /journal-entry`)
  already filters to `is_active: true` server-side. There is no toggle
  capability for lines the way there is for Ledger Accounts — a line's
  soft-delete is a one-way removal from the entry.
- No search/filter query params exist server-side beyond `page`/`limit`.

Decision (confirmed with user): build this **frontend-only**, with **no backend
changes**. `GET {API}/journal-entry?limit=100` (already fetched by
`JournalEntriesView`) already returns every entry with its `lines[]` embedded
(`id`, `account {id, code, name}`, `debit`, `credit`, `description`) — flattening
that client-side is sufficient to build the workspace. The "System Status"
filter and "Operational Status Badge" from the original spec are dropped: the
API never exposes `is_active` on lines, and every line the API can return is
implicitly active.

The workspace is **read-only** (view/search/inspect only). Creating or editing
lines remains the job of `JournalEntryLinesEditor` inside the entry's own
create/edit form, consistent with the backend rule that lines can only be
added/updated while the parent entry is `DRAFT`. The original spec's "Add Line
Item" empty-state action is dropped for the same reason.

## 2. Data Flow

- On mount, fetch:
  - `GET {API}/journal-entry?limit=100` → entries with nested `lines[]`
  - `GET {API}/ledger-accounts?limit=100` → for the Ledger Account filter dropdown
    (filtered to `is_active` client-side, same as `JournalEntriesView`'s
    `fetchLedgerAccounts`)
- Both requests carry `Authorization: Bearer <token>` via `getAccessToken()`; a
  `401` on either triggers `clearAuthSession()` + redirect to `/login`, matching
  every other financial-engine view.
- Flatten client-side:
  ```ts
  entries.flatMap(entry => entry.lines.map(line => ({ line, entry })))
  ```
  giving each row full access to `entry.entry_number`, `entry.entry_date`,
  `entry.description`, and the line's resolved `account {id, code, name}`.
- **Empty state:** "No posting line items recorded. Select a Journal Entry or
  clear filters to view detailed ledger movements."

## 3. Filters & Search (all client-side, `useMemo`, same pattern as
`JournalEntriesView`'s `matchesFilters`)

| Filter | Behavior |
|---|---|
| Search text | Matches `line.description`, `entry.entry_number`, or `account.code` (case-insensitive substring) |
| Posting Type | `<select>`: All Lines / Debit Only (`debit > 0`) / Credit Only (`credit > 0`) |
| Ledger Account | `<select>` populated from fetched accounts (`"1000 — Cash"`), filters by `account.id` |
| Journal Entry scope | Set programmatically when arriving via the "jump-in" action from `JournalEntriesView` (not a manual filter control) — see §5. Shown as a dismissible chip ("Scoped to JE-2024-0001 ✕") above the filter bar; clearing it reverts to all lines. |

System Status filter dropped (see §1).

## 4. Grid Layout

Matches the existing table styling used by `JournalEntriesView` /
`LedgerAccountsView` (no separate visual reference file exists in this repo).

| Column | Content |
|---|---|
| Parent Journal Entry | `entry_number` + `entry_date` rendered as a button; click calls `onNavigate('journal-entries')` (switches to the Journal Entries tab — no deep link to the specific row, since `JournalEntriesView` has no "open this entry by id" prop today and adding one is out of scope) |
| Ledger Account | Badge: `code - name` (e.g. "1000 - Cash") |
| Description | `line.description`; if empty, italic fallback to `entry.description` |
| Debit | Formatted currency, right-aligned; `$0.00` in muted gray when 0 |
| Credit | Formatted currency, right-aligned; `$0.00` in muted gray when 0 |

No status column (dropped, see §1). No per-row detail drawer — all relevant
fields are already visible inline, and the workspace is read-only.

`LedgerQuickLinks` rendered with `current="journal-entries-lines"` — this nav
target and the sidebar `Features.txt` entry (`journal-entries-lines|Journal
Entries lines ledger|financial-engine|2|0`) already exist; only the
`MerchantFrame.tsx` render branch is missing.

## 5. Navigation Wiring

- **`MerchantFrame.tsx`**: import `JournalEntryLinesView`; add
  `if (activeTab === 'journal-entries-lines')` render branch. Add one new piece
  of state, `linesEntryFilter: JournalEntry | null`, to carry the "jump-in"
  scope across the tab switch (plain `useState`, mirrors how `activeTab` is
  already managed — no router).
- **`JournalEntriesView.tsx`**: add a new optional prop
  `onViewLines?: (entry: JournalEntry) => void`, kept separate from
  `onNavigate` (which stays a pure string pass-through for `LedgerQuickLinks` —
  no change to that existing contract). Wire a "View Line Items" action into
  the existing detail drawer.
- **`MerchantFrame`** wires it as:
  ```ts
  onViewLines={(entry) => { setLinesEntryFilter(entry); setActiveTab('journal-entries-lines'); }}
  ```
- **`JournalEntryLinesView.tsx`** accepts `entry?: JournalEntry | null` (the
  scope) and `onClearEntry?: () => void`, plus `onNavigate`.

## 6. Testing Plan

`JournalEntryLinesView.test.tsx`, following the established
`vi.stubGlobal('fetch', ...)` + `@testing-library/react` pattern (no MSW;
`auth-storage` mocked at module level):

- Data fetch: correct URLs (`/journal-entry?limit=100`, `/ledger-accounts?limit=100`),
  loading/error/401-redirect states.
- Flattening correctness: multiple entries × multiple lines → correct row count
  and field mapping (entry_number, account badge, description fallback).
- Each filter in isolation and combined (search, posting type, account).
- Empty state copy when zero rows match.
- Entry-scoped mode: pre-filtered on mount when `entry` prop is passed, chip
  renders, clearing it calls `onClearEntry` and un-scopes to all lines.
- Debit/credit `$0.00` muted styling when zero.

Plus a small addition to `JournalEntriesView.test.tsx` covering the new "View
Line Items" action calling `onViewLines` with the correct entry.

## 7. Out of Scope

- Any backend changes (new endpoints, exposing `is_active`, query params).
- Creating, editing, or (re)activating individual lines from this workspace.
- Deep-linking the "Parent Journal Entry" click to open that entry's specific
  detail drawer (lands on the Journal Entries tab generally).
