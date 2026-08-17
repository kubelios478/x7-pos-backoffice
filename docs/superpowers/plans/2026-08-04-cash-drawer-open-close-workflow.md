# Cash Drawer Open/Close Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-inject shift/collaborator context from the JWT (instead of trusting client-supplied IDs) when opening/closing a cash drawer, and add a `Discrepancy` reconciliation status when the physical closing count doesn't match the recorded balance.

**Architecture:** Backend (`CashDrawersService` in `x7-pos-back-end`) resolves the merchant's active `Shift` and the authenticated user's `Collaborator` record server-side, replacing the old client-supplied `shiftId`/`openedBy`/`closedBy` fields; the close path compares `closingBalance` to `currentBalance` to decide `Close` vs `Discrepancy`. Frontend (`CashDrawersView.tsx` in `x7-pos-backoffice`) drops the now-obsolete manual ID inputs and adds `Discrepancy` badge/variance UI.

**Tech Stack:** Backend: NestJS + TypeORM (Postgres), Jest. Frontend: React 19 + TypeScript + Vite, Vitest + Testing Library.

**Spec:** [`docs/superpowers/specs/2026-08-04-cash-drawer-open-close-workflow-design.md`](../specs/2026-08-04-cash-drawer-open-close-workflow-design.md)

## Global Constraints

- Opening balance must be `>= 0.00` (already enforced via `@Min(0)`; must remain true after every change).
- `shift_id`, `opened_by`, `closed_by`, `merchant_id` are never accepted from the request body — always resolved server-side from `@CurrentUser()`.
- Single-active-drawer guard is scoped by `shift_id` **and** `merchant_id`. No terminal entity/column exists or is introduced.
- Guard conflict message, verbatim: `An active cash drawer session (#CD-{id}) is already open for this shift. Please close the active session before opening a new drawer.`
- Closing sets `status = CLOSE` when `closingBalance === currentBalance` (compared as numbers — `current_balance` is a `decimal` column and can arrive as a numeric string), else `status = DISCREPANCY`. No third outcome.
- No DB migration — `CashDrawer.status` is `@Column({ type: 'varchar', length: 50 })`, schema auto-syncs (`synchronize: true`).
- No new "preview active shift" GET endpoint. The Open modal does not show the resolved shift before submit.
- Backend repo root for every backend path below: `../x7-pos-back-end` (sibling of this repo). Frontend paths are relative to this repo's root.

---

### Task B1: Open flow — auto-inject shift/collaborator context (backend)

**Files:**
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-drawers/constants/cash-drawer-status.enum.ts`
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-drawers/dto/create-cash-drawer.dto.ts`
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.controller.ts:1-166`
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.service.ts:1-171`
- Test: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.service.spec.ts:1-394`
- Test: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.controller.spec.ts:1-164`

**Interfaces:**
- Produces: `CashDrawerStatus.DISCREPANCY = 'Discrepancy'` (enum member used by Task B2). `CreateCashDrawerDto { openingBalance: number }`. `CashDrawersService.create(dto: CreateCashDrawerDto, user: AuthenticatedUser): Promise<OneCashDrawerResponseDto>`. `CashDrawersController.create` now takes `@CurrentUser() user: AuthenticatedUser` instead of `@Request() req`.
- Consumes: existing `Shift`/`Collaborator` repositories already injected into `CashDrawersService` (no new module wiring needed — `cash-drawers.module.ts` already provides `TypeOrmModule.forFeature([CashDrawer, Shift, Collaborator])`).

- [ ] **Step 1: Write the failing service test for the new `create()` contract**

Replace the entire `describe('create', ...)` block (current lines 129-394 of `cash-drawers.service.spec.ts`) with:

```ts
  describe('create', () => {
    const createCashDrawerDto: CreateCashDrawerDto = {
      openingBalance: 100.0,
    };

    it('should create a cash drawer successfully', async () => {
      jest
        .spyOn(shiftRepository, 'findOne')
        .mockResolvedValue(mockShift as any);
      jest
        .spyOn(collaboratorRepository, 'findOne')
        .mockResolvedValue(mockCollaborator as any);
      jest
        .spyOn(cashDrawerRepository, 'save')
        .mockResolvedValue(mockCashDrawer as any);
      jest
        .spyOn(cashDrawerRepository, 'findOne')
        .mockResolvedValueOnce(null) // no existing open drawer for the active shift
        .mockResolvedValueOnce(mockCashDrawer as any); // complete drawer after save

      const result = await service.create(createCashDrawerDto, mockUser);

      expect(shiftRepository.findOne).toHaveBeenCalledWith({
        where: { merchant: { id: 1 }, status: ShiftStatus.ACTIVE },
      });
      expect(collaboratorRepository.findOne).toHaveBeenCalledWith({
        where: { user_id: 1, merchant_id: 1 },
      });
      expect(cashDrawerRepository.save).toHaveBeenCalled();
      expect(result.statusCode).toBe(201);
      expect(result.message).toBe('Cash drawer created successfully');
      expect(result.data.id).toBe(1);
    });

    it('should throw ForbiddenException when user has no merchant_id', async () => {
      const userWithoutMerchant = { ...mockUser, merchant: undefined as any };
      await expect(
        service.create(createCashDrawerDto, userWithoutMerchant),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.create(createCashDrawerDto, userWithoutMerchant),
      ).rejects.toThrow(
        'You must be associated with a merchant to create cash drawers',
      );
    });

    it('should throw BadRequestException if opening balance is negative', async () => {
      const dtoWithNegativeBalance = { openingBalance: -10 };

      await expect(
        service.create(dtoWithNegativeBalance, mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(dtoWithNegativeBalance, mockUser),
      ).rejects.toThrow('Opening balance must be non-negative');
    });

    it('should throw BadRequestException when there is no active shift for the merchant', async () => {
      jest.spyOn(shiftRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.create(createCashDrawerDto, mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(createCashDrawerDto, mockUser),
      ).rejects.toThrow(
        'No active shift found. Start a shift before opening a cash drawer.',
      );
    });

    it('should throw BadRequestException when the user has no linked collaborator profile', async () => {
      jest
        .spyOn(shiftRepository, 'findOne')
        .mockResolvedValue(mockShift as any);
      jest.spyOn(collaboratorRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.create(createCashDrawerDto, mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(createCashDrawerDto, mockUser),
      ).rejects.toThrow('No collaborator profile is linked to your account.');
    });

    it('should throw ConflictException naming the active session id when the shift already has an open drawer', async () => {
      const existingOpenCashDrawer = { ...mockCashDrawer, id: 12 };
      jest
        .spyOn(shiftRepository, 'findOne')
        .mockResolvedValue(mockShift as any);
      jest
        .spyOn(collaboratorRepository, 'findOne')
        .mockResolvedValue(mockCollaborator as any);
      jest
        .spyOn(cashDrawerRepository, 'findOne')
        .mockResolvedValue(existingOpenCashDrawer as any);

      await expect(
        service.create(createCashDrawerDto, mockUser),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.create(createCashDrawerDto, mockUser),
      ).rejects.toThrow(
        'An active cash drawer session (#CD-12) is already open for this shift. Please close the active session before opening a new drawer.',
      );
    });
  });
```

