# Tip Rules — Suggested Percentages Must Sum to Exactly 100%

## Problem / story

`Suggested Percentages` (the tag-input chips shown when `tipCalculationMethod === 'percentage'`)
currently has no relationship between its entries — any positive value up to 100 can be added
freely, and the form only requires at least one chip (`arraysValid`). In practice this field is
used to split a tip 100% across workers (e.g. one worker → `100`, two workers → `20` + `80`), so
the list must always add up to exactly 100 — never more, never less. Today it doesn't: two chips
of `15` and `20` (35% total) pass validation and submit successfully.

This redefines the field's purpose away from its original doc-comment framing ("Suggested tip
percentages for customers to choose from" — independent options like 15/18/20 for a customer to
pick from) toward "a full breakdown of the tip across workers." The rule applies whenever
`tipCalculationMethod === 'percentage'`, regardless of `tipDistributionMethod` (Individual, Pool,
or Role-Based) — confirmed with the user rather than scoping it to Individual only.

## Decisions made with the user

- **Scope: applies to every rule using percentage-based calculation**, not just
  `tipDistributionMethod === 'individual'`. Role-Based rules keep their separate, existing
  Staff/Kitchen/Manager sum-to-100 check on top of this one — the two are independent fields.
- **Exact equality on the frontend, `±0.01` tolerance on the backend.** Chips are always whole
  integers (`parseInt` in `addPercentage`), so summing them client-side can't produce floating-point
  drift — `=== 100` is safe and unambiguous. The backend receives the same list divided by 100
  (fractions), where summing floats can drift (e.g. `0.2 + 0.8 = 0.9999999999999999`), so it reuses
  the existing Role-Based pattern: `Math.abs(sum - 1) > 0.01`.
- **Fixing the pre-existing `update()` validation gap, bundled into this change.** Today
  `MerchantTipRuleService.update()` runs zero business-rule validation — not even the Role-Based
  sum-to-100 check that `create()` already has (see `2026-07-09-tip-rules-crud-lifecycle-design.md`,
  which explicitly deferred this). Since this ticket adds a second sum-to-100 rule that has the same
  need, both checks (Role-Based and Suggested Percentages) are added to `update()` in the same pass,
  closing the gap instead of compounding it. `update()`'s DTO is partial, so the check merges
  incoming fields onto the persisted entity before validating (the same values `Object.assign` would
  end up persisting), not just whatever happens to be in the PATCH body.
- **No change to `maximumTipPercentage` or per-chip bounds** — those were already fixed in the
  prior change (0–100 range, per-chip cap at 100/1). This spec only adds the cross-chip sum
  constraint.
- **No backfill/migration for existing rows.** Rules already persisted with a suggested-percentages
  list that doesn't sum to 100 are left as-is; the check only runs on new `create`/`update` payloads.
  Editing such a rule will require the user to fix the split before the next save succeeds.

## Backend (`x7-pos-back-end`)

### `MerchantTipRuleService`

Add a private helper, same shape as the existing inline Role-Based check:

```ts
private validateSuggestedPercentagesSum(
  tipCalculationMethod: TipCalculationMethod,
  suggestedPercentages: number[] | undefined,
): void {
  if (tipCalculationMethod !== TipCalculationMethod.PERCENTAGE) {
    return;
  }
  const sum = (suggestedPercentages ?? []).reduce((acc, n) => acc + Number(n), 0);
  if (Math.abs(sum - 1) > 0.01) {
    ErrorHandler.invalidInput('Suggested percentages must sum to 100%');
  }
}
```

- **`create()`**: call `this.validateSuggestedPercentagesSum(dto.tipCalculationMethod, dto.suggestedPercentages)` alongside the existing Role-Based check.
- **`update()`**: currently has no business-rule validation at all. Before saving, merge `dto` onto
  the loaded `merchantTipRule` (the same shape `Object.assign` already produces) and run *both*
  checks against the merged values:
  - Role-Based: if the merged `tipDistributionMethod === 'role_based'`, `staffPercentage` /
    `kitchenPercentage` / `managerPercentage` must all be present and sum to `1` (±0.01) — lifting
    the existing `create()` logic into a second private helper (`validateRoleBasedSum`) so both
    methods call the same code instead of duplicating the inline block.
  - Suggested Percentages: `validateSuggestedPercentagesSum` as above, using the merged
    `tipCalculationMethod`/`suggestedPercentages`.

