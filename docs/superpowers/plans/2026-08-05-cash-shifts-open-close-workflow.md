# Cash Shifts Open/Close Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps between the story and the already-largely-built `cash-shifts` backend module (add a `DISCREPANCY` status, auto-inject `openedBy`/`closedBy` from the JWT instead of trusting client input, enrich the response with collaborator names), and build the missing `CashShiftsView` frontend screen with a blind cash-count closing flow.

**Architecture:** Backend (`CashShiftsService`/`CashShiftsController` in `x7-pos-back-end`) resolves the acting Collaborator server-side from `@CurrentUser()` on both open and close, replacing client-supplied `collaboratorId`; close compares `declaredAmount` to the computed `systemAmount` (both rounded to cents) to decide `CLOSED` vs `DISCREPANCY`. Frontend (`CashShiftsView.tsx`, new, in `x7-pos-backoffice`) lists shifts, opens new ones against an availability-filtered drawer dropdown, and closes them through a dialog that never fetches or renders `systemAmount` before submit — the blind-count requirement is enforced by simply not requesting that data until after the close call returns.

**Tech Stack:** Backend: NestJS + TypeORM (Postgres), Jest. Frontend: React 19 + TypeScript + Vite, Vitest + Testing Library.

**Spec:** [`docs/superpowers/specs/2026-08-05-cash-shifts-open-close-workflow-design.md`](../specs/2026-08-05-cash-shifts-open-close-workflow-design.md)

## Global Constraints

- `collaboratorId` is never accepted from the request body on either `POST /cash-shifts` or `POST /cash-shifts/:id/close` — always resolved server-side via `collaboratorRepo.findOne({ where: { user_id: user.id, merchant_id } })`.
- Per-drawer guard conflict message, verbatim: `` `Cash Drawer #${cashDrawerId} already has an active shift session (#CS-${existingDrawerShift.id}) in progress. Please close the active shift before opening a new one.` ``
- Per-collaborator guard stays as-is (message unchanged): `` `This collaborator already has an open cash shift (ID: ${existingCollaboratorShift.id}). Close it before opening a new one.` ``
- Closing sets `status = CLOSED` when `declaredAmount === systemAmount` **after both are rounded to 2 decimal places** (`Math.round(x * 100) / 100`), else `status = DISCREPANCY`. No third outcome.
- The "MERCHANT_USER can only close a shift they opened" rule is preserved — it now compares `shift.openedBy` against the auto-resolved collaborator id instead of a client-supplied one.
- No DB migration — `opened_by`/`closed_by` already exist as plain `int` columns on `cash_shifts`; the new `ManyToOne` relations join on them without a schema change (`synchronize: true`).
- The Close Shift dialog (frontend) must never fetch or render `systemAmount` before the close request is submitted — that omission is the entire blind-count mechanism, not a separate flag to toggle.
- `GET /cash-shifts` takes no query params — all frontend filtering (status, search) is client-side over the already-fetched list.
- Backend repo root for every backend path below: `../x7-pos-back-end` (sibling of this repo). Frontend paths are relative to this repo's root.
- **Known pre-existing baseline failure, confirmed before any task in this plan started:** `cash-shifts.service.spec.ts`'s `describe('addManualTransaction', ...)` block already fails 2/2 tests (`queryRunner.manager.createQueryBuilder is not a function` — a mock-setup gap in `mockEntityManager`, not a service bug). `addManualTransaction` is untouched by this plan (out of scope per the design spec) and this block is carried over byte-for-byte unchanged. Do not attempt to fix it — it is not this plan's concern. When a step says "Expected: PASS, all describe blocks," that means `openShift` and `closeShift` (and `addManualTransaction` staying at its pre-existing 2-failing baseline, not newly broken).

---

### Task B1: Collaborator enrichment, DISCREPANCY status, and open-flow auto-injection (backend)

