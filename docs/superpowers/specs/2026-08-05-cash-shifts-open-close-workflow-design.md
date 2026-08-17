# Cash Shifts — Open/Close Workflow with Blind Reconciliation

**Date:** 2026-08-05
**Branches:** `x7-pos-backoffice` @ `rafaalejandro_subscription` · `x7-pos-back-end` @ `subcripcion`
**Related:** [[project-cash-drawers-directory]], `2026-08-04-cash-drawer-open-close-workflow-design.md` (the pattern this design mirrors), `2026-08-05-cash-drawers-quick-launch-nav-design.md` (registered the `cash-shifts` stub this work replaces)

## User story

As an authorized Cashier or Shift Supervisor, I want to open a cashier shift session on a designated cash drawer and perform a blind cash count reconciliation upon shift closure, so that I can record actual physical cash collected, automatically calculate financial discrepancies (difference), and prevent multiple active shifts on the same cash drawer.

## Current state

The `cash-shifts` backend module (`x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-shifts/`) already exists and is substantially complete: entity, controller (`POST /cash-shifts`, `GET /cash-shifts`, `GET /cash-shifts/active`, `GET /cash-shifts/:id`, `POST /cash-shifts/:id/close`, `POST /cash-shifts/:id/transactions/manual`), the per-drawer and per-collaborator "one active shift" guards, and a SQL-driven `getLiveBalance()` that computes `systemAmount` from `cash_transactions`, `cash_movements`, and cash tip settlements. `closeShift` already computes `difference = declaredAmount - systemAmount`.

On the frontend, `cash-shifts` is currently registered only as a `COMING_SOON_STUBS` entry in `MerchantFrame.tsx` (added by the 2026-08-05 Quick Launch nav work) — no real view exists.

This design closes the gaps between what exists and the story's acceptance criteria, and builds the missing frontend view.

## Gaps this design closes

1. **No DISCREPANCY status.** `CashShiftStatus` only has `OPEN`/`CLOSED`. The story requires status to become `DISCREPANCY` when `difference !== 0`, even though the difference is already calculated. The sibling `cash-drawers` module already shipped this exact pattern (2026-08-04) — reuse it.
2. **No automatic context injection for collaborator.** `CreateCashShiftDto`/`CloseCashShiftDto` require the client to pass `collaboratorId` explicitly. The story asks for `openedBy = activeCollaborator.id` to be resolved automatically from the authenticated session — again, already precedented in `cash-drawers`. This also closes a spoofing gap: today any `collaboratorId` can be submitted by the client.
3. **No frontend view.** `CashShiftsView` doesn't exist yet.

## Backend changes (`x7-pos-back-end`)

### `constants/cash-shift-status.enum.ts`
Add `DISCREPANCY = 'DISCREPANCY'` alongside `OPEN`/`CLOSED`.

### DTOs
- `CreateCashShiftDto`: remove `collaboratorId`. Keeps `cashDrawerId`, `openingBalance`.
- `CloseCashShiftDto`: remove `collaboratorId`. Keeps `declaredAmount`.

### `cash-shifts.service.ts`
- `openShift`: resolve the acting Collaborator via `collaboratorRepo.findOne({ where: { user_id: user.id, merchant_id: merchantId } })` (same lookup the service already uses for the MERCHANT_USER check in `closeShift`). Use its `id` as `openedBy`. If no linked Collaborator record exists, throw the same `ForbiddenException` already used elsewhere in this service for that case.
- `closeShift`: resolve the acting Collaborator the same way for `closedBy`. Remove the now-redundant `dto.collaboratorId !== currentUserCollaborator.id` check (the field no longer exists on the DTO). Keep the existing "MERCHANT_USER can only close a shift they opened" check (`shift.openedBy !== currentUserCollaborator.id`) — it now compares against the auto-resolved id, so it still enforces the same rule with no other code change needed.
- `closeShift`: round both `declaredAmount` and the computed `systemAmount` to cents (`Math.round(x * 100) / 100`) before comparing, mirroring `cash-drawers.service.ts:394-404`. Set `status = CLOSED` if equal, else `DISCREPANCY`.
- Conflict message for the per-drawer guard: reword to match the story's exact phrasing —
  `` `Cash Drawer #${dto.cashDrawerId} already has an active shift session (#CS-${existingDrawerShift.id}) in progress. Please close the active shift before opening a new one.` ``
- Everything else in `openShift`/`closeShift` (drawer-must-be-OPEN check, drawer-belongs-to-merchant check, the per-collaborator "already has an open shift" guard) stays as-is — no requirement to change it, and the user confirmed keeping the per-collaborator guard.

### `entities/cash-shift.entity.ts`
Add `ManyToOne` relations to `Collaborator`, mirroring `CashDrawer`:
```ts
@ManyToOne(() => Collaborator, { nullable: false })
@JoinColumn({ name: 'opened_by' })
openedByCollaborator: Collaborator;

@ManyToOne(() => Collaborator, { nullable: true })
@JoinColumn({ name: 'closed_by' })
closedByCollaborator: Collaborator | null;
```
(`opened_by`/`closed_by` columns already exist as plain `int` columns — these relations join on them without a schema migration, same as `CashDrawer` does today.)