Also add a top-level `mockUser` const (used by this task and reused by Task B2), placed right after the existing `mockCollaborator` const (around line 69) — **not** inside the `describe('create', ...)` block, so `describe('update', ...)` can reuse it in Task B2:

```ts
  const mockUser: AuthenticatedUser = {
    id: 1,
    email: 'cashier@example.com',
    role: 'MERCHANT_USER' as any,
    scope: 'MERCHANT_WEB' as any,
    merchant: { id: 1 },
  };
```

And add these two imports at the top of the file (alongside the existing relative imports):

```ts
import { ShiftStatus } from '../../shift/shifts/constants/shift-status.enum';
import { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "../x7-pos-back-end" && npx jest cash-drawers.service.spec.ts`
Expected: FAIL (either a TypeScript compile error because `service.create` still takes `(dto, merchantId: number)`, or assertion failures against the old shift/collaborator query shapes).

- [ ] **Step 3: Add the `DISCREPANCY` status**

In `constants/cash-drawer-status.enum.ts`:

```ts
export enum CashDrawerStatus {
  OPEN = 'Open',
  CLOSE = 'Close',
  PAUSE = 'Pause',
  DISCREPANCY = 'Discrepancy',
}
```

- [ ] **Step 4: Shrink `CreateCashDrawerDto`**

Replace the full contents of `dto/create-cash-drawer.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsNotEmpty, Min } from 'class-validator';

export class CreateCashDrawerDto {
  @ApiProperty({
    example: 100.0,
    description: 'Opening balance amount in the cash drawer',
  })
  @IsNumber({}, { message: 'Opening balance must be a valid number' })
  @IsNotEmpty({ message: 'Opening balance is required' })
  @Min(0, { message: 'Opening balance must be greater than or equal to 0' })
  openingBalance: number;
}
```

- [ ] **Step 5: Rewrite `CashDrawersService.create()`**

In `cash-drawers.service.ts`, add these two imports alongside the existing ones:

```ts
import { ShiftStatus } from '../../shift/shifts/constants/shift-status.enum';
import { AuthenticatedUser } from 'src/auth/interfaces/authenticated-user.interface';
```

Replace the entire `create()` method (current lines 35-171) with:

```ts
  async create(
    createCashDrawerDto: CreateCashDrawerDto,
    user: AuthenticatedUser,
  ): Promise<OneCashDrawerResponseDto> {
    const authenticatedUserMerchantId = user?.merchant?.id;

    if (!authenticatedUserMerchantId) {
      throw new ForbiddenException(
        'You must be associated with a merchant to create cash drawers',
      );
    }

    if (createCashDrawerDto.openingBalance < 0) {
      throw new BadRequestException('Opening balance must be non-negative');
    }

    const activeShift = await this.shiftRepository.findOne({
      where: {
        merchant: { id: authenticatedUserMerchantId },
        status: ShiftStatus.ACTIVE,
      },
    });

    if (!activeShift) {
      throw new BadRequestException(
        'No active shift found. Start a shift before opening a cash drawer.',
      );
    }

    const collaborator = await this.collaboratorRepository.findOne({
      where: { user_id: user.id, merchant_id: authenticatedUserMerchantId },
    });

    if (!collaborator) {
      throw new BadRequestException(
        'No collaborator profile is linked to your account.',
      );
    }

    const existingOpenCashDrawer = await this.cashDrawerRepository.findOne({
      where: {
        shift_id: activeShift.id,
        merchant_id: authenticatedUserMerchantId,
        status: CashDrawerStatus.OPEN,
      },
    });

    if (existingOpenCashDrawer) {
      throw new ConflictException(
        `An active cash drawer session (#CD-${existingOpenCashDrawer.id}) is already open for this shift. Please close the active session before opening a new drawer.`,
      );
    }

    const cashDrawer = new CashDrawer();
    cashDrawer.merchant_id = authenticatedUserMerchantId;
    cashDrawer.shift_id = activeShift.id;
    cashDrawer.opening_balance = createCashDrawerDto.openingBalance;
    cashDrawer.current_balance = createCashDrawerDto.openingBalance;
    cashDrawer.closing_balance = null;
    cashDrawer.opened_by = collaborator.id;
    cashDrawer.closed_by = null;
    cashDrawer.status = CashDrawerStatus.OPEN;

    const savedCashDrawer = await this.cashDrawerRepository.save(cashDrawer);

    const completeCashDrawer = await this.cashDrawerRepository.findOne({
      where: { id: savedCashDrawer.id },
      relations: [
        'merchant',
        'shift',
        'shift.merchant',
        'openedByCollaborator',
        'closedByCollaborator',
      ],
    });

    if (!completeCashDrawer) {
      throw new NotFoundException('Cash drawer not found after creation');
    }

    return {
      statusCode: 201,
      message: 'Cash drawer created successfully',
      data: this.formatCashDrawerResponse(completeCashDrawer),
    };
  }