**Files:**
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-shifts/constants/cash-shift-status.enum.ts`
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-shifts/dto/create-cash-shift.dto.ts`
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-shifts/dto/cash-shift-response.dto.ts`
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-shifts/entities/cash-shift.entity.ts`
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-shifts/cash-shifts.service.ts`
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-shifts/cash-shifts.controller.ts:36-47`
- Test: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-shifts/cash-shifts.service.spec.ts`

**Interfaces:**
- Produces: `CashShiftStatus.DISCREPANCY = 'DISCREPANCY'` (used by Task B2). `CreateCashShiftDto { cashDrawerId: number; openingBalance: number }` (no `collaboratorId`). `BasicCollaboratorInfoDto { id, name, role }` and `CashShiftResponseDto.openedByCollaborator/closedByCollaborator: BasicCollaboratorInfoDto | null`. `CashShiftsService.openShift(dto: CreateCashShiftDto, user: AuthenticatedUser): Promise<OneCashShiftResponseDto>`.
- Consumes: existing `collaboratorRepo`, `cashDrawerRepo`, `cashShiftRepo` already injected into `CashShiftsService` (no module wiring changes needed).

- [ ] **Step 1: Write the failing service tests**

Replace the entire contents of `cash-shifts.service.spec.ts` with:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { CashShiftsService } from './cash-shifts.service';
import { CashShift } from './entities/cash-shift.entity';
import { CashShiftStatus } from './constants/cash-shift-status.enum';
import { CashDrawer } from '../cash-drawers/entities/cash-drawer.entity';
import { CashDrawerStatus } from '../cash-drawers/constants/cash-drawer-status.enum';
import { Merchant } from '../../../platform-saas/merchants/entities/merchant.entity';
import { Collaborator } from '../../../finance-hr/hr/collaborators/entities/collaborator.entity';
import { CashShiftRepository } from './cash-shift.repository';
import { CashFlowService } from './cash-flow.service';
import { CreateCashShiftDto } from './dto/create-cash-shift.dto';
import { CloseCashShiftDto } from './dto/close-cash-shift.dto';
import { ManualCashTransactionDto } from './dto/manual-cash-transaction.dto';
import { CashShiftMovementType } from './constants/cash-shift-movement-type.enum';
import { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { UserRole } from '../../../platform-saas/users/constants/role.enum';
import { Scope } from '../../../platform-saas/users/constants/scope.enum';

describe('CashShiftsService', () => {
  let service: CashShiftsService;
  let cashDrawerRepo: Repository<CashDrawer>;
  let collaboratorRepo: Repository<Collaborator>;
  let cashShiftRepo: CashShiftRepository;
  let cashFlowService: CashFlowService;

  const mockCashDrawerRepository = {
    findOne: jest.fn(),
  };

  const mockMerchantRepository = {
    findOne: jest.fn(),
  };

  const mockCollaboratorRepository = {
    findOne: jest.fn(),
  };

  const mockCashShiftRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    getLiveBalance: jest.fn(),
    getSalesSummary: jest.fn(),
  };

  const mockCashFlowService = {
    addMovement: jest.fn(),
  };

  const mockEntityManager = {
    findOne: jest.fn(),
    query: jest.fn(),
    getRepository: jest.fn().mockReturnThis(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: mockEntityManager,
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  // Collaborator linked to the currently authenticated user (activeUser below).
  const mockCollaborator = {
    id: 5,
    user_id: 1,
    merchant_id: 10,
    name: 'John Doe',
    role: 'WAITER',
  };

  // A different collaborator, used for "someone else opened/closes this shift" cases.
  const mockOtherCollaborator = {
    id: 8,
    user_id: 2,
    merchant_id: 10,
    name: 'Mark Lee',
    role: 'MANAGER',
  };

  const activeUser: AuthenticatedUser = {
    id: 1,
    email: 'cashier@test.com',
    role: UserRole.MERCHANT_USER,
    scope: Scope.MERCHANT_WEB,
    merchant: { id: 10 },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashShiftsService,
        {
          provide: getRepositoryToken(CashDrawer),
          useValue: mockCashDrawerRepository,
        },
        {
          provide: getRepositoryToken(Merchant),
          useValue: mockMerchantRepository,
        },
        {
          provide: getRepositoryToken(Collaborator),
          useValue: mockCollaboratorRepository,
        },
        {
          provide: CashShiftRepository,
          useValue: mockCashShiftRepository,
        },
        {
          provide: CashFlowService,
          useValue: mockCashFlowService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<CashShiftsService>(CashShiftsService);
    cashDrawerRepo = module.get<Repository<CashDrawer>>(
      getRepositoryToken(CashDrawer),
    );
    collaboratorRepo = module.get<Repository<Collaborator>>(
      getRepositoryToken(Collaborator),
    );
    cashShiftRepo = module.get<CashShiftRepository>(CashShiftRepository);
    cashFlowService = module.get<CashFlowService>(CashFlowService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('openShift', () => {
    const createDto: CreateCashShiftDto = {
      cashDrawerId: 1,
      openingBalance: 100,
    };

    it('should resolve the collaborator from the JWT and open a shift successfully', async () => {
      jest
        .spyOn(collaboratorRepo, 'findOne')
        .mockResolvedValue(mockCollaborator as any);
      jest.spyOn(cashDrawerRepo, 'findOne').mockResolvedValue({
        id: 1,
        merchant_id: 10,
        status: CashDrawerStatus.OPEN,
      } as any);
      const savedShift = {
        id: 99,
        merchantId: 10,
        cashDrawerId: 1,
        openedBy: 5,
        closedBy: null,
        openingBalance: 100,
        systemAmount: null,
        declaredAmount: null,
        difference: null,
        status: CashShiftStatus.OPEN,
        openedAt: new Date(),
        closedAt: null,
      };
      jest.spyOn(cashShiftRepo, 'create').mockReturnValue(savedShift as any);
      jest.spyOn(cashShiftRepo, 'save').mockResolvedValue(savedShift as any);
      // Exactly 3 queued values for the 3 real cashShiftRepo.findOne calls this
      // path makes, in order: the per-collaborator guard, the per-drawer guard,
      // and the post-save refetch-with-relations.
      jest
        .spyOn(cashShiftRepo, 'findOne')
        .mockResolvedValueOnce(null) // collaborator guard
        .mockResolvedValueOnce(null) // drawer guard
        .mockResolvedValueOnce({
          ...savedShift,
          openedByCollaborator: mockCollaborator,
          closedByCollaborator: null,
        } as any); // post-save refetch with relations

      const result = await service.openShift(createDto, activeUser);

      expect(collaboratorRepo.findOne).toHaveBeenCalledWith({
        where: { user_id: 1, merchant_id: 10 },
      });
      expect(cashShiftRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ openedBy: 5, cashDrawerId: 1, openingBalance: 100 }),
      );
      expect(result.statusCode).toBe(201);
      expect(result.message).toBe('Cash shift opened successfully');
      expect(result.data.id).toBe(99);
      expect(result.data.status).toBe(CashShiftStatus.OPEN);
      expect(result.data.openedByCollaborator).toEqual({
        id: 5,
        name: 'John Doe',
        role: 'WAITER',
      });
      expect(result.data.closedByCollaborator).toBeNull();
    });

    it('should throw ForbiddenException when the user has no merchant', async () => {
      const userWithoutMerchant = { ...activeUser, merchant: undefined as any };
      await expect(
        service.openShift(createDto, userWithoutMerchant),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when the user has no linked collaborator profile', async () => {
      jest.spyOn(collaboratorRepo, 'findOne').mockResolvedValue(null);

      await expect(service.openShift(createDto, activeUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.openShift(createDto, activeUser)).rejects.toThrow(
        'Your user account is not linked to any collaborator record. Cannot open cash shift.',
      );
    });

    it('should throw ConflictException if the resolved collaborator already has an open shift', async () => {
      jest
        .spyOn(collaboratorRepo, 'findOne')
        .mockResolvedValue(mockCollaborator as any);
      jest
        .spyOn(cashShiftRepo, 'findOne')
        .mockResolvedValueOnce({ id: 98, status: CashShiftStatus.OPEN } as any);

      await expect(service.openShift(createDto, activeUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException naming the active session id when the drawer already has an open shift', async () => {
      jest
        .spyOn(collaboratorRepo, 'findOne')
        .mockResolvedValue(mockCollaborator as any);
      jest
        .spyOn(cashShiftRepo, 'findOne')
        .mockResolvedValueOnce(null) // collaborator guard
        .mockResolvedValueOnce({ id: 42, status: CashShiftStatus.OPEN } as any); // drawer guard

      // A single invocation, inspected once: two separate `await expect(...)`
      // calls would each re-invoke openShift and exhaust the two queued
      // `mockResolvedValueOnce` values between them, so the second call
      // would fall through to `cashDrawerRepo.findOne` (unmocked here) and
      // throw a different exception than the one under test.
      const error: unknown = await service
        .openShift(createDto, activeUser)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(
        'Cash Drawer #1 already has an active shift session (#CS-42) in progress. Please close the active shift before opening a new one.',
      );
    });
  });

  describe('closeShift', () => {
    const closeDto: CloseCashShiftDto = {
      declaredAmount: 150,
      collaboratorId: 5,
    };

    const activeShift = {
      id: 99,
      merchantId: 10,
      cashDrawerId: 1,
      openedBy: 5,
      openingBalance: 100,
      status: CashShiftStatus.OPEN,
      openedAt: new Date(),
    };

    it('should close a shift successfully and calculate discrepancy (difference)', async () => {
      jest
        .spyOn(cashShiftRepo, 'findOne')
        .mockResolvedValueOnce({ ...activeShift } as any)
        .mockResolvedValueOnce({
          ...activeShift,
          status: CashShiftStatus.CLOSED,
          systemAmount: 120,
          declaredAmount: 150,
          difference: 30,
          closedBy: 5,
          closedAt: new Date(),
          openedByCollaborator: mockCollaborator,
          closedByCollaborator: mockCollaborator,
        } as any);
      jest
        .spyOn(collaboratorRepo, 'findOne')
        .mockResolvedValueOnce(mockCollaborator as any) // check for MERCHANT_USER self check
        .mockResolvedValueOnce(mockCollaborator as any); // check for closing collaborator
      jest.spyOn(cashShiftRepo, 'getLiveBalance').mockResolvedValue(120); // 100 opening + 20 sales
      jest
        .spyOn(cashShiftRepo, 'save')
        .mockImplementation(async (s) => s as any);
      jest
        .spyOn(cashShiftRepo, 'getSalesSummary')
        .mockResolvedValue([{ method: 'Cash', amount: 20 }]);

      const result = await service.closeShift(99, closeDto, activeUser);

      expect(result.statusCode).toBe(200);
      expect(result.data.systemAmount).toBe(120);
      expect(result.data.declaredAmount).toBe(150);
      expect(result.data.difference).toBe(30); // 150 declared - 120 system = 30 overage
      expect(result.data.status).toBe(CashShiftStatus.CLOSED);
      expect(result.data.closedByCollaborator).toEqual({
        id: 5,
        name: 'John Doe',
        role: 'WAITER',
      });
      expect(result.data.salesSummary).toEqual([
        { method: 'Cash', amount: 20 },
      ]);
    });

    it('should throw ForbiddenException if MERCHANT_USER tries to close other collaborator shift', async () => {
      jest
        .spyOn(cashShiftRepo, 'findOne')
        .mockResolvedValue({ ...activeShift, openedBy: 8 } as any); // Opened by collaborator 8
      jest
        .spyOn(collaboratorRepo, 'findOne')
        .mockResolvedValue(mockCollaborator as any); // Current user is collaborator 5

      await expect(
        service.closeShift(99, closeDto, activeUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow MERCHANT_ADMIN to close other collaborator shift', async () => {
      const adminUser = { ...activeUser, role: UserRole.MERCHANT_ADMIN };
      jest
        .spyOn(cashShiftRepo, 'findOne')
        .mockResolvedValueOnce({ ...activeShift, openedBy: 8 } as any)
        .mockResolvedValueOnce({
          ...activeShift,
          openedBy: 8,
          status: CashShiftStatus.CLOSED,
          systemAmount: 100,
          declaredAmount: 150,
          difference: 50,
          closedBy: 5,
          openedByCollaborator: mockOtherCollaborator,
          closedByCollaborator: mockCollaborator,
        } as any);
      jest
        .spyOn(collaboratorRepo, 'findOne')
        .mockResolvedValue(mockCollaborator as any); // Closing collaborator is 5
      jest.spyOn(cashShiftRepo, 'getLiveBalance').mockResolvedValue(100);
      jest
        .spyOn(cashShiftRepo, 'save')
        .mockImplementation(async (s) => s as any);
      jest.spyOn(cashShiftRepo, 'getSalesSummary').mockResolvedValue([]);

      const result = await service.closeShift(99, closeDto, adminUser);

      expect(result.statusCode).toBe(200);
      expect(result.data.status).toBe(CashShiftStatus.CLOSED);
      expect(result.data.closedByCollaborator?.id).toBe(5);
    });
  });

  describe('addManualTransaction', () => {
    const manualDto: ManualCashTransactionDto = {
      amount: 50,
      type: CashShiftMovementType.OUT,
      collaboratorId: 5,
      reason: 'Payment to supplier',
    };

    const activeShift = {
      id: 99,
      merchantId: 10,
      cashDrawerId: 1,
      openedBy: 5,
      openingBalance: 100,
      status: CashShiftStatus.OPEN,
    };

    it('should register an OUT flow successfully if balance is sufficient', async () => {
      jest
        .spyOn(cashShiftRepo, 'findOne')
        .mockResolvedValue(activeShift as any);
      jest
        .spyOn(collaboratorRepo, 'findOne')
        .mockResolvedValue({ id: 5, merchant_id: 10 } as any);

      mockEntityManager.findOne.mockResolvedValue(activeShift);
      mockEntityManager.query.mockResolvedValue([{ balance: '120' }]);
      jest
        .spyOn(cashFlowService, 'addMovement')
        .mockResolvedValue({ id: 1, amount: 50, type: 'withdrawal' } as any);

      const result = await service.addManualTransaction(99, manualDto, 10);

      expect(result.statusCode).toBe(201);
      expect(result.message).toBe('Manual transaction registered successfully');
      expect(result.data.amount).toBe(50);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException for OUT flow if balance is insufficient (CAT 1)', async () => {
      jest
        .spyOn(cashShiftRepo, 'findOne')
        .mockResolvedValue(activeShift as any);
      jest
        .spyOn(collaboratorRepo, 'findOne')
        .mockResolvedValue({ id: 5, merchant_id: 10 } as any);

      mockEntityManager.findOne.mockResolvedValue(activeShift);
      mockEntityManager.query.mockResolvedValue([{ balance: '30' }]);

      await expect(
        service.addManualTransaction(99, manualDto, 10),
      ).rejects.toThrow(BadRequestException);
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException if trying to write on a CLOSED shift', async () => {
      jest.spyOn(cashShiftRepo, 'findOne').mockResolvedValue({
        ...activeShift,
        status: CashShiftStatus.CLOSED,
      } as any);

      await expect(
        service.addManualTransaction(99, manualDto, 10),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "../x7-pos-back-end" && npx jest cash-shifts.service.spec.ts`
Expected: FAIL — `service.openShift` still takes `(dto, merchantId: number)` and `CreateCashShiftDto` still requires `collaboratorId`; `result.data.openedByCollaborator` is `undefined` because the response still returns bare `openedBy`/`closedBy` numbers.

- [ ] **Step 3: Add the `DISCREPANCY` status**

In `constants/cash-shift-status.enum.ts`:

```ts
export enum CashShiftStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  DISCREPANCY = 'DISCREPANCY',
}
```

- [ ] **Step 4: Shrink `CreateCashShiftDto`**

Replace the full contents of `dto/create-cash-shift.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsPositive, Min } from 'class-validator';

export class CreateCashShiftDto {
  @ApiProperty({
    example: 1,
    description: 'ID of the physical cash drawer where the shift is opened',
  })
  @IsInt()
  @IsPositive()
  cashDrawerId: number;

  @ApiProperty({
    example: 1000.0,
    description: 'Opening balance of the cash shift',
  })
  @IsNumber()
  @Min(0)
  openingBalance: number;
}
```

