# Cash Transaction Detail Drawer — Design

Date: 2026-08-07
Branch: rafaalejandro_subscription

## Context

Ticket: as a Store Auditor or Finance Manager, I want a detailed inspection
drawer for any selected cash transaction row so I can view operational notes
(`notes`), audit creation/update timestamps (`created_at`, `updated_at`),
inspect associated cash shift details (`cashShift`), and verify loyalty points
accrued/redeemed (`loyaltyPointTransactions`).

Today `CashTransactionsView.tsx` (frontend) has a `CashTransactionDetailModal`
opened only by a per-row "View Details" button, showing flat fields already
present on the list row: id, cash drawer, type, amount, collaborator id,
linked order, notes, created/updated at. `2026-08-07-cash-transactions-workspace-design.md`
explicitly scoped loyalty points out as a backend gap ("`CashTransactionResponseDto`
does not include the `loyaltyPointTransactions` relation"). This spec closes
that gap and adds the cash shift context, superseding that non-goal.

Backend investigation confirmed the data already exists, just not wired up:

- `CashTransaction` entity (`x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-transactions/entities/cash-transaction.entity.ts`)
  already declares `cashShift` (`@ManyToOne('CashShift', ..., { nullable: true })`
  via `shift_id`) and `loyaltyPointTransactions` (`@OneToMany(() => LoyaltyPointTransaction, lpt => lpt.payment)`).
- Neither relation is loaded by `cash-transactions.service.ts#findOne` (no
  `relations` option), and `CashTransactionResponseDto` has no fields for
  either — the API simply never surfaces them today.
- The loyalty domain (`src/growth/loyalty/loyalty-points-transaction/`) is
  fully built: `LoyaltyPointTransaction` entity, `LoyaltyPointsSource` enum
  (`ORDER`, `PAYMENT`, `REFERRAL`, `PROMOTION`, `MANUAL_ADJUST`, `REDEMPTION`,
  `ORDER_REVERSAL`, `REFUND_REVERSAL`), and existing services. `points` is
  stored **signed** — positive when earning, negative on redemption/reversal
  (confirmed in `loyalty-rewards-redemptions.service.ts` and
  `loyalty-points-redemption.service.ts`, both write `points: -pointsToDeduct`).
- `CashShift` entity has `openedByCollaborator`/`closedByCollaborator`
  (`Collaborator`, which has plain `name`/`role` fields — no first/last name
  split). `cash-shifts.service.ts` already has the exact mapping shape used
  for the sibling `CashShiftsView` (`BasicCollaboratorInfoDto` in
  `cash-shifts/dto/cash-shift-response.dto.ts`: `{ id, name, role }`).
- `CashTransactionStatus` is `active | deleted` (soft-delete, not a workflow
  status) — the Status Badge just reflects this.

## Non-goals

- No editing from the drawer. Cash transactions are system-generated (POS
  sales, shift open/close/pause); this is a read-only audit view, matching
  the existing view's non-goals.
- No changes to `GET /cash-transactions` (list). Only the single-record
  `GET /cash-transactions/:id` gains the nested data, to avoid inflating the
  paginated list payload with relations most rows never need to render.
- No navigation from the loyalty rows to a Loyalty Customer or Order screen —
  no such views exist in this SPA yet (same reasoning as the existing "Linked
  Order is an indicator, not a link" non-goal).
- No changes to `CashTransactionType`/`CashTransactionStatus` enums or to how
  transactions are created.

## Backend changes (`x7-pos-back-end`)

`cash-transactions.service.ts#findOne`: add a `relations` option —
`['collaborator', 'cashShift', 'cashShift.openedByCollaborator', 'cashShift.closedByCollaborator', 'loyaltyPointTransactions']`.
No module registration changes needed — `findOne` navigates relations already
declared on the entity; no new repository is injected.

New DTOs in `cash-transaction-response.dto.ts`, used only by the single-record
response (list keeps using the existing `CashTransactionResponseDto`/`format()`):

```ts
export class CashTransactionCashShiftDto {
  id: number;
  status: CashShiftStatus;
  openedAt: Date;
  closedAt: Date | null;
  openingBalance: number;
  systemAmount: number | null;
  declaredAmount: number | null;
  difference: number | null;
  openedByCollaborator: BasicCollaboratorInfoDto;
  closedByCollaborator: BasicCollaboratorInfoDto | null;
}

export class CashTransactionLoyaltyPointDto {
  id: number;
  description: string | null;
  source: LoyaltyPointsSource;
  points: number;
  loyaltyCustomerId: number;
  createdAt: Date;
}

export class CashTransactionDetailResponseDto extends CashTransactionResponseDto {
  collaborator: BasicCollaboratorInfoDto;
  cashShift: CashTransactionCashShiftDto | null;
  loyaltyPointTransactions: CashTransactionLoyaltyPointDto[];
}
```

`CashTransactionCashShiftDto` is a deliberately lighter shape than the
existing `CashShiftResponseDto` (skips `salesSummary`/`expenses`/
`manualInflows`/`totalExpenses`, which are `CashFlowService` aggregates not
needed for an embedded reference and not populated by a plain relation load).
`BasicCollaboratorInfoDto` is imported from `cash-shifts/dto/cash-shift-response.dto.ts`
(already the established cross-module import pattern — `loyalty-points-transaction`'s
own response DTO already imports `CashTransactionLittleResponseDto` from the
cash-transactions module).

`cash-transactions.service.ts`: new `formatDetail(transaction)` method
(parallel to the existing `format()`) building the shape above — collaborator
via the loaded `transaction.collaborator` relation (fallback `{ id: transaction.collaboratorId, name: 'Unknown', role: '—' }`
if somehow null, matching the fallback pattern already used in
`cash-shifts.service.ts`), `cashShift` mapped the same way or `null`,
`loyaltyPointTransactions` mapped 1:1 or `[]`. `findOne`'s controller/service
return type switches to `CashTransactionDetailResponseDto`; `findAll` is
untouched.

## Frontend changes (`x7-pos-backoffice`)

### Types (`src/types/cash-transaction.ts`)

Add optional fields to `CashTransaction` (same idiom as the existing `notes?`)
plus two new interfaces:

```ts
export interface BasicCollaboratorInfo {
  id: number;
  name: string;
  role: string;
}

export interface CashTransactionCashShift {
  id: number;
  status: string;
  openedAt: string;
  closedAt: string | null;
  openingBalance: number;
  systemAmount: number | null;
  declaredAmount: number | null;
  difference: number | null;
  openedByCollaborator: BasicCollaboratorInfo;
  closedByCollaborator: BasicCollaboratorInfo | null;
}

export interface LoyaltyPointTransaction {
  id: number;
  description: string | null;
  source: string;
  points: number;
  loyaltyCustomerId: number;
  createdAt: string;
}

// on CashTransaction:
collaborator?: BasicCollaboratorInfo;
cashShift?: CashTransactionCashShift | null;
loyaltyPointTransactions?: LoyaltyPointTransaction[];
```

These stay optional because list rows (`GET /cash-transactions`) never
populate them — only the detail fetch does.

### Data loading

`CashTransactionsView.tsx` opens the drawer **instantly** on trigger using the
row's already-fetched data (id, amount, type, notes, created/updated —
everything the current modal already shows), then fires
`GET ${API_BASE}/cash-transactions/{id}` in the background to fill in
`collaborator`, `cashShift`, and `loyaltyPointTransactions`. A `detailLoading`
boolean gates just the Shift and Loyalty Points sections (small inline
skeleton), so the drawer never blocks on a network round-trip for data it
already has. On fetch failure, those two sections show an inline "Couldn't
load shift/loyalty data" message rather than failing the whole drawer (notes/
amount/etc. stay visible and correct since they came from the row).