```

- [ ] **Step 6: Run the service test to verify it passes**

Run: `cd "../x7-pos-back-end" && npx jest cash-drawers.service.spec.ts`
Expected: PASS for `describe('create', ...)`. The `update`/`findAll`/`findOne`/`remove` blocks are untouched by this task and must still pass unchanged.

- [ ] **Step 7: Write the failing controller test for the new `create()` wiring**

Replace the `describe('POST /cash-drawers (create)', ...)` block (current lines 115-164 of `cash-drawers.controller.spec.ts`) with:

```ts
  describe('POST /cash-drawers (create)', () => {
    const createDto: CreateCashDrawerDto = {
      openingBalance: 100.0,
    };

    it('should create a new cash drawer successfully', async () => {
      const createSpy = jest.spyOn(service, 'create');
      createSpy.mockResolvedValue(mockOneCashDrawerResponse);

      const result = await controller.create(createDto, mockUser as any);

      expect(createSpy).toHaveBeenCalledWith(createDto, mockUser);
      expect(result).toEqual(mockOneCashDrawerResponse);
      expect(result.statusCode).toBe(201);
      expect(result.message).toBe('Cash drawer created successfully');
    });

    it('should handle service errors during creation', async () => {
      const errorMessage =
        'No active shift found. Start a shift before opening a cash drawer.';
      const createSpy = jest.spyOn(service, 'create');
      createSpy.mockRejectedValue(new Error(errorMessage));

      await expect(
        controller.create(createDto, mockUser as any),
      ).rejects.toThrow(errorMessage);
      expect(createSpy).toHaveBeenCalledWith(createDto, mockUser);
    });
  });
```

(The old "should throw ForbiddenException if user has no merchant_id" case is dropped here — the controller no longer reads `req.user?.merchant?.id` itself, it just forwards `user`, so that scenario is now purely service-level and is already covered by Task B1 Step 1's `mockUser`-without-merchant test.)

- [ ] **Step 8: Run the controller test to verify it fails**

Run: `cd "../x7-pos-back-end" && npx jest cash-drawers.controller.spec.ts`
Expected: FAIL — `controller.create` still has signature `(dto, req)`.

- [ ] **Step 9: Wire `@CurrentUser()` into the controller's `create()`**

In `cash-drawers.controller.ts`, add these two imports alongside the existing ones:

```ts
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from 'src/auth/interfaces/authenticated-user.interface';
```

Replace the `create()` handler (current lines 157-166) with:

```ts
  async create(
    @Body() createCashDrawerDto: CreateCashDrawerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cashDrawersService.create(createCashDrawerDto, user);
  }