- [ ] **Step 5: Add `Collaborator` relations to the entity**

In `entities/cash-shift.entity.ts`, add this import alongside the existing ones:

```ts
import { Collaborator } from '../../../../finance-hr/hr/collaborators/entities/collaborator.entity';
```

Then add these two relations inside the `// ── Relations ──` section (after the existing `cashDrawer` relation, before `cashTransactions`):

```ts
    @ManyToOne(() => Collaborator, { nullable: false })
    @JoinColumn({ name: 'opened_by' })
    openedByCollaborator: Collaborator;

    @ManyToOne(() => Collaborator, { nullable: true })
    @JoinColumn({ name: 'closed_by' })
    closedByCollaborator: Collaborator | null;
```

- [ ] **Step 6: Rewrite the response DTO with collaborator objects**

Replace the full contents of `dto/cash-shift-response.dto.ts`:

```ts
// Response DTO for Cash Shift entity and calculations
import { CashShiftStatus } from '../constants/cash-shift-status.enum';
import { CashMovementResponseDto } from '../../cash-movements/dto/cash-movement-response.dto';

export class BasicCollaboratorInfoDto {
  id: number;
  name: string;
  role: string;
}

export class CashShiftResponseDto {
  id: number;
  merchantId: number;
  cashDrawerId: number;
  openedByCollaborator: BasicCollaboratorInfoDto;
  closedByCollaborator: BasicCollaboratorInfoDto | null;
  openingBalance: number;
  systemAmount: number | null;
  declaredAmount: number | null;
  difference: number | null;
  status: CashShiftStatus;
  openedAt: Date;
  closedAt: Date | null;
  salesSummary?: { method: string; amount: number }[];
  expenses?: CashMovementResponseDto[];
  totalExpenses?: number;
  manualInflows?: CashMovementResponseDto[];
  totalManualInflows?: number;
}

export class OneCashShiftResponseDto {
  statusCode: number;
  message: string;
  data: CashShiftResponseDto;
}

export class AllCashShiftsResponseDto {
  statusCode: number;
  message: string;
  data: CashShiftResponseDto[];
}
```

- [ ] **Step 7: Rewrite `format()` to emit collaborator objects**

In `cash-shifts.service.ts`, replace the entire `private format(...)` method (current lines 49-104) with:

```ts
  private format(
    shift: CashShift,
    salesSummary?: { method: string; amount: number }[],
    movements?: CashMovement[],
  ): CashShiftResponseDto {
    const mappedMovements = movements || shift.cashMovements || [];

    const expenses = mappedMovements.filter(
      (m) => m.type === CashMovementType.OUTFLOW,
    );
    const totalExpenses = expenses.reduce(
      (sum, m) => sum + Number(m.amount),
      0,
    );

    const manualInflows = mappedMovements.filter(
      (m) => m.type === CashMovementType.INFLOW,
    );
    const totalManualInflows = manualInflows.reduce(
      (sum, m) => sum + Number(m.amount),
      0,
    );

    const formatMovement = (m: CashMovement) => ({
      id: m.id,
      shiftId: m.shiftId,
      amount: Number(m.amount),
      reason: m.reason,
      receiptPhoto: m.receiptPhoto,
      userId: m.userId,
      type: m.type,
      createdAt: m.createdAt,
    });

    return {
      id: shift.id,
      merchantId: shift.merchantId,
      cashDrawerId: shift.cashDrawerId,
      openedByCollaborator: {
        id: shift.openedByCollaborator.id,
        name: shift.openedByCollaborator.name,
        role: shift.openedByCollaborator.role,
      },
      closedByCollaborator: shift.closedByCollaborator
        ? {
            id: shift.closedByCollaborator.id,
            name: shift.closedByCollaborator.name,
            role: shift.closedByCollaborator.role,
          }
        : null,
      openingBalance: Number(shift.openingBalance),
      systemAmount:
        shift.systemAmount !== null ? Number(shift.systemAmount) : null,
      declaredAmount:
        shift.declaredAmount !== null ? Number(shift.declaredAmount) : null,
      difference: shift.difference !== null ? Number(shift.difference) : null,
      status: shift.status,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      salesSummary,
      totalExpenses,
      expenses: expenses.map(formatMovement),
      manualInflows: manualInflows.map(formatMovement),
      totalManualInflows,
    };
  }
```

- [ ] **Step 8: Rewrite `openShift()` for auto-injection and the reworded conflict message**

Replace the entire `openShift()` method (current lines 114-192) with:

```ts
  async openShift(
    dto: CreateCashShiftDto,
    user: AuthenticatedUser,
  ): Promise<OneCashShiftResponseDto> {
    const merchantId = user.merchant?.id;
    if (!merchantId) {
      throw new ForbiddenException('User must belong to a merchant');
    }

    const collaborator = await this.collaboratorRepo.findOne({
      where: { user_id: user.id, merchant_id: merchantId },
    });
    if (!collaborator) {
      throw new ForbiddenException(
        'Your user account is not linked to any collaborator record. Cannot open cash shift.',
      );
    }

    // Validate that the collaborator does not already have an active shift
    const existingCollaboratorShift = await this.cashShiftRepo.findOne({
      where: { openedBy: collaborator.id, status: CashShiftStatus.OPEN },
    });
    if (existingCollaboratorShift) {
      throw new ConflictException(
        `This collaborator already has an open cash shift (ID: ${existingCollaboratorShift.id}). Close it before opening a new one.`,
      );
    }

    // Validate that the cash drawer does not already have an active shift
    const existingDrawerShift = await this.cashShiftRepo.findOne({
      where: { cashDrawerId: dto.cashDrawerId, status: CashShiftStatus.OPEN },
    });
    if (existingDrawerShift) {
      throw new ConflictException(
        `Cash Drawer #${dto.cashDrawerId} already has an active shift session (#CS-${existingDrawerShift.id}) in progress. Please close the active shift before opening a new one.`,
      );
    }

    // Validate cash drawer
    const cashDrawer = await this.cashDrawerRepo.findOne({
      where: { id: dto.cashDrawerId },
    });
    if (!cashDrawer) {
      throw new NotFoundException(
        `Cash drawer with ID ${dto.cashDrawerId} not found`,
      );
    }
    if (cashDrawer.merchant_id !== merchantId) {
      throw new ForbiddenException(
        'The cash drawer does not belong to your merchant',
      );
    }
    if (cashDrawer.status !== CashDrawerStatus.OPEN) {
      throw new BadRequestException(
        'The cash drawer must be in OPEN status to open a cash shift',
      );
    }

    const shift = this.cashShiftRepo.create({
      merchantId,
      cashDrawerId: dto.cashDrawerId,
      openedBy: collaborator.id,
      closedBy: null,
      openingBalance: dto.openingBalance,
      systemAmount: null,
      declaredAmount: null,
      difference: null,
      status: CashShiftStatus.OPEN,
      closedAt: null,
    });

    const saved = await this.cashShiftRepo.save(shift);

    const shiftWithRelations = await this.cashShiftRepo.findOne({
      where: { id: saved.id },
      relations: ['openedByCollaborator', 'closedByCollaborator'],
    });

    return {
      statusCode: 201,
      message: 'Cash shift opened successfully',
      data: this.format(shiftWithRelations || saved),
    };
  }
```

- [ ] **Step 9: Load the collaborator relations everywhere else `format()` is called**

In `cash-shifts.service.ts`, `closeShift()` currently refetches with `relations: ['cashMovements']` before calling `format()`. Replace that one line (current line 283) with:

```ts
    const shiftWithRelations = await this.cashShiftRepo.findOne({
      where: { id: shiftId },
      relations: ['cashMovements', 'openedByCollaborator', 'closedByCollaborator'],
    });
```

In `findActiveShift()`, replace the `relations: ['cashMovements']` line (current line 425) with:

```ts
    const shift = await this.cashShiftRepo.findOne({
      where: { merchantId, status: CashShiftStatus.OPEN },
      relations: ['cashMovements', 'openedByCollaborator', 'closedByCollaborator'],
    });
```

In `findAll()`, replace the `relations: ['cashMovements']` line (current line 454) with:

```ts
    const shifts = await this.cashShiftRepo.find({
      where: { merchantId },
      relations: ['cashMovements', 'openedByCollaborator', 'closedByCollaborator'],
      order: { openedAt: 'DESC' },
    });
```

In `findOne()`, replace the `relations: ['cashMovements']` line (current line 483) with:

```ts
    const shift = await this.cashShiftRepo.findOne({
      where: { id },
      relations: ['cashMovements', 'openedByCollaborator', 'closedByCollaborator'],
    });
```

- [ ] **Step 10: Wire the controller's `openShift()` to pass the full user**

In `cash-shifts.controller.ts`, replace the `openShift()` handler (current lines 42-47):

```ts
    @Post()
    openShift(
        @Body() dto: CreateCashShiftDto,
        @CurrentUser() user: AuthenticatedUser,
    ) {
        return this.cashShiftsService.openShift(dto, user);
    }
```

(No other change needed in the controller — `AuthenticatedUser` and `CurrentUser` are already imported.)

- [ ] **Step 11: Run the test to verify it passes**

Run: `cd "../x7-pos-back-end" && npx jest cash-shifts.service.spec.ts`
Expected: PASS, all describe blocks.

- [ ] **Step 12: Run the full backend test suite for this module's neighbors**

Run: `cd "../x7-pos-back-end" && npx jest src/restaurant-operations/cashdrawer`
Expected: PASS — confirms the relation/DTO changes didn't break `cash-drawers`, `cash-movements`, or `cash-transactions` tests (none of which import from `cash-shifts`).

- [ ] **Step 13: Commit**

```bash
cd "../x7-pos-back-end"
git add src/restaurant-operations/cashdrawer/cash-shifts/constants/cash-shift-status.enum.ts \
        src/restaurant-operations/cashdrawer/cash-shifts/dto/create-cash-shift.dto.ts \
        src/restaurant-operations/cashdrawer/cash-shifts/dto/cash-shift-response.dto.ts \
        src/restaurant-operations/cashdrawer/cash-shifts/entities/cash-shift.entity.ts \
        src/restaurant-operations/cashdrawer/cash-shifts/cash-shifts.service.ts \
        src/restaurant-operations/cashdrawer/cash-shifts/cash-shifts.controller.ts \
        src/restaurant-operations/cashdrawer/cash-shifts/cash-shifts.service.spec.ts