### `CashTransactionDetailDrawer` (replaces `CashTransactionDetailModal`)

Same shell as `JournalEntryDetailDrawer` (`financial-engine/JournalEntriesView.tsx`):
right-anchored slide-in panel (`animate-slide-in`, `w-full max-w-lg h-full`),
clickable backdrop (`data-testid="drawer-backdrop"`), dark header bar with
close `X`, `role="dialog"`.

**Header (Transaction Metadata):**
- `#CT-{id}`
- Status badge (`active`/`deleted`, same pill styling as the Type badge —
  green-ish for active, muted gray for deleted)
- Exact timestamp: raw `createdAt` ISO string
- Performing Collaborator: `#EMP-{collaboratorId} — {collaborator.name}` (falls
  back to just `#EMP-{collaboratorId}` while `detailLoading`)

**Financial & System Session Summary section:**
- Amount + Type (reuses existing `amountColorClass`/`formatTypeLabel`)
- Cash Drawer: `#CD-{cashDrawerId}`
- Shift: `#SHIFT-{cashShift.id}` + its status badge, or "No shift linked" when
  `cashShift` is `null` (a transaction can be created outside an open shift)
- Audit Trail Timestamps: `createdAt` and `updatedAt` shown as the raw ISO
  strings the API returns (ticket calls for exact ISO time strings here,
  distinct from the friendlier `formatDateTime` used elsewhere in the view)

**Operational Notes & Loyalty Points Ledger panel:**
- Notes: `transaction.notes`, falling back to the exact copy
  `"No additional notes provided for this transaction."` when empty
- Loyalty Points table: columns Date (`formatDateTime(createdAt)`), Source
  (from `LoyaltyPointsSource`, same `formatTypeLabel`-style humanization),
  Description, Points (right-aligned, `text-green-600` when `points > 0`,
  `text-[#ae001a]` when `points < 0`, sign shown explicitly e.g. `+150` /
  `-50`). Empty state when the array is empty (and not loading): "No loyalty
  point activity linked to this transaction."

### Trigger

Ticket requires opening via row click **or** the existing button. The table
row (`data-testid="cash-transaction-row-{id}"`) gets `onClick` calling the
same handler as the button, plus `cursor-pointer`/`hover:bg-[#f8f3eb]` (the
hover style already exists). The button keeps working identically — both
paths call the same `openDetail(txn)` function, no `stopPropagation` needed
since they trigger the same action.

## Testing

**Frontend** (`CashTransactionsView.test.tsx`): extend the fetch mock to also
serve `GET /cash-transactions/:id`. New/updated cases:
- Row click opens the drawer (not just the button)
- Drawer shows collaborator name, shift id/status, and audit ISO timestamps
  once the detail fetch resolves
- "No shift linked" when `cashShift` is `null`
- Loyalty table renders rows with correct sign-based coloring; empty state
  when the array is empty
- Notes empty-state copy matches the exact required string
- Detail fetch failure leaves the base fields intact and shows the inline
  section-level error

**Backend** (`cash-transactions.service.spec.ts`, `cash-transactions.controller.spec.ts`):
- `findOne` calls the repo with the expected `relations` array
- `formatDetail()` maps a fully-populated transaction (with shift and loyalty
  rows) correctly
- `formatDetail()` handles `cashShift: null` and `loyaltyPointTransactions: []`
- Collaborator fallback when the relation is unexpectedly null
