# Journal Entry Lines — Full CRUD Design Spec

**Date:** 2026-07-28
**Branch:** rafaalejandro_subscription
**Area:** MerchantFrame / financial-engine (evolves the existing Journal Entry Lines workspace)

**Supersedes:** `docs/superpowers/specs/2026-07-27-journal-entry-lines-design.md`, which
scoped `JournalEntryLinesView` to read-only (view/search/inspect only), with creation
and editing of lines left to `JournalEntryLinesEditor` inside the parent
`JournalEntry`'s own create/edit form. This spec reverses that decision at the user's
explicit request: `JournalEntryLinesView` becomes a full CRUD workspace
(Create / View Details / Update / Soft-Delete) for individual line items, using form
drawers, independent of the parent entry's own compose-time form.

`JournalEntryLinesEditor.tsx` (the inline multi-row editor embedded in
`JournalEntryFormDrawer` for composing a brand-new entry with its lines in one shot)
is **not** touched by this spec — it remains as-is, a separate authoring surface for
brand-new entries.

## 1. Problem

As an authorized Finance Manager, I want to execute complete lifecycle operations
(Create, View Details, Update, Soft-Delete) for individual `JournalEntryLine` records
from a dedicated workspace, so I can adjust posting allocations after an entry already
exists, without re-opening/re-submitting the whole parent entry.

## 2. Backend Reality Check

The originating ticket describes a flat endpoint
(`PATCH /api/v1/accounting/journal-entry-lines/{id}` with `is_active: false` for
soft-delete). That endpoint does not exist. The real backend
(`x7-pos-back-end/src/core/financial-engine/journal-entry-line/`) exposes nested,
entry-scoped routes — confirmed by reading the controller/service directly:

| Verb | Path | Behavior |
|---|---|---|
| `POST` | `/journal-entries/:entryId/lines` | Create. 400 if parent entry is not DRAFT. |
| `GET` | `/journal-entries/:entryId/lines` | List (paginated), already consumed via the flattened `journal-entry?limit=100` fetch. |
| `GET` | `/journal-entries/:entryId/lines/:id` | Single line. **Not called by this feature** — the data is already present in the flattened `entries` state and the already-fetched `ledgerAccounts` list (see §4); adding a fetch here would be redundant. |
| `PATCH` | `/journal-entries/:entryId/lines/:id` | Update. 400 if parent entry is not DRAFT. Accepts partial `{account_id, debit, credit, description}` — no `is_active` field. |
| `DELETE` | `/journal-entries/:entryId/lines/:id` | Soft-delete: service sets `is_active = false` server-side and recalculates parent totals. 400 if parent entry is not DRAFT. |

Consequence: soft-delete is one-way. `UpdateJournalEntryLineDto` has no `is_active`
field, so a deleted line cannot be reactivated through the API. This matches what the
prior spec already found.

Every write recalculates `journal_entry.total_debit` / `total_credit` server-side, so
the client always refetches `GET /journal-entry?limit=100` after a successful
create/update/delete to pick up the new totals and `is_balanced` flag (used by the
existing Post gatekeeper in `JournalEntriesView`, unchanged by this spec).

## 3. Leaf Account Computation

`GET /ledger-accounts` does not return a `children` array (confirmed in
`ledger-accounts.service.ts` / `LedgerAccountResponseDto`). "Leaf account" is computed
client-side exactly like `LedgerAccountsView`'s `childrenCount` already does: given the
full active `ledgerAccounts` list already fetched for the account filter dropdown, an
account is a leaf iff no other active account has `parent_account_id` equal to its id.

```ts
function isLeafAccount(account: LedgerAccount, accounts: LedgerAccount[]): boolean {
  return !accounts.some((a) => a.parent_account_id === account.id);
}
```

## 4. Data Already Available (no new fetches beyond what `JournalEntryLinesView` has today)