git commit -m "feat(cash-shifts): auto-inject opener context, enrich collaborator info, add Discrepancy status"
```

---

### Task B2: Close flow — auto-injected closer and Discrepancy branching (backend)

**Files:**
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-shifts/dto/close-cash-shift.dto.ts`
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-shifts/cash-shifts.service.ts`
- Modify: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-shifts/cash-shifts.controller.ts:81-97`
- Test: `../x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-shifts/cash-shifts.service.spec.ts` (the `describe('closeShift', ...)` block)

**Interfaces:**
- Consumes: `CashShiftStatus.DISCREPANCY`, `mockCollaborator`/`mockOtherCollaborator`/`activeUser` fixtures (all from Task B1).
- Produces: `CloseCashShiftDto { declaredAmount: number }` (no `collaboratorId`). `CashShiftsService.closeShift(shiftId, dto, user)` now auto-resolves `closedBy` and rounds before comparing.

- [ ] **Step 1: Write the failing tests for the new `closeShift()` contract**

Replace the entire `describe('closeShift', ...)` block in `cash-shifts.service.spec.ts` with:

```ts
  describe('closeShift', () => {
    const closeDto: CloseCashShiftDto = {
      declaredAmount: 150,
    };

    const activeShift = {
      id: 99,
      merchantId: 10,
      cashDrawerId: 1,
      openedBy: 5,
      openingBalance: 100,
      status: CashShiftStatus.OPEN,
      openedAt: new Date(),
    };

    it('should resolve closedBy from the JWT and close a shift, calculating the difference', async () => {
      jest
        .spyOn(cashShiftRepo, 'findOne')
        .mockResolvedValueOnce({ ...activeShift } as any)
        .mockResolvedValueOnce({
          ...activeShift,
          status: CashShiftStatus.CLOSED,
          systemAmount: 120,
          declaredAmount: 150,
          difference: 30,
          closedBy: 5,
          closedAt: new Date(),
          openedByCollaborator: mockCollaborator,
          closedByCollaborator: mockCollaborator,
        } as any);
      jest
        .spyOn(collaboratorRepo, 'findOne')
        .mockResolvedValue(mockCollaborator as any);
      jest.spyOn(cashShiftRepo, 'getLiveBalance').mockResolvedValue(120);
      jest
        .spyOn(cashShiftRepo, 'save')
        .mockImplementation(async (s) => s as any);
      jest
        .spyOn(cashShiftRepo, 'getSalesSummary')
        .mockResolvedValue([{ method: 'Cash', amount: 20 }]);

      const result = await service.closeShift(99, closeDto, activeUser);

      expect(collaboratorRepo.findOne).toHaveBeenCalledWith({
        where: { user_id: 1, merchant_id: 10 },
      });
      expect(cashShiftRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ closedBy: 5, status: CashShiftStatus.CLOSED }),
      );
      expect(result.statusCode).toBe(200);
      expect(result.data.systemAmount).toBe(120);
      expect(result.data.declaredAmount).toBe(150);
      expect(result.data.difference).toBe(30);
      expect(result.data.status).toBe(CashShiftStatus.CLOSED);
    });

    it('should set status to DISCREPANCY when declaredAmount does not match systemAmount, rounded to cents', async () => {
      // declaredAmount 119.999 rounds to 120.00; getLiveBalance below returns
      // 100, so systemAmount rounds to 100.00 — a genuine 20.00 overage, not
      // sub-cent noise, so this must land on DISCREPANCY.
      const mismatchedDto: CloseCashShiftDto = { declaredAmount: 119.999 };
      jest
        .spyOn(cashShiftRepo, 'findOne')
        .mockResolvedValueOnce({ ...activeShift } as any)
        .mockResolvedValueOnce({
          ...activeShift,
          status: CashShiftStatus.DISCREPANCY,
          systemAmount: 100,
          declaredAmount: 120,
          difference: 20,
          closedBy: 5,
          openedByCollaborator: mockCollaborator,
          closedByCollaborator: mockCollaborator,
        } as any);
      jest
        .spyOn(collaboratorRepo, 'findOne')
        .mockResolvedValue(mockCollaborator as any);
      jest.spyOn(cashShiftRepo, 'getLiveBalance').mockResolvedValue(100);
      jest
        .spyOn(cashShiftRepo, 'save')
        .mockImplementation(async (s) => s as any);
      jest.spyOn(cashShiftRepo, 'getSalesSummary').mockResolvedValue([]);

      const result = await service.closeShift(99, mismatchedDto, activeUser);

      expect(cashShiftRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: CashShiftStatus.DISCREPANCY }),
      );
    });

    it('should set status to CLOSED (not DISCREPANCY) when the difference is only sub-cent noise', async () => {
      const nearMatchDto: CloseCashShiftDto = { declaredAmount: 100.001 };
      jest
        .spyOn(cashShiftRepo, 'findOne')
        .mockResolvedValueOnce({ ...activeShift } as any)
        .mockResolvedValueOnce({
          ...activeShift,
          status: CashShiftStatus.CLOSED,
          openedByCollaborator: mockCollaborator,
          closedByCollaborator: mockCollaborator,
        } as any);
      jest
        .spyOn(collaboratorRepo, 'findOne')
        .mockResolvedValue(mockCollaborator as any);
      jest.spyOn(cashShiftRepo, 'getLiveBalance').mockResolvedValue(100);
      jest
        .spyOn(cashShiftRepo, 'save')
        .mockImplementation(async (s) => s as any);
      jest.spyOn(cashShiftRepo, 'getSalesSummary').mockResolvedValue([]);

      await service.closeShift(99, nearMatchDto, activeUser);

      expect(cashShiftRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: CashShiftStatus.CLOSED }),
      );
    });

    it('should throw ForbiddenException if MERCHANT_USER tries to close a shift opened by someone else', async () => {
      jest
        .spyOn(cashShiftRepo, 'findOne')
        .mockResolvedValue({ ...activeShift, openedBy: 8 } as any);
      jest
        .spyOn(collaboratorRepo, 'findOne')
        .mockResolvedValue(mockCollaborator as any); // Current user resolves to collaborator 5

      await expect(
        service.closeShift(99, closeDto, activeUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow MERCHANT_ADMIN to close a shift opened by someone else', async () => {
      const adminUser = { ...activeUser, role: UserRole.MERCHANT_ADMIN };
      jest
        .spyOn(cashShiftRepo, 'findOne')
        .mockResolvedValueOnce({ ...activeShift, openedBy: 8 } as any)
        .mockResolvedValueOnce({
          ...activeShift,
          openedBy: 8,
          status: CashShiftStatus.CLOSED,
          systemAmount: 100,
          declaredAmount: 150,
          difference: 50,
          closedBy: 5,
          openedByCollaborator: mockOtherCollaborator,
          closedByCollaborator: mockCollaborator,
        } as any);
      jest
        .spyOn(collaboratorRepo, 'findOne')
        .mockResolvedValue(mockCollaborator as any);
      jest.spyOn(cashShiftRepo, 'getLiveBalance').mockResolvedValue(100);
      jest
        .spyOn(cashShiftRepo, 'save')
        .mockImplementation(async (s) => s as any);
      jest.spyOn(cashShiftRepo, 'getSalesSummary').mockResolvedValue([]);

      const result = await service.closeShift(99, closeDto, adminUser);

      expect(result.statusCode).toBe(200);
      expect(result.data.closedByCollaborator?.id).toBe(5);
    });

    it('should throw ForbiddenException when the closing user has no linked collaborator profile', async () => {
      jest
        .spyOn(cashShiftRepo, 'findOne')
        .mockResolvedValue({ ...activeShift } as any);
      jest.spyOn(collaboratorRepo, 'findOne').mockResolvedValue(null);

      await expect(
        service.closeShift(99, closeDto, activeUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if the shift is not OPEN', async () => {
      jest.spyOn(cashShiftRepo, 'findOne').mockResolvedValue({
        ...activeShift,
        status: CashShiftStatus.CLOSED,
      } as any);

      await expect(
        service.closeShift(99, closeDto, activeUser),
      ).rejects.toThrow(BadRequestException);
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "../x7-pos-back-end" && npx jest cash-shifts.service.spec.ts`
Expected: FAIL — `closeShift` still reads `dto.collaboratorId`, doesn't round before comparing, and never sets `DISCREPANCY`.

- [ ] **Step 3: Shrink `CloseCashShiftDto`**

Replace the full contents of `dto/close-cash-shift.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class CloseCashShiftDto {
  @ApiProperty({
    example: 1480.0,
    description: 'Amount declared by the cashier when closing the shift',
  })
  @IsNumber()
  @Min(0)
  declaredAmount: number;
}
```

- [ ] **Step 4: Rewrite `closeShift()` — auto-inject `closedBy`, round, branch to DISCREPANCY**

Replace the entire `closeShift()` method in `cash-shifts.service.ts` (current lines 203-292) with:

