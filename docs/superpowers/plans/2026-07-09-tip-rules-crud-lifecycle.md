# Tip Rules — Full CRUD Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Merchant Admins full Create / View Details / Update / Soft-Delete lifecycle for Tip Rules in `TipRulesView.tsx`, matching the pattern already shipped for Tax Rules, and finish the in-progress backend audit-trail/security refactor of `merchant-tip-rule` that the frontend CRUD depends on.

**Architecture:** Two repos. `x7-pos-back-end` (branch `subcripcion`) gets a small, targeted fix to `MerchantTipRuleService` (audit trail on update, password-leak fix on findOne, username in select lists) — no new endpoints, no DTO redesign (that part is already done). `x7-pos-backoffice` (branch `rafaalejandro_subscription`) gets `TipRuleFormModal` (create+edit, dynamic tag-inputs, role-based percentage split), `TipRuleDetailModal`, and a bidirectional `ConfirmStatusDialog`, all added directly to `TipRulesView.tsx` — no new files, following the `TaxRulesView.tsx` precedent exactly.

**Tech Stack:** NestJS + TypeORM + class-validator (backend), React 19 + TypeScript + Tailwind v4 + Vitest + Testing Library (frontend).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-09-tip-rules-crud-lifecycle-design.md` — read it if anything below is ambiguous.
- `suggestedPercentages` and Staff/Kitchen/Manager % are stored as **fractions** (`0.15` = 15%). The form takes whole-number input (`15`) and divides by 100 before sending. `fixedAmountOptions` and `maximumTipPercentage` are **whole numbers**, sent as-is — no conversion.
- `tipCalculationMethod === 'custom'` shows neither tag-input. `'percentage'` shows only Suggested Percentages. `'fixed_amount'` shows only Fixed Amount Options.
- On create, `suggestedPercentages` and `fixedAmountOptions` are **always both present** in the POST body — `[]` for whichever the active method doesn't use (the backend DTO's `@IsNotEmpty()` accepts `[]` but not `undefined`).
- Distribution Percentages (Staff/Kitchen/Manager %) render only when Distribution Method = Role-Based, and are then all three required, summing to 100 (±1, mirroring the backend's ±0.01-of-1 check on the /100 fraction).
- Soft-delete is `PATCH { status: 'inactive' }`, never the real `DELETE` route.
- No new files — `TipRuleFormModal`, `TipRuleDetailModal`, `ConfirmStatusDialog` all live inside `TipRulesView.tsx`, matching `TaxRulesView.tsx`.
- `x7-pos-back-end` already has uncommitted, in-progress changes on `merchant-tip-rule` files (session-scoped `create`/`findAll`/`findOne`, trimmed `CreateMerchantTipRuleDto`). Do not revert or fight that state — build on top of it.

---

## Task 1: Backend — `MerchantTipRuleService` audit-trail & security fixes

**Files:**
- Modify: `../x7-pos-back-end/src/core/configuration/merchant-tip-rule/dto/update-merchant-tip-rule.dto.ts`
- Modify: `../x7-pos-back-end/src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.ts`
- Modify: `../x7-pos-back-end/src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.spec.ts`

**Interfaces:**
- Produces: `MerchantTipRuleService.update()` now always derives `updatedBy`/`updatedAt` from the session user (no `dto.updatedById`). `findOne()` now runs through `createQueryBuilder` with a `select()` that excludes `password`/`resetToken`/`refreshToken`. `findAll()`/`findOne()` share a `TIP_RULE_SELECT_FIELDS` constant that includes `createdBy.username`/`updatedBy.username`. `create()`'s `createdByUser` lookup is now scoped with `AUDIT_USER_SELECT`. None of this changes the controller or the response DTO shapes — later frontend tasks consume the same `GET/POST/PATCH /merchant-tip-rule` contract.

- [ ] **Step 1: Write a failing test — `update()` must derive `updatedBy`/`updatedAt` from the session user, not from the payload**

In `merchant-tip-rule.service.spec.ts`, inside the `describe('Update Merchant Tip Rule', ...)` block (currently ends around line 575, right before `describe('Remove Merchant Tip Rule', ...)`), add:

```ts
    it('always sets updatedBy and updatedAt from the session user, ignoring any client value', async () => {
      const findOneSpy = jest.spyOn(merchantTipRuleRepository, 'findOne');
      findOneSpy.mockResolvedValue(mockMerchantTipRule as MerchantTipRule);
      jest.spyOn(merchantRepository, 'findOne').mockResolvedValue({
        id: 10,
        companyId: (mockMerchantTipRule.company as Company).id,
      } as Merchant);
      const sessionUser = { id: 1, username: 'session-user', email: 'session@test.com' } as User;
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(sessionUser);
      const saveSpy = jest
        .spyOn(merchantTipRuleRepository, 'save')
        .mockImplementation(async (entity) => entity as MerchantTipRule);

      await service.update(1, mockUpdateMerchantTipRuleDto, mockMerchantAdminUser);

      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedBy: sessionUser,
          updatedAt: expect.any(Date),
        }),
      );
    });
```

Do **not** run the suite yet — the fixture referenced by this test (`mockUpdateMerchantTipRuleDto`) currently declares `companyId`/`createdById`/`updatedById`, which Step 2 removes from the DTO type. Steps 2 and 3 must land together for the file to compile.

- [ ] **Step 2: Drop the stale fields from `UpdateMerchantTipRuleDto`**

Replace the full contents of `update-merchant-tip-rule.dto.ts` with:

```ts
//src/core/configuration/merchant-tip-rule/dto/update-merchant-tip-rule.dto.ts
import { PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CreateMerchantTipRuleDto } from './create-merchant-tip-rule.dto';

