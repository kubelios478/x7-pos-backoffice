# Tip Rules — Full CRUD Lifecycle (Create / View Details / Update / Soft-Delete)

## Problem / story

As an authorized Merchant Administrator, I want to execute complete lifecycle operations
(Create, View Details, Update, and Soft-Delete) for tip schemas using form drawer components,
so that I can adjust gratuity logic dynamically and maintain absolute audit accountability.

This builds directly on the read-only workspace already on disk (`TipRulesView.tsx` +
`TipRulesView.test.tsx`, currently untracked) — grid, filters, empty states, and the
`RuleConfigQuickLinks` panel are already shipped. Both action buttons currently call
`alert('Add Tip Rule — coming soon')`. This spec is the CRUD follow-up, mirroring
`2026-07-08-tax-rules-crud-lifecycle-design.md` structurally, adapted for tip-rule-specific data
shapes (dynamic arrays, distribution percentages).

## Reality check vs. the story

The backend (`x7-pos-back-end`, branch `subcripcion`) already has an **in-progress, uncommitted**
refactor of `merchant-tip-rule` that partially mirrors the finished Tax Rule pattern: `create`,
`findAll`, and `findOne` already derive `companyId`/`merchant` from the session
(`resolveMerchantContext`) and check ownership (`assertOwnsCompany`). `CreateMerchantTipRuleDto`
has already been stripped of client-supplied `companyId`/`merchantId`/`createdAt`/`updatedAt`/
`createdById`/`updatedById`/`status`. This spec finishes that refactor rather than starting one:

1. **`update()` still trusts a client-supplied `dto.updatedById`, and never touches `updatedAt`
   at all.** Unlike `merchant-tax-rule.service.ts#update`, which always resolves `updatedBy` from
   `user.id` and sets `updatedAt = new Date()`, the tip-rule version only sets `updatedBy` if the
   caller happens to send `updatedById` in the body, and has no `updatedAt` line whatsoever — a
   PATCH today silently leaves `updatedAt` stale forever. This directly breaks the ticket's
   "dynamically changing the updatedBy property to the active session user" rule. Fixed to match
   `merchant-tax-rule.service.ts#update` exactly.