```ts
  async closeShift(
    shiftId: number,
    dto: CloseCashShiftDto,
    user: AuthenticatedUser,
  ): Promise<OneCashShiftResponseDto> {
    const merchantId = user.merchant?.id;
    if (!merchantId) {
      throw new ForbiddenException('User must belong to a merchant');
    }

    const shift = await this.cashShiftRepo.findOne({
      where: { id: shiftId },
    });

    if (!shift) {
      throw new NotFoundException(`Cash shift with ID ${shiftId} not found`);
    }

    if (shift.merchantId !== merchantId) {
      throw new ForbiddenException(
        'You can only close cash shifts belonging to your merchant',
      );
    }

    if (shift.status !== CashShiftStatus.OPEN) {
      throw new BadRequestException(
        `The cash shift is already ${shift.status.toLowerCase()}. Only OPEN cash shifts can be closed.`,
      );
    }

    const collaborator = await this.collaboratorRepo.findOne({
      where: { user_id: user.id, merchant_id: merchantId },
    });
    if (!collaborator) {
      throw new ForbiddenException(
        'Your user account is not linked to any collaborator record. Cannot close cash shift.',
      );
    }

    // Enforce CAT 3: MERCHANT_USER can only close their own shift
    if (user.role === UserRole.MERCHANT_USER && shift.openedBy !== collaborator.id) {
      throw new ForbiddenException(
        'You are not authorized to close this cash shift. You can only close your own active cash shifts.',
      );
    }

    // Step 1: obtain systemAmount from the DB (delegated 100% to SQL engine)
    const rawSystemAmount = await this.cashShiftRepo.getLiveBalance(shiftId);

    // Step 2: round both sides to cents before comparing/persisting — the
    // declared amount is user-entered and the live balance is SQL-summed
    // decimal(12,2) data, so sub-cent floating point noise on either side
    // must not manufacture a false Discrepancy.
    const systemAmount = Math.round(rawSystemAmount * 100) / 100;
    const declaredAmount = Math.round(Number(dto.declaredAmount) * 100) / 100;
    const difference = Math.round((declaredAmount - systemAmount) * 100) / 100;
    const status =
      difference === 0 ? CashShiftStatus.CLOSED : CashShiftStatus.DISCREPANCY;

    // Step 3 & 4: update the record with closing data
    shift.systemAmount = systemAmount;
    shift.declaredAmount = declaredAmount;
    shift.difference = difference;
    shift.closedBy = collaborator.id;
    shift.closedAt = new Date();
    shift.status = status;

    const closed = await this.cashShiftRepo.save(shift);
    const shiftWithRelations = await this.cashShiftRepo.findOne({
      where: { id: shiftId },
      relations: ['cashMovements', 'openedByCollaborator', 'closedByCollaborator'],
    });
    const salesSummary = await this.cashShiftRepo.getSalesSummary(shiftId);

    return {
      statusCode: 200,
      message: 'Cash shift closed successfully',
      data: this.format(shiftWithRelations || closed, salesSummary),
    };
  }
```

- [ ] **Step 5: Update the controller's Swagger description for `closeShift()`**

In `cash-shifts.controller.ts`, the `@ApiOperation` description above `closeShift()` (current lines 82-85) already says the backend "calculates the systemAmount... and registers the closing" — update the second sentence to reflect the dropped `collaboratorId`:

```ts
    @ApiOperation({
        summary: 'Close a cash shift',
        description:
            'The backend calculates the systemAmount (system balance), the difference (declaredAmount - systemAmount), and registers the closing. The closing collaborator is resolved automatically from the authenticated session; the frontend only sends declaredAmount.',
    })
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd "../x7-pos-back-end" && npx jest cash-shifts.service.spec.ts`
Expected: PASS, all describe blocks (`openShift`, `closeShift`, `addManualTransaction`).

- [ ] **Step 7: Run the full backend test suite for this module's neighbors**

Run: `cd "../x7-pos-back-end" && npx jest src/restaurant-operations/cashdrawer`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd "../x7-pos-back-end"
git add src/restaurant-operations/cashdrawer/cash-shifts/dto/close-cash-shift.dto.ts \
        src/restaurant-operations/cashdrawer/cash-shifts/cash-shifts.service.ts \
        src/restaurant-operations/cashdrawer/cash-shifts/cash-shifts.controller.ts \
        src/restaurant-operations/cashdrawer/cash-shifts/cash-shifts.service.spec.ts
git commit -m "feat(cash-shifts): auto-inject closer context and add Discrepancy reconciliation on close"
```

---

### Task F1: Types, base directory view, and navigation wiring (frontend)

**Files:**
- Create: `src/types/cash-shift.ts`
- Create: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx`
- Create: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx`
- Modify: `src/components/MerchantFrame/MerchantFrame.tsx:53,96-100,531-533` (import, `COMING_SOON_STUBS`, render branch)

**Interfaces:**
- Produces: `CashShift`, `CashShiftStatus`, `CashShiftCollaboratorRef`, `CreateCashShiftDto`, `CloseCashShiftDto` (types, matching Task B1/B2's backend contracts). `normalizeShift(raw): CashShift`, `formatCurrency(n): string`, `formatDateTime(v): string`, `STATUS_BADGE_CLASSES: Record<CashShiftStatus, string>` (all exported from `CashShiftsView.tsx`, mirroring `CashDrawersView.tsx`'s module-level exports). `CashShiftsView: React.FC<{ onNavigate?: (view: string) => void }>` (default export).
- Consumes: nothing from other tasks in this plan (F2/F3 build on top of this task's `CashShiftsView.tsx`).

- [ ] **Step 1: Write the failing component tests for the base directory view**

Create `src/types/cash-shift.ts`:

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

Create `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx`:

```tsx
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CashShiftsView, formatDateTime } from './CashShiftsView';
import type { CashShift } from '../../../../types/cash-shift';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

export function mockFetchOnce(data: CashShift[], status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: async () => ({ statusCode: status, message: 'ok', data }),
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const openShift: CashShift = {
  id: 1,
  merchantId: 10,
  cashDrawerId: 3,
  openingBalance: 100,
  systemAmount: null,
  declaredAmount: null,
  difference: null,
  status: 'OPEN',
  openedAt: '2026-08-05T08:00:00Z',
  closedAt: null,
  openedByCollaborator: { id: 10, name: 'John Doe', role: 'WAITER' },
  closedByCollaborator: null,
};

const closedShift: CashShift = {
  ...openShift,
  id: 2,
  cashDrawerId: 4,
  systemAmount: 120,
  declaredAmount: 120,
  difference: 0,
  status: 'CLOSED',
  closedAt: '2026-08-05T16:00:00Z',
  openedByCollaborator: { id: 12, name: 'Alice Brown', role: 'HOST' },
  closedByCollaborator: { id: 11, name: 'Jane Smith', role: 'MANAGER' },
};

const discrepancyShift: CashShift = {
  ...closedShift,
  id: 5,
  cashDrawerId: 6,
  systemAmount: 120,
  declaredAmount: 100,
  difference: -20,
  status: 'DISCREPANCY',
};

describe('CashShiftsView — data fetch', () => {
  it('fetches cash shifts on mount with no query params', async () => {
    mockFetchOnce([]);
    render(<CashShiftsView />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/cash-shifts'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }),
        }),
      );
    });
    const calledUrl = (fetch as any).mock.calls[0][0] as string;
    expect(calledUrl.endsWith('/cash-shifts')).toBe(true);
  });

  it('shows a loading indicator while fetching', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<CashShiftsView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error card with retry when the fetch fails', async () => {
    mockFetchOnce([], 500);
    render(<CashShiftsView />);

    expect(await screen.findByText(/Failed to load cash shift sessions/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
  });

  it('redirects to login on a 401 response', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };

    mockFetchOnce([], 401);
    render(<CashShiftsView />);

    await waitFor(() => expect(window.location.href).toBe('/login'));

    // @ts-expect-error restoring original Location object
    window.location = originalLocation;
  });

  it('shows the empty state when there are no sessions', async () => {
    mockFetchOnce([]);
    render(<CashShiftsView />);
    expect(await screen.findByTestId('cash-shifts-empty-state')).toBeInTheDocument();
  });
});

