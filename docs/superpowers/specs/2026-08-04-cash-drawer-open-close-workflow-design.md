# Cash Drawer Open/Close Workflow — Design

## Context

Follow-up to [`2026-08-03-cash-drawers-design.md`](2026-08-03-cash-drawers-design.md), which shipped
the Cash Drawers Directory (grid + Open/Close/View Details) against the backend as it existed then:
`Shift ID`, `Opened By`, and `Closed By` were plain numeric inputs, trusted straight from the request
body, because `GET /shifts`/`GET /collaborators` were `MERCHANT_ADMIN`-only.

The new story tightens this into a real operational workflow for Cashiers/Shift Supervisors:

1. **Context auto-injection on open** — `shift_id` resolves to the merchant's active shift,
   `opened_by` resolves to the logged-in collaborator, `merchant_id` from the JWT. None of these are
   client-supplied anymore.
2. **Single active drawer guard** — already exists server-side (`ConflictException` when the shift
   already has an `Open` drawer), tightened to also scope by `merchant_id` and reworded to match the
   story's message.
3. **Reconciliation on close** — `closing_balance` is compared to `current_balance`. Equal → `Close`.
   Not equal → new `Discrepancy` status, with the variance surfaced in the UI. `closed_by` is
   auto-injected the same way as `opened_by`.

This is a two-repo change: `../x7-pos-back-end` (`src/restaurant-operations/cashdrawer/cash-drawers/`)
and this repo's `CashDrawersView.tsx` / `src/types/cash-drawer.ts`.

### Decisions made with the user

- **Backend is in scope**, not just the frontend — auto-injection and the `Discrepancy` status don't
  exist today and can't be faked client-side.
- **"Shift/terminal" in the story means shift only.** There is no terminal entity/column anywhere in
  the schema. The existing shift-scoped guard (tightened to also check `merchant_id`) is the full
  implementation — no new terminal concept.
- **Manual Shift ID / Opened By / Closed By inputs are removed**, not kept as an override. The modals
  show static copy instead ("assigned automatically from your active session").