2. **`UpdateMerchantTipRuleDto` still carries `companyId`, `createdById`, `updatedById`** as
   leftover fields from before the in-progress refactor (the `Create` DTO already dropped them,
   the `Update` DTO didn't). Removed, leaving `PartialType(CreateMerchantTipRuleDto)` +
   `status?: 'active' | 'inactive'` — identical shape to `UpdateMerchantTaxRuleDto`.
3. **`findOne` leaks raw `User` fields**, same bug already found and fixed for tax rules in
   `2026-07-08`: it calls `repository.findOne({ relations: [...] })` with no `select`, so
   `password`, `resetToken`, `refreshToken` would serialize into the Detail-drawer response the
   first time this frontend actually calls it. Rewritten to a `queryBuilder.select()` mirroring
   `findAll`'s (already-scoped) field list.
4. **`findAll`'s existing select list omits `createdBy.username`/`updatedBy.username`**
   (`createdBy.id`, `createdBy.email` only) — the audit display convention established for Tax
   Rules is `username ?? email`; without `username` in the select it always falls back to email.
   Added to both `findAll`'s and the new `findOne` `select()` list, matching tax-rule's field set.
5. **`createdBy.name` does not exist**, same finding as Tax Rules — `User` has `username` and
   `email`, no `name` column. Detail drawer renders `createdBy.username ?? createdBy.email`
   (a display-label choice, not a backend change).
6. **The soft-delete AC (PATCH flips `status` to `'inactive'`) is not the existing
   `DELETE /merchant-tip-rule/:id` route**, which sets `status: 'deleted'` — a third state. Same
   resolution as Tax Rules: soft-delete is implemented as
   `PATCH /merchant-tip-rule/:id { status: 'inactive' }`. The real `DELETE` route is left
   untouched (unused by this frontend).
7. **`suggestedPercentages`/`fixedAmountOptions` are `@IsArray() @IsNumber({}, {each:true})
   @IsNotEmpty()` with no `@IsOptional()`** on `CreateMerchantTipRuleDto`, even though only one of
   the two is meaningful depending on `tipCalculationMethod`. `class-validator`'s `IsNotEmpty`
   accepts `[]` (it only rejects `''`/`null`/`undefined`), so the frontend always sends **both**
   keys on create, with `[]` for whichever one doesn't apply — this satisfies validation without
   a backend DTO change.
8. **Role-based distribution has a server-side invariant already enforced in `create`** (not yet
   in `update`): if `tipDistributionMethod === 'role_based'`, `staffPercentage`/
   `kitchenPercentage`/`managerPercentage` must all be present and sum to `1` (±0.01), else
   `ErrorHandler.invalidInput`. The form mirrors this client-side (blocks submit unless all three
   are filled and sum to 100) so users don't hit the raw 400. `update()` does not currently run
   this same check when `tipDistributionMethod`/percentages change via PATCH — **left as-is**
   (out of scope, flagged below) since editing distribution method isn't a common path and adding
   it risks scope creep on a backend file already mid-refactor; the frontend's client-side
   sum-to-100 validation covers the UI-driven path either way.

## Decisions made with the user

- **Distribution Percentages (Staff/Kitchen/Manager %) are included in the form** as an optional
  section, shown when `tipDistributionMethod === 'role_based'`, even though the ticket's business
  rules don't mention them — the existing read-only grid already renders Kitchen/Managers badges
  driven by these fields, so omitting them from the form would make those fields is write-only
  via nothing.
- **`suggestedPercentages` tag-input takes whole-number input (e.g. `15`) and divides by 100
  before submit** (`0.15`), matching how the existing grid already formats/reads this field
  (`Math.round(value * 100)}%`) and the test fixtures (`0.15` → `"15%"`). The same conversion
  applies to Staff/Kitchen/Manager % inputs (stored as fractions). `fixedAmountOptions` and
  `maximumTipPercentage` are NOT converted — sent as whole numbers as-is (matching existing
  `$Math.round(value)` / `Max: {value}%` display code).
- **`tipCalculationMethod === 'custom'` hides both array tag-inputs** — the ticket's conditional-
  input rule only describes `percentage` and `fixed_amount`; `custom` gets neither.
- **Modal, not a slide-in drawer**, for Create, Edit, and View Details — same precedent-following
  call already made for Tax Rules (`ProductsView.tsx` / the Tax Rules CRUD spec). The story's
  "drawer"/"side-panel" wording is satisfied functionally, not literally.
- **Status toggle is bidirectional** (deactivate *and* reactivate) — same convention as Tax Rules,
  implemented locally inside `TipRulesView.tsx` (not imported from `SaaSFrame/StatusToggle.tsx`).

## Backend (`x7-pos-back-end`)

### `UpdateMerchantTipRuleDto` — drop stale fields

```ts
export class UpdateMerchantTipRuleDto extends PartialType(CreateMerchantTipRuleDto) {
  @IsOptional() @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
```

Removed: `companyId`, `createdById`, `updatedById` (leftovers from before the in-progress
refactor; `Create` already dropped them).

### `MerchantTipRuleService`

- **`update(id, dto: UpdateMerchantTipRuleDto, user: AuthenticatedUser)`**: keep the existing
  `assertOwnsCompany` check (already added). Replace the `if (dto.updatedById) {...}` block:
  always look up the calling `User` by `user.id` for `updatedBy`, `ErrorHandler.notFound(...)` if
  not found. Always set `merchantTipRule.updatedAt = new Date()`. Remaining fields merged via the
  existing `Object.assign(merchantTipRule, dto)` (now safe since the DTO no longer carries
  `companyId`/`createdById`/`updatedById`).
- **`findOne(id, user)`**: rewrite from `repository.findOne({ relations: [...] })` to a
  `queryBuilder` with explicit `.select()`: `merchantTipRule`, `company.id`, `createdBy.id`,
  `createdBy.username`, `createdBy.email`, `updatedBy.id`, `updatedBy.username`,
  `updatedBy.email`, `merchant.id`, `merchant.name` — closes the password/token leak, matches
  `findAll`'s (soon-to-be-widened) field list. Keep the existing `assertOwnsCompany` call.
- **`findAll`**: add `createdBy.username`/`updatedBy.username` to the existing `.select()` list
  (currently `id`/`email` only).
- `create()` and `remove()` (the `DELETE` route handler): untouched.

### `MerchantTipRuleController`

No changes — `create`, `findAll`, `findOne`, `update` already forward `@CurrentUser()` to the
service from the in-progress refactor.

## Frontend (`x7-pos-backoffice`)

### `src/types/configuration.ts`

`MerchantTipRule` gains audit fields (reuses the existing `AuditUser` interface):

```ts
export interface MerchantTipRule {
  // ...existing fields...
  createdAt?: string;
  updatedAt?: string;
  createdBy?: AuditUser | null;
  updatedBy?: AuditUser | null;
}

export interface CreateTipRuleDto {
  name: string;
  tipCalculationMethod: TipCalculationMethod;
  tipDistributionMethod: TipDistributionMethod;
  suggestedPercentages: number[];   // fraction, e.g. 0.15 — always present, [] if not applicable
  fixedAmountOptions: number[];     // whole dollars — always present, [] if not applicable
  allowCustomTip: boolean;
  maximumTipPercentage: number;     // whole percent, e.g. 30
  autoDistribute: boolean;
  staffPercentage?: number;         // fraction — only when tipDistributionMethod === 'role_based'
  kitchenPercentage?: number;
  managerPercentage?: number;
}

export type UpdateTipRuleDto = Partial<CreateTipRuleDto> & { status?: 'active' | 'inactive' };
```

### `TipRulesView.tsx`

**Entry points for Create** (same 2-entry-point convention as Tax Rules):
- "Add Tip Rule" button in the filter toolbar row (currently `alert(...)`, rewired).
- "Add Tip Rule" button in the true-empty-state card (currently `alert(...)`, rewired).
- FAB, `fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] rounded-full`, `aria-label="Quick create tip
  rule"` (net-new — the current read-only view has no FAB).

**`TipRuleFormModal`** — one component, `mode: 'create' | 'edit'`:
- **Rule Name** — text, counter, blocks >50 chars.
- **Calculation Method** — select: Percentage / Fixed Amount / Custom.
- **Distribution Method** — select: Individual / Pool / Role-Based.
- **Conditional on Calculation Method**: `percentage` → tag-input "Suggested Percentages" (Enter
  adds a chip from the current integer input, e.g. `15` → chip "15%"; removable chips);
  `fixed_amount` → tag-input "Fixed Amount Options" (chips "$5" etc.); `custom` → neither renders.
- **Maximum Tip Percentage** — number input, required.
- **Allow Custom Tip** / **Auto-Distribute** — checkboxes.
- **Distribution Percentages** section, shown only when Distribution Method = Role-Based: Staff %
  / Kitchen % / Manager % number inputs. Client-side: if any of the three has a value, all three
  are required and must sum to 100 (mirrors the backend's ±0.01-of-1 check after /100 conversion).
- Submit disabled when: name empty or >50 chars, either select unset, active tag-input has zero
  chips (percentage/fixed_amount modes only — `custom` has no such requirement),
  maximumTipPercentage not a valid number, role-based percentages incomplete or not summing to
  100, or (edit mode) no field changed from the rule's current values.
- Create submit: `POST /merchant-tip-rule` with `CreateTipRuleDto` — `suggestedPercentages` and
  `fixedAmountOptions` both always included (`[]` for whichever the active method doesn't use),
  values converted per the "Decisions" section above. On success: prepend to `rules` state, close,
  toast success. On error: close, toast error (401 → existing `clearAuthSession()` redirect).
- Edit submit: `PATCH /merchant-tip-rule/:id` with only the changed fields, same conversions. On
  success: replace the row in `rules` state, close, toast. Edit never touches `status` (matches
  the unified-status-toggle convention).

**`TipRuleDetailModal`** — read-only, opened by clicking a row (action-icon clicks
`e.stopPropagation()`). Fetches `GET /merchant-tip-rule/:id` on open (list payload doesn't carry
audit fields, same "always fetch on open" default as Tax Rules). Displays: name, calculation/
distribution method, suggested-percentages or fixed-amount-options pills (formatted with the
existing `formatSuggestedPercentage`/`formatFixedAmount` helpers), max tip %, Allow Custom Tip /
Auto-Distribute badges, Staff/Kitchen/Manager % (if present), and an Audit Trail section: "Created
{date} by {createdBy.username ?? createdBy.email}" / "Last updated {date} by
{updatedBy.username ?? updatedBy.email}" (reuses the `formatAuditDate`/`formatAuditUser` helpers,
ported from `TaxRulesView.tsx` verbatim).

**Actions column** — new, rightmost, `opacity-0 group-hover:opacity-100` on row hover:
- Pencil icon → opens `TipRuleFormModal` in edit mode, pre-populated (percentages/percentages
  converted back to whole numbers for display, e.g. `0.15` → `15`).
- `block` (active rows) / `check_circle` (inactive rows) icon → local `ConfirmStatusDialog`
  ("Deactivate this tip rule?" / "Reactivate this tip rule?") → on confirm,
  `PATCH /merchant-tip-rule/:id { status: 'inactive' | 'active' }`, replace the row in state,
  toast.

**Data fetching**: same inline-`fetch` + `getAccessToken()`/`clearAuthSession()` pattern already
used by `fetchTipRules` — no shared service file.

## Testing

**Backend** (`merchant-tip-rule.service.spec.ts` / `.controller.spec.ts`, already partially
updated by the in-progress refactor — extend, don't rewrite):
- `update`: `updatedBy`/`updatedAt` always auto-set from the session user regardless of payload
  content (mirrors the existing "always sets updatedBy from the session user, ignoring any client
  value" test already written for Tax Rules); a client-supplied `updatedById` in the raw body is
  ignored (DTO no longer declares the field).
- `findOne`: response excludes `password`/`resetToken`/`refreshToken` on `createdBy`/`updatedBy`;
  forbidden on cross-company access (already covered).
- `findAll`: `createdBy.username`/`updatedBy.username` present in the selected fields.

**Frontend** (`TipRulesView.test.tsx`, extending the existing file):
- Create: toolbar button, empty-state button, and FAB all open the modal; conditional rendering
  (percentage → suggested-percentages tag-input only, fixed_amount → fixed-amount tag-input only,
  custom → neither); role-based section appears only for Role-Based distribution and blocks
  submit until three percentages summing to 100 are filled; happy path asserts the POST body has
  `suggestedPercentages`/`fixedAmountOptions` both present with the unused one as `[]` and correct
  /100 conversion; error path.
- Edit: pencil opens modal pre-filled (with percentages converted back to whole numbers); submit
  disabled with no changes; happy path (PATCH, row replaced); error path.
- Detail: row click opens modal with audit fields rendered (`createdBy.username`, fallback to
  `email`); action-icon clicks don't open the detail modal.
- Status toggle: both directions, confirm dialog blocks the PATCH until confirmed, row updates in
  place on success.
- Final verification: `npm run test` green (both repos); `npx tsc --build --noEmit --force` clean
  in `x7-pos-backoffice` (per [[reference-tsc-build-check]]).

## Out of scope

- The real `DELETE /merchant-tip-rule/:id` route and its `'deleted'` status value.
- Bulk operations.
- Enforcing the role-based sum-to-100 invariant server-side inside `update()` (only `create()` has
  it today) — the frontend's client-side validation covers the only path that currently exercises
  this, and touching that check risks scope creep on an already mid-refactor service file.
- Any change to `QueryMerchantTipRuleDto` or list-level filtering/sorting beyond what's already
  shipped in the read-only workspace.
- A drawer/side-panel UI pattern — explicitly decided against in favor of the existing modal
  convention.
- Portal-admin-initiated create/update flows — naturally blocked by `resolveMerchantContext`
  returning no merchant for a `PORTAL_ADMIN`, not specially designed for.