describe('CashShiftsView — grid rendering', () => {
  it('renders session id, drawer badge, balances, staff, and status for each row', async () => {
    mockFetchOnce([openShift, closedShift]);
    render(<CashShiftsView />);

    expect(await screen.findByText('#CS-1')).toBeInTheDocument();
    expect(screen.getByText('#CD-3')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('In Service')).toBeInTheDocument();
    expect(screen.getAllByText('OPEN').length).toBeGreaterThan(0);

    expect(screen.getByText('#CS-2')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getAllByText('CLOSED').length).toBeGreaterThan(0);
  });

  it('renders a Discrepancy badge for shifts with a non-zero difference', async () => {
    mockFetchOnce([discrepancyShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-5');
    expect(screen.getByText('DISCREPANCY')).toBeInTheDocument();
  });

  it('never renders raw foreign key values as bare text', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    expect(screen.queryByText('10', { selector: 'td' })).not.toBeInTheDocument();
  });
});

describe('CashShiftsView — detail modal', () => {
  it('opens the detail modal with full reconciliation data for a closed shift', async () => {
    mockFetchOnce([closedShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-2');

    await userEvent.click(screen.getByRole('button', { name: /view cash shift 2 details/i }));
    const dialog = await screen.findByRole('dialog', { name: /cash shift details/i });

    expect(within(dialog).getByText('#CD-4')).toBeInTheDocument();
    // `formatDateTime` uses `toLocaleString()` with no fixed timezone, so
    // assert on the timezone-independent parts (name/role) rather than a
    // full formatted timestamp, which would be environment-dependent.
    expect(
      within(dialog).getByText((_, el) => el?.textContent === `Jane Smith (MANAGER) — ${formatDateTime(closedShift.closedAt as string)}`),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('$120.00')).toBeInTheDocument();
  });
});

describe('CashShiftsView — Quick Links', () => {
  it('renders the cash management shortcuts bar', async () => {
    mockFetchOnce([]);
    render(<CashShiftsView />);
    await screen.findByTestId('cash-shifts-empty-state');
    expect(screen.getByRole('navigation', { name: /related cash management shortcuts/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: FAIL — `./CashShiftsView` doesn't exist yet.

- [ ] **Step 3: Create `CashShiftsView.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type { CashShift, CashShiftStatus } from '../../../../types/cash-shift';
import { CashManagementQuickLinks } from './CashManagementQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const STATUS_BADGE_CLASSES: Record<CashShiftStatus, string> = {
  OPEN: 'bg-green-500/10 text-green-600',
  CLOSED: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  DISCREPANCY: 'bg-orange-500/10 text-orange-700',
};

// The backend stores balances as Postgres `decimal` columns with no server-side
// coercion, so they arrive over the wire as numeric strings (e.g. "120.00").
// Normalize at the fetch boundary so every `CashShift` in state has real numbers.
export function normalizeShift(raw: CashShift): CashShift {
  return {
    ...raw,
    openingBalance: Number(raw.openingBalance),
    systemAmount: raw.systemAmount == null ? null : Number(raw.systemAmount),
    declaredAmount: raw.declaredAmount == null ? null : Number(raw.declaredAmount),
    difference: raw.difference == null ? null : Number(raw.difference),
  };
}

export function formatCurrency(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDateTime(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

interface CashShiftDetailModalProps {
  shift: CashShift;
  onClose: () => void;
}

const CashShiftDetailModal: React.FC<CashShiftDetailModalProps> = ({ shift, onClose }) => {
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Cash Shift Details"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">#CS-{shift.id} Details</span>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Cash Drawer</p>
            <p className="font-bold text-[#1d1c17]">#CD-{shift.cashDrawerId}</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Opening</p>
              <p>{formatCurrency(shift.openingBalance)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">System</p>
              <p>{shift.systemAmount == null ? '--' : formatCurrency(shift.systemAmount)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Declared</p>
              <p>{shift.declaredAmount == null ? '--' : formatCurrency(shift.declaredAmount)}</p>
            </div>
          </div>
          {shift.difference != null && (
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Difference</p>
              <p className={shift.difference === 0 ? 'text-[#1d1c17]' : 'font-bold text-orange-700'}>
                {shift.difference === 0
                  ? formatCurrency(0)
                  : `${shift.difference > 0 ? '+' : '-'}${formatCurrency(Math.abs(shift.difference))}`}
              </p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Opened By</p>
            <p>
              {shift.openedByCollaborator.name} ({shift.openedByCollaborator.role}) — {formatDateTime(shift.openedAt)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Closed By</p>
            <p>
              {shift.closedByCollaborator
                ? `${shift.closedByCollaborator.name} (${shift.closedByCollaborator.role}) — ${
                    shift.closedAt ? formatDateTime(shift.closedAt) : ''
                  }`
                : 'In Service'}
            </p>
          </div>
          <div>
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[shift.status]}`}
            >
              {shift.status}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface CashShiftsViewProps {
  onNavigate?: (view: string) => void;
}

export const CashShiftsView: React.FC<CashShiftsViewProps> = ({ onNavigate }) => {
  const [shifts, setShifts] = useState<CashShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | CashShiftStatus>('');

  const fetchCashShifts = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/cash-shifts`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Error al cargar los turnos de caja');
      }

      const json = await res.json();
      setShifts((json.data ?? []).map(normalizeShift));
    } catch (err) {
      console.error('Error fetching cash shifts:', err);
      setError('Failed to load cash shift sessions. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredShifts = React.useMemo(() => {
    return shifts.filter((shift) => {
      if (statusFilter && shift.status !== statusFilter) return false;
      const term = searchQuery.trim().toLowerCase();
      if (!term) return true;
      const sessionId = `#cs-${shift.id}`;
      const drawerId = `#cd-${shift.cashDrawerId}`;
      const openedByName = shift.openedByCollaborator.name.toLowerCase();
      const closedByName = shift.closedByCollaborator?.name.toLowerCase() ?? '';
      return (
        sessionId.includes(term) ||
        drawerId.includes(term) ||
        openedByName.includes(term) ||
        closedByName.includes(term)
      );
    });
  }, [shifts, searchQuery, statusFilter]);

  const hasActiveFilter = Boolean(searchQuery || statusFilter);
  const isFilteredEmpty = !loading && !error && hasActiveFilter && filteredShifts.length === 0;
  const isTrueEmpty = !loading && !error && shifts.length === 0 && !hasActiveFilter;

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const [detailShift, setDetailShift] = useState<CashShift | null>(null);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
  };

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={() => fetchCashShifts()}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by staff name, drawer, or session ID..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search cash shift sessions"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | CashShiftStatus)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="DISCREPANCY">Discrepancy</option>
        </select>
        {hasActiveFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>

      {isTrueEmpty && (
        <div
          data-testid="cash-shifts-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">point_of_sale</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No cash shift sessions found.
          </p>
        </div>
      )}

      {(loading || shifts.length > 0 || isFilteredEmpty) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">CASH SHIFT SESSIONS</span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredShifts.length} sessions`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Session ID &amp; Drawer
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Opening Balance
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Opened By
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Closed By
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {loading
                  ? [1, 2, 3].map((i) => (
                      <tr key={i}>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                      </tr>
                    ))
                  : isFilteredEmpty
                  ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                          <p className="text-sm text-[#5f5e5e]">No cash shift sessions match your active filters</p>
                          <button type="button" onClick={clearFilters} className="text-[#ae001a] text-sm font-semibold hover:underline">
                            Clear filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                  : filteredShifts.map((shift) => (
                      <tr key={shift.id} data-testid={`cash-shift-row-${shift.id}`} className="hover:bg-[#f8f3eb] transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17]">
                            #CS-{shift.id}{' '}
                            <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-700">
                              #CD-{shift.cashDrawerId}
                            </span>
                          </p>
                        </td>
                        <td className="px-6 py-4">{formatCurrency(shift.openingBalance)}</td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-[#1d1c17]">{shift.openedByCollaborator.name}</p>
                          <p className="text-[11px] text-[#5f5e5e] mt-1">{formatDateTime(shift.openedAt)}</p>
                        </td>
                        <td className="px-6 py-4">
                          {shift.closedByCollaborator ? (
                            <p className="font-semibold text-[#1d1c17]">{shift.closedByCollaborator.name}</p>
                          ) : (
                            <span className="bg-blue-500/10 text-blue-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              In Service
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[shift.status]}`}
                          >
                            {shift.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setDetailShift(shift)}
                              aria-label={`View cash shift ${shift.id} details`}
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                            >
                              <span className="material-symbols-outlined text-[20px]">visibility</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CashManagementQuickLinks activeModule="cash-shifts" onNavigate={onNavigate} />

      {detailShift && <CashShiftDetailModal shift={detailShift} onClose={() => setDetailShift(null)} />}

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
    </div>
  );
};

export default CashShiftsView;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: PASS, entire file.

- [ ] **Step 5: Wire the view into `MerchantFrame.tsx`**

Add the import alongside the existing `CashDrawersView` import (current line 53):

```ts
import { CashDrawersView } from './views/restaurant-operations/CashDrawersView';
import { CashShiftsView } from './views/restaurant-operations/CashShiftsView';
```

Remove the `'cash-shifts'` entry from `COMING_SOON_STUBS` (current lines 96-100):

```ts
const COMING_SOON_STUBS: Record<string, ComingSoonStub> = {
  'privacy-policy': {
    title: 'Privacy Policy',
    route: '/legal/privacy-policy',
    icon: 'gavel'
  },
  'terms-of-service': {
    title: 'Terms of Service',
    route: '/legal/terms-of-service',
    icon: 'gavel'
  },
  'help-center': {
    title: 'Help Center',
    route: '/support/help-center',
    icon: 'help'
  },
  'cash-transactions': {
    title: 'Cash Transactions',
    route: '/cash-management/transactions',
    icon: 'receipt_long'
  },
  'cash-drawer-history': {
    title: 'Drawer History',
    route: '/cash-management/history',
    icon: 'history'
  },
  'cash-movements': {
    title: 'Drawer Movements',
    route: '/cash-management/movements',
    icon: 'trending_up'
  }
};
```

Add the render branch right after the existing `cash-drawers` branch (current lines 531-533):

```tsx
    if (activeTab === 'cash-drawers') {
      return <CashDrawersView onNavigate={(view) => setActiveTab(view)} />;
    }

    if (activeTab === 'cash-shifts') {
      return <CashShiftsView onNavigate={(view) => setActiveTab(view)} />;
    }

```

- [ ] **Step 6: Run the frontend type check**

Run: `npx tsc --build --noEmit --force`
Expected: zero errors. (This repo's plain `tsc --noEmit` is a no-op — this is the form that actually type-checks, per project convention.)

- [ ] **Step 7: Commit**

```bash
git add src/types/cash-shift.ts \
        src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx \
        src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx \
        src/components/MerchantFrame/MerchantFrame.tsx
git commit -m "feat(cash-shifts): add Cash Shifts directory view with detail modal and nav wiring"
```

---

### Task F2: Open Cash Shift — availability-filtered drawer dropdown (frontend)

**Files:**
- Modify: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx`
- Test: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx`

**Interfaces:**
- Consumes: `CashShiftsView` base component from Task F1. `CashDrawer`/`CashDrawerStatus` types from `src/types/cash-drawer.ts` (pre-existing, unchanged).
- Produces: `OpenCashShiftFormModal` (module-local component). `CashShiftsView` now POSTs `CreateCashShiftDto { cashDrawerId, openingBalance }` to `/cash-shifts` on submit (matches Task B1's backend contract).

- [ ] **Step 1: Write the failing tests for the Open modal**

Add this to the bottom of `CashShiftsView.test.tsx` (after the existing `describe('CashShiftsView — Quick Links', ...)` block), and add `import type { CashDrawer } from '../../../../types/cash-drawer';` alongside the existing `CashShift` type import at the top of the file:

```tsx
const availableDrawer: CashDrawer = {
  id: 7,
  openingBalance: 0,
  currentBalance: 0,
  closingBalance: null,
  createdAt: '2026-08-05T08:00:00Z',
  updatedAt: '2026-08-05T08:00:00Z',
  status: 'Open',
  merchant: { id: 1, name: 'Restaurant ABC' },
  shift: { id: 1, name: 'Shift 1', startTime: '2026-08-05T08:00:00Z', endTime: '2026-08-05T16:00:00Z', status: 'ACTIVE', merchant: { id: 1, name: 'Restaurant ABC' } },
  openedByCollaborator: { id: 10, name: 'John Doe', role: 'WAITER' },
  closedByCollaborator: null,
};

const busyDrawer: CashDrawer = { ...availableDrawer, id: 3 };
const closedDrawer: CashDrawer = { ...availableDrawer, id: 9, status: 'Close' };

function mockFetchSequence(responses: Array<{ status?: number; data: unknown }>) {
  let call = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const r = responses[Math.min(call, responses.length - 1)];
      call += 1;
      const status = r.status ?? 200;
      return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => ({ statusCode: status, message: 'ok', data: r.data }),
      };
    }),
  );
}

describe('CashShiftsView — Open Cash Shift', () => {
  it('lists only drawers that are Open and have no active shift', async () => {
    // openShift occupies drawer #3 (busyDrawer); drawer #9 is Close; drawer #7 is available.
    mockFetchSequence([
      { data: [openShift] }, // initial GET /cash-shifts (openShift.cashDrawerId === 3)
      { data: [availableDrawer, busyDrawer, closedDrawer] }, // GET /cash-drawers when the modal opens
    ]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /open cash shift/i }));
    const dialog = await screen.findByRole('dialog', { name: /open cash shift/i });
    const select = within(dialog).getByLabelText(/cash drawer/i);

    expect(within(select).getByRole('option', { name: /#CD-7/i })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: /#CD-3/i })).not.toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: /#CD-9/i })).not.toBeInTheDocument();
  });

  it('validates drawer selection and opening balance, submits, and refetches the list', async () => {
    mockFetchSequence([
      { data: [] },
      { data: [availableDrawer] },
    ]);
    render(<CashShiftsView />);
    await screen.findByTestId('cash-shifts-empty-state');

    await userEvent.click(screen.getByRole('button', { name: /open cash shift/i }));
    const dialog = await screen.findByRole('dialog', { name: /open cash shift/i });
    const submitButton = within(dialog).getByRole('button', { name: /open shift/i });
    expect(submitButton).toBeDisabled();

    await userEvent.selectOptions(within(dialog).getByLabelText(/cash drawer/i), '7');
    await userEvent.type(within(dialog).getByLabelText(/opening balance/i), '100');
    expect(submitButton).toBeEnabled();

    const newShift: CashShift = { ...openShift, id: 6, cashDrawerId: 7, openingBalance: 100 };
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === 'POST') {
        return { status: 201, ok: true, json: async () => ({ statusCode: 201, message: 'ok', data: newShift }) };
      }
      return { status: 200, ok: true, json: async () => ({ statusCode: 200, message: 'ok', data: [newShift] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/cash-shifts'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cashDrawerId: 7, openingBalance: 100 }),
        }),
      );
    });
    expect(await screen.findByText(/cash shift opened successfully/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /open cash shift/i })).not.toBeInTheDocument();
    expect(await screen.findByText('#CS-6')).toBeInTheDocument();
  });

  it('shows the backend conflict message inline in the dialog and keeps it open', async () => {
    mockFetchSequence([
      { data: [] },
      { data: [availableDrawer] },
    ]);
    render(<CashShiftsView />);
    await screen.findByTestId('cash-shifts-empty-state');

    await userEvent.click(screen.getByRole('button', { name: /open cash shift/i }));
    const dialog = await screen.findByRole('dialog', { name: /open cash shift/i });
    await userEvent.selectOptions(within(dialog).getByLabelText(/cash drawer/i), '7');
    await userEvent.type(within(dialog).getByLabelText(/opening balance/i), '100');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
        json: async () => ({
          message:
            'Cash Drawer #7 already has an active shift session (#CS-12) in progress. Please close the active shift before opening a new one.',
        }),
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /open shift/i }));

    await screen.findByText(/cash drawer #7 already has an active shift session \(#cs-12\)/i);
    expect(screen.getByRole('dialog', { name: /open cash shift/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: FAIL — there's no "Open Cash Shift" button or dialog yet.

- [ ] **Step 3: Add the `OpenCashShiftFormModal` component**

In `CashShiftsView.tsx`, add this import alongside the existing ones:

```ts
import type { CashDrawer } from '../../../../types/cash-drawer';
import type { CreateCashShiftDto } from '../../../../types/cash-shift';
```

Add this component after `CashShiftDetailModal` and before the `CashShiftsViewProps` interface:

```tsx
interface OpenCashShiftFormModalProps {
  drawers: CashDrawer[];
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (dto: CreateCashShiftDto) => void;
}

const OpenCashShiftFormModal: React.FC<OpenCashShiftFormModalProps> = ({
  drawers,
  submitting,
  error,
  onCancel,
  onSubmit,
}) => {
  const [cashDrawerId, setCashDrawerId] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');

  const openingBalanceNum = parseFloat(openingBalance);
  const openingBalanceValid = openingBalance.trim() !== '' && !isNaN(openingBalanceNum) && openingBalanceNum >= 0;
  const drawerValid = cashDrawerId !== '';

  const isValid = drawerValid && openingBalanceValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({ cashDrawerId: Number(cashDrawerId), openingBalance: openingBalanceNum });
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Open Cash Shift"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Open Cash Shift</span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <p className="text-sm text-[#5f5e5e]">
              The opening collaborator is assigned automatically from your session.
            </p>
            {drawers.length === 0 ? (
              <p className="text-sm text-[#ae001a]">
                No available cash drawers — all drawers are either closed or already have an active shift.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cash-shift-drawer" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Cash Drawer
                </label>
                <select
                  id="cash-shift-drawer"
                  value={cashDrawerId}
                  onChange={(e) => setCashDrawerId(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                >
                  <option value="">Select a cash drawer…</option>
                  {drawers.map((drawer) => (
                    <option key={drawer.id} value={drawer.id}>
                      #CD-{drawer.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cash-shift-opening-balance" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Opening Balance ($)
              </label>
              <input
                id="cash-shift-opening-balance"
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
              Open Shift
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};
```

- [ ] **Step 4: Wire the modal into `CashShiftsView`**

Inside the `CashShiftsView` component body, add state and handlers right after the existing `detailShift`/`clearFilters` block:

```tsx
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [availableDrawers, setAvailableDrawers] = useState<CashDrawer[]>([]);

  const openCreateModal = async () => {
    setCreateError(null);
    setFormModalOpen(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/cash-drawers?limit=100`, { headers });
      const json = await res.json().catch(() => ({ data: [] }));
      const openShiftDrawerIds = new Set(
        shifts.filter((s) => s.status === 'OPEN').map((s) => s.cashDrawerId),
      );
      const drawers: CashDrawer[] = (json.data ?? []).filter(
        (d: CashDrawer) => d.status === 'Open' && !openShiftDrawerIds.has(d.id),
      );
      setAvailableDrawers(drawers);
    } catch (err) {
      console.error('Error fetching cash drawers:', err);
      setAvailableDrawers([]);
    }
  };

  const closeCreateModal = () => {
    setCreateError(null);
    setFormModalOpen(false);
  };

  const handleCreateSubmit = async (dto: CreateCashShiftDto) => {
    setFormSubmitting(true);
    setCreateError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/cash-shifts`, {
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
        throw new Error(json.message || 'Failed to open cash shift');
      }

      await fetchCashShifts();
      setFormModalOpen(false);
      setToast({ message: 'Cash shift opened successfully', type: 'success' });
    } catch (err: any) {
      setCreateError(err.message || 'Failed to open cash shift');
    } finally {
      setFormSubmitting(false);
    }
  };
```

Add the "Open Cash Shift" button to the filter toolbar, right after the `{hasActiveFilter && (...)}` block:

```tsx
        <button
          type="button"
          onClick={openCreateModal}
          className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Open Cash Shift
        </button>
```

Update the true-empty state copy (added in Task F1) to include the call to action, replacing:

```tsx
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No cash shift sessions found.
          </p>
```

with:

```tsx
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No cash shift sessions found. Click &apos;Open Cash Shift&apos; to start a new session.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Open Cash Shift
          </button>
```

Finally, render the modal near the other modals at the bottom of the component:

```tsx
      {formModalOpen && (
        <OpenCashShiftFormModal
          drawers={availableDrawers}
          submitting={formSubmitting}
          error={createError}
          onCancel={closeCreateModal}
          onSubmit={handleCreateSubmit}
        />
      )}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: PASS, entire file.

- [ ] **Step 6: Run the frontend type check**

Run: `npx tsc --build --noEmit --force`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx \
        src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx
git commit -m "feat(cash-shifts): add Open Cash Shift modal with availability-filtered drawer dropdown"
```

---

### Task F3: Close Shift — blind count dialog and reconciliation result (frontend)

**Files:**
- Modify: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx`
- Test: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx`

**Interfaces:**
- Consumes: `CashShiftsView` with the Open modal wired, from Task F2. `CloseCashShiftDto { declaredAmount }` type from `src/types/cash-shift.ts` (Task F1).
- Produces: `CloseCashShiftDialog` and `CashShiftResultModal` (module-local components). `CashShiftsView` now POSTs to `/cash-shifts/:id/close` (matches Task B2's backend contract) and shows the reconciliation result.

- [ ] **Step 1: Write the failing tests for Close Shift**

Add this to the bottom of `CashShiftsView.test.tsx`:

```tsx
describe('CashShiftsView — Close Shift', () => {
  it('only shows the close action for OPEN sessions', async () => {
    mockFetchOnce([openShift, closedShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    expect(screen.getByRole('button', { name: /close cash shift 1/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close cash shift 2/i })).not.toBeInTheDocument();
  });

  it('never fetches or renders the system amount in the close dialog (blind count)', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash shift 1/i }));
    const dialog = await screen.findByRole('dialog', { name: /close cash shift/i });

    expect(within(dialog).queryByText(/system amount/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/system/i)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/declared amount/i)).toBeInTheDocument();
  });

  it('closes a shift with just the declared amount and shows a CLOSED reconciliation result', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash shift 1/i }));
    const dialog = await screen.findByRole('dialog', { name: /close cash shift/i });
    await userEvent.type(within(dialog).getByLabelText(/declared amount/i), '120');

    const closedResponse: CashShift = {
      ...openShift,
      systemAmount: 120,
      declaredAmount: 120,
      difference: 0,
      status: 'CLOSED',
      closedAt: '2026-08-05T16:00:00Z',
      closedByCollaborator: { id: 10, name: 'John Doe', role: 'WAITER' },
    };
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === 'POST') {
        return { status: 200, ok: true, json: async () => ({ statusCode: 200, message: 'ok', data: closedResponse }) };
      }
      return { status: 200, ok: true, json: async () => ({ statusCode: 200, message: 'ok', data: [closedResponse] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    await userEvent.click(within(dialog).getByRole('button', { name: /confirm close/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/cash-shifts/1/close'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ declaredAmount: 120 }),
        }),
      );
    });

    const resultDialog = await screen.findByRole('dialog', { name: /shift closed/i });
    expect(within(resultDialog).getByText('$120.00')).toBeInTheDocument();
    expect(within(resultDialog).getByText('CLOSED')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /close cash shift/i })).not.toBeInTheDocument();
  });

  it('shows a DISCREPANCY result when the declared amount does not match the system amount', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash shift 1/i }));
    const dialog = await screen.findByRole('dialog', { name: /close cash shift/i });
    await userEvent.type(within(dialog).getByLabelText(/declared amount/i), '100');

    const discrepancyResponse: CashShift = {
      ...openShift,
      systemAmount: 120,
      declaredAmount: 100,
      difference: -20,
      status: 'DISCREPANCY',
      closedAt: '2026-08-05T16:00:00Z',
      closedByCollaborator: { id: 10, name: 'John Doe', role: 'WAITER' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, options?: { method?: string }) => {
        if (options?.method === 'POST') {
          return { status: 200, ok: true, json: async () => ({ statusCode: 200, message: 'ok', data: discrepancyResponse }) };
        }
        return { status: 200, ok: true, json: async () => ({ statusCode: 200, message: 'ok', data: [discrepancyResponse] }) };
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /confirm close/i }));

    const resultDialog = await screen.findByRole('dialog', { name: /shift closed/i });
    expect(within(resultDialog).getByText('DISCREPANCY')).toBeInTheDocument();
    expect(within(resultDialog).getByText('-$20.00')).toBeInTheDocument();
  });

  it('shows a close-shift error inline in the dialog and keeps it open', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash shift 1/i }));
    const dialog = await screen.findByRole('dialog', { name: /close cash shift/i });
    await userEvent.type(within(dialog).getByLabelText(/declared amount/i), '100');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ message: 'The cash shift is already closed. Only OPEN cash shifts can be closed.' }),
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /confirm close/i }));

    await screen.findByText(/the cash shift is already closed/i);
    expect(screen.getByRole('dialog', { name: /close cash shift/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: FAIL — there's no Close action or dialog yet.

- [ ] **Step 3: Add `CloseCashShiftDialog` and `CashShiftResultModal`**

In `CashShiftsView.tsx`, add this import alongside the existing type imports:

```ts
import type { CloseCashShiftDto } from '../../../../types/cash-shift';
```

Add these two components after `OpenCashShiftFormModal` and before the `CashShiftsViewProps` interface:

```tsx
interface CloseCashShiftDialogProps {
  shift: CashShift;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (dto: CloseCashShiftDto) => void;
}

const CloseCashShiftDialog: React.FC<CloseCashShiftDialogProps> = ({
  shift,
  submitting,
  error,
  onCancel,
  onConfirm,
}) => {
  const [declaredAmount, setDeclaredAmount] = useState('');

  const declaredAmountNum = parseFloat(declaredAmount);
  const isValid = declaredAmount.trim() !== '' && !isNaN(declaredAmountNum) && declaredAmountNum >= 0;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-center p-4">
      <div
        role="dialog"
        aria-label="Close Cash Shift"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left"
      >
        <p className="font-bold text-[#1d1c17]">Close cash shift #CS-{shift.id}?</p>
        <p className="text-sm text-[#5f5e5e] mt-2">
          Count the physical cash in the drawer and enter it below. The system balance is not shown here — it is
          compared automatically after you submit.
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="close-shift-declared" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Declared Amount ($)
            </label>
            <input
              id="close-shift-declared"
              type="number"
              step="0.01"
              value={declaredAmount}
              onChange={(e) => setDeclaredAmount(e.target.value)}
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
            onClick={() => onConfirm({ declaredAmount: declaredAmountNum })}
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

interface CashShiftResultModalProps {
  shift: CashShift;
  onClose: () => void;
}

const CashShiftResultModal: React.FC<CashShiftResultModalProps> = ({ shift, onClose }) => {
  const difference = shift.difference ?? 0;
  const isBalanced = difference === 0;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-center p-4">
      <div
        role="dialog"
        aria-label="Shift Closed"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left"
      >
        <p className="font-bold text-[#1d1c17]">Cash shift #CS-{shift.id} closed</p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">System Amount</p>
            <p>{shift.systemAmount == null ? '--' : formatCurrency(shift.systemAmount)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Declared Amount</p>
            <p>{shift.declaredAmount == null ? '--' : formatCurrency(shift.declaredAmount)}</p>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Variance</p>
          <p className={isBalanced ? 'text-[#1d1c17]' : 'font-bold text-orange-700'}>
            {isBalanced ? formatCurrency(0) : `${difference > 0 ? '+' : '-'}${formatCurrency(Math.abs(difference))}`}
          </p>
        </div>
        <div className="mt-4">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[shift.status]}`}>
            {shift.status}
          </span>
        </div>
        <div className="flex justify-end mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#222222] hover:bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
```

- [ ] **Step 4: Wire the close flow and result modal into `CashShiftsView`**

Add state and handlers right after the `handleCreateSubmit` function added in Task F2:

```tsx
  const [closingShift, setClosingShift] = useState<CashShift | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [resultShift, setResultShift] = useState<CashShift | null>(null);

  const openCloseDialog = (shift: CashShift) => {
    setCloseError(null);
    setClosingShift(shift);
  };

  const cancelCloseDialog = () => {
    setCloseError(null);
    setClosingShift(null);
  };

  const handleCloseSubmit = async (dto: CloseCashShiftDto) => {
    if (!closingShift) return;
    setCloseSubmitting(true);
    setCloseError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/cash-shifts/${closingShift.id}/close`, {
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
        throw new Error(json.message || 'Failed to close cash shift');
      }

      await fetchCashShifts();
      setClosingShift(null);
      setResultShift(normalizeShift(json.data));
    } catch (err: any) {
      setCloseError(err.message || 'Failed to close cash shift');
    } finally {
      setCloseSubmitting(false);
    }
  };
```

Add the Close action button in the table's Actions cell, right after the View Details button:

```tsx
                            {shift.status === 'OPEN' && (
                              <button
                                type="button"
                                onClick={() => openCloseDialog(shift)}
                                aria-label={`Close cash shift ${shift.id}`}
                                className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                              >
                                <span className="material-symbols-outlined text-[20px]">lock</span>
                              </button>
                            )}
```

Render the two new modals near the other modals at the bottom of the component:

```tsx
      {closingShift && (
        <CloseCashShiftDialog
          shift={closingShift}
          submitting={closeSubmitting}
          error={closeError}
          onCancel={cancelCloseDialog}
          onConfirm={handleCloseSubmit}
        />
      )}

      {resultShift && <CashShiftResultModal shift={resultShift} onClose={() => setResultShift(null)} />}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: PASS, entire file.

- [ ] **Step 6: Run the full frontend test suite and the type check**

Run: `npx vitest run` — confirm no regressions elsewhere.
Run: `npx tsc --build --noEmit --force` — confirm zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx \
        src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx
git commit -m "feat(cash-shifts): add blind-count Close Shift dialog and reconciliation result modal"
```

---

## Self-Review Notes

- **Spec coverage:** "Open Cash Shift" modal with `cashDrawerId`/`openingBalance` and automatic context injection → Task F2 / Task B1. Single-active-shift guard per drawer (and the existing per-collaborator guard, kept) with the story's exact conflict wording → Task B1 Step 8. Blind cash count (never fetching/rendering `systemAmount` before submit) → Task F3, directly asserted in Step 1's "never fetches or renders the system amount" test. Automatic `closedBy`/`closedAt` injection and `systemAmount`/`difference`/status computation on close → Task B2. `CLOSED` vs `DISCREPANCY` branching → Task B2 Step 4, surfaced in the frontend via Task F3's result modal and Task F1's status badge/detail modal.
- **Placeholder scan:** no TBD/TODO; every step ships real code, not descriptions of code.
- **Type consistency:** `CreateCashShiftDto { cashDrawerId, openingBalance }` matches exactly between the backend DTO (B1) and frontend type/POST body (F2). `CloseCashShiftDto { declaredAmount }` matches exactly between backend (B2) and frontend (F3). `CashShiftStatus` values (`'OPEN' | 'CLOSED' | 'DISCREPANCY'`) match exactly between the backend enum (B1) and the frontend union type (F1) — both as uppercase strings, since the backend enum values themselves are `'OPEN'`/`'CLOSED'`/`'DISCREPANCY'` (unlike `cash-drawers`, whose statuses are capitalized words). `openedByCollaborator`/`closedByCollaborator: { id, name, role } | null` shape matches between the backend response DTO (B1) and the frontend `CashShiftCollaboratorRef` type (F1).
- **Task boundary check:** B1 leaves `closeShift` still using a client-supplied `collaboratorId` (a real, if superseded, intermediate state) but with `format()` already emitting collaborator objects and the full spec file green — B2 only changes `closeShift`'s own logic and DTO. F1 ships a working, read-only shift directory wired into navigation; F2 adds the Open flow on top; F3 adds the Close flow on top. Each task's `npx vitest run CashShiftsView.test.tsx` / `npx jest cash-shifts.service.spec.ts` step is green before moving to the next task.