export class UpdateMerchantTipRuleDto extends PartialType(
  CreateMerchantTipRuleDto,
) {
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
```

- [ ] **Step 3: Fix the now-broken `mockUpdateMerchantTipRuleDto` fixture**

In `merchant-tip-rule.service.spec.ts`, replace the `mockUpdateMerchantTipRuleDto` object (currently lines 86–99) with:

```ts
  const mockUpdateMerchantTipRuleDto: UpdateMerchantTipRuleDto = {
    status: 'inactive',
    name: 'Updated Merchant Tip Rule',
    tipCalculationMethod: TipCalculationMethod.FIXED_AMOUNT,
    tipDistributionMethod: TipDistributionMethod.POOL,
    suggestedPercentages: [5, 10, 15],
    fixedAmountOptions: [2, 4, 6],
    allowCustomTip: false,
    maximumTipPercentage: 20,
    autoDistribute: false,
  };
```

- [ ] **Step 4: Run the suite and confirm the new test fails for the right reason**

Run: `cd ../x7-pos-back-end && npx jest src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.spec.ts -t "always sets updatedBy and updatedAt"`
Expected: FAIL. The current `update()` only sets `updatedBy` when `dto.updatedById` is truthy — but that field no longer exists on the DTO, so `updatedBy` stays whatever `mockMerchantTipRule.updatedBy` already was (`{ id: 1 }`, not `sessionUser`), and `updatedAt` is never touched at all.

- [ ] **Step 5: Implement the audit-trail fix in `update()`**

In `merchant-tip-rule.service.ts`, add two constants right after the imports (before `@Injectable()`):

```ts
const AUDIT_USER_SELECT: (keyof User)[] = ['id', 'username', 'email'];
const TIP_RULE_SELECT_FIELDS = [
  'merchantTipRule',
  'company.id',
  'createdBy.id',
  'createdBy.username',
  'createdBy.email',
  'updatedBy.id',
  'updatedBy.username',
  'updatedBy.email',
  'merchant.id',
  'merchant.name',
];
```

Replace the `update()` method body from `if (dto.updatedById) {` through the closing `}` of that block (currently lines 237–247) with:

```ts
    const updatedByUser = await this.userRepository.findOne({
      where: { id: user.id },
      select: AUDIT_USER_SELECT,
    });
    if (!updatedByUser) {
      ErrorHandler.notFound('UpdatedBy user not found');
    }
    merchantTipRule.updatedBy = updatedByUser;
    merchantTipRule.updatedAt = new Date();
```

- [ ] **Step 6: Run the test again and confirm it passes**

Run: `cd ../x7-pos-back-end && npx jest src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.spec.ts -t "always sets updatedBy and updatedAt"`
Expected: PASS.

- [ ] **Step 7: Write a failing test — `findOne()` must use a scoped `queryBuilder.select()`, not raw `repository.findOne`**

Replace the entire `describe('Find One Merchant Tip Rule', ...)` block (currently lines 370–469) with:

```ts
  describe('Find One Merchant Tip Rule', () => {
    it('should throw error for invalid ID (null)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await expect(
        service.findOne(null as any, mockMerchantAdminUser),
      ).rejects.toThrow();
    });

    it('should throw error for invalid ID (zero)', async () => {
      await expect(
        service.findOne(0, mockMerchantAdminUser),
      ).rejects.toThrow();
    });

    it('should throw error for invalid ID (negative)', async () => {
      await expect(
        service.findOne(-1, mockMerchantAdminUser),
      ).rejects.toThrow();
    });

    it('should handle not found merchant tip rule', async () => {
      const qb = merchantTipRuleRepository.createQueryBuilder() as any;
      qb.getOne.mockResolvedValue(null);

      await expect(
        service.findOne(999, mockMerchantAdminUser),
      ).rejects.toThrow('Merchant Tip Rule not found');
    });

    it('scopes findOne to a safe field list via queryBuilder instead of loading raw relations', async () => {
      const qb = merchantTipRuleRepository.createQueryBuilder() as any;
      qb.getOne.mockResolvedValue(mockMerchantTipRule as MerchantTipRule);
      const repoFindOneSpy = jest.spyOn(merchantTipRuleRepository, 'findOne');
      jest.spyOn(merchantRepository, 'findOne').mockResolvedValue({
        id: 10,
        companyId: (mockMerchantTipRule.company as Company).id,
      } as Merchant);

      await service.findOne(1, mockMerchantAdminUser);

      expect(qb.select).toHaveBeenCalledWith(TIP_RULE_SELECT_FIELDS);
      expect(repoFindOneSpy).not.toHaveBeenCalled();
    });

    it('should return a merchant tip rule when found', async () => {
      const qb = merchantTipRuleRepository.createQueryBuilder() as any;
      qb.getOne.mockResolvedValue(mockMerchantTipRule as MerchantTipRule);
      jest.spyOn(merchantRepository, 'findOne').mockResolvedValue({
        id: 10,
        companyId: (mockMerchantTipRule.company as Company).id,
      } as Merchant);

      const result = await service.findOne(1, mockMerchantAdminUser);

      expect(result).toEqual({
        statusCode: 200,
        message: 'Merchant Tip Rule retrieved successfully',
        data: mockMerchantTipRule,
      });
    });

    it('forbids viewing a tip rule owned by a different company', async () => {
      const qb = merchantTipRuleRepository.createQueryBuilder() as any;
      qb.getOne.mockResolvedValue(mockMerchantTipRule as MerchantTipRule);
      jest
        .spyOn(merchantRepository, 'findOne')
        .mockResolvedValue({ id: 10, companyId: 999 } as Merchant);

      await expect(
        service.findOne(1, mockMerchantAdminUser),
      ).rejects.toThrow();
    });
  });
```

Add `TIP_RULE_SELECT_FIELDS` to the spec file's imports — since it's not exported from the service, redeclare it locally at the top of the spec file (right after the existing imports, before `describe('MerchantTipRuleService', ...)`):

```ts
const TIP_RULE_SELECT_FIELDS = [
  'merchantTipRule',
  'company.id',
  'createdBy.id',
  'createdBy.username',
  'createdBy.email',
  'updatedBy.id',
  'updatedBy.username',
  'updatedBy.email',
  'merchant.id',
  'merchant.name',
];
```

Also add `where` and `getOne` to the shared `mockQueryBuilder` in `beforeEach` (currently lines 102–110):

```ts
    const mockQueryBuilder: any = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockMerchantTipRule], 1]),
      getOne: jest.fn().mockResolvedValue(mockMerchantTipRule),
    };
```

- [ ] **Step 8: Run the suite and confirm the `Find One` tests fail for the right reason**

Run: `cd ../x7-pos-back-end && npx jest src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.spec.ts -t "Find One Merchant Tip Rule"`
Expected: FAIL — `findOne()` still calls `repository.findOne({ relations: [...] })`, so `qb.select`/`qb.getOne` are never invoked and the "scopes findOne" test's assertions fail.

- [ ] **Step 9: Rewrite `findOne()` to use the scoped queryBuilder**

Replace the `findOne()` method body (currently lines 186–213) with:

```ts
  async findOne(
    id: number,
    user: AuthenticatedUser,
  ): Promise<OneMerchantTipRuleResponseDto> {
    if (!Number.isInteger(id) || id < 1) {
      ErrorHandler.invalidId('ID must be a positive integer');
    }

    const merchantTipRule = await this.merchantTipRuleRepository
      .createQueryBuilder('merchantTipRule')
      .leftJoin('merchantTipRule.company', 'company')
      .leftJoin('merchantTipRule.createdBy', 'createdBy')
      .leftJoin('merchantTipRule.updatedBy', 'updatedBy')
      .leftJoin('merchantTipRule.merchant', 'merchant')
      .select(TIP_RULE_SELECT_FIELDS)
      .where('merchantTipRule.id = :id', { id })
      .andWhere('merchantTipRule.status IN (:...statuses)', {
        statuses: ['active', 'inactive'],
      })
      .getOne();

    if (!merchantTipRule) {
      ErrorHandler.merchantTipRuleNotFound();
    }

    await assertOwnsCompany(
      this.merchantRepository,
      user,
      merchantTipRule.company.id,
    );

    return {
      statusCode: 200,
      message: 'Merchant Tip Rule retrieved successfully',
      data: merchantTipRule,
    };
  }
```

- [ ] **Step 10: Run the suite and confirm the `Find One` tests pass**

Run: `cd ../x7-pos-back-end && npx jest src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.spec.ts -t "Find One Merchant Tip Rule"`
Expected: PASS (all 6 tests).

- [ ] **Step 11: Widen `findAll`'s select list and lock `create`'s audit lookup down — write the tests first**

In the `describe('Find All Merchant Tip Rules', ...)` block, add:

```ts
    it('includes username in the selected audit fields', async () => {
      const qb = merchantTipRuleRepository.createQueryBuilder() as any;
      qb.getManyAndCount.mockResolvedValue([[mockMerchantTipRule], 1]);

      await service.findAll({ page: 1, limit: 10 }, mockPortalAdminUser);

      expect(qb.select).toHaveBeenCalledWith(TIP_RULE_SELECT_FIELDS);
    });