```

Also update the Swagger decorators directly above `create()` (current lines 119-156) — replace from `@ApiBadRequestResponse({` through `@ApiBody({ type: CreateCashDrawerDto })` with:

```ts
  @ApiBadRequestResponse({
    description:
      'Invalid input data, no active shift, or no linked collaborator profile',
    example: {
      statusCode: 400,
      message: 'No active shift found. Start a shift before opening a cash drawer.',
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - Invalid or missing JWT token',
    example: {
      statusCode: 401,
      message: 'Unauthorized',
    },
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - user is not associated with a merchant',
    example: {
      statusCode: 403,
      message: 'You must be associated with a merchant to create cash drawers',
    },
  })
  @ApiConflictResponse({
    description: 'Conflict - the active shift already has an open cash drawer',
    example: {
      statusCode: 409,
      message:
        'An active cash drawer session (#CD-12) is already open for this shift. Please close the active session before opening a new drawer.',
    },
  })
  @ApiBody({ type: CreateCashDrawerDto })
```

(This removes the old `@ApiNotFoundResponse` block for create() — a "Shift not found" 404 can no longer happen once the shift is server-resolved.)

- [ ] **Step 10: Run both spec files to verify everything passes**

Run: `cd "../x7-pos-back-end" && npx jest cash-drawers.service.spec.ts cash-drawers.controller.spec.ts`
Expected: PASS, all describe blocks (including the untouched `findAll`/`findOne`/`update`/`remove` ones).

- [ ] **Step 11: Commit**

```bash
cd "../x7-pos-back-end"
git add src/restaurant-operations/cashdrawer/cash-drawers/constants/cash-drawer-status.enum.ts \
        src/restaurant-operations/cashdrawer/cash-drawers/dto/create-cash-drawer.dto.ts \
        src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.controller.ts \
        src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.service.ts \
        src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.service.spec.ts \
        src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.controller.spec.ts
git commit -m "feat(cash-drawers): auto-inject shift and collaborator context on open"
```

---

### Task B2: Close flow — reconciliation and Discrepancy status (backend)

**Files:**
- Delete: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-drawers/dto/update-cash-drawer.dto.ts`
- Create: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-drawers/dto/close-cash-drawer.dto.ts`
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.controller.ts`
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.service.ts`
- Test: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.service.spec.ts` (the `describe('update', ...)` block)
- Test: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.controller.spec.ts` (the `describe('PUT /cash-drawers/:id (update)', ...)` block)

**Interfaces:**
- Consumes: `CashDrawerStatus.DISCREPANCY`, `mockUser: AuthenticatedUser` (both from Task B1).
- Produces: `CloseCashDrawerDto { closingBalance: number }`. `CashDrawersService.update(id: number, dto: CloseCashDrawerDto, user: AuthenticatedUser): Promise<OneCashDrawerResponseDto>`.

- [ ] **Step 1: Write the failing service test for the new `update()` (close) contract**

Replace the entire `describe('update', ...)` block (current lines 588-685 of `cash-drawers.service.spec.ts`) with:

```ts
  describe('update', () => {
    const closeCashDrawerDto: CloseCashDrawerDto = {
      closingBalance: 100.0,
    };

    it('should close a cash drawer when the closing balance matches the current balance', async () => {
      const closedCashDrawer = {
        ...mockCashDrawer,
        closing_balance: 100.0,
        closed_by: 1,
        status: CashDrawerStatus.CLOSE,
        closedByCollaborator: mockCollaborator,
      };
      jest
        .spyOn(cashDrawerRepository, 'findOne')
        .mockResolvedValueOnce(mockCashDrawer as any) // existing, current_balance = 100.0
        .mockResolvedValueOnce(closedCashDrawer as any); // refetched after update
      jest
        .spyOn(collaboratorRepository, 'findOne')
        .mockResolvedValue(mockCollaborator as any);
      jest
        .spyOn(cashDrawerRepository, 'update')
        .mockResolvedValue(undefined as any);

      const result = await service.update(1, closeCashDrawerDto, mockUser);

      expect(cashDrawerRepository.update).toHaveBeenCalledWith(1, {
        closing_balance: 100.0,
        closed_by: 1,
        status: CashDrawerStatus.CLOSE,
      });
      expect(result.statusCode).toBe(200);
      expect(result.data.status).toBe(CashDrawerStatus.CLOSE);
    });

    it('should mark the drawer as Discrepancy when the closing balance does not match the current balance', async () => {
      const mismatchedDto: CloseCashDrawerDto = { closingBalance: 90.0 };
      const discrepancyCashDrawer = {
        ...mockCashDrawer,
        closing_balance: 90.0,
        closed_by: 1,
        status: CashDrawerStatus.DISCREPANCY,
        closedByCollaborator: mockCollaborator,
      };
      jest
        .spyOn(cashDrawerRepository, 'findOne')
        .mockResolvedValueOnce(mockCashDrawer as any) // current_balance = 100.0
        .mockResolvedValueOnce(discrepancyCashDrawer as any);
      jest
        .spyOn(collaboratorRepository, 'findOne')
        .mockResolvedValue(mockCollaborator as any);
      jest
        .spyOn(cashDrawerRepository, 'update')
        .mockResolvedValue(undefined as any);

      const result = await service.update(1, mismatchedDto, mockUser);

      expect(cashDrawerRepository.update).toHaveBeenCalledWith(1, {
        closing_balance: 90.0,
        closed_by: 1,
        status: CashDrawerStatus.DISCREPANCY,
      });
      expect(result.data.status).toBe(CashDrawerStatus.DISCREPANCY);
    });

    it('should throw BadRequestException if id is invalid', async () => {
      await expect(
        service.update(0, closeCashDrawerDto, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when user has no merchant_id', async () => {
      const userWithoutMerchant = { ...mockUser, merchant: undefined as any };
      await expect(
        service.update(1, closeCashDrawerDto, userWithoutMerchant),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if cash drawer not found', async () => {
      jest.spyOn(cashDrawerRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.update(999, closeCashDrawerDto, mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.update(999, closeCashDrawerDto, mockUser),
      ).rejects.toThrow('Cash drawer not found');
    });

    it('should throw ConflictException if the drawer is not open', async () => {
      const alreadyClosedDrawer = {
        ...mockCashDrawer,
        status: CashDrawerStatus.CLOSE,
      };
      jest
        .spyOn(cashDrawerRepository, 'findOne')
        .mockResolvedValue(alreadyClosedDrawer as any);

      await expect(
        service.update(1, closeCashDrawerDto, mockUser),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.update(1, closeCashDrawerDto, mockUser),
      ).rejects.toThrow('Only an open cash drawer can be closed');
    });

    it('should throw BadRequestException when the user has no linked collaborator profile', async () => {
      jest
        .spyOn(cashDrawerRepository, 'findOne')
        .mockResolvedValue(mockCashDrawer as any);
      jest.spyOn(collaboratorRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.update(1, closeCashDrawerDto, mockUser),
      ).rejects.toThrow('No collaborator profile is linked to your account.');
    });
  });
```

Update the import at the top of the file from `UpdateCashDrawerDto` to `CloseCashDrawerDto`:

```ts
import { CloseCashDrawerDto } from './dto/close-cash-drawer.dto';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "../x7-pos-back-end" && npx jest cash-drawers.service.spec.ts`
Expected: FAIL — `close-cash-drawer.dto.ts` doesn't exist yet and `service.update` still has the old signature/logic.

- [ ] **Step 3: Replace the update DTO with a dedicated close DTO**

Delete `dto/update-cash-drawer.dto.ts`. Create `dto/close-cash-drawer.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsNotEmpty, Min } from 'class-validator';

export class CloseCashDrawerDto {
  @ApiProperty({
    example: 150.5,
    description: 'Physical cash count entered to close the cash drawer',
  })
  @IsNumber({}, { message: 'Closing balance must be a valid number' })
  @IsNotEmpty({ message: 'Closing balance is required' })
  @Min(0, { message: 'Closing balance must be greater than or equal to 0' })
  closingBalance: number;
}
```

- [ ] **Step 4: Rewrite `CashDrawersService.update()`**

In `cash-drawers.service.ts`, replace the `import { UpdateCashDrawerDto } from './dto/update-cash-drawer.dto';` line with:

```ts
import { CloseCashDrawerDto } from './dto/close-cash-drawer.dto';
```

Replace the entire `update()` method (current lines 383-545) with:

```ts
  async update(
    id: number,
    closeCashDrawerDto: CloseCashDrawerDto,
    user: AuthenticatedUser,
  ): Promise<OneCashDrawerResponseDto> {
    if (!id || id <= 0) {
      throw new BadRequestException(
        'Cash drawer ID must be a valid positive number',
      );
    }

    const authenticatedUserMerchantId = user?.merchant?.id;
    if (!authenticatedUserMerchantId) {
      throw new ForbiddenException(
        'You must be associated with a merchant to update cash drawers',
      );
    }

    const existingCashDrawer = await this.cashDrawerRepository.findOne({
      where: { id },
      relations: [
        'merchant',
        'shift',
        'shift.merchant',
        'openedByCollaborator',
        'closedByCollaborator',
      ],
    });

    if (!existingCashDrawer) {
      throw new NotFoundException('Cash drawer not found');
    }

    if (existingCashDrawer.merchant_id !== authenticatedUserMerchantId) {
      throw new ForbiddenException(
        'You can only update cash drawers from your merchant',
      );
    }

    if (existingCashDrawer.status !== CashDrawerStatus.OPEN) {
      throw new ConflictException('Only an open cash drawer can be closed');
    }

    if (closeCashDrawerDto.closingBalance < 0) {
      throw new BadRequestException('Closing balance must be non-negative');
    }

    const collaborator = await this.collaboratorRepository.findOne({
      where: { user_id: user.id, merchant_id: authenticatedUserMerchantId },
    });

    if (!collaborator) {
      throw new BadRequestException(
        'No collaborator profile is linked to your account.',
      );
    }

    // `current_balance`/`closingBalance` can arrive as numeric strings (decimal
    // column), so coerce both sides before comparing.
    const currentBalance = Number(existingCashDrawer.current_balance);
    const closingBalance = Number(closeCashDrawerDto.closingBalance);
    const status =
      closingBalance === currentBalance
        ? CashDrawerStatus.CLOSE
        : CashDrawerStatus.DISCREPANCY;

    await this.cashDrawerRepository.update(id, {
      closing_balance: closeCashDrawerDto.closingBalance,
      closed_by: collaborator.id,
      status,
    });

    const updatedCashDrawer = await this.cashDrawerRepository.findOne({
      where: { id },
      relations: [
        'merchant',
        'shift',
        'shift.merchant',
        'openedByCollaborator',
        'closedByCollaborator',
      ],
    });

    if (!updatedCashDrawer) {
      throw new NotFoundException('Cash drawer not found after update');
    }

    return {
      statusCode: 200,
      message: 'Cash drawer updated successfully',
      data: this.formatCashDrawerResponse(updatedCashDrawer),
    };
  }
```

- [ ] **Step 5: Run the service test to verify it passes**

Run: `cd "../x7-pos-back-end" && npx jest cash-drawers.service.spec.ts`
Expected: PASS for all describe blocks.

- [ ] **Step 6: Write the failing controller test for the new `update()` (close) wiring**

Replace the `describe('PUT /cash-drawers/:id (update)', ...)` block (current lines 303-461-ish of `cash-drawers.controller.spec.ts`) with:

```ts
  describe('PUT /cash-drawers/:id (update)', () => {
    const closeDto: CloseCashDrawerDto = {
      closingBalance: 150.0,
    };

    it('should close a cash drawer successfully', async () => {
      const updateSpy = jest.spyOn(service, 'update');
      const updatedResponse: OneCashDrawerResponseDto = {
        ...mockOneCashDrawerResponse,
        statusCode: 200,
        message: 'Cash drawer updated successfully',
        data: {
          ...mockCashDrawerResponseData,
          closingBalance: 150.0,
          status: CashDrawerStatus.CLOSE,
        },
      };
      updateSpy.mockResolvedValue(updatedResponse);

      const result = await controller.update(1, closeDto, mockUser as any);

      expect(updateSpy).toHaveBeenCalledWith(1, closeDto, mockUser);
      expect(result).toEqual(updatedResponse);
      expect(result.statusCode).toBe(200);
    });

    it('should handle service errors during update', async () => {
      const errorMessage = 'Cash drawer not found';
      const updateSpy = jest.spyOn(service, 'update');
      updateSpy.mockRejectedValue(new Error(errorMessage));

      await expect(
        controller.update(1, closeDto, mockUser as any),
      ).rejects.toThrow(errorMessage);
      expect(updateSpy).toHaveBeenCalledWith(1, closeDto, mockUser);
    });

    it('should propagate a Discrepancy status from the service response', async () => {
      const updateSpy = jest.spyOn(service, 'update');
      const discrepancyResponse: OneCashDrawerResponseDto = {
        ...mockOneCashDrawerResponse,
        statusCode: 200,
        message: 'Cash drawer updated successfully',
        data: {
          ...mockCashDrawerResponseData,
          closingBalance: 90.0,
          status: CashDrawerStatus.DISCREPANCY,
        },
      };
      updateSpy.mockResolvedValue(discrepancyResponse);

      const result = await controller.update(
        1,
        { closingBalance: 90.0 },
        mockUser as any,
      );

      expect(result.data.status).toBe(CashDrawerStatus.DISCREPANCY);
    });
  });
```

Update the import at the top of the file from `UpdateCashDrawerDto` to `CloseCashDrawerDto`:

```ts
import { CloseCashDrawerDto } from './dto/close-cash-drawer.dto';
```

- [ ] **Step 7: Run the controller test to verify it fails**

Run: `cd "../x7-pos-back-end" && npx jest cash-drawers.controller.spec.ts`
Expected: FAIL — `controller.update` still takes `(id, dto, req)` and imports the deleted `UpdateCashDrawerDto`.

- [ ] **Step 8: Wire `@CurrentUser()` into the controller's `update()`**

In `cash-drawers.controller.ts`, replace `import { UpdateCashDrawerDto } from './dto/update-cash-drawer.dto';` with:

```ts
import { CloseCashDrawerDto } from './dto/close-cash-drawer.dto';
```

Replace the `update()` handler (current lines 501-512) with:

```ts
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() closeCashDrawerDto: CloseCashDrawerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cashDrawersService.update(id, closeCashDrawerDto, user);
  }
```

Also update the Swagger decorators directly above `update()` (current lines 464-500) — replace from `@ApiBadRequestResponse({` through `@ApiBody({ type: UpdateCashDrawerDto })` with:

```ts
  @ApiBadRequestResponse({
    description:
      'Invalid input data, cash drawer ID, or no linked collaborator profile',
    example: {
      statusCode: 400,
      message: 'Cash drawer ID must be a valid positive number',
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - Invalid or missing JWT token',
    example: {
      statusCode: 401,
      message: 'Unauthorized',
    },
  })
  @ApiForbiddenResponse({
    description: 'Forbidden - Insufficient permissions or merchant mismatch',
    example: {
      statusCode: 403,
      message: 'You can only update cash drawers from your merchant',
    },
  })
  @ApiNotFoundResponse({
    description: 'Cash drawer not found',
    example: {
      statusCode: 404,
      message: 'Cash drawer not found',
    },
  })
  @ApiConflictResponse({
    description: 'Conflict - the cash drawer is not currently open',
    example: {
      statusCode: 409,
      message: 'Only an open cash drawer can be closed',
    },
  })
  @ApiParam({ name: 'id', type: Number, description: 'Cash drawer ID' })
  @ApiBody({ type: CloseCashDrawerDto })
```

- [ ] **Step 9: Run both spec files to verify everything passes**

Run: `cd "../x7-pos-back-end" && npx jest src/restaurant-operations/cashdrawer/cash-drawers`
Expected: PASS, all describe blocks in both files.

- [ ] **Step 10: Commit**

```bash
cd "../x7-pos-back-end"
git add src/restaurant-operations/cashdrawer/cash-drawers/dto/close-cash-drawer.dto.ts \
        src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.controller.ts \
        src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.service.ts \
        src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.service.spec.ts \
        src/restaurant-operations/cashdrawer/cash-drawers/cash-drawers.controller.spec.ts
git rm src/restaurant-operations/cashdrawer/cash-drawers/dto/update-cash-drawer.dto.ts
git commit -m "feat(cash-drawers): auto-inject closed_by and add Discrepancy reconciliation"
```

---

### Task F1: Open Cash Drawer — auto-injected context (frontend)

**Files:**
- Modify: `src/types/cash-drawer.ts:37-41`
- Modify: `src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx:40-155` (`OpenCashDrawerFormModal`)
- Test: `src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx:455-546`

**Interfaces:**
- Produces: `CreateCashDrawerDto { openingBalance: number }` (matches Task B1's backend contract).
- Consumes: `CashDrawer` type (unchanged), existing `mockFetchOnce`/`openDrawer` test fixtures.

- [ ] **Step 1: Write the failing component test for the shrunk Open modal**

Replace the entire `describe('CashDrawersView — Open Cash Drawer', ...)` block (current lines 455-546 of `CashDrawersView.test.tsx`) with:

```tsx
describe('CashDrawersView — Open Cash Drawer', () => {
  it('opens the create modal, validates the opening balance, submits a new session, closes the dialog, and refetches the list', async () => {
    mockFetchOnce([]);
    render(<CashDrawersView />);
    await screen.findByTestId('cash-drawers-empty-state');

    await userEvent.click(screen.getByRole('button', { name: /open cash drawer/i }));
    const dialog = screen.getByRole('dialog', { name: /open cash drawer/i });
    const submitButton = within(dialog).getByRole('button', { name: /open drawer/i });
    expect(submitButton).toBeDisabled();

    expect(
      within(dialog).getByText(/your active shift and collaborator profile are assigned automatically/i),
    ).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/shift id/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/opened by/i)).not.toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/opening balance/i), '100');
    expect(submitButton).toBeEnabled();

    // The success path refetches the list instead of splicing the raw POST
    // response into state, so the mock must answer both requests.
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === 'POST') {
        return {
          status: 201,
          ok: true,
          json: async () => ({ statusCode: 201, message: 'ok', data: openDrawer }),
        };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ statusCode: 200, message: 'ok', data: [openDrawer] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/cash-drawers'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ openingBalance: 100 }),
        }),
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/cash-drawers?'),
        expect.objectContaining({ headers: expect.anything() }),
      );
    });
    expect(await screen.findByText(/cash drawer opened successfully/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /open cash drawer/i })).not.toBeInTheDocument();
    expect(await screen.findByText('#CD-1')).toBeInTheDocument();
  });

  it('shows the backend conflict message inline in the dialog, keeps the dialog open, and preserves the typed opening balance on error', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    await userEvent.click(screen.getByRole('button', { name: /open cash drawer/i }));
    const dialog = screen.getByRole('dialog', { name: /open cash drawer/i });
    await userEvent.type(within(dialog).getByLabelText(/opening balance/i), '100');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
        json: async () => ({
          message:
            'An active cash drawer session (#CD-12) is already open for this shift. Please close the active session before opening a new drawer.',
        }),
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /open drawer/i }));

    await screen.findByText(/an active cash drawer session \(#cd-12\) is already open for this shift/i);

    const persistedDialog = screen.getByRole('dialog', { name: /open cash drawer/i });
    expect(persistedDialog).toBeInTheDocument();
    expect(
      within(persistedDialog).getByText(/an active cash drawer session \(#cd-12\) is already open for this shift/i),
    ).toBeInTheDocument();
    expect(within(persistedDialog).getByLabelText(/opening balance/i)).toHaveValue(100);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run CashDrawersView.test.tsx`
Expected: FAIL — the modal still renders Shift ID/Opened By inputs and posts the old payload shape.

- [ ] **Step 3: Shrink `CreateCashDrawerDto`**

In `src/types/cash-drawer.ts`, replace:

```ts
export interface CreateCashDrawerDto {
  shiftId: number;
  openingBalance: number;
  openedBy: number;
}
```

with:

```ts
export interface CreateCashDrawerDto {
  openingBalance: number;
}
```

- [ ] **Step 4: Simplify `OpenCashDrawerFormModal`**

In `CashDrawersView.tsx`, replace the entire `OpenCashDrawerFormModal` component (current lines 47-155) with:

```tsx
const OpenCashDrawerFormModal: React.FC<OpenCashDrawerFormModalProps> = ({
  submitting,
  error,
  onCancel,
  onSubmit,
}) => {
  const [openingBalance, setOpeningBalance] = useState('');

  const openingBalanceNum = parseFloat(openingBalance);
  const openingBalanceValid = openingBalance.trim() !== '' && !isNaN(openingBalanceNum) && openingBalanceNum >= 0;

  const isValid = openingBalanceValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({ openingBalance: openingBalanceNum });
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Open Cash Drawer"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Open Cash Drawer</span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <p className="text-sm text-[#5f5e5e]">
              Your active shift and collaborator profile are assigned automatically.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cash-drawer-opening-balance" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Opening Balance ($)
              </label>
              <input
                id="cash-drawer-opening-balance"
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
              />
            </div>
          </div>
          {error && (
            <div className="px-6 pb-2 shrink-0">
              <p role="alert" className="text-sm text-[#ae001a] font-medium">
                {error}
              </p>
            </div>
          )}
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
              Open Drawer
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run CashDrawersView.test.tsx`
Expected: PASS for `describe('CashDrawersView — Open Cash Drawer', ...)`. Other describe blocks are untouched by this task and must still pass.

- [ ] **Step 6: Commit**

```bash
git add src/types/cash-drawer.ts \
        src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx \
        src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx
git commit -m "feat(cash-drawers): drop manual shift/operator inputs from the Open modal"
```

---

### Task F2: Close Cash Drawer — reconciliation and Discrepancy (frontend)

**Files:**
- Modify: `src/types/cash-drawer.ts` (`CashDrawerStatus`, `CloseCashDrawerDto`)
- Modify: `src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx` (`STATUS_BADGE_CLASSES`, `CloseCashDrawerDialog`, status filter `<select>`, `CashDrawerDetailModal`)
- Test: `src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx` (the `describe('CashDrawersView — Close Drawer', ...)` block)

**Interfaces:**
- Consumes: `CreateCashDrawerDto` shrink from Task F1 (already applied).
- Produces: `CashDrawerStatus = 'Open' | 'Close' | 'Pause' | 'Discrepancy'`; `CloseCashDrawerDto { closingBalance: number }` (matches Task B2's backend contract).

- [ ] **Step 1: Write the failing component tests for Close/Discrepancy**

Replace the entire `describe('CashDrawersView — Close Drawer', ...)` block (current lines 564-659 of `CashDrawersView.test.tsx`) with:

```tsx
describe('CashDrawersView — Close Drawer', () => {
  it('only shows the close action for Open sessions', async () => {
    mockFetchOnce([openDrawer, closedDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    expect(screen.getByRole('button', { name: /close cash drawer 1/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close cash drawer 2/i })).not.toBeInTheDocument();
  });

  it('closes a drawer with just the closing balance, closes the dialog, and refetches the list', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash drawer 1/i }));
    expect(screen.queryByLabelText(/closed by/i)).not.toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: /confirm close/i });
    await userEvent.clear(screen.getByLabelText(/closing balance/i));
    await userEvent.type(screen.getByLabelText(/closing balance/i), '125.50');

    const closedResponse: CashDrawer = {
      ...openDrawer,
      closingBalance: 125.5,
      currentBalance: 125.5,
      status: 'Close',
      closedByCollaborator: { id: 11, name: 'Jane Smith', role: 'MANAGER' },
    };
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === 'PUT') {
        return {
          status: 200,
          ok: true,
          json: async () => ({ statusCode: 200, message: 'ok', data: closedResponse }),
        };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ statusCode: 200, message: 'ok', data: [closedResponse] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/cash-drawers/1'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ closingBalance: 125.5 }),
        }),
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/cash-drawers?'),
        expect.objectContaining({ headers: expect.anything() }),
      );
    });
    expect(await screen.findByText(/cash drawer closed successfully/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm close/i })).not.toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('shows a close-drawer error inline in the dialog, keeps it open, and preserves the typed closing balance on error', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash drawer 1/i }));
    await userEvent.clear(screen.getByLabelText(/closing balance/i));
    await userEvent.type(screen.getByLabelText(/closing balance/i), '150.50');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ message: 'No collaborator profile is linked to your account.' }),
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: /confirm close/i }));

    await screen.findByText(/no collaborator profile is linked to your account/i);

    expect(screen.getByRole('button', { name: /confirm close/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/closing balance/i)).toHaveValue(150.5);
  });

  it('marks the row and detail modal with a Discrepancy badge and a highlighted variance when the closing balance does not match the current balance', async () => {
    const discrepancyDrawer: CashDrawer = {
      ...openDrawer,
      id: 3,
      closingBalance: 90.0,
      currentBalance: 100.0,
      status: 'Discrepancy',
      closedByCollaborator: { id: 11, name: 'Jane Smith', role: 'MANAGER' },
    };
    mockFetchOnce([discrepancyDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-3');

    expect(screen.getByText('Discrepancy')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /view cash drawer 3 details/i }));
    const dialog = await screen.findByRole('dialog', { name: /cash drawer details/i });
    expect(within(dialog).getByText('Variance')).toBeInTheDocument();
    expect(within(dialog).getByText('-$10.00')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run CashDrawersView.test.tsx`
Expected: FAIL — the dialog still renders a Closed By input, `CashDrawerStatus`/`CloseCashDrawerDto` don't have room for `'Discrepancy'`, and no Variance row exists.

- [ ] **Step 3: Add `Discrepancy` to the status type and shrink `CloseCashDrawerDto`**

In `src/types/cash-drawer.ts`, replace:

```ts
export type CashDrawerStatus = 'Open' | 'Close' | 'Pause';
```

with:

```ts
export type CashDrawerStatus = 'Open' | 'Close' | 'Pause' | 'Discrepancy';
```

And replace:

```ts
export interface CloseCashDrawerDto {
  closingBalance: number;
  closedBy: number;
}
```

with:

```ts
export interface CloseCashDrawerDto {
  closingBalance: number;
}
```

- [ ] **Step 4: Add the `Discrepancy` badge color**

In `CashDrawersView.tsx`, replace:

```ts
export const STATUS_BADGE_CLASSES: Record<CashDrawerStatus, string> = {
  Open: 'bg-green-500/10 text-green-600',
  Close: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  Pause: 'bg-amber-500/10 text-amber-600',
};
```

with:

```ts
export const STATUS_BADGE_CLASSES: Record<CashDrawerStatus, string> = {
  Open: 'bg-green-500/10 text-green-600',
  Close: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  Pause: 'bg-amber-500/10 text-amber-600',
  Discrepancy: 'bg-orange-500/10 text-orange-700',
};
```

- [ ] **Step 5: Simplify `CloseCashDrawerDialog`**

Replace the entire `CloseCashDrawerDialog` component with:

```tsx
const CloseCashDrawerDialog: React.FC<CloseCashDrawerDialogProps> = ({
  drawer,
  submitting,
  error,
  onCancel,
  onConfirm,
}) => {
  const [closingBalance, setClosingBalance] = useState(String(drawer.currentBalance));

  const closingBalanceNum = parseFloat(closingBalance);
  const closingBalanceValid = closingBalance.trim() !== '' && !isNaN(closingBalanceNum) && closingBalanceNum >= 0;

  const isValid = closingBalanceValid;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-center p-4">
      <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left">
        <p className="font-bold text-[#1d1c17]">Close cash drawer #CD-{drawer.id}?</p>
        <p className="text-sm text-[#5f5e5e] mt-2">
          Enter the final closing balance. The closing operator is recorded automatically from your session.
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="close-drawer-balance" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Closing Balance ($)
            </label>
            <input
              id="close-drawer-balance"
              type="number"
              step="0.01"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
              className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-[#ae001a] font-medium mt-4">
            {error}
          </p>
        )}
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
            disabled={!isValid || submitting}
            onClick={() => onConfirm({ closingBalance: closingBalanceNum })}
            className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] disabled:opacity-40 text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
          >
            Confirm Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
```

- [ ] **Step 6: Add `Discrepancy` to the status filter `<select>`**

In the main `CashDrawersView` component's JSX, replace:

```tsx
          <option value="">All Statuses</option>
          <option value="Open">Open</option>
          <option value="Close">Close</option>
          <option value="Pause">Pause</option>
```

with:

```tsx
          <option value="">All Statuses</option>
          <option value="Open">Open</option>
          <option value="Close">Close</option>
          <option value="Pause">Pause</option>
          <option value="Discrepancy">Discrepancy</option>
```

- [ ] **Step 7: Add the Variance row to `CashDrawerDetailModal`**

Replace:

```tsx
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Opening</p>
              <p>{formatCurrency(drawer.openingBalance)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Current</p>
              <p>{formatCurrency(drawer.currentBalance)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Closing</p>
              <p>{drawer.closingBalance == null ? '--' : formatCurrency(drawer.closingBalance)}</p>
            </div>
          </div>
```

with:

```tsx
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Opening</p>
              <p>{formatCurrency(drawer.openingBalance)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Current</p>
              <p>{formatCurrency(drawer.currentBalance)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Closing</p>
              <p>{drawer.closingBalance == null ? '--' : formatCurrency(drawer.closingBalance)}</p>
            </div>
          </div>
          {drawer.closingBalance != null && (
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Variance</p>
              {(() => {
                const variance = drawer.closingBalance - drawer.currentBalance;
                const isBalanced = variance === 0;
                return (
                  <p className={isBalanced ? 'text-[#1d1c17]' : 'font-bold text-orange-700'}>
                    {isBalanced
                      ? formatCurrency(0)
                      : `${variance > 0 ? '+' : '-'}${formatCurrency(Math.abs(variance))}`}
                  </p>
                );
              })()}
            </div>
          )}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run CashDrawersView.test.tsx`
Expected: PASS, entire file.

- [ ] **Step 9: Run the full frontend test suite and the tsc build check**

Run: `npx vitest run` — confirm no regressions elsewhere.
Run: `npx tsc --build --noEmit --force` — this repo's plain `tsc --noEmit` is a no-op; this is the form that actually type-checks (per project convention). Confirm zero errors.

- [ ] **Step 10: Commit**

```bash
git add src/types/cash-drawer.ts \
        src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx \
        src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx
git commit -m "feat(cash-drawers): add Discrepancy reconciliation UI and drop manual closed-by input"
```

---

## Self-Review Notes

- **Spec coverage:** Auto-injection of `shift_id`/`opened_by`/`merchant_id` on open → Task B1. Single-active-drawer guard (message + merchant scoping) → Task B1 Step 5. Auto-injection of `closed_by` and Close/Discrepancy branching → Task B2. Opening balance `>= 0.00` validation → already enforced, verified untouched in B1/F1. Frontend UI for all of the above → F1/F2.
- **Type consistency:** `CreateCashDrawerDto`/`CloseCashDrawerDto` shapes match exactly between backend DTOs (B1/B2) and frontend types (F1/F2). `CashDrawerStatus`/`CashDrawerStatus` enum member `DISCREPANCY`/`'Discrepancy'` match between backend enum (B1) and frontend union type (F2).
- **Task boundary check:** Each task leaves its repo's test suite fully green — B1 doesn't touch `update()`, so Task B2 can be reviewed/merged independently; F1 doesn't touch the Close dialog, so F2 is independently reviewable.