- `entries` (from `GET /journal-entry?limit=100`) — gives every line's `id`, `account
  {id, code, name}`, `debit`, `credit`, `description`, plus the parent entry's
  `status`, `entry_number`, `entry_date`, `description`, `is_balanced`.
- `ledgerAccounts` (from `GET /ledger-accounts?limit=100`, filtered `is_active`) —
  gives full account records including `type` and `parent_account_id`, used both for
  the leaf filter and to show "account classification" (type) in the Detail Drawer,
  which the line's embedded `account` object does not carry.

## 5. Create Line Drawer

Triggered by a new **"Add Line Item"** button in the workspace toolbar (next to the
existing filters). Reuses the drawer shell/visual pattern of
`LedgerAccountFormDrawer` / `JournalEntryFormDrawer` (`createPortal` to
`document.body`, dark header bar, slide-in).

Fields:
- **Journal Entry** — searchable combobox (same combobox idiom as the existing account
  search in `LedgerAccountFormDrawer`: text input + `role="combobox"` + `listbox` +
  `onMouseDown` selection + blur-timeout close), listing only entries with
  `status === 'DRAFT'` (the backend 400s otherwise — filtering client-side avoids a
  guaranteed-failing round trip). **Required.**
  - If the workspace is in scoped mode (arrived via "View Line Items" jump-in, i.e.
    `entry` prop is set), this field is pre-filled with the scoped entry and rendered
    as a locked/read-only field (per user decision) instead of a combobox. If the
    scoped entry is not DRAFT, the "Add Line Item" button itself is disabled with an
    inline note ("This journal entry is POSTED — line items are locked.") rather than
    opening a drawer that can't succeed.
- **Ledger Account** — searchable combobox, same idiom, options filtered to
  `isLeafAccount(...)` (see §3) among active accounts. **Required.** If validation
  somehow sees a non-leaf `account_id` (defense-in-depth; unreachable through normal
  selection since the list is pre-filtered), submit is blocked with: *"Cannot post
  transactions directly to summary accounts. Please select a detailed leaf account."*
- **Debit** / **Credit** — number inputs, mutual exclusion:
  - Typing a value `> 0` into Debit sets Credit to `'0'` and disables the Credit
    input; typing `0`/clearing Debit re-enables Credit.
  - Symmetric for Credit → Debit.
  - Submit blocked if both resolve to `0`, with: *"A line item must have either a
    Debit or Credit amount greater than zero."*
- **Description** — optional text.

No client-side balance check — a DRAFT parent's cumulative imbalance is allowed
per §6.

Submit → `POST /journal-entries/{selectedEntryId}/lines` with
`{account_id, debit, credit, description?}` → on success, refetch
`GET /journal-entry?limit=100`, close drawer, success toast (matching the existing
3-second auto-dismiss toast pattern in `JournalEntriesView`/`LedgerAccountsView`).
On failure, inline error banner in the drawer (same pattern as
`JournalEntryFormDrawer`'s `submitError`), drawer stays open.

## 6. Draft Balance Tolerance

No new logic needed: since Create/Update/Delete never check
`total_debit === total_credit`, and the existing "Post" action in `JournalEntriesView`
already blocks the DRAFT→POSTED transition server-side until balanced (unchanged),
this requirement is satisfied by simply not adding a balance gate to the new
operations.

## 7. Detail Drawer (row click)

Replaces the current no-op row (today the row's only click target is the "Journal
Entry" cell, which calls `onNavigate('journal-entries')`). New behavior: clicking
anywhere on the row (except the still-present "jump to parent entry" link inside it)
opens a read-only Detail Drawer, same visual shell as `LedgerAccountDetailDrawer`:

- Line: account code/name, debit, credit, description.
- Account classification: `type` (looked up from `ledgerAccounts` by `account.id`).
- Parent entry header: `entry_number`, `entry_date`, `status` (badge, reusing
  `STATUS_BADGE_CLASSES` from `JournalEntriesView`), `description`.
- If `entry.status === 'DRAFT'`: **Edit** and **Delete** buttons in the drawer header
  (same placement as `JournalEntryDetailDrawer`'s action buttons).
- If `entry.status !== 'DRAFT'`: no action buttons; an inline note instead —
  *"This journal entry is POSTED — line items are locked."* (Posted Parent
  Immobility Lock.)

## 8. Edit Drawer

Same shell as Create, `mode="edit"`, pre-filled from the selected row's `line` +
`entry`:
- Journal Entry shown as a static, non-editable label (the update DTO has no
  `journal_entry_id` field — moving a line to a different entry is out of scope).
- Account / Debit / Credit / Description editable with the same leaf-filter and
  mutual-exclusion rules as Create.
- Submit → `PATCH /journal-entries/{entry.id}/lines/{line.id}` with only the
  changed-shape payload (all four fields, since the backend accepts a full partial
  object) → refetch, close, success toast.

Only reachable when `entry.status === 'DRAFT'` (the trigger action is hidden
otherwise, per §7).

## 9. Delete (Soft-Delete)

Delete icon on each row (rendered only when `entry.status === 'DRAFT'`, consistent
with the drawer's own gating) and inside the Detail Drawer header. Clicking either
opens a confirmation modal, visually matching `ConfirmJournalActionDialog`:

- Title: "DELETE LINE ITEM"
- Body: references the account code/name and amount for confirmation clarity.
- Confirm → `DELETE /journal-entries/{entry.id}/lines/{line.id}` → refetch
  `GET /journal-entry?limit=100`, close modal (and Detail Drawer if open), success
  toast: *"Journal entry line deleted successfully."*
- Cancel closes the modal with no request made.

## 10. Grid Changes

- New "Add Line Item" button in the toolbar area (next to existing filters), matching
  the `LedgerAccountsView` "Add Account" button styling.
- Rows become clickable (Detail Drawer), replacing today's inert styling for
  non-linked cells; the existing entry-number link inside the row keeps its own
  `onNavigate('journal-entries')` behavior via `stopPropagation` so it doesn't also
  trigger the row's Detail Drawer.
- New Delete icon column/action per row, hidden when the parent entry is not DRAFT.
- No new columns otherwise — grid layout from the prior spec (§4 of the 07-27 spec)
  is unchanged.

## 11. Testing Plan

Extends `JournalEntryLinesView.test.tsx` (existing `vi.stubGlobal('fetch', ...)` +
Testing Library pattern, no MSW):

- **Create:** opens via toolbar button; Journal Entry combobox lists DRAFT-only
  entries; Ledger Account combobox lists leaf-only accounts; mutual exclusion
  (typing debit disables/zeroes credit and vice versa); blocked submit when both are
  zero, with the exact error copy; successful `POST` triggers refetch + toast + drawer
  close; failure keeps drawer open with inline error.
- **Scoped Create:** when arriving with `entry` prop set, Journal Entry field is
  pre-filled and locked; "Add Line Item" disabled with note when the scoped entry is
  not DRAFT.
- **Detail Drawer:** row click opens it; shows line, account type (cross-referenced
  from `ledgerAccounts`), and parent entry header; Edit/Delete visible only when
  DRAFT; locked note shown when POSTED.
- **Edit:** opens pre-filled; Journal Entry field is a static label, not editable;
  same leaf/mutual-exclusion rules apply; successful `PATCH` triggers refetch + toast.
- **Delete:** icon hidden when parent entry is POSTED; confirm modal opens on click;
  confirming issues `DELETE`, refetches, shows toast; cancel makes no request.
- Regression: existing filter/search/empty-state/scoped-chip tests from the 07-27
  spec continue to pass unmodified.

## 12. Out of Scope

- Any backend changes.
- Reactivating a soft-deleted line (not supported by the API — `is_active` is
  write-only from the server's perspective, one-directional).
- Moving a line to a different parent journal entry via Edit.
- A dedicated `GET .../lines/:id` fetch for the Detail Drawer (data is already fully
  available client-side; see §4).
