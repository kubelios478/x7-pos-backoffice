# Cash Shifts — Centralized Workspace Grid (Audit View)

**Date:** 2026-08-06
**Branches:** `x7-pos-backoffice` @ `rafaalejandro_subscription`
**Related:** [[project-cash-drawers-directory]], `2026-08-05-cash-shifts-open-close-workflow-design.md` (the Open/Close workflow this grid displays; that story's acceptance criteria are already fully implemented and out of scope here)

## User story

As an authenticated Merchant Administrator, Store Manager, or Head Cashier, I want a centralized Cash Shifts workspace directory embedded within the application shell, so that I can track operational cashier shift sessions (CashShift), audit opening floats (openingBalance), inspect system-calculated sales vs declared cashier cash (systemAmount vs declaredAmount), monitor financial variance (difference), and manage session statuses (CashShiftStatus).

## Current state

`CashShiftsView.tsx` already exists (built for the Open/Close workflow story) with a working grid, search, status filter, Open/Close/View Details actions, and multi-tenant isolation (merchantId resolved server-side from the JWT via `GET /cash-shifts`, rather than a client-supplied `?merchantId={id}` query param — functionally equivalent to the story's isolation requirement, and safer since a client-supplied merchantId can't be spoofed; this mechanism is being kept as-is).

## Gaps this design closes

1. **No financial columns in the main grid.** `systemAmount`, `declaredAmount`, and `difference` are only visible inside the "View Details" modal today. The story requires them as first-class grid columns.
2. **No dedicated Cash Drawer filter.** Only a status dropdown and a free-text search (which fuzzy-matches drawer IDs as a substring) exist today; the story asks for a discrete `cashDrawerId` filter control.
3. **No `AUDITED` status.** `CashShiftStatus` only has `OPEN`/`CLOSED`/`DISCREPANCY` today, backend and frontend.
4. **Two different variance color schemes in the same view.** The Detail Modal and Result Modal use a binary scheme (gray at $0, orange for any nonzero difference). The new grid column requires 3-way coloring (gray at $0, green for surplus, bold red for shortage). This design unifies all three call sites onto the 3-color scheme so the same variance never reads differently depending on where it's shown.
5. **Copy mismatches.** Empty-state text and the "no closer yet" badge label don't match the story's exact wording.

## Frontend changes (`x7-pos-backoffice`)

All changes are confined to `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx` and `src/types/cash-shift.ts`.

### `src/types/cash-shift.ts`
Add `'AUDITED'` to the `CashShiftStatus` union type.

### Shared variance helper (new)
```ts
function varianceColorClass(difference: number | null): string {
  if (difference == null) return 'text-[#5f5e5e]';
  if (difference === 0) return 'text-[#1d1c17]';
  return difference > 0 ? 'text-green-600 font-bold' : 'text-[#ae001a] font-bold';
}
function formatVariance(difference: number): string {
  return difference === 0
    ? formatCurrency(0)
    : `${difference > 0 ? '+' : '-'}${formatCurrency(Math.abs(difference))}`;
}
```
Used by the new grid column, `CashShiftDetailModal`, and `CashShiftResultModal` — replacing each modal's current inline binary (`difference === 0 ? normal : 'font-bold text-orange-700'`) logic.

### `STATUS_BADGE_CLASSES`
Add `AUDITED: 'bg-purple-500/10 text-purple-700'`.

### Grid columns
Insert 3 new `<th>`/`<td>` pairs between "Opening Balance" and "Opened By": **System Total**, **Declared Amount**, **Variance**. The existing "Opening Balance" header is kept as-is (the story's "Opening Float" is descriptive prose, not a mandated header string, and renaming risks breaking existing test selectors for no functional gain).
- System Total: `shift.status === 'OPEN' ? '--' : (shift.systemAmount == null ? '--' : formatCurrency(shift.systemAmount))` — stays blind while the shift is active, same rule already used in the Detail Modal.
- Declared Amount: `shift.declaredAmount == null ? '--' : formatCurrency(shift.declaredAmount)`.
- Variance: `shift.difference == null ? '--' : formatVariance(shift.difference)`, styled with `varianceColorClass(shift.difference)`.
- Loading skeleton row gets 3 additional placeholder `<td>`s to match the new column count (9 total: Session ID & Drawer, Opening Balance, System Total, Declared Amount, Variance, Opened By, Closed By, Status, Actions).
- The table's existing `overflow-x-auto` wrapper contains the extra width — no structural layout change needed to satisfy the "mounts cleanly without horizontal breaking" acceptance criterion.

### Cash Drawer filter
New `drawerFilter` state (`'' | number`). Options are the unique `cashDrawerId` values present in the currently-fetched `shifts` array (`Array.from(new Set(shifts.map(s => s.cashDrawerId))).sort((a, b) => a - b)`), rendered as `#CD-{id}` options — no additional fetch. Combined with `statusFilter` and `searchQuery` in the existing `filteredShifts` memo (`shift.cashDrawerId === drawerFilter` check, skipped when `drawerFilter === ''`).

### Status filter dropdown
Add `<option value="AUDITED">Audited</option>`.

### Copy fixes
- Empty state (`data-testid="cash-shifts-empty-state"`) text → `"No cashier shift sessions found. Click 'Open Cash Shift' to start a new cashier session."`
- "In Service" badge (grid Closed-By column and Detail Modal "Closed By" row) → **"Active Shift"**.

### `CashShiftDetailModal` / `CashShiftResultModal`
Replace their inline binary difference styling/formatting with `varianceColorClass()` / `formatVariance()`.

## Backend changes (`x7-pos-back-end`)

### `constants/cash-shift-status.enum.ts`
Add `AUDITED = 'AUDITED'`. No migration needed — `synchronize: true` is active (same mechanism already used to add `DISCREPANCY`).

No service, controller, or DTO changes: this status value is added for type/DB readiness only. Nothing in the system sets it yet (per explicit scope decision — a future "Mark as Audited" action is out of scope for this story).

## Out of scope

- Any action or endpoint that transitions a shift into `AUDITED` — the status exists in the enum/UI for display and filtering only.
- Changing the multi-tenant isolation mechanism to a client-supplied `?merchantId={id}` query param — the existing JWT-derived approach already satisfies the isolation requirement and is kept.
- Any change to Open/Close workflow behavior, guards, or the blind-count Close dialog — already fully implemented per the prior design doc.
- Server-side filtering/pagination on `GET /cash-shifts` — filtering (status, drawer, search) remains client-side over the already-fetched list, consistent with the existing endpoint's capability.

## Testing

**Frontend** (`CashShiftsView.test.tsx`):
- New grid columns render `systemAmount`/`declaredAmount`/`difference` correctly for CLOSED/DISCREPANCY rows, and System Total shows `--` for an OPEN row even when the fixture has a non-null `systemAmount` (blind-in-grid regression guard).
- Variance column color classes: gray at $0, green for positive difference, red+bold for negative difference — asserted in the grid, the Detail Modal, and the Result Modal (all three via the shared helper).
- Drawer filter: dropdown options match unique drawer IDs in the fetched list; selecting one filters rows; combines correctly with an active status filter and/or search query.
- Status filter includes an "Audited" option; selecting it with no `AUDITED` rows present renders the existing filtered-empty state (no crash).
- Empty state renders the exact updated copy.
- "Active Shift" badge text renders where "In Service" used to.

No backend test changes required (enum-only addition, no branching logic to cover).