- **No new "preview active shift" endpoint.** The Open modal does not show which shift it'll use
  before submit — resolution happens server-side, and the result appears in the grid/detail modal
  after success (or as an inline error if there's no active shift). Keeps backend surface minimal;
  revisit if this becomes a real UX complaint.

## Backend contract changes (`x7-pos-back-end`)

`src/restaurant-operations/cashdrawer/cash-drawers/`:

- **`constants/cash-drawer-status.enum.ts`**: add `DISCREPANCY = 'Discrepancy'`. Plain `varchar(50)`
  column, `synchronize: true` — no migration needed.
- **`dto/create-cash-drawer.dto.ts`**: drop `shiftId` and `openedBy`. Only `openingBalance: number`
  (`@IsNumber() @IsNotEmpty() @Min(0)`) remains client-supplied.
- **Close DTO** (currently `UpdateCashDrawerDto = PartialType(CreateCashDrawerDto)`, used only via
  `PUT /cash-drawers/:id` from this app's Close Drawer action — confirmed no other caller relies on
  partial-editing other fields through this endpoint): replace with a dedicated
  `CloseCashDrawerDto { closingBalance: number }` (`@IsNumber() @IsNotEmpty() @Min(0)`). Drop
  `closedBy` from the client-supplied shape.
- **`cash-drawers.controller.ts`**: switch both `POST /` and `PUT /:id` from manually reading
  `@Request() req` to `@CurrentUser() user: AuthenticatedUser` (the pattern already used by
  `merchant-tip-rule.controller.ts`), passing `user` into the service.
- **`cash-drawers.service.ts`**:
  - New small helper to resolve the `Collaborator` for the authenticated user:
    `collaboratorRepository.findOne({ where: { user_id: user.id, merchant_id: merchantId } })`.
    Throws `BadRequestException` ("No collaborator profile is linked to your account.") if none.
  - **`create()`**:
    1. `merchantId = user.merchant.id`.
    2. `activeShift = shiftsService.findActiveShiftByMerchant(merchantId)` (already exists, currently
       only called internally from `orders.service.ts`) → `BadRequestException` ("No active shift
       found. Start a shift before opening a cash drawer.") if `null`.
    3. Resolve collaborator (see above) → `opened_by`.
    4. Single-open-drawer guard: tighten the existing query to
       `{ shift_id: activeShift.id, status: OPEN, merchant_id: merchantId }`. On conflict:
       `ConflictException('An active cash drawer session (#CD-' + existing.id + ') is already open
       for this shift. Please close the active session before opening a new drawer.')`.
    5. `shift_id = activeShift.id`, `opening_balance = dto.openingBalance`,
       `current_balance = dto.openingBalance`, `status = OPEN` (unchanged).
  - **`update()`** (close path, i.e. `closingBalance` provided):
    1. Resolve collaborator → `closed_by`.
    2. Load the target drawer; if `status !== OPEN`, reject (can't re-close/re-open through this
       path — unchanged from today's implicit behavior, just now explicit).
    3. `status = dto.closingBalance === currentDrawer.current_balance ? CLOSE : DISCREPANCY`
       (compare as numbers — `current_balance` is a `decimal` column and arrives as a string from
       TypeORM internally too, so cast both sides before comparing).
    4. `closing_balance = dto.closingBalance`, `closed_by` set, `updated_at` auto.
  - No stored "variance" column — it's always `closingBalance - currentBalance`, derivable from two
    fields already on the record. Response shape (`CashDrawerResponseDto`) is unchanged.

## Frontend changes (`x7-pos-backoffice`)

`src/types/cash-drawer.ts`:

- `CashDrawerStatus` → `'Open' | 'Close' | 'Pause' | 'Discrepancy'`.
- `CreateCashDrawerDto` → `{ openingBalance: number }`.
- `CloseCashDrawerDto` → `{ closingBalance: number }`.

`src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx`:

- **`OpenCashDrawerFormModal`**: remove the Shift ID and Opened By inputs. Keep Opening Balance
  (`≥ 0` validation, unchanged). Add a short static line: "Your active shift and collaborator profile
  are assigned automatically." Submits `{ openingBalance }`.
- **`CloseCashDrawerDialog`**: remove the Closed By input. Keep Closing Balance, still prefilled with
  `drawer.currentBalance` as an editable default (unchanged UX — it's a starting suggestion for the
  physical count, not a lock). Submits `{ closingBalance }`.
- **`STATUS_BADGE_CLASSES`**: add `Discrepancy: 'bg-orange-500/10 text-orange-700'` — distinct from
  `Pause`'s amber so the two don't read as the same state at a glance.
- Status filter `<select>`: add a `Discrepancy` option.
- **`CashDrawerDetailModal`**: add a "Variance" row, shown whenever `closingBalance != null`,
  computed client-side as `closingBalance - currentBalance`. `$0.00` renders in the normal muted
  style; non-zero renders in the same orange used for the `Discrepancy` badge, with an explicit `+`/`-`
  sign so over/under is unambiguous at a glance.
- Grid row for a `Discrepancy` drawer: same layout as `Close`, just the new badge color — variance
  detail stays in the modal (consistent with the existing "grid for scanning, modal for depth"
  pattern; no `Discrepancy` rows have a further row action, same as `Close`).
- Error handling: no new UI plumbing. The 409 conflict, "no active shift", and "no collaborator
  profile" backend errors all surface through the existing `createError`/`closeError` inline slots
  (`json.message` is already threaded through).

## Testing plan

- **Backend** (existing `cash-drawers` spec, wherever it lives — extend, don't replace):
  - `create()`: resolves `shift_id`/`opened_by` from context, not body; rejects when no active shift;
    rejects when no linked collaborator; 409 with the exact updated message when a shift already has
    an open drawer; guard is merchant-scoped (a same-shift-id drawer under a *different* merchant does
    not block).
  - `update()`: resolves `closed_by` from context; `status = Close` when balances match; `status =
    Discrepancy` when they don't (both over and under); rejects closing an already-closed drawer.
- **Frontend** (`CashDrawersView.test.tsx`):
  - Open modal no longer renders Shift ID/Opened By inputs; submits `{ openingBalance }` only.
  - Close dialog no longer renders Closed By input; submits `{ closingBalance }` only.
  - `Discrepancy` status renders its own badge color, distinct from `Pause` and `Close`.
  - Detail modal variance row: `$0.00`/neutral style on exact match, signed + orange style on mismatch,
    absent when `closingBalance` is `null`.
  - Inline error rendering for a 409 response and for generic 400 messages (no active shift / no
    collaborator) — reuses the existing error-slot assertions, just with new message text.