```

In the `describe('Create Merchant Tip Rule', ...)` block, add:

```ts
    it('scopes the createdBy lookup to id/username/email only', async () => {
      jest.spyOn(merchantRepository, 'findOne').mockResolvedValue({
        id: 10,
        companyId: 7,
      } as Merchant);
      jest.spyOn(companyRepository, 'findOne').mockResolvedValue({
        id: 7,
      } as Company);
      const userFindOneSpy = jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue({ id: 1 } as User);
      jest
        .spyOn(merchantTipRuleRepository, 'create')
        .mockReturnValue(mockMerchantTipRule as MerchantTipRule);
      jest
        .spyOn(merchantTipRuleRepository, 'save')
        .mockResolvedValue(mockMerchantTipRule as MerchantTipRule);

      await service.create(mockCreateMerchantTipRuleDto, mockMerchantAdminUser);

      expect(userFindOneSpy).toHaveBeenCalledWith({
        where: { id: 1 },
        select: ['id', 'username', 'email'],
      });
    });
```

- [ ] **Step 12: Run and confirm both new tests fail**

Run: `cd ../x7-pos-back-end && npx jest src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.spec.ts -t "includes username|scopes the createdBy lookup"`
Expected: FAIL — `findAll`'s inline select array lacks `createdBy.username`/`updatedBy.username`; `create`'s `userRepository.findOne` call has no `select` option at all.

- [ ] **Step 13: Implement both fixes**

In `findAll()`, replace the inline `.select([...])` array (currently lines 138–147) with `.select(TIP_RULE_SELECT_FIELDS)`.

In `create()`, replace:

```ts
    const createdByUser = await this.userRepository.findOne({
      where: { id: user.id },
    });
```

with:

```ts
    const createdByUser = await this.userRepository.findOne({
      where: { id: user.id },
      select: AUDIT_USER_SELECT,
    });
```

- [ ] **Step 14: Run the full spec file and confirm everything passes**

Run: `cd ../x7-pos-back-end && npx jest src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.spec.ts`
Expected: PASS, all tests green.

- [ ] **Step 15: Commit**

```bash
cd ../x7-pos-back-end
git add src/core/configuration/merchant-tip-rule/dto/update-merchant-tip-rule.dto.ts src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.ts src/core/configuration/merchant-tip-rule/merchant-tip-rule.service.spec.ts
git commit -m "fix(merchant-tip-rule): derive updatedBy/updatedAt from session, close audit-user field leak"
```

---

## Task 2: Backend — final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd ../x7-pos-back-end && npx jest src/core/configuration/merchant-tip-rule`
Expected: PASS — both `merchant-tip-rule.service.spec.ts` and `merchant-tip-rule.controller.spec.ts` green.

- [ ] **Step 2: Run the TypeScript build**

Run: `cd ../x7-pos-back-end && npx tsc --noEmit`
Expected: no errors referencing `merchant-tip-rule`.

If either step surfaces failures outside `merchant-tip-rule` (e.g. the pre-existing `43 suites rotos (typeorm TS2307)` documented in project memory), confirm they're unrelated to this change and move on — do not fix unrelated pre-existing breakage in this task.

---

## Task 3: Frontend — extend `src/types/configuration.ts`

**Files:**
- Modify: `src/types/configuration.ts`

**Interfaces:**
- Produces: `MerchantTipRule` gains `createdAt?`, `updatedAt?`, `createdBy?: AuditUser | null`, `updatedBy?: AuditUser | null`. New exports `CreateTipRuleDto`, `UpdateTipRuleDto`. Task 4 imports `CreateTipRuleDto`; Task 5 imports `UpdateTipRuleDto`; Task 6 reads the new `MerchantTipRule` audit fields.

- [ ] **Step 1: Add the audit fields and DTOs**

In `src/types/configuration.ts`, replace the `MerchantTipRule` interface (currently lines 44–58) with:

```ts
export interface MerchantTipRule {
  id: number;
  name: string;
  tipCalculationMethod: TipCalculationMethod;
  tipDistributionMethod: TipDistributionMethod;
  suggestedPercentages: (number | string)[] | null;
  fixedAmountOptions: (number | string)[] | null;
  allowCustomTip: boolean;
  maximumTipPercentage: number;
  autoDistribute: boolean;
  staffPercentage: number | string | null;
  kitchenPercentage: number | string | null;
  managerPercentage: number | string | null;
  status: ConfigurationStatus;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: AuditUser | null;
  updatedBy?: AuditUser | null;
}

export interface CreateTipRuleDto {
  name: string;
  tipCalculationMethod: TipCalculationMethod;
  tipDistributionMethod: TipDistributionMethod;
  suggestedPercentages: number[];
  fixedAmountOptions: number[];
  allowCustomTip: boolean;
  maximumTipPercentage: number;
  autoDistribute: boolean;
  staffPercentage?: number;
  kitchenPercentage?: number;
  managerPercentage?: number;
}

export type UpdateTipRuleDto = Partial<CreateTipRuleDto> & {
  status?: 'active' | 'inactive';
};
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `npx tsc --build --noEmit --force`
Expected: clean (no errors — nothing consumes the new fields/types yet, so this only validates the additions themselves are well-formed).

- [ ] **Step 3: Commit**

```bash
git add src/types/configuration.ts
git commit -m "feat(types): add Tip Rule audit fields and Create/Update DTOs"
```

---

## Task 4: Frontend — Create workflow (`TipRuleFormModal` in create mode)

**Files:**
- Modify: `src/components/MerchantFrame/views/TipRulesView.tsx`
- Modify: `src/components/MerchantFrame/views/TipRulesView.test.tsx`

**Interfaces:**
- Consumes: `CreateTipRuleDto`, `UpdateTipRuleDto` from `src/types/configuration.ts` (Task 3). `toNumber` (already defined at the top of `TipRulesView.tsx`).
- Produces: `TipRuleFormModal` component with props `{ mode: 'create' | 'edit'; initialRule?: MerchantTipRule; submitting: boolean; onCancel: () => void; onSubmit: (dto: CreateTipRuleDto | UpdateTipRuleDto) => void }` — built fully here (edit-mode pre-fill and `isUnchanged` logic included), but only exercised in `create` mode until Task 5 wires the pencil icon. `handleCreateSubmit(dto: CreateTipRuleDto): Promise<void>` on `TipRulesView`. Task 5 adds `handleEditSubmit` and switches the modal's `onSubmit` to branch between the two.

- [ ] **Step 1: Add imports and the `toWholeNumber` helper**

In `TipRulesView.tsx`, replace the import block (currently lines 1–6) with:

```tsx
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../lib/auth-storage';
import type {
  MerchantTipRule,
  TipCalculationMethod,
  TipDistributionMethod,
  CreateTipRuleDto,
  UpdateTipRuleDto,
} from '../../../types/configuration';
import { RuleConfigQuickLinks } from './RuleConfigQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
```

Immediately after the existing `formatFixedAmount` function (currently lines 25–27), add:

```tsx
function toWholeNumber(value: number | string | null | undefined): number {
  return Math.round(toNumber(value) * 100);
}
```

- [ ] **Step 2: Add the `TipRuleFormModal` component**

Immediately after the `DISTRIBUTION_PILL_STYLES` constant (currently lines 47–51) and before `interface TipRulesViewProps`, add:

```tsx
interface TipRuleFormModalProps {
  mode: 'create' | 'edit';
  initialRule?: MerchantTipRule;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (dto: CreateTipRuleDto | UpdateTipRuleDto) => void;
}