### `dto/cash-shift-response.dto.ts`
Replace bare `openedBy: number` / `closedBy: number | null` with `openedByCollaborator: { id, name, role }` / `closedByCollaborator: { id, name, role } | null`, following the shape `cash-drawer-response.dto.ts` already uses. The service's `format()` method populates these from the joined relations (loaded via `relations: [...]` on the repository calls, same pattern already used for `cashMovements`).

## Frontend changes (`x7-pos-backoffice`)

### `src/types/cash-shift.ts` (new)
```ts
export type CashShiftStatus = 'OPEN' | 'CLOSED' | 'DISCREPANCY';

export interface CashShiftCollaboratorRef {
  id: number;
  name: string;
  role: string;
}

export interface CashShift {
  id: number;
  merchantId: number;
  cashDrawerId: number;
  openingBalance: number;
  systemAmount: number | null;
  declaredAmount: number | null;
  difference: number | null;
  status: CashShiftStatus;
  openedAt: string;
  closedAt: string | null;
  openedByCollaborator: CashShiftCollaboratorRef;
  closedByCollaborator: CashShiftCollaboratorRef | null;
}

export interface CreateCashShiftDto {
  cashDrawerId: number;
  openingBalance: number;
}

export interface CloseCashShiftDto {
  declaredAmount: number;
}
```
Include a `normalizeShift()` helper coercing `openingBalance`/`systemAmount`/`declaredAmount`/`difference` from the decimal-as-string wire format, same as `normalizeDrawer()` in `CashDrawersView.tsx`.

### `CashShiftsView.tsx` (new, `views/restaurant-operations/`)
Modeled directly on `CashDrawersView.tsx`, reusing its structural patterns (portal-based modals, toast, loading skeleton rows, empty/filtered-empty states, `getAccessToken`/401 handling).

- **List**: `GET /cash-shifts`. Note this endpoint takes no query params (unlike `/cash-drawers`) — filtering (status, search by session/drawer id or collaborator name) is client-side only over the fetched list.
- **Open Cash Shift modal**:
  - Fetches `GET /cash-drawers` to build the `cashDrawerId` dropdown, cross-referenced against the currently-fetched shifts list to exclude any drawer that already has an `OPEN` shift. Dropdown only lists drawers with `status === 'Open'` and no active shift — the user never reaches the backend's conflict error through normal use of this dropdown.
  - `openingBalance` input (decimal, ≥ 0).
  - No collaborator field — resolved automatically server-side.
  - Submits `POST /cash-shifts`.
- **Table columns**: Session ID (`#CS-{id}`) + drawer ref, Opening Balance, Opened By (name/role), Closed By (name/role or "In Service"), Status badge (`Open`=green, `Closed`=gray, `Discrepancy`=orange — same convention as `CashDrawersView`'s `STATUS_BADGE_CLASSES`), Actions (View Details always; Close Shift only when `status === 'OPEN'`).
- **Close Shift dialog**: single `declaredAmount` input. Does not fetch or render `systemAmount` anywhere in this dialog — that omission is the entire blind-count mechanism. Submits `POST /cash-shifts/:id/close`.
- **Result modal on successful close**: shows `declaredAmount` vs `systemAmount`, the computed variance, and the resulting `CLOSED`/`DISCREPANCY` outcome — reusing the Variance-row display pattern from `CashDrawerDetailModal`. Then refetches the list.
- **Detail modal** (View Details, any row): full record, including `systemAmount`/`declaredAmount`/`difference` once populated — no blind-count concern here since it's only reachable after the shift is already closed.

### `MerchantFrame.tsx`
- Remove the `cash-shifts` entry from `COMING_SOON_STUBS`.
- Add a render branch for `activeTab === 'cash-shifts'` → `<CashShiftsView onNavigate={...} />`, wired the same way `cash-drawers` is today.
- `CashManagementQuickLinks` needs no changes — it already has a `cash-shifts` button; `CashShiftsView` just needs to render `<CashManagementQuickLinks activeModule="cash-shifts" onNavigate={onNavigate} />`.

## Error handling

- 409 Conflict (per-drawer or per-collaborator guard) → shown inline in the Open modal, same as `CashDrawersView`'s `createError`.
- 400 Bad Request (shift already closed) → shown inline in the Close dialog.
- 401 → `clearAuthSession()` + redirect to `/login`, reused verbatim from `CashDrawersView`.

## Testing

**Backend** (`cash-shifts.service.spec.ts`): DISCREPANCY branch, cent-rounding comparison, JWT-based auto-injection of `openedBy`/`closedBy` (replacing the old collaboratorId-based test fixtures), removal of `collaboratorId` from DTO validation tests.

**Frontend** (`CashShiftsView.test.tsx`, mirroring `CashDrawersView.test.tsx`): per-drawer guard conflict message rendering, Close dialog never rendering `systemAmount` in its DOM, open/close happy paths, Discrepancy result modal, drawer-dropdown filtering to available drawers only, 401 redirect.

## Out of scope

- The `cash-shifts/:id/transactions/manual` endpoint (manual cash in/out during an open shift) — already built, no UI hook-up requested by this story.
- Resolving/reopening a shift that closed with `DISCREPANCY` — terminal state, same explicit decision already made for `cash-drawers`.
- Server-side filtering/pagination on `GET /cash-shifts` — out of scope; client-side filtering only, per current endpoint capability.
