# Tip Rules — Suggested Percentages Must Sum to Exactly 100% Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Suggested Percentages` on a Merchant Tip Rule (the tag-input chips shown when `tipCalculationMethod === 'percentage'`) require its entries to sum to exactly 100% — never less, never more — on both create and update, in both repos.

**Architecture:** Two independent-but-parallel changes: (1) `x7-pos-back-end` adds a cross-field sum check in `MerchantTipRuleService` (a `@Min`/`@Max` class-validator decorator can't express "these array elements must sum to N", so it lives in the service, mirroring the existing Role-Based sum check); (2) `x7-pos-backoffice` adds the same sum constraint to `TipRulesView.tsx`'s client-side validity computation and shows an inline error message. Bundled in: the backend's `update()` currently runs zero business-rule validation (not even the pre-existing Role-Based check) — both new and existing sum checks are wired into `update()` in the same pass.

**Tech Stack:** NestJS + TypeORM + class-validator + Jest (`x7-pos-back-end`); React 19 + TypeScript + Vitest + Testing Library (`x7-pos-backoffice`).

## Global Constraints

- Sum tolerance: **exact equality (`=== 100`)** on the frontend (chips are always whole integers via `parseInt`, no float drift possible). **`±0.01` tolerance** on the backend (values arrive divided by 100 as fractions, e.g. `0.2 + 0.8 = 0.9999999999999999`), matching the existing Role-Based check's tolerance.
- The rule applies **whenever `tipCalculationMethod === 'percentage'`**, regardless of `tipDistributionMethod` (Individual, Pool, or Role-Based) — confirmed with the user, not scoped to Individual only.
- No backfill/migration for existing rows whose suggested-percentages don't already sum to 100 — the check only runs on new `create`/`update` payloads; editing such a row requires fixing the split first.
- No changes to `maximumTipPercentage` bounds, per-chip caps, copy/labels, or `ApiProperty` descriptions — out of scope for this plan.
- Spec: `docs/superpowers/specs/2026-07-17-tip-rules-suggested-percentages-sum-100-design.md`.

---

### Task 1: Backend — sum validation in `create()`, extracted for reuse

**Files:**
- Modify: `x7-pos-back-end/src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.ts:1-129`
- Test: `x7-pos-back-end/src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.spec.ts`

**Interfaces:**
- Produces: `MerchantTipRuleService.validateRoleBasedSum(tipDistributionMethod: TipDistributionMethod, staffPercentage?: number, kitchenPercentage?: number, managerPercentage?: number): void` (private) — throws via `ErrorHandler.invalidInput` if invalid, otherwise returns.
- Produces: `MerchantTipRuleService.validateSuggestedPercentagesSum(tipCalculationMethod: TipCalculationMethod, suggestedPercentages?: number[]): void` (private) — same throw contract.
- Consumed by: Task 2 (`update()`, same file).

- [ ] **Step 1: Fix the existing `create` DTO fixture so it doesn't accidentally violate the new rule**

  In `merchant-tip-rule.service.spec.ts`, `mockCreateMerchantTipRuleDto` currently has `tipCalculationMethod: TipCalculationMethod.PERCENTAGE` with `suggestedPercentages: [10, 15, 20]` (sums to 45, not 1). Every existing `Create Merchant Tip Rule` test reuses this fixture, so once validation is wired in, they'd all start throwing. Fix the fixture first, before implementing the check, so nothing else needs to change:

  ```ts
  const mockCreateMerchantTipRuleDto: CreateMerchantTipRuleDto = {
    name: 'Test Merchant Tip Rule',
    tipCalculationMethod: TipCalculationMethod.PERCENTAGE,
    tipDistributionMethod: TipDistributionMethod.INDIVIDUAL,
    suggestedPercentages: [0.5, 0.3, 0.2],
    fixedAmountOptions: [1, 2, 3],
    allowCustomTip: true,
    maximumTipPercentage: 25,
    autoDistribute: true,
  };
  ```

  (Only the `suggestedPercentages` line changes, from `[10, 15, 20]` to `[0.5, 0.3, 0.2]`.)

- [ ] **Step 2: Run the existing suite to confirm it's still green (sanity check, no behavior change yet)**

  Run: `cd "x7-pos-back-end" && npx jest merchant-tip-rule.service.spec.ts`
  Expected: all existing tests PASS (this step only changed inert fixture data; no validation logic exists yet).

- [ ] **Step 3: Write the new failing tests for the sum check**

  Add these inside the existing `describe('Create Merchant Tip Rule', ...)` block in `merchant-tip-rule.service.spec.ts`, after the last existing `it(...)` in that block (`'scopes the createdBy lookup to id/username/email only'`):

  ```ts
    it('rejects suggested percentages that do not sum to 100 for percentage calculation', async () => {
      await expect(
        service.create(
          { ...mockCreateMerchantTipRuleDto, suggestedPercentages: [0.15, 0.2] },
          mockMerchantAdminUser,
        ),
      ).rejects.toThrow('Suggested percentages must sum to 100%');
    });

    it('accepts a single 100% suggested percentage (one worker takes the full tip)', async () => {
      jest.spyOn(merchantRepository, 'findOne').mockResolvedValue({
        id: 10,
        companyId: 7,
      } as Merchant);
      jest.spyOn(companyRepository, 'findOne').mockResolvedValue({
        id: 7,
      } as Company);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({
        id: 1,
      } as User);
      jest
        .spyOn(merchantTipRuleRepository, 'create')
        .mockReturnValue(mockMerchantTipRule as MerchantTipRule);
      jest
        .spyOn(merchantTipRuleRepository, 'save')
        .mockResolvedValue(mockMerchantTipRule as MerchantTipRule);

      await expect(
        service.create(
          { ...mockCreateMerchantTipRuleDto, suggestedPercentages: [1] },
          mockMerchantAdminUser,
        ),
      ).resolves.toBeDefined();
    });

    it('skips the sum check entirely for non-percentage calculation methods', async () => {
      jest.spyOn(merchantRepository, 'findOne').mockResolvedValue({
        id: 10,
        companyId: 7,
      } as Merchant);
      jest.spyOn(companyRepository, 'findOne').mockResolvedValue({
        id: 7,
      } as Company);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({
        id: 1,
      } as User);
      jest
        .spyOn(merchantTipRuleRepository, 'create')
        .mockReturnValue(mockMerchantTipRule as MerchantTipRule);
      jest
        .spyOn(merchantTipRuleRepository, 'save')
        .mockResolvedValue(mockMerchantTipRule as MerchantTipRule);

      await expect(
        service.create(
          {
            ...mockCreateMerchantTipRuleDto,
            tipCalculationMethod: TipCalculationMethod.FIXED_AMOUNT,
            suggestedPercentages: [],
            fixedAmountOptions: [5, 10],
          },
          mockMerchantAdminUser,
        ),
      ).resolves.toBeDefined();
    });
  ```

- [ ] **Step 4: Run the suite and confirm the three new tests fail**

  Run: `cd "x7-pos-back-end" && npx jest merchant-tip-rule.service.spec.ts`
  Expected: FAIL — the 3 new tests fail because `service.create` has no sum-validation logic yet (the "rejects..." test fails because nothing throws; the other two already pass trivially since nothing blocks them — that's fine, they'll stay passing once the code exists too).

- [ ] **Step 5: Implement the two private validators and wire the new one into `create()`**

  In `merchant-tip-rule.service.ts`, add this import alongside the existing `TipDistributionMethod` import:

  ```ts
  import { TipCalculationMethod } from '../constants/tip-calculation-method.enum';
  ```

  Replace the `create()` method (currently lines 53–76 contain the inline Role-Based check) with:

  ```ts
  private validateRoleBasedSum(
    tipDistributionMethod: TipDistributionMethod,
    staffPercentage?: number,
    kitchenPercentage?: number,
    managerPercentage?: number,
  ): void {
    if (tipDistributionMethod !== TipDistributionMethod.ROLE_BASED) {
      return;
    }

    if (
      staffPercentage == null ||
      kitchenPercentage == null ||
      managerPercentage == null
    ) {
      ErrorHandler.invalidInput(
        'Role based distribution requires all percentage fields',
      );
    }

    const pctTotal =
      Number(staffPercentage) + Number(kitchenPercentage) + Number(managerPercentage);

    if (Math.abs(pctTotal - 1) > 0.01) {
      ErrorHandler.invalidInput('Tip distribution percentages must total 1');
    }
  }

  private validateSuggestedPercentagesSum(
    tipCalculationMethod: TipCalculationMethod,
    suggestedPercentages?: number[],
  ): void {
    if (tipCalculationMethod !== TipCalculationMethod.PERCENTAGE) {
      return;
    }

    const sum = (suggestedPercentages ?? []).reduce(
      (acc, n) => acc + Number(n),
      0,
    );

    if (Math.abs(sum - 1) > 0.01) {
      ErrorHandler.invalidInput('Suggested percentages must sum to 100%');
    }
  }

  async create(
    dto: CreateMerchantTipRuleDto,
    user: AuthenticatedUser,
  ): Promise<OneMerchantTipRuleResponseDto> {
    this.validateRoleBasedSum(
      dto.tipDistributionMethod,
      dto.staffPercentage,
      dto.kitchenPercentage,
      dto.managerPercentage,
    );
    this.validateSuggestedPercentagesSum(
      dto.tipCalculationMethod,
      dto.suggestedPercentages,
    );

    const { merchant, companyId } = await resolveMerchantContext(
  ```

  (Everything from `const { merchant, companyId } = await resolveMerchantContext(` onward in the original `create()` body is unchanged — only the block above it is replaced.)

- [ ] **Step 6: Run the suite and confirm everything passes**

  Run: `cd "x7-pos-back-end" && npx jest merchant-tip-rule.service.spec.ts`
  Expected: PASS — all tests green, including the 3 new ones.

- [ ] **Step 7: Commit**

  ```bash
  git add src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.ts src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.spec.ts
  git commit -m "feat: require suggested percentages to sum to 100% on tip rule create"
  ```

---

### Task 2: Backend — wire both sum checks into `update()`, closing the pre-existing gap

**Files:**
- Modify: `x7-pos-back-end/src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.ts:230-271` (the `update()` method, after Task 1's changes)
- Test: `x7-pos-back-end/src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.spec.ts`

**Interfaces:**
- Consumes: `validateRoleBasedSum` and `validateSuggestedPercentagesSum` from Task 1 (same class, private methods, called via `this.`).

- [ ] **Step 1: Write the failing tests**

  Add these inside the existing `describe('Update Merchant Tip Rule', ...)` block, after the last existing `it(...)` (`'always sets updatedBy and updatedAt from the session user, ignoring any client value'`):

  ```ts
    it('rejects an update where suggested percentages do not sum to 100 for percentage calculation', async () => {
      jest
        .spyOn(merchantTipRuleRepository, 'findOne')
        .mockResolvedValue(mockMerchantTipRule as MerchantTipRule);
      jest.spyOn(merchantRepository, 'findOne').mockResolvedValue({
        id: 10,
        companyId: (mockMerchantTipRule.company as Company).id,
      } as Merchant);

      await expect(
        service.update(
          1,
          {
            tipCalculationMethod: TipCalculationMethod.PERCENTAGE,
            suggestedPercentages: [0.5, 0.2],
          },
          mockMerchantAdminUser,
        ),
      ).rejects.toThrow('Suggested percentages must sum to 100%');
    });

    it('accepts an update where suggested percentages sum to exactly 100', async () => {
      jest
        .spyOn(merchantTipRuleRepository, 'findOne')
        .mockResolvedValue(mockMerchantTipRule as MerchantTipRule);
      jest.spyOn(merchantRepository, 'findOne').mockResolvedValue({
        id: 10,
        companyId: (mockMerchantTipRule.company as Company).id,
      } as Merchant);
      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue({ id: 1 } as User);
      jest
        .spyOn(merchantTipRuleRepository, 'save')
        .mockImplementation(async (entity) => entity as MerchantTipRule);

      await expect(
        service.update(
          1,
          {
            tipCalculationMethod: TipCalculationMethod.PERCENTAGE,
            suggestedPercentages: [0.2, 0.8],
          },
          mockMerchantAdminUser,
        ),
      ).resolves.toBeDefined();
    });

    it('falls back to the persisted suggestedPercentages when the update payload omits them', async () => {
      jest.spyOn(merchantTipRuleRepository, 'findOne').mockResolvedValue({
        ...mockMerchantTipRule,
        tipCalculationMethod: TipCalculationMethod.PERCENTAGE,
        suggestedPercentages: [0.3, 0.3],
      } as MerchantTipRule);
      jest.spyOn(merchantRepository, 'findOne').mockResolvedValue({
        id: 10,
        companyId: (mockMerchantTipRule.company as Company).id,
      } as Merchant);
      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue({ id: 1 } as User);

      await expect(
        service.update(1, { name: 'Renamed only' }, mockMerchantAdminUser),
      ).rejects.toThrow('Suggested percentages must sum to 100%');
    });

    it('rejects an update that sets Role-Based distribution without percentages summing to 100 (closes the pre-existing update() gap)', async () => {
      jest
        .spyOn(merchantTipRuleRepository, 'findOne')
        .mockResolvedValue(mockMerchantTipRule as MerchantTipRule);
      jest.spyOn(merchantRepository, 'findOne').mockResolvedValue({
        id: 10,
        companyId: (mockMerchantTipRule.company as Company).id,
      } as Merchant);

      await expect(
        service.update(
          1,
          {
            tipDistributionMethod: TipDistributionMethod.ROLE_BASED,
            staffPercentage: 0.5,
            kitchenPercentage: 0.3,
            managerPercentage: 0.1,
          },
          mockMerchantAdminUser,
        ),
      ).rejects.toThrow('Tip distribution percentages must total 1');
    });
  ```

- [ ] **Step 2: Run the suite and confirm the 4 new tests fail**

  Run: `cd "x7-pos-back-end" && npx jest merchant-tip-rule.service.spec.ts`
  Expected: FAIL on all 4 new tests — `update()` has no business-rule validation yet, so nothing throws and nothing blocks the "accepts" case from a different, unrelated reason.

- [ ] **Step 3: Wire both validators into `update()`**

  In `merchant-tip-rule.service.ts`, in the `update()` method, insert the validation block right after `merchantTipRule.updatedAt = new Date();` and before `Object.assign(merchantTipRule, dto);`:

  ```ts
    merchantTipRule.updatedBy = updatedByUser;
    merchantTipRule.updatedAt = new Date();

    this.validateRoleBasedSum(
      dto.tipDistributionMethod ?? merchantTipRule.tipDistributionMethod,
      dto.staffPercentage ?? merchantTipRule.staffPercentage,
      dto.kitchenPercentage ?? merchantTipRule.kitchenPercentage,
      dto.managerPercentage ?? merchantTipRule.managerPercentage,
    );
    this.validateSuggestedPercentagesSum(
      dto.tipCalculationMethod ?? merchantTipRule.tipCalculationMethod,
      dto.suggestedPercentages ?? merchantTipRule.suggestedPercentages,
    );

    Object.assign(merchantTipRule, dto);
  ```

- [ ] **Step 4: Run the suite and confirm everything passes**

  Run: `cd "x7-pos-back-end" && npx jest merchant-tip-rule.service.spec.ts`
  Expected: PASS — all tests green, including the 4 new ones. (`mockUpdateMerchantTipRuleDto`, used by the pre-existing update tests, sets `tipCalculationMethod: FIXED_AMOUNT` and `tipDistributionMethod: POOL`, so both new checks are skipped for those — no other fixture changes needed.)

- [ ] **Step 5: Run the full backend test suite for this module (regression check)**

  Run: `cd "x7-pos-back-end" && npx jest merchant-tip-rule`
  Expected: PASS — both `merchant-tip-rule.service.spec.ts` and `merchant-tip-rule.controller.spec.ts` green (the controller spec mocks the service entirely, so it's unaffected by this change).

- [ ] **Step 6: Commit**

  ```bash
  git add src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.ts src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.spec.ts
  git commit -m "fix: enforce sum-to-100 validation in tip rule update(), closing pre-existing gap"
  ```

---

### Task 3: Frontend — enforce the sum-to-100 constraint in `TipRulesView.tsx`

**Files:**
- Modify: `x7-pos-backoffice/src/components/MerchantFrame/views/TipRulesView.tsx:149-154` (the `arraysValid` block), `:304-321` (chip list JSX)
- Test: `x7-pos-backoffice/src/components/MerchantFrame/views/TipRulesView.test.tsx`

**Interfaces:**
- Produces: `suggestedPercentagesSum: number` (derived local variable in the form component) — sum of the whole-integer `suggestedPercentages` chip array.
- `arraysValid` (existing derived boolean, already consumed by `isValid` at line 205) changes meaning for the `'percentage'` branch from "at least one chip" to "chips sum to exactly 100".

- [ ] **Step 1: Update existing tests that rely on "any positive chip is valid enough" — neutral text change, no behavior change yet**

  Five tests in `TipRulesView.test.tsx` add a single `15` suggested-percentage chip purely to satisfy the current "at least one chip" check, then assert the submit button becomes enabled (or that a POST fires). Under the new rule a lone `15%` chip won't sum to 100, so change each of these to add a single `100` chip instead (matching the design's "one worker gets 100%" example) — this is a no-op against *today's* code (any positive value already passes), but sets these tests up correctly for the code change in Step 4.

  **1a.** Test `'disables submit until name, max tip %, and a suggested-percentage chip are provided'`:

  ```ts
    await user.type(screen.getByLabelText('Suggested Percentages'), '100');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    expect(submitButton).toBeEnabled();
  });
  ```

  (Only the `'15'` → `'100'` change on the `user.type` line; everything else in that test is unchanged.)

  **1b.** Test `'disables submit when Maximum Tip Percentage is out of the 0-100 range'`:

  ```ts
    await user.type(screen.getByLabelText('Rule Name'), 'New Split');
    await user.type(screen.getByLabelText('Suggested Percentages'), '100');
    await user.click(screen.getByLabelText('Add suggested percentage'));
  ```

  (Same `'15'` → `'100'` change, same line shape.)

  **1c.** Test `'shows Distribution Percentages only for Role-Based distribution and requires the split to sum to 100'`:

  ```ts
    await user.type(screen.getByLabelText('Rule Name'), 'Role Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '100');
    await user.click(screen.getByLabelText('Add suggested percentage'));
  ```

  **1d.** Test `'submits a POST request with converted values and prepends the new rule on success'` — three changes in this one test:

  ```ts
    const createdRule: MerchantTipRule = {
      id: 4,
      name: 'New Split',
      tipCalculationMethod: 'percentage',
      tipDistributionMethod: 'individual',
      suggestedPercentages: [1],
      fixedAmountOptions: [],
      allowCustomTip: false,
      maximumTipPercentage: 30,
      autoDistribute: false,
      staffPercentage: null,
      kitchenPercentage: null,
      managerPercentage: null,
      status: 'active',
    };
  ```

  ```ts
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));
    await user.type(screen.getByLabelText('Rule Name'), 'New Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '100');
    await user.click(screen.getByLabelText('Add suggested percentage'));
    await user.click(screen.getByRole('button', { name: /save tip rule/i }));
  ```

  ```ts
    expect(body.suggestedPercentages).toEqual([1]);
    expect(body.fixedAmountOptions).toEqual([]);
    expect(body.maximumTipPercentage).toBe(30);
  ```

  (`suggestedPercentages: [0.15]` → `[1]` in the mock, `'15'` → `'100'` in the typed input, `toEqual([0.15])` → `toEqual([1])` in the assertion.)

  **1e.** Test `'shows an error toast and closes the modal when create fails'`:

  ```ts
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));
    await user.type(screen.getByLabelText('Rule Name'), 'New Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '100');
    await user.click(screen.getByLabelText('Add suggested percentage'));
    await user.click(screen.getByRole('button', { name: /save tip rule/i }));
  ```

- [ ] **Step 2: Run the suite and confirm it's still green (sanity check)**

  Run: `cd "x7-pos-backoffice" && npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx`
  Expected: PASS — no behavior changed yet, only chip values in test setup.

- [ ] **Step 3: Extend the chip add/remove test and write new failing tests for the sum rule**

  Replace the body of the existing `'adds and removes suggested-percentage chips'` test to also assert the new error message appears once the two chips leave the sum below 100:

  ```ts
  it('adds and removes suggested-percentage chips', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    await user.type(screen.getByLabelText('Suggested Percentages'), '15');
    await user.click(screen.getByLabelText('Add suggested percentage'));
    await user.type(screen.getByLabelText('Suggested Percentages'), '20');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    const dialog = screen.getByRole('dialog', { name: /add tip rule/i });
    expect(within(dialog).getByText('15%')).toBeInTheDocument();
    expect(within(dialog).getByText('20%')).toBeInTheDocument();
    expect(screen.getByText(/suggested percentages must sum to 100/i)).toBeInTheDocument();

    await user.click(within(dialog).getByLabelText('Remove 15%'));

    expect(within(dialog).queryByText('15%')).not.toBeInTheDocument();
    expect(within(dialog).getByText('20%')).toBeInTheDocument();
  });
  ```

  (Added: the `expect(screen.getByText(/suggested percentages must sum to 100/i))...` line, right after the two chips are confirmed present, before the removal step. Nothing else in this test changes.)

  Then add two new tests directly after it:

  ```ts
  it('disables submit until suggested percentages sum to exactly 100, using a multi-chip split', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    await user.type(screen.getByLabelText('Rule Name'), 'Two Worker Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '20');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    const submitButton = screen.getByRole('button', { name: /save tip rule/i });
    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/suggested percentages must sum to 100/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Suggested Percentages'), '80');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    expect(submitButton).toBeEnabled();
    expect(screen.queryByText(/suggested percentages must sum to 100/i)).not.toBeInTheDocument();

    const dialog = screen.getByRole('dialog', { name: /add tip rule/i });
    await user.click(within(dialog).getByLabelText('Remove 80%'));

    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/suggested percentages must sum to 100/i)).toBeInTheDocument();
  });

  it('disables submit when suggested percentages add up to more than 100', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    await user.type(screen.getByLabelText('Rule Name'), 'Overallocated Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '60');
    await user.click(screen.getByLabelText('Add suggested percentage'));
    await user.type(screen.getByLabelText('Suggested Percentages'), '50');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    expect(screen.getByRole('button', { name: /save tip rule/i })).toBeDisabled();
    expect(screen.getByText(/suggested percentages must sum to 100/i)).toBeInTheDocument();
  });
  ```

- [ ] **Step 4: Run the suite and confirm the new/extended tests fail**

  Run: `cd "x7-pos-backoffice" && npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx`
  Expected: FAIL — the extended chip test and the 2 new tests fail because there's no sum check or error message yet (`screen.getByText(/suggested percentages must sum to 100/i)` won't be found).

- [ ] **Step 5: Implement the sum constraint and inline error message**

  In `TipRulesView.tsx`, replace the `arraysValid` block (currently lines 149–154):

  ```ts
  const suggestedPercentagesSum = suggestedPercentages.reduce((a, b) => a + b, 0);

  const arraysValid =
    tipCalculationMethod === 'percentage'
      ? suggestedPercentagesSum === 100
      : tipCalculationMethod === 'fixed_amount'
        ? fixedAmountOptions.length > 0
        : true;
  ```

  Then, in the chip-list JSX (currently lines 304–321, the `<div className="flex flex-wrap gap-1.5">...chips...</div>` block), add the inline error message right after that closing `</div>`, still inside the outer `tipCalculationMethod === 'percentage' && (...)` wrapper:

  ```tsx
                <div className="flex flex-wrap gap-1.5">
                  {suggestedPercentages.map((pct, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 text-[11px] font-semibold bg-[#f2ede5] text-[#1d1c17] px-2 py-1 rounded"
                    >
                      {pct}%
                      <button
                        type="button"
                        onClick={() => removePercentage(i)}
                        aria-label={`Remove ${pct}%`}
                        className="text-[#5f5e5e] hover:text-[#ae001a]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                {suggestedPercentagesSum !== 100 && (
                  <span className="text-[11px] text-[#ae001a] font-bold">
                    Suggested percentages must sum to 100
                  </span>
                )}
              </div>
            )}
  ```

  (Only the new `{suggestedPercentagesSum !== 100 && (...)}` block is added, immediately after the existing chips `</div>` and before the two closing tags that were already there.)

- [ ] **Step 6: Run the suite and confirm everything passes**

  Run: `cd "x7-pos-backoffice" && npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx`
  Expected: PASS on every test **except** `'submits a PATCH request and replaces the row on success'` (edit-mode) — that one is expected to fail here; it's fixed in Step 7 below, because it opens a legacy fixture (`MOCK_RULES[0]`) whose `suggestedPercentages` (`[0.15, 0.18, 0.2]`, summing to 53%) predates this rule.

- [ ] **Step 7: Fix the edit-mode PATCH test to top up a legacy (grandfathered) split before saving**

  `MOCK_RULES[0]` (`'Standard Percentage Split'`) has `suggestedPercentages: [0.15, 0.18, 0.2]` — 53%, a legacy value that predates this rule and is left as-is per the "no backfill" decision. Editing it now correctly requires fixing the split first. Update the test `'submits a PATCH request and replaces the row on success'` to do exactly that — add one more chip to reach 100 before saving:

  ```ts
  it('submits a PATCH request and replaces the row on success', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    const updatedRule: MerchantTipRule = { ...MOCK_RULES[0], name: 'Updated Split' };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: updatedRule }),
      }),
    );

    await user.click(within(row).getByLabelText('Edit tip rule'));
    const nameInput = screen.getByLabelText('Rule Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Split');
    await user.type(screen.getByLabelText('Suggested Percentages'), '47');
    await user.click(screen.getByLabelText('Add suggested percentage'));
    await user.click(screen.getByRole('button', { name: /save tip rule/i }));

    expect(await screen.findByText('Updated Split')).toBeInTheDocument();
    expect(screen.getByText('Tip rule updated successfully')).toBeInTheDocument();
  });
  ```

  (Added the two lines that add a `47` chip — `15 + 18 + 20 + 47 = 100` — right before the save click; everything else in the test is unchanged.)

- [ ] **Step 8: Run the full `TipRulesView` suite and confirm everything passes**

  Run: `cd "x7-pos-backoffice" && npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx`
  Expected: PASS — all tests green.

- [ ] **Step 9: Commit**

  ```bash
  git add src/components/MerchantFrame/views/TipRulesView.tsx src/components/MerchantFrame/views/TipRulesView.test.tsx
  git commit -m "feat: require suggested percentages to sum to exactly 100% in Tip Rules form"
  ```

---

### Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend module suite**

  Run: `cd "x7-pos-back-end" && npx jest merchant-tip-rule`
  Expected: PASS — `merchant-tip-rule.service.spec.ts` and `merchant-tip-rule.controller.spec.ts` both green.

- [ ] **Step 2: Run the full frontend suite for this view**

  Run: `cd "x7-pos-backoffice" && npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx`
  Expected: PASS — all tests green.

- [ ] **Step 3: Type-check the frontend**

  Run: `cd "x7-pos-backoffice" && npx tsc --build --noEmit --force`
  Expected: PASS — no type errors. (Per project convention: plain `tsc --noEmit` at the repo root is a no-op here; `--build --force` is required to actually type-check.)

- [ ] **Step 4: No commit in this task** — it's verification-only. If any step fails, return to the relevant task, fix, and re-commit there.

## Out of scope

- Auto-balancing chips (suggesting the remainder needed to reach 100).
- Changing the field's label/copy or the DTO's `ApiProperty` description.
- Backfilling or flagging existing persisted rules whose suggested-percentages don't sum to 100.
- Any change to `maximumTipPercentage` or per-chip bounds.