### `CreateMerchantTipRuleDto`

No changes — `@Max(1, { each: true })` on `suggestedPercentages` (added previously) stays as a
defense-in-depth per-element cap; the new check is a cross-field sum rule that class-validator
decorators can't express, so it lives in the service like the Role-Based check does.

## Frontend (`x7-pos-backoffice`)

### `TipRulesView.tsx`

- New derived value: `const suggestedPercentagesSum = suggestedPercentages.reduce((a, b) => a + b, 0);`
- `arraysValid` changes for the `'percentage'` branch:
  ```ts
  const arraysValid =
    tipCalculationMethod === 'percentage'
      ? suggestedPercentagesSum === 100
      : tipCalculationMethod === 'fixed_amount'
        ? fixedAmountOptions.length > 0
        : true;
  ```
- New inline error message, shown under the chip list when `tipCalculationMethod === 'percentage'`
  and `suggestedPercentagesSum !== 100` (mirrors the existing Role-Based message style/placement):
  ```tsx
  {tipCalculationMethod === 'percentage' && suggestedPercentagesSum !== 100 && (
    <span className="text-[11px] text-[#ae001a] font-bold">
      Suggested percentages must sum to 100
    </span>
  )}
  ```
- No changes to `addPercentage`/`removePercentage` — chips stay manually entered/removed; no
  auto-balancing of the last chip.

## Testing

**Frontend** (`TipRulesView.test.tsx`):
- Update the existing "adds and removes suggested-percentage chips" test — today it leaves
  15% + 20% = 35% and doesn't assert on submit state; add an assertion that submit stays disabled
  at 35% and the new error message is visible.
- New test: submit stays disabled at 35% (15+20), becomes enabled at exactly 100 (e.g. adding 65
  more, or starting over with 20+80), and disabled again if a chip is removed and the sum drops
  below 100.
- New test: a single 100% chip (one worker) is valid and enables submit (all other required fields
  filled).

**Backend** (`merchant-tip-rule.service.spec.ts`):
- `create()`: rejects `tipCalculationMethod: 'percentage'` with `suggestedPercentages` summing to
  `0.35` (35%); accepts `[1]` (single 100% worker) and `[0.2, 0.8]` (sums to 1, within tolerance);
  the check is skipped entirely for `fixed_amount`/`custom` methods.
- `update()`: same three cases as `create()`, exercised via `PATCH`; additionally, a case where the
  PATCH body doesn't include `suggestedPercentages` at all but does change something else — the
  persisted (pre-existing) percentages are used for the sum check, not treated as absent/valid.
- `update()`: Role-Based sum-to-100 is now enforced too — a PATCH that sets
  `tipDistributionMethod: 'role_based'` with percentages summing to `0.9` is rejected, closing the
  gap flagged in `2026-07-09-tip-rules-crud-lifecycle-design.md`.
- Final verification: `npx jest merchant-tip-rule` (backend) and the `TipRulesView.test.tsx` suite
  (frontend) both green; `npx tsc --build --noEmit --force` clean in `x7-pos-backoffice`.

## Out of scope

- Auto-balancing chips (e.g. suggesting the remainder needed to reach 100) — manual entry only.
- Changing the field's label/copy or the DTO's `ApiProperty` description to reflect the new
  "worker distribution" meaning instead of the old "customer choice" framing — flagged as a
  follow-up, not bundled here to avoid unrelated copy churn in a validation-focused change.
- Backfilling or flagging existing persisted rules whose suggested-percentages don't sum to 100.
- Any change to `maximumTipPercentage` or per-chip bounds (already handled in the prior change).