const TipRuleFormModal: React.FC<TipRuleFormModalProps> = ({
  mode,
  initialRule,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [name, setName] = useState(initialRule?.name ?? '');
  const [tipCalculationMethod, setTipCalculationMethod] = useState<TipCalculationMethod>(
    initialRule?.tipCalculationMethod ?? 'percentage',
  );
  const [tipDistributionMethod, setTipDistributionMethod] = useState<TipDistributionMethod>(
    initialRule?.tipDistributionMethod ?? 'individual',
  );

  const [suggestedPercentages, setSuggestedPercentages] = useState<number[]>(
    (initialRule?.suggestedPercentages ?? []).map((v) => toWholeNumber(v)),
  );
  const [percentageInput, setPercentageInput] = useState('');

  const [fixedAmountOptions, setFixedAmountOptions] = useState<number[]>(
    (initialRule?.fixedAmountOptions ?? []).map((v) => Math.round(toNumber(v))),
  );
  const [fixedAmountInput, setFixedAmountInput] = useState('');

  const [maximumTipPercentage, setMaximumTipPercentage] = useState(
    initialRule ? String(initialRule.maximumTipPercentage) : '',
  );
  const [allowCustomTip, setAllowCustomTip] = useState(initialRule?.allowCustomTip ?? false);
  const [autoDistribute, setAutoDistribute] = useState(initialRule?.autoDistribute ?? false);

  const [staffPercentage, setStaffPercentage] = useState(
    initialRule?.staffPercentage != null ? String(toWholeNumber(initialRule.staffPercentage)) : '',
  );
  const [kitchenPercentage, setKitchenPercentage] = useState(
    initialRule?.kitchenPercentage != null ? String(toWholeNumber(initialRule.kitchenPercentage)) : '',
  );
  const [managerPercentage, setManagerPercentage] = useState(
    initialRule?.managerPercentage != null ? String(toWholeNumber(initialRule.managerPercentage)) : '',
  );

  const addPercentage = () => {
    const n = parseInt(percentageInput, 10);
    if (!isNaN(n) && n > 0) {
      setSuggestedPercentages((prev) => [...prev, n]);
      setPercentageInput('');
    }
  };
  const removePercentage = (index: number) => {
    setSuggestedPercentages((prev) => prev.filter((_, i) => i !== index));
  };

  const addFixedAmount = () => {
    const n = parseInt(fixedAmountInput, 10);
    if (!isNaN(n) && n > 0) {
      setFixedAmountOptions((prev) => [...prev, n]);
      setFixedAmountInput('');
    }
  };
  const removeFixedAmount = (index: number) => {
    setFixedAmountOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const isRoleBased = tipDistributionMethod === 'role_based';
  const staffNum = parseFloat(staffPercentage);
  const kitchenNum = parseFloat(kitchenPercentage);
  const managerNum = parseFloat(managerPercentage);
  const roleBasedValid =
    !isRoleBased ||
    (staffPercentage.trim() !== '' &&
      kitchenPercentage.trim() !== '' &&
      managerPercentage.trim() !== '' &&
      !isNaN(staffNum) &&
      !isNaN(kitchenNum) &&
      !isNaN(managerNum) &&
      Math.abs(staffNum + kitchenNum + managerNum - 100) <= 1);

  const arraysValid =
    tipCalculationMethod === 'percentage'
      ? suggestedPercentages.length > 0
      : tipCalculationMethod === 'fixed_amount'
        ? fixedAmountOptions.length > 0
        : true;

  const maxTipNum = parseFloat(maximumTipPercentage);
  const maxTipValid = maximumTipPercentage.trim() !== '' && !isNaN(maxTipNum);

  const nameValid = name.trim().length > 0 && name.length <= 50;

  const buildDto = (): CreateTipRuleDto => ({
    name: name.trim(),
    tipCalculationMethod,
    tipDistributionMethod,
    suggestedPercentages:
      tipCalculationMethod === 'percentage' ? suggestedPercentages.map((n) => n / 100) : [],
    fixedAmountOptions: tipCalculationMethod === 'fixed_amount' ? fixedAmountOptions : [],
    allowCustomTip,
    maximumTipPercentage: maxTipNum,
    autoDistribute,
    ...(isRoleBased
      ? {
          staffPercentage: staffNum / 100,
          kitchenPercentage: kitchenNum / 100,
          managerPercentage: managerNum / 100,
        }
      : {}),
  });

  const initialDto: CreateTipRuleDto | null =
    mode === 'edit' && initialRule
      ? {
          name: initialRule.name,
          tipCalculationMethod: initialRule.tipCalculationMethod,
          tipDistributionMethod: initialRule.tipDistributionMethod,
          suggestedPercentages: (initialRule.suggestedPercentages ?? []).map((v) => toNumber(v)),
          fixedAmountOptions: (initialRule.fixedAmountOptions ?? []).map((v) => toNumber(v)),
          allowCustomTip: initialRule.allowCustomTip,
          maximumTipPercentage: initialRule.maximumTipPercentage,
          autoDistribute: initialRule.autoDistribute,
          ...(initialRule.tipDistributionMethod === 'role_based'
            ? {
                staffPercentage: toNumber(initialRule.staffPercentage),
                kitchenPercentage: toNumber(initialRule.kitchenPercentage),
                managerPercentage: toNumber(initialRule.managerPercentage),
              }
            : {}),
        }
      : null;

  const isUnchanged =
    mode === 'edit' && initialDto !== null && JSON.stringify(buildDto()) === JSON.stringify(initialDto);

  const isValid = nameValid && arraysValid && maxTipValid && roleBasedValid && !isUnchanged;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit(buildDto());
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label={mode === 'create' ? 'Add Tip Rule' : 'Edit Tip Rule'}
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">
            {mode === 'create' ? 'Add Tip Rule' : 'Edit Tip Rule'}
          </span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tip-rule-name" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Rule Name
              </label>
              <input
                id="tip-rule-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
              />
              <span className={`text-[11px] ${name.length > 50 ? 'text-[#ae001a] font-bold' : 'text-[#5f5e5e]'}`}>
                {name.length}/50
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="tip-rule-calc-method" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Calculation Method
              </label>
              <select
                id="tip-rule-calc-method"
                value={tipCalculationMethod}
                onChange={(e) => setTipCalculationMethod(e.target.value as TipCalculationMethod)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
              >
                <option value="percentage">Percentage</option>
                <option value="fixed_amount">Fixed Amount</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="tip-rule-distribution-method" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Distribution Method
              </label>
              <select
                id="tip-rule-distribution-method"
                value={tipDistributionMethod}
                onChange={(e) => setTipDistributionMethod(e.target.value as TipDistributionMethod)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
              >
                <option value="individual">Individual</option>
                <option value="pool">Pool</option>
                <option value="role_based">Role-Based</option>
              </select>
            </div>

            {tipCalculationMethod === 'percentage' && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="tip-rule-suggested-percentage-input"
                  className="text-[11px] font-bold text-[#5f5e5e] uppercase"
                >
                  Suggested Percentages
                </label>
                <div className="flex gap-2">
                  <input
                    id="tip-rule-suggested-percentage-input"
                    type="number"
                    value={percentageInput}
                    onChange={(e) => setPercentageInput(e.target.value)}
                    placeholder="e.g., 15"
                    className="flex-1 bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
                  />
                  <button
                    type="button"
                    onClick={addPercentage}
                    aria-label="Add suggested percentage"
                    className="px-3 py-2 bg-[#222222] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
                  >
                    Add
                  </button>
                </div>
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
              </div>
            )}

            {tipCalculationMethod === 'fixed_amount' && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="tip-rule-fixed-amount-input"
                  className="text-[11px] font-bold text-[#5f5e5e] uppercase"
                >
                  Fixed Amount Options
                </label>
                <div className="flex gap-2">
                  <input
                    id="tip-rule-fixed-amount-input"
                    type="number"
                    value={fixedAmountInput}
                    onChange={(e) => setFixedAmountInput(e.target.value)}
                    placeholder="e.g., 5"
                    className="flex-1 bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
                  />
                  <button
                    type="button"
                    onClick={addFixedAmount}
                    aria-label="Add fixed amount option"
                    className="px-3 py-2 bg-[#222222] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {fixedAmountOptions.map((amt, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 text-[11px] font-semibold bg-[#f2ede5] text-[#1d1c17] px-2 py-1 rounded"
                    >
                      ${amt}
                      <button
                        type="button"
                        onClick={() => removeFixedAmount(i)}
                        aria-label={`Remove $${amt}`}
                        className="text-[#5f5e5e] hover:text-[#ae001a]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="tip-rule-max-tip" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Maximum Tip Percentage
              </label>
              <input
                id="tip-rule-max-tip"
                type="number"
                value={maximumTipPercentage}
                onChange={(e) => setMaximumTipPercentage(e.target.value)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                placeholder="e.g., 30"
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={allowCustomTip}
                  onChange={(e) => setAllowCustomTip(e.target.checked)}
                />
                Allow Custom Tip
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={autoDistribute}
                  onChange={(e) => setAutoDistribute(e.target.checked)}
                />
                Auto-Distribute
              </label>
            </div>

            {isRoleBased && (
              <div className="flex flex-col gap-2 border-t border-[#e8e2d8] pt-4">
                <span className="text-[11px] font-bold text-[#5f5e5e] uppercase">Distribution Percentages</span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="tip-rule-staff-pct" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                      Staff %
                    </label>
                    <input
                      id="tip-rule-staff-pct"
                      type="number"
                      value={staffPercentage}
                      onChange={(e) => setStaffPercentage(e.target.value)}
                      className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="tip-rule-kitchen-pct" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                      Kitchen %
                    </label>
                    <input
                      id="tip-rule-kitchen-pct"
                      type="number"
                      value={kitchenPercentage}
                      onChange={(e) => setKitchenPercentage(e.target.value)}
                      className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="tip-rule-manager-pct" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                      Manager %
                    </label>
                    <input
                      id="tip-rule-manager-pct"
                      type="number"
                      value={managerPercentage}
                      onChange={(e) => setManagerPercentage(e.target.value)}
                      className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
                    />
                  </div>
                </div>
                {!roleBasedValid && (
                  <span className="text-[11px] text-[#ae001a] font-bold">
                    Staff, Kitchen, and Manager % must be filled and sum to 100
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="p-4 border-t border-[#e8e2d8] flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
            >
              Save Tip Rule
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};
```

- [ ] **Step 3: Wire state, the create handler, entry points, the FAB, and the toast**

In the `TipRulesView` component, replace the state declarations (currently lines 58–67, the `useState` calls up through `statusFilter`) by adding these lines right after `setStatusFilter` is declared:

```tsx
  const [formModalOpen, setFormModalOpen] = useState<null | { mode: 'create' | 'edit'; rule?: MerchantTipRule }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);
```

Immediately after `fetchTipRules` and its `useEffect(() => { fetchTipRules(); }, [])` block (currently ends at line 103), add:

```tsx
  const handleCreateSubmit = async (dto: CreateTipRuleDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-tip-rule`, {
        method: 'POST',
        headers,
        body: JSON.stringify(dto),
      });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to create tip rule');
      }

      setRules((prev) => [json.data, ...prev]);
      setFormModalOpen(null);
      setToast({ message: 'Tip rule created successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(null);
      setToast({ message: err.message || 'Failed to create tip rule', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };
```

Replace both `onClick={() => alert('Add Tip Rule — coming soon')}` occurrences (the toolbar button around line 205 and the empty-state button around line 257) with:

```tsx
              onClick={() => setFormModalOpen({ mode: 'create' })}
```

Immediately before the closing `</div>` of the component's returned JSX (currently the very last line inside the top-level `<div className="flex flex-col gap-6 ...">`, right after the `<RuleConfigQuickLinks .../>` line), add:

```tsx
      <button
        type="button"
        onClick={() => setFormModalOpen({ mode: 'create' })}
        aria-label="Quick create tip rule"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {formModalOpen && (
        <TipRuleFormModal
          mode={formModalOpen.mode}
          initialRule={formModalOpen.rule}
          submitting={formSubmitting}
          onCancel={() => setFormModalOpen(null)}
          onSubmit={(dto) => handleCreateSubmit(dto as CreateTipRuleDto)}
        />
      )}

      {toast && (
        <div
          className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-3.5 shadow-lg text-white text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          <span className="material-symbols-outlined text-lg">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100 transition-opacity">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}
```

(The `onSubmit={(dto) => handleCreateSubmit(dto as CreateTipRuleDto)}` line above is temporary — Task 5 replaces it with a create/edit branch once `handleEditSubmit` exists.)

- [ ] **Step 4: Write the failing tests**

Add a new `describe` block at the end of `TipRulesView.test.tsx`:

```tsx
describe('TipRulesView — create tip rule', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the create modal from the toolbar button', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    expect(screen.getByRole('dialog', { name: /add tip rule/i })).toBeInTheDocument();
  });

  it('opens the create modal from the FAB', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    await user.click(screen.getByLabelText('Quick create tip rule'));

    expect(screen.getByRole('dialog', { name: /add tip rule/i })).toBeInTheDocument();
  });

  it('opens the create modal from the empty-state CTA', async () => {
    mockFetchOnce([]);
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByTestId('tip-rules-empty-state');

    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    expect(screen.getByRole('dialog', { name: /add tip rule/i })).toBeInTheDocument();
  });

  it('disables submit until name, max tip %, and a suggested-percentage chip are provided', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    const submitButton = screen.getByRole('button', { name: /save tip rule/i });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Rule Name'), 'New Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Suggested Percentages'), '15');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    expect(submitButton).toBeEnabled();
  });

  it('blocks submit when name exceeds 50 characters', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    await user.type(screen.getByLabelText('Rule Name'), 'a'.repeat(51));
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '15');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    expect(screen.getByRole('button', { name: /save tip rule/i })).toBeDisabled();
  });

  it('toggles between the suggested-percentages and fixed-amount tag-inputs based on Calculation Method', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    expect(screen.getByLabelText('Suggested Percentages')).toBeInTheDocument();
    expect(screen.queryByLabelText('Fixed Amount Options')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Calculation Method'), 'fixed_amount');

    expect(screen.queryByLabelText('Suggested Percentages')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Fixed Amount Options')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Calculation Method'), 'custom');

    expect(screen.queryByLabelText('Suggested Percentages')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fixed Amount Options')).not.toBeInTheDocument();
  });

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

    await user.click(within(dialog).getByLabelText('Remove 15%'));

    expect(within(dialog).queryByText('15%')).not.toBeInTheDocument();
    expect(within(dialog).getByText('20%')).toBeInTheDocument();
  });

  it('shows Distribution Percentages only for Role-Based distribution and requires the split to sum to 100', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    expect(screen.queryByLabelText('Staff %')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Distribution Method'), 'role_based');
    expect(screen.getByLabelText('Staff %')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Rule Name'), 'Role Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '15');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    const submitButton = screen.getByRole('button', { name: /save tip rule/i });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Staff %'), '70');
    await user.type(screen.getByLabelText('Kitchen %'), '20');
    await user.type(screen.getByLabelText('Manager %'), '5');
    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/must be filled and sum to 100/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Manager %'));
    await user.type(screen.getByLabelText('Manager %'), '10');
    expect(submitButton).toBeEnabled();
  });

  it('submits a POST request with converted values and prepends the new rule on success', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    const createdRule: MerchantTipRule = {
      id: 4,
      name: 'New Split',
      tipCalculationMethod: 'percentage',
      tipDistributionMethod: 'individual',
      suggestedPercentages: [0.15],
      fixedAmountOptions: [],
      allowCustomTip: false,
      maximumTipPercentage: 30,
      autoDistribute: false,
      staffPercentage: null,
      kitchenPercentage: null,
      managerPercentage: null,
      status: 'active',
    };

    const fetchSpy = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ data: createdRule }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await user.click(screen.getByRole('button', { name: /add tip rule/i }));
    await user.type(screen.getByLabelText('Rule Name'), 'New Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '15');
    await user.click(screen.getByLabelText('Add suggested percentage'));
    await user.click(screen.getByRole('button', { name: /save tip rule/i }));

    expect(await screen.findByText('New Split')).toBeInTheDocument();
    expect(screen.getByText('Tip rule created successfully')).toBeInTheDocument();

    const [, requestInit] = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const body = JSON.parse(requestInit.body as string);
    expect(body.suggestedPercentages).toEqual([0.15]);
    expect(body.fixedAmountOptions).toEqual([]);
    expect(body.maximumTipPercentage).toBe(30);
  });

  it('shows an error toast and closes the modal when create fails', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ message: 'Invalid payload' }),
      }),
    );

    await user.click(screen.getByRole('button', { name: /add tip rule/i }));
    await user.type(screen.getByLabelText('Rule Name'), 'New Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '15');
    await user.click(screen.getByLabelText('Add suggested percentage'));
    await user.click(screen.getByRole('button', { name: /save tip rule/i }));

    expect(await screen.findByText('Invalid payload')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /add tip rule/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx`
Expected: PASS — all pre-existing tests still green, plus the 10 new ones in `TipRulesView — create tip rule`.

(These should pass immediately after Step 3's implementation since the component and its wiring were written together — if any fail, compare the failing assertion's label text against Step 2's JSX exactly; the two must match verbatim.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --build --noEmit --force`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/MerchantFrame/views/TipRulesView.tsx src/components/MerchantFrame/views/TipRulesView.test.tsx
git commit -m "feat(tip-rules): add create workflow with conditional tag-inputs and role-based split"
```

---

## Task 5: Frontend — Edit workflow + Actions column

**Files:**
- Modify: `src/components/MerchantFrame/views/TipRulesView.tsx`
- Modify: `src/components/MerchantFrame/views/TipRulesView.test.tsx`

**Interfaces:**
- Consumes: `TipRuleFormModal` (Task 4, already supports `mode: 'edit'`), `UpdateTipRuleDto` (Task 3).
- Produces: `handleEditSubmit(ruleId: number, dto: UpdateTipRuleDto): Promise<void>`. New "Actions" table column with an Edit pencil icon. Task 6 (detail modal) relies on this column's icons already calling `e.stopPropagation()`. Task 7 (status toggle) appends a second icon to this same column.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `TipRulesView.test.tsx`, after the `— create tip rule` block:

```tsx
describe('TipRulesView — edit tip rule', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the edit modal pre-filled from the pencil action', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit tip rule'));

    const dialog = screen.getByRole('dialog', { name: /edit tip rule/i });
    expect(within(dialog).getByLabelText('Rule Name')).toHaveValue('Standard Percentage Split');
    expect(within(dialog).getByLabelText('Calculation Method')).toHaveValue('percentage');
    expect(within(dialog).getByText('15%')).toBeInTheDocument();
    expect(within(dialog).getByText('18%')).toBeInTheDocument();
    expect(within(dialog).getByText('20%')).toBeInTheDocument();
  });

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
    await user.click(screen.getByRole('button', { name: /save tip rule/i }));

    expect(await screen.findByText('Updated Split')).toBeInTheDocument();
    expect(screen.getByText('Tip rule updated successfully')).toBeInTheDocument();
  });

  it('shows an error toast when edit fails', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
        json: async () => ({ message: 'Server error' }),
      }),
    );

    await user.click(within(row).getByLabelText('Edit tip rule'));
    const nameInput = screen.getByLabelText('Rule Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Changed Name');
    await user.click(screen.getByRole('button', { name: /save tip rule/i }));

    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('disables submit in edit mode when no fields have changed', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit tip rule'));

    expect(screen.getByRole('dialog', { name: /edit tip rule/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save tip rule/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx -t "edit tip rule"`
Expected: FAIL — there's no "Edit tip rule" label anywhere in the DOM yet (no Actions column).

- [ ] **Step 3: Add `handleEditSubmit` and fix the modal's `onSubmit` branch**

Immediately after `handleCreateSubmit` (added in Task 4), add:

```tsx
  const handleEditSubmit = async (ruleId: number, dto: UpdateTipRuleDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-tip-rule/${ruleId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(dto),
      });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to update tip rule');
      }

      setRules((prev) => prev.map((r) => (r.id === json.data.id ? json.data : r)));
      setFormModalOpen(null);
      setToast({ message: 'Tip rule updated successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(null);
      setToast({ message: err.message || 'Failed to update tip rule', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };
```

Replace the temporary `onSubmit={(dto) => handleCreateSubmit(dto as CreateTipRuleDto)}` line (added in Task 4) with:

```tsx
          onSubmit={(dto) =>
            formModalOpen.mode === 'create'
              ? handleCreateSubmit(dto as CreateTipRuleDto)
              : handleEditSubmit(formModalOpen.rule!.id, dto as UpdateTipRuleDto)
          }
```

- [ ] **Step 4: Add the Actions column to the table**

Replace the table header row (currently the five `<th>` elements ending with the "Status" column, lines 280–296) by appending a sixth column:

```tsx
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Actions
                  </th>
```

right after the existing "Status" `<th>`.

Update the loading-skeleton `<tr>` (currently lines 300–318) to add a sixth `<td>` after the existing five:

```tsx
                      <td className="px-6 py-4">
                        <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" />
                      </td>
```

Change the filtered-empty row's `colSpan={5}` (currently line 321) to `colSpan={6}`.

In the row-rendering `filteredRules.map((rule) => { ... })` block, change the outer `<tr key={rule.id} className={...}>` (currently lines 353–358) to add `cursor-default` removed and no `onClick` yet (that's Task 6) — leave the `<tr>` as-is for this task. After the existing Status `<td>` (currently lines 424–434) and before the closing `</tr>`, add:

```tsx
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFormModalOpen({ mode: 'edit', rule });
                              }}
                              aria-label="Edit tip rule"
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                            >
                              <span className="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                          </div>
                        </td>
```

- [ ] **Step 5: Run the edit tests and confirm they pass**

Run: `npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx -t "edit tip rule"`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full file and confirm no regressions**

Run: `npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx`
Expected: PASS, all tests (create + edit + everything from the read-only workspace) green.

- [ ] **Step 7: Type-check**

Run: `npx tsc --build --noEmit --force`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/MerchantFrame/views/TipRulesView.tsx src/components/MerchantFrame/views/TipRulesView.test.tsx
git commit -m "feat(tip-rules): add edit workflow and Actions column"
```

---

## Task 6: Frontend — `TipRuleDetailModal` (row-click inspection)

**Files:**
- Modify: `src/components/MerchantFrame/views/TipRulesView.tsx`
- Modify: `src/components/MerchantFrame/views/TipRulesView.test.tsx`

**Interfaces:**
- Consumes: `MerchantTipRule.createdAt/updatedAt/createdBy/updatedBy` (Task 3), `formatSuggestedPercentage`/`formatFixedAmount`/`toNumber` (already in the file), `CALC_METHOD_LABELS`/`DISTRIBUTION_LABELS` (already in the file).
- Produces: `TipRuleDetailModal` component, `handleRowClick(ruleId: number): Promise<void>`, `detailRule` state. No later task depends on this.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `TipRulesView.test.tsx`, after `— edit tip rule`:

```tsx
describe('TipRulesView — detail inspection', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the detail modal with audit fields when a row is clicked', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          data: {
            ...MOCK_RULES[0],
            createdAt: '2026-01-05T10:00:00.000Z',
            updatedAt: '2026-02-10T12:00:00.000Z',
            createdBy: { id: 1, username: 'jane.doe', email: 'jane@company.com' },
            updatedBy: { id: 2, username: null, email: 'ops@company.com' },
          },
        }),
      }),
    );

    await user.click(row);

    expect(await screen.findByRole('dialog', { name: /tip rule details/i })).toBeInTheDocument();
    expect(screen.getByText(/jane\.doe/)).toBeInTheDocument();
    expect(screen.getByText(/ops@company\.com/)).toBeInTheDocument();
  });

  it('does not open the detail modal when the edit icon is clicked', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit tip rule'));

    expect(screen.queryByRole('dialog', { name: /tip rule details/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx -t "detail inspection"`
Expected: FAIL — clicking a row does nothing yet.

- [ ] **Step 3: Add `TipRuleDetailModal`**

Immediately after the `TipRuleFormModal` component (added in Task 4) and before `interface TipRulesViewProps`, add:

```tsx
interface TipRuleDetailModalProps {
  rule: MerchantTipRule;
  onClose: () => void;
}

const formatAuditDate = (value?: string) => {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

const formatAuditUser = (u?: { username: string | null; email: string } | null) => {
  if (!u) return '—';
  return u.username || u.email;
};

const TipRuleDetailModal: React.FC<TipRuleDetailModalProps> = ({ rule, onClose }) => {
  const values = rule.tipCalculationMethod === 'fixed_amount' ? rule.fixedAmountOptions : rule.suggestedPercentages;
  const formatValue = rule.tipCalculationMethod === 'fixed_amount' ? formatFixedAmount : formatSuggestedPercentage;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Tip Rule Details"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Tip Rule Details</span>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Name</p>
            <p className="font-bold text-[#1d1c17]">{rule.name}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Calculation Method</p>
              <p>{CALC_METHOD_LABELS[rule.tipCalculationMethod]}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Distribution Method</p>
              <p>{DISTRIBUTION_LABELS[rule.tipDistributionMethod]}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              {rule.tipCalculationMethod === 'fixed_amount' ? 'Fixed Amount Options' : 'Suggested Percentages'}
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              {values && values.length > 0 ? (
                values.map((value, i) => (
                  <span key={i} className="text-[11px] font-semibold bg-[#f2ede5] text-[#5f5e5e] px-1.5 py-0.5 rounded">
                    {formatValue(value)}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-[#5f5e5e] italic">No suggested values</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Maximum Tip %</p>
              <p>{rule.maximumTipPercentage}%</p>
            </div>
            <div className="flex flex-col gap-1">
              {rule.allowCustomTip && (
                <span className="bg-amber-500/10 text-amber-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded w-fit">
                  Custom Tip Allowed
                </span>
              )}
              {rule.autoDistribute && (
                <span className="bg-blue-500/10 text-blue-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded w-fit">
                  Auto-Distribute
                </span>
              )}
            </div>
          </div>
          {rule.tipDistributionMethod === 'role_based' && (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Staff %</p>
                <p>{formatSuggestedPercentage(rule.staffPercentage ?? 0)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Kitchen %</p>
                <p>{formatSuggestedPercentage(rule.kitchenPercentage ?? 0)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Manager %</p>
                <p>{formatSuggestedPercentage(rule.managerPercentage ?? 0)}</p>
              </div>
            </div>
          )}
          <div className="border-t border-[#e8e2d8] pt-4 space-y-2">
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Audit Trail</p>
            <p className="text-xs">
              Created {formatAuditDate(rule.createdAt)} by {formatAuditUser(rule.createdBy)}
            </p>
            <p className="text-xs">
              Last updated {formatAuditDate(rule.updatedAt)} by {formatAuditUser(rule.updatedBy)}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
```

- [ ] **Step 4: Add `detailRule` state, `handleRowClick`, row `onClick`, and modal render**

Add to the state block (next to `formModalOpen`):

```tsx
  const [detailRule, setDetailRule] = useState<MerchantTipRule | null>(null);
```

Immediately after `handleEditSubmit` (added in Task 5), add:

```tsx
  const handleRowClick = async (ruleId: number) => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-tip-rule/${ruleId}`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to load tip rule details');
      }

      setDetailRule(json.data);
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to load tip rule details', type: 'error' });
    }
  };
```

Replace the row's opening tag (currently `<tr key={rule.id} className={...}>`, set up in Task 5) with:

```tsx
                      <tr
                        key={rule.id}
                        onClick={() => handleRowClick(rule.id)}
                        className={`group hover:bg-[#f8f3eb] transition-colors cursor-pointer ${
                          rule.status !== 'active' ? 'opacity-75' : ''
                        }`}
                      >
```

Immediately after the `{formModalOpen && <TipRuleFormModal .../>}` block, add:

```tsx
      {detailRule && <TipRuleDetailModal rule={detailRule} onClose={() => setDetailRule(null)} />}
```

- [ ] **Step 5: Run the detail tests and confirm they pass**

Run: `npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx -t "detail inspection"`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full file and confirm no regressions**

Run: `npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx`
Expected: PASS.

- [ ] **Step 7: Type-check**

Run: `npx tsc --build --noEmit --force`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/MerchantFrame/views/TipRulesView.tsx src/components/MerchantFrame/views/TipRulesView.test.tsx
git commit -m "feat(tip-rules): add row-click detail inspection with audit trail"
```

---

## Task 7: Frontend — bidirectional status toggle (soft-delete / reactivate)

**Files:**
- Modify: `src/components/MerchantFrame/views/TipRulesView.tsx`
- Modify: `src/components/MerchantFrame/views/TipRulesView.test.tsx`

**Interfaces:**
- Consumes: the Actions column (Task 5).
- Produces: `ConfirmStatusDialog` component, `handleToggleConfirm(): Promise<void>`, `togglingRule`/`toggleSubmitting` state. Final task in the CRUD build — nothing downstream depends on this.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `TipRulesView.test.tsx`, after `— detail inspection`:

```tsx
describe('TipRulesView — status toggle', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('deactivates an active rule after confirmation', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: { ...MOCK_RULES[0], status: 'inactive' } }),
      }),
    );

    await user.click(within(row).getByLabelText('Deactivate tip rule'));
    expect(screen.getByText(/deactivate this tip rule/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await screen.findByText('Tip rule deactivated successfully');
    const updatedRow = (await screen.findByText('Standard Percentage Split')).closest('tr')!;
    expect(within(updatedRow).getByText('Inactive')).toBeInTheDocument();
  });

  it('reactivates an inactive rule after confirmation', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Flat Amount Options')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: { ...MOCK_RULES[1], status: 'active' } }),
      }),
    );

    await user.click(within(row).getByLabelText('Reactivate tip rule'));
    expect(screen.getByText(/reactivate this tip rule/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await screen.findByText('Tip rule reactivated successfully');
  });

  it('does not send a request when the confirm dialog is cancelled', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ data: MOCK_RULES }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    const callsBefore = fetchSpy.mock.calls.length;
    await user.click(within(row).getByLabelText('Deactivate tip rule'));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
    expect(screen.queryByText(/deactivate this tip rule/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx -t "status toggle"`
Expected: FAIL — no "Deactivate tip rule" / "Reactivate tip rule" icons exist yet.

- [ ] **Step 3: Add `ConfirmStatusDialog`**

Immediately after `TipRuleDetailModal` (added in Task 6) and before `interface TipRulesViewProps`, add:

```tsx
interface ConfirmStatusDialogProps {
  rule: MerchantTipRule;
  nextStatus: 'active' | 'inactive';
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmStatusDialog: React.FC<ConfirmStatusDialogProps> = ({
  rule,
  nextStatus,
  submitting,
  onCancel,
  onConfirm,
}) => {
  const isDeactivating = nextStatus === 'inactive';
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-center p-4">
      <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left">
        <p className="font-bold text-[#1d1c17]">
          {isDeactivating ? 'Deactivate this tip rule?' : 'Reactivate this tip rule?'}
        </p>
        <p className="text-sm text-[#5f5e5e] mt-2">
          {isDeactivating
            ? `"${rule.name}" will stop being offered to customers.`
            : `"${rule.name}" will start being offered to customers again.`}
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] disabled:opacity-40 text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
```

- [ ] **Step 4: Add toggle state, `handleToggleConfirm`, the toggle icon, and the dialog render**

Add to the state block (next to `detailRule`):

```tsx
  const [togglingRule, setTogglingRule] = useState<MerchantTipRule | null>(null);
  const [toggleSubmitting, setToggleSubmitting] = useState(false);
```

Immediately after `handleRowClick` (added in Task 6), add:

```tsx
  const handleToggleConfirm = async () => {
    if (!togglingRule) return;
    const nextStatus: 'active' | 'inactive' = togglingRule.status === 'active' ? 'inactive' : 'active';
    setToggleSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/merchant-tip-rule/${togglingRule.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to update tip rule status');
      }

      setRules((prev) => prev.map((r) => (r.id === json.data.id ? json.data : r)));
      setTogglingRule(null);
      setToast({
        message: nextStatus === 'inactive' ? 'Tip rule deactivated successfully' : 'Tip rule reactivated successfully',
        type: 'success',
      });
    } catch (err: any) {
      setTogglingRule(null);
      setToast({ message: err.message || 'Failed to update tip rule status', type: 'error' });
    } finally {
      setToggleSubmitting(false);
    }
  };
```

In the Actions column `<td>` (added in Task 5), add a second button right after the pencil-icon button, still inside the same `flex justify-center gap-2 ...` div:

```tsx
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTogglingRule(rule);
                              }}
                              aria-label={rule.status === 'active' ? 'Deactivate tip rule' : 'Reactivate tip rule'}
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                            >
                              <span className="material-symbols-outlined text-[20px]">
                                {rule.status === 'active' ? 'block' : 'check_circle'}
                              </span>
                            </button>
```

Immediately after the `{detailRule && <TipRuleDetailModal .../>}` block, add:

```tsx
      {togglingRule && (
        <ConfirmStatusDialog
          rule={togglingRule}
          nextStatus={togglingRule.status === 'active' ? 'inactive' : 'active'}
          submitting={toggleSubmitting}
          onCancel={() => setTogglingRule(null)}
          onConfirm={handleToggleConfirm}
        />
      )}
```

- [ ] **Step 5: Run the toggle tests and confirm they pass**

Run: `npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx -t "status toggle"`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full file and confirm no regressions**

Run: `npx vitest run src/components/MerchantFrame/views/TipRulesView.test.tsx`
Expected: PASS, every test in the file green.

- [ ] **Step 7: Type-check**

Run: `npx tsc --build --noEmit --force`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/MerchantFrame/views/TipRulesView.tsx src/components/MerchantFrame/views/TipRulesView.test.tsx
git commit -m "feat(tip-rules): add bidirectional status toggle (deactivate/reactivate)"
```

---

## Task 8: Final verification (both repos)

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend test suite**

Run: `npm run test`
Expected: PASS, no regressions anywhere in the suite (not just `TipRulesView.test.tsx`).

- [ ] **Step 2: Run the frontend type build**

Run: `npx tsc --build --noEmit --force`
Expected: clean (per [[reference-tsc-build-check]] — plain `tsc --noEmit` is a no-op in this project, always use `--build --noEmit --force`).

- [ ] **Step 3: Run the backend tip-rule suite once more**

Run: `cd ../x7-pos-back-end && npx jest src/core/configuration/merchant-tip-rule`
Expected: PASS.

- [ ] **Step 4: Manually smoke-test the golden path**

Start the dev server (`npm run dev`) and, against a running backend, as a Merchant Admin:
1. Open Tip Rules — confirm the existing grid/filters still render.
2. Click "Add Tip Rule", pick Percentage, add two suggested-percentage chips, fill Maximum Tip Percentage, save — confirm the new row appears with correct pills.
3. Click the new row — confirm the detail drawer shows the audit trail with your own username/email as both Created-by and Updated-by.
4. Click the pencil icon, change the name, save — confirm the row updates and the detail drawer's "Last updated" timestamp changes.
5. Click the deactivate icon, confirm — confirm the row shows "Inactive"; click reactivate, confirm — confirm it flips back.

If the dev server or backend isn't reachable in this environment, state that explicitly rather than claiming this step passed.

- [ ] **Step 5: Report completion**

No commit in this task — it's verification-only. If any step surfaces a regression, fix it as a new commit before considering the feature done.
