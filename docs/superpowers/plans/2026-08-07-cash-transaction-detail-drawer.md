# Cash Transaction Detail Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat "View Details" modal on the Cash Transactions grid with a full inspection drawer that surfaces `cashShift` context and a `loyaltyPointTransactions` ledger, backed by a backend endpoint that now actually loads and returns those relations.

**Architecture:** Backend (`x7-pos-back-end`): `GET /cash-transactions/:id` gains a `relations` option on its `findOne` query (`collaborator`, `cashShift` + its two collaborator sub-relations, `loyaltyPointTransactions`) and a new `formatDetail()` mapper feeding a new `CashTransactionDetailResponseDto`. `GET /cash-transactions` (list) is untouched. Frontend (`x7-pos-backoffice`): the transactions grid opens the drawer instantly with the row's already-fetched data, then fires `GET /cash-transactions/:id` in the background to fill in collaborator name, shift, and loyalty rows, gating only those specific sections with a small loading/error state.

**Tech Stack:** NestJS + TypeORM + Jest (backend), React 19 + TypeScript + Vite + Vitest + Testing Library (frontend), Tailwind v4 utility classes, no new dependencies.

## Global Constraints

- Notes empty-state copy must be the exact string `No additional notes provided for this transaction.` (spec, ticket).
- Loyalty empty-state copy: `No loyalty point activity linked to this transaction.` (spec).
- `createdAt`/`updatedAt` in the drawer's Audit Trail Timestamps must render as the raw ISO string returned by the API, not a locale-formatted date (spec — ticket calls for "exact... ISO time strings").
- `GET /cash-transactions` (list/paginated) response shape does not change — only `GET /cash-transactions/:id` gains new fields.
- `points` on a loyalty row is signed (positive = earned, negative = redeemed/reversed) — color green when `> 0`, red (`#ae001a`) when `< 0`.
- No edit/create/delete affordances in the drawer — read-only audit view.
- Follow existing code conventions in each repo (Tailwind utility classes and component shape already used by `JournalEntryDetailDrawer`; NestJS DTO/service patterns already used by `cash-shifts.service.ts`).

---

## Task 1: Backend — expose `cashShift` and `loyaltyPointTransactions` on `GET /cash-transactions/:id`

**Files:**
- Modify: `C:\Users\Rafael Cordero\x7-pos-back-end\src\restaurant-operations\cashdrawer\cash-transactions\dto\cash-transaction-response.dto.ts`
- Modify: `C:\Users\Rafael Cordero\x7-pos-back-end\src\restaurant-operations\cashdrawer\cash-transactions\cash-transactions.service.ts`
- Modify: `C:\Users\Rafael Cordero\x7-pos-back-end\src\restaurant-operations\cashdrawer\cash-transactions\cash-transactions.controller.ts`
- Test: `C:\Users\Rafael Cordero\x7-pos-back-end\src\restaurant-operations\cashdrawer\cash-transactions\cash-transactions.service.spec.ts`
- Test: `C:\Users\Rafael Cordero\x7-pos-back-end\src\restaurant-operations\cashdrawer\cash-transactions\cash-transactions.controller.spec.ts`

**Interfaces:**
- Produces (consumed by frontend Task 2): `GET /cash-transactions/:id` response `data` shape —
  ```ts
  {
    id: number; cashDrawerId: number; orderId: number | null; type: string;
    amount: number; collaboratorId: number; status: 'active' | 'deleted';
    notes: string | null; createdAt: string; updatedAt: string; // ISO strings over the wire
    collaborator: { id: number; name: string; role: string };
    cashShift: {
      id: number; status: 'OPEN' | 'CLOSED' | 'DISCREPANCY' | 'AUDITED';
      openedAt: string; closedAt: string | null;
      openingBalance: number; systemAmount: number | null;
      declaredAmount: number | null; difference: number | null;
      openedByCollaborator: { id: number; name: string; role: string };
      closedByCollaborator: { id: number; name: string; role: string } | null;
    } | null;
    loyaltyPointTransactions: Array<{
      id: number; description: string | null; source: string; points: number;
      loyaltyCustomerId: number; createdAt: string;
    }>;
  }
  ```
  (list response `GET /cash-transactions` is unchanged — no `collaborator`/`cashShift`/`loyaltyPointTransactions` fields there).

- [ ] **Step 1: Write the failing service test for the `relations` option on `findOne`**

Open `cash-transactions.service.spec.ts`. In the `describe('findOne', ...)` block (starts at the existing `it('should return a cash transaction successfully', ...)`, line 628), update the existing assertion and add three new tests. Replace the whole `it('should return a cash transaction successfully', ...)` block with:

```ts
    it('should return a cash transaction successfully', async () => {
      jest
        .spyOn(cashTransactionRepository, 'findOne')
        .mockResolvedValue(mockCashTransaction as any);
      jest
        .spyOn(cashDrawerRepository, 'findOne')
        .mockResolvedValue(mockCashDrawer as any);

      const result = await service.findOne(1, 1);

      expect(cashTransactionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1, status: CashTransactionStatus.ACTIVE },
        relations: [
          'collaborator',
          'cashShift',
          'cashShift.openedByCollaborator',
          'cashShift.closedByCollaborator',
          'loyaltyPointTransactions',
        ],
      });
      expect(result.statusCode).toBe(200);
      expect(result.message).toBe('Cash transaction retrieved successfully');
      expect(result.data.id).toBe(1);
    });

    it('should map collaborator, cashShift, and loyaltyPointTransactions onto the detail response', async () => {
      const fullTransaction = {
        ...mockCashTransaction,
        collaborator: { id: 1, name: 'Jhon Doe', role: 'waiter' },
        cashShift: {
          id: 7,
          status: 'OPEN',
          openedAt: new Date('2024-01-15T07:00:00Z'),
          closedAt: null,
          openingBalance: 100,
          systemAmount: null,
          declaredAmount: null,
          difference: null,
          openedBy: 1,
          closedBy: null,
          openedByCollaborator: { id: 1, name: 'Jhon Doe', role: 'waiter' },
          closedByCollaborator: null,
        },
        loyaltyPointTransactions: [
          {
            id: 55,
            description: 'Points earned from order',
            source: 'ORDER',
            points: 150,
            loyaltyCustomerId: 3,
            createdAt: new Date('2024-01-15T08:00:00Z'),
          },
        ],
      };
      jest
        .spyOn(cashTransactionRepository, 'findOne')
        .mockResolvedValue(fullTransaction as any);
      jest
        .spyOn(cashDrawerRepository, 'findOne')
        .mockResolvedValue(mockCashDrawer as any);

      const result = await service.findOne(1, 1);

      expect(result.data.collaborator).toEqual({
        id: 1,
        name: 'Jhon Doe',
        role: 'waiter',
      });
      expect(result.data.cashShift).toEqual({
        id: 7,
        status: 'OPEN',
        openedAt: fullTransaction.cashShift.openedAt,
        closedAt: null,
        openingBalance: 100,
        systemAmount: null,
        declaredAmount: null,
        difference: null,
        openedByCollaborator: { id: 1, name: 'Jhon Doe', role: 'waiter' },
        closedByCollaborator: null,
      });
      expect(result.data.loyaltyPointTransactions).toEqual([
        {
          id: 55,
          description: 'Points earned from order',
          source: 'ORDER',
          points: 150,
          loyaltyCustomerId: 3,
          createdAt: fullTransaction.loyaltyPointTransactions[0].createdAt,
        },
      ]);
    });

    it('should return cashShift: null and loyaltyPointTransactions: [] when neither relation is present', async () => {
      const bareTransaction = {
        ...mockCashTransaction,
        collaborator: { id: 1, name: 'Jhon Doe', role: 'waiter' },
        cashShift: null,
        loyaltyPointTransactions: [],
      };
      jest
        .spyOn(cashTransactionRepository, 'findOne')
        .mockResolvedValue(bareTransaction as any);
      jest
        .spyOn(cashDrawerRepository, 'findOne')
        .mockResolvedValue(mockCashDrawer as any);

      const result = await service.findOne(1, 1);

      expect(result.data.cashShift).toBeNull();
      expect(result.data.loyaltyPointTransactions).toEqual([]);
    });

    it('should fall back to an Unknown collaborator when the relation is missing', async () => {
      const noCollaboratorTransaction = {
        ...mockCashTransaction,
        collaborator: null,
        cashShift: null,
        loyaltyPointTransactions: [],
      };
      jest
        .spyOn(cashTransactionRepository, 'findOne')
        .mockResolvedValue(noCollaboratorTransaction as any);
      jest
        .spyOn(cashDrawerRepository, 'findOne')
        .mockResolvedValue(mockCashDrawer as any);

      const result = await service.findOne(1, 1);

      expect(result.data.collaborator).toEqual({
        id: mockCashTransaction.collaborator_id,
        name: 'Unknown',
        role: '—',
      });
    });
```

- [ ] **Step 2: Run the service tests to see them fail**

Run: `cd "C:\Users\Rafael Cordero\x7-pos-back-end" && npx jest src/restaurant-operations/cashdrawer/cash-transactions/cash-transactions.service.spec.ts`
Expected: FAIL — the `relations` assertion fails (current `findOne` call has no `relations` key) and `result.data.collaborator`/`cashShift`/`loyaltyPointTransactions` are `undefined` (TS also errors because these fields don't exist yet on `CashTransactionResponseDto`, so this won't even compile until Step 3 adds the DTOs — that compile failure **is** the expected failing state).

- [ ] **Step 3: Add the new DTOs**

In `cash-transaction-response.dto.ts`, add these imports right after the existing ones (top of file, after `import { CashTransactionType } from '../constants/cash-transaction-type.enum';`):

```ts
import { CashShiftStatus } from 'src/restaurant-operations/cashdrawer/cash-shifts/constants/cash-shift-status.enum';
import { BasicCollaboratorInfoDto } from 'src/restaurant-operations/cashdrawer/cash-shifts/dto/cash-shift-response.dto';
import { LoyaltyPointsSource } from 'src/growth/loyalty/loyalty-points-transaction/constants/loyalty-points-source.enum';
```

Then append these classes at the end of the file (after the existing `CashTransactionLittleResponseDto` class):

```ts
export class CashTransactionCashShiftDto {
  @ApiProperty({ example: 7 })
  id: number;

  @ApiProperty({ example: 'OPEN', enum: CashShiftStatus })
  status: CashShiftStatus;

  @ApiProperty({ example: '2024-01-15T07:00:00Z' })
  openedAt: Date;

  @ApiProperty({ example: '2024-01-15T20:00:00Z', nullable: true })
  closedAt: Date | null;

  @ApiProperty({ example: 1000.0 })
  openingBalance: number;

  @ApiProperty({ example: 1500.0, nullable: true })
  systemAmount: number | null;

  @ApiProperty({ example: 1480.0, nullable: true })
  declaredAmount: number | null;

  @ApiProperty({ example: -20.0, nullable: true })
  difference: number | null;

  @ApiProperty({ type: () => BasicCollaboratorInfoDto })
  openedByCollaborator: BasicCollaboratorInfoDto;

  @ApiProperty({ type: () => BasicCollaboratorInfoDto, nullable: true })
  closedByCollaborator: BasicCollaboratorInfoDto | null;
}

export class CashTransactionLoyaltyPointDto {
  @ApiProperty({ example: 55 })
  id: number;

  @ApiProperty({ example: 'Points earned from order', nullable: true })
  description: string | null;

  @ApiProperty({ example: 'ORDER', enum: LoyaltyPointsSource })
  source: LoyaltyPointsSource;

  @ApiProperty({ example: 150 })
  points: number;

  @ApiProperty({ example: 3 })
  loyaltyCustomerId: number;

  @ApiProperty({ example: '2024-01-15T08:00:00Z' })
  createdAt: Date;
}

export class CashTransactionDetailResponseDto extends CashTransactionResponseDto {
  @ApiProperty({ type: () => BasicCollaboratorInfoDto })
  collaborator: BasicCollaboratorInfoDto;

  @ApiProperty({ type: () => CashTransactionCashShiftDto, nullable: true })
  cashShift: CashTransactionCashShiftDto | null;

  @ApiProperty({ type: () => CashTransactionLoyaltyPointDto, isArray: true })
  loyaltyPointTransactions: CashTransactionLoyaltyPointDto[];
}

export class OneCashTransactionDetailResponseDto extends SuccessResponse {
  @ApiProperty({ type: CashTransactionDetailResponseDto })
  data: CashTransactionDetailResponseDto;
}
```

- [ ] **Step 4: Wire the relations, `formatDetail()`, and the new return type into the service**

In `cash-transactions.service.ts`:

1. Update the import block (currently lines 28–32) to also import the new DTO and `Collaborator`-typed helper isn't needed beyond what's already imported (`Collaborator` is already imported at line 26):

```ts
import {
  OneCashTransactionResponseDto,
  OneCashTransactionDetailResponseDto,
  PaginatedCashTransactionsResponseDto,
  CashTransactionResponseDto,
  CashTransactionDetailResponseDto,
} from './dto/cash-transaction-response.dto';
```

2. Replace the `findOne` method body (lines 371–398) with:

```ts
  async findOne(
    id: number,
    authenticatedUserMerchantId: number,
  ): Promise<OneCashTransactionDetailResponseDto> {
    if (!id || id <= 0) throw new BadRequestException('Invalid id');
    if (!authenticatedUserMerchantId)
      throw new ForbiddenException('You must be associated with a merchant');

    const row = await this.cashTransactionRepo.findOne({
      where: { id, status: CashTransactionStatus.ACTIVE },
      relations: [
        'collaborator',
        'cashShift',
        'cashShift.openedByCollaborator',
        'cashShift.closedByCollaborator',
        'loyaltyPointTransactions',
      ],
    });
    if (!row) throw new NotFoundException('Cash transaction not found');

    // Ensure ownership via cash drawer
    const cashDrawer = await this.cashDrawerRepo.findOne({
      where: { id: row.cash_drawer_id },
    });
    if (!cashDrawer || cashDrawer.merchant_id !== authenticatedUserMerchantId)
      throw new ForbiddenException(
        'You can only access transactions from your merchant',
      );

    return {
      statusCode: 200,
      message: 'Cash transaction retrieved successfully',
      data: this.formatDetail(row),
    };
  }
```

3. Add the `formatDetail` method right after the existing `private format(...)` method (after line 499, before the closing `}` of the class):

```ts

  private formatDetail(row: CashTransaction): CashTransactionDetailResponseDto {
    const toBasicCollaborator = (
      c: Collaborator | null | undefined,
      fallbackId: number,
    ) =>
      c
        ? { id: c.id, name: c.name, role: c.role }
        : { id: fallbackId, name: 'Unknown', role: '—' };

    return {
      ...this.format(row),
      collaborator: toBasicCollaborator(row.collaborator, row.collaborator_id),
      cashShift: row.cashShift
        ? {
            id: row.cashShift.id,
            status: row.cashShift.status,
            openedAt: row.cashShift.openedAt,
            closedAt: row.cashShift.closedAt,
            openingBalance: Number(row.cashShift.openingBalance),
            systemAmount:
              row.cashShift.systemAmount !== null
                ? Number(row.cashShift.systemAmount)
                : null,
            declaredAmount:
              row.cashShift.declaredAmount !== null
                ? Number(row.cashShift.declaredAmount)
                : null,
            difference:
              row.cashShift.difference !== null
                ? Number(row.cashShift.difference)
                : null,
            openedByCollaborator: toBasicCollaborator(
              row.cashShift.openedByCollaborator,
              row.cashShift.openedBy,
            ),
            closedByCollaborator: row.cashShift.closedByCollaborator
              ? toBasicCollaborator(
                  row.cashShift.closedByCollaborator,
                  row.cashShift.closedBy ?? 0,
                )
              : null,
          }
        : null,
      loyaltyPointTransactions: (row.loyaltyPointTransactions ?? []).map(
        (lpt) => ({
          id: lpt.id,
          description: lpt.description ?? null,
          source: lpt.source,
          points: lpt.points,
          loyaltyCustomerId: lpt.loyaltyCustomerId,
          createdAt: lpt.createdAt,
        }),
      ),
    };
  }
```

- [ ] **Step 5: Update the controller's `findOne` return type**

In `cash-transactions.controller.ts`:

1. Update the import (currently lines 43–46) to add `OneCashTransactionDetailResponseDto`:

```ts
import {
  OneCashTransactionResponseDto,
  OneCashTransactionDetailResponseDto,
  PaginatedCashTransactionsResponseDto,
} from './dto/cash-transaction-response.dto';
```

2. Change the `findOne` controller method's Swagger response type and TS return type (lines 238–271): update `@ApiOkResponse({ ..., type: OneCashTransactionResponseDto, ... })` to `type: OneCashTransactionDetailResponseDto`, and change the method signature:

```ts
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OneCashTransactionDetailResponseDto> {
    const authenticatedUserMerchantId = user.merchant?.id;
    return this.cashTransactionsService.findOne(
      id,
      authenticatedUserMerchantId,
    );
  }
```

(Leave the `@ApiOkResponse` `example` block as-is — it's illustrative Swagger documentation, not a type check; updating its example payload is optional polish, not required for correctness.)

- [ ] **Step 6: Run the service tests again and verify they pass**

Run: `cd "C:\Users\Rafael Cordero\x7-pos-back-end" && npx jest src/restaurant-operations/cashdrawer/cash-transactions/cash-transactions.service.spec.ts`
Expected: PASS (all tests in the file, including the 4 in `describe('findOne', ...)`)

- [ ] **Step 7: Fix the controller spec's now-mistyped `findOne` fixtures**

`cash-transactions.controller.spec.ts` currently types the `findOne` response as `OneCashTransactionResponseDto` (missing the new required fields), which will now fail to compile against the service's new return type. Add a detail fixture near the top of the file, right after the existing `mockOneCashTransactionResponse` (after line 66):

```ts
  const mockCashTransactionDetailResponseData: CashTransactionDetailResponseDto =
    {
      ...mockCashTransactionResponseData,
      collaborator: { id: 1, name: 'Jhon Doe', role: 'waiter' },
      cashShift: null,
      loyaltyPointTransactions: [],
    };

  const mockOneCashTransactionDetailResponse: OneCashTransactionDetailResponseDto =
    {
      statusCode: 200,
      message: 'Cash transaction retrieved successfully',
      data: mockCashTransactionDetailResponseData,
    };
```

Add `OneCashTransactionDetailResponseDto` and `CashTransactionDetailResponseDto` to the existing import from `./dto/cash-transaction-response.dto'` (line 10–13):

```ts
import {
  OneCashTransactionResponseDto,
  OneCashTransactionDetailResponseDto,
  CashTransactionResponseDto,
  CashTransactionDetailResponseDto,
} from './dto/cash-transaction-response.dto';
```

Then in the `describe('GET /cash-transactions/:id (findOne)', ...)` block (lines 229–289), replace every `const response: OneCashTransactionResponseDto = { ...mockOneCashTransactionResponse, ... }` with `const response: OneCashTransactionDetailResponseDto = { ...mockOneCashTransactionDetailResponse, ... }` — i.e. the two occurrences at lines 232 and 260 become:

```ts
      const response: OneCashTransactionDetailResponseDto = {
        ...mockOneCashTransactionDetailResponse,
        statusCode: 200,
        message: 'Cash transaction retrieved successfully',
      };
```

- [ ] **Step 8: Run the full backend test suite for this module**

Run: `cd "C:\Users\Rafael Cordero\x7-pos-back-end" && npx jest src/restaurant-operations/cashdrawer/cash-transactions`
Expected: PASS — both `cash-transactions.service.spec.ts` and `cash-transactions.controller.spec.ts` green, no TS compile errors.

- [ ] **Step 9: Commit**

```bash
cd "C:\Users\Rafael Cordero\x7-pos-back-end"
git add src/restaurant-operations/cashdrawer/cash-transactions/dto/cash-transaction-response.dto.ts src/restaurant-operations/cashdrawer/cash-transactions/cash-transactions.service.ts src/restaurant-operations/cashdrawer/cash-transactions/cash-transactions.controller.ts src/restaurant-operations/cashdrawer/cash-transactions/cash-transactions.service.spec.ts src/restaurant-operations/cashdrawer/cash-transactions/cash-transactions.controller.spec.ts
git commit -m "feat(cash-transactions): expose cashShift and loyaltyPointTransactions on GET /cash-transactions/:id"
```

---

## Task 2: Frontend — types, detail-fetch wiring, drawer shell, row-click trigger

**Files:**
- Modify: `c:\Users\Rafael Cordero\x7-pos-backoffice\src\types\cash-transaction.ts`
- Modify: `c:\Users\Rafael Cordero\x7-pos-backoffice\src\components\MerchantFrame\views\restaurant-operations\CashTransactionsView.tsx`
- Test: `c:\Users\Rafael Cordero\x7-pos-backoffice\src\components\MerchantFrame\views\restaurant-operations\CashTransactionsView.test.tsx`

**Interfaces:**
- Consumes: backend response shape from Task 1 (`GET /cash-transactions/:id` returns `data.collaborator`, `data.cashShift`, `data.loyaltyPointTransactions` as documented in Task 1's Interfaces block).
- Produces (consumed by Tasks 3 and 4, which render inside the same drawer component added here): `CashTransactionDetailDrawer` component; `openDetail(txn: CashTransaction): void` handler wired to both the row and the button; `detailTransaction: CashTransaction | null`, `detailLoading: boolean`, `detailError: string | null` state, all passed as props into `CashTransactionDetailDrawer`; types `BasicCollaboratorInfo`, `CashTransactionCashShift`, `LoyaltyPointTransaction` exported from `src/types/cash-transaction.ts`.

- [ ] **Step 1: Read the current types file**

Read `c:\Users\Rafael Cordero\x7-pos-backoffice\src\types\cash-transaction.ts` before editing (required by the Edit tool).

- [ ] **Step 2: Extend the types file**

Add these three new interfaces and three new optional fields on `CashTransaction`:

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
```

On the existing `CashTransaction` interface, add (alongside the existing `notes?: string | null;` field):

```ts
  collaborator?: BasicCollaboratorInfo;
  cashShift?: CashTransactionCashShift | null;
  loyaltyPointTransactions?: LoyaltyPointTransaction[];
```

- [ ] **Step 3: Write the failing tests for row-click trigger, detail fetch, and the notes fallback copy change**

In `CashTransactionsView.test.tsx`, replace the whole `describe('CashTransactionsView — View Details modal', ...)` block (lines 133–176) with:

```ts
describe('CashTransactionsView — View Details drawer', () => {
  function mockFetchWithDetail(list: CashTransaction[], detail: CashTransaction) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          status: 200,
          ok: true,
          json: async () =>
            url.includes(`/cash-transactions/${detail.id}`)
              ? { statusCode: 200, message: 'ok', data: detail }
              : { statusCode: 200, message: 'ok', data: list, paginationMeta },
        }),
      ),
    );
  }

  it('opens the detail drawer with full transaction info when View Details is clicked', async () => {
    const user = userEvent.setup();
    mockFetchWithDetail([saleTxn], saleTxn);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await user.click(screen.getByRole('button', { name: /view cash transaction 1 details/i }));

    const dialog = screen.getByRole('dialog', { name: /cash transaction details/i });
    expect(within(dialog).getByText('#CT-1')).toBeInTheDocument();
    expect(within(dialog).getByText('#CD-3')).toBeInTheDocument();
    expect(within(dialog).getByText('SALE')).toBeInTheDocument();
    expect(within(dialog).getByText('$125.50')).toBeInTheDocument();
    expect(within(dialog).getByText('Order #200')).toBeInTheDocument();
    expect(within(dialog).getByText('Table 4 dine-in')).toBeInTheDocument();
  });

  it('opens the detail drawer when the row itself is clicked, not just the button', async () => {
    const user = userEvent.setup();
    mockFetchWithDetail([saleTxn], saleTxn);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await user.click(screen.getByTestId('cash-transaction-row-1'));

    expect(screen.getByRole('dialog', { name: /cash transaction details/i })).toBeInTheDocument();
  });

  it('shows the exact audit-trail ISO timestamps for created and updated', async () => {
    const user = userEvent.setup();
    mockFetchWithDetail([saleTxn], saleTxn);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await user.click(screen.getByRole('button', { name: /view cash transaction 1 details/i }));
    const dialog = screen.getByRole('dialog', { name: /cash transaction details/i });
    expect(within(dialog).getAllByText(saleTxn.createdAt).length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).getByText(saleTxn.updatedAt)).toBeInTheDocument();
  });

  it('closes the detail drawer when the close button is clicked', async () => {
    const user = userEvent.setup();
    mockFetchWithDetail([saleTxn], saleTxn);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await user.click(screen.getByRole('button', { name: /view cash transaction 1 details/i }));
    expect(screen.getByRole('dialog', { name: /cash transaction details/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog', { name: /cash transaction details/i })).not.toBeInTheDocument();
  });

  it('shows a dash for orderId and the exact empty-notes copy when the transaction has neither', async () => {
    const user = userEvent.setup();
    const bareTxn: CashTransaction = { ...saleTxn, id: 9, orderId: null, notes: null };
    mockFetchWithDetail([bareTxn], bareTxn);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-9');

    await user.click(screen.getByRole('button', { name: /view cash transaction 9 details/i }));
    const dialog = screen.getByRole('dialog', { name: /cash transaction details/i });
    expect(within(dialog).getByText('—')).toBeInTheDocument();
    expect(
      within(dialog).getByText('No additional notes provided for this transaction.'),
    ).toBeInTheDocument();
  });

  it('shows an inline error and keeps the base fields when the detail fetch fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('/cash-transactions/1')
          ? Promise.resolve({ status: 500, ok: false, json: async () => ({}) })
          : Promise.resolve({
              status: 200,
              ok: true,
              json: async () => ({ statusCode: 200, message: 'ok', data: [saleTxn], paginationMeta }),
            }),
      ),
    );
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await user.click(screen.getByRole('button', { name: /view cash transaction 1 details/i }));
    const dialog = screen.getByRole('dialog', { name: /cash transaction details/i });
    expect(within(dialog).getByText('#CT-1')).toBeInTheDocument();
    expect(within(dialog).getByText('Table 4 dine-in')).toBeInTheDocument();
    expect(within(dialog).getAllByText(/could not load/i).length).toBeGreaterThanOrEqual(1);
  });
});
```

Note: this removes the old generic `getAllByText('—').length >= 2` assertion (it depended on the old dash fallback for notes, which is now the explicit sentence) in favor of asserting the order-id dash and the exact notes sentence separately.

- [ ] **Step 4: Run the test file to see the new/changed tests fail**

Run: `cd "c:\Users\Rafael Cordero\x7-pos-backoffice" && npx vitest run src/components/MerchantFrame/views/restaurant-operations/CashTransactionsView.test.tsx`
Expected: FAIL — row-click test fails (row has no click handler yet), ISO-timestamp test fails (drawer still shows `formatDateTime`-formatted dates), notes-copy test fails (still shows `—`), error-fallback test fails (no detail fetch exists yet at all).

- [ ] **Step 5: Rename the modal to a drawer, add the fetch-on-open wiring, and switch Notes/Audit Trail copy**

In `CashTransactionsView.tsx`:

1. Update the type import (line 4–8) to include the new types:

```ts
import type {
  CashTransaction,
  CashTransactionType,
  CashTransactionPaginationMeta,
} from '../../../../types/cash-transaction';
```

(no new type imports needed here — the component only needs `CashTransaction`, whose shape already grew via Task 2 Step 2).

2. Replace the whole `CashTransactionDetailModal` component (lines 51–118) with a renamed, slide-in drawer version. It now also takes `loading`/`error` props (populated in Task 3/4, unused visually until then except for the inline error passthrough added below):

```tsx
interface CashTransactionDetailDrawerProps {
  transaction: CashTransaction;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

const CashTransactionDetailDrawer: React.FC<CashTransactionDetailDrawerProps> = ({
  transaction,
  loading,
  error,
  onClose,
}) => {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end font-sans">
      <div
        data-testid="cash-transaction-drawer-backdrop"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Cash Transaction Details"
        className="relative bg-white border-l border-[#e8e2d8] shadow-2xl w-full max-w-lg h-full overflow-hidden animate-slide-in text-left flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">#CT-{transaction.id} Details</span>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Transaction</p>
            <p className="font-bold text-[#1d1c17]">#CT-{transaction.id}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Cash Drawer</p>
              <p>#CD-{transaction.cashDrawerId}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Type</p>
              <p>{formatTypeLabel(transaction.type)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Amount</p>
              <p className={amountColorClass(transaction.type)}>{formatCurrency(transaction.amount)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Collaborator</p>
              <p>#EMP-{transaction.collaboratorId}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Linked Order</p>
            <p>{transaction.orderId != null ? `Order #${transaction.orderId}` : '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Notes</p>
            <p>{transaction.notes || 'No additional notes provided for this transaction.'}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Created (Audit Trail)</p>
              <p className="font-mono text-xs">{transaction.createdAt}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Updated (Audit Trail)</p>
              <p className="font-mono text-xs">{transaction.updatedAt}</p>
            </div>
          </div>
          {error && (
            <p className="text-[#ae001a] text-xs" role="alert">
              {error}
            </p>
          )}
          {loading && (
            <p className="text-[#5f5e5e] text-xs" data-testid="detail-loading-indicator">
              Loading shift and loyalty details…
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
```

3. Inside `CashTransactionsView`, replace the single `detailTransaction` state (line 130) with the fetch-on-open trio and a request-id ref. Replace:

```ts
  const [detailTransaction, setDetailTransaction] = useState<CashTransaction | null>(null);
```

with:

```ts
  const [detailTransaction, setDetailTransaction] = useState<CashTransaction | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequestIdRef = React.useRef<number | null>(null);
```

4. Add `openDetail`/`closeDetail` handlers. Insert them right after the `fetchCashTransactions` function definition (after line 186, before the `useEffect` at line 188):

```ts
  const openDetail = async (txn: CashTransaction) => {
    setDetailTransaction(txn);
    setDetailError(null);
    setDetailLoading(true);
    detailRequestIdRef.current = txn.id;
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/cash-transactions/${txn.id}`, { headers });
      if (!res.ok) throw new Error('Failed to load cash transaction detail');
      const json = await res.json();
      if (detailRequestIdRef.current === txn.id) {
        setDetailTransaction(normalizeTransaction(json.data));
      }
    } catch (err) {
      console.error('Error fetching cash transaction detail:', err);
      if (detailRequestIdRef.current === txn.id) {
        setDetailError('Could not load shift and loyalty point details for this transaction.');
      }
    } finally {
      if (detailRequestIdRef.current === txn.id) {
        setDetailLoading(false);
      }
    }
  };

  const closeDetail = () => {
    detailRequestIdRef.current = null;
    setDetailTransaction(null);
    setDetailError(null);
    setDetailLoading(false);
  };
```

5. Wire the row and button to `openDetail`, and make the row visually clickable. Replace the `<tr>` opening tag and the "Actions" button cell (lines 400–461) with:

```tsx
                      <tr
                        key={txn.id}
                        data-testid={`cash-transaction-row-${txn.id}`}
                        onClick={() => openDetail(txn)}
                        className="hover:bg-[#f8f3eb] transition-colors cursor-pointer"
                      >
```

(keep every `<td>` in between unchanged) and change only the Actions button's `onClick`:

```tsx
                        <td className="px-6 py-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail(txn);
                            }}
                            aria-label={`View cash transaction ${txn.id} details`}
                            className="p-1 text-[#1d1c17] hover:text-primary transition-colors duration-200"
                          >
                            <span className="material-symbols-outlined text-[20px]">visibility</span>
                          </button>
                        </td>
```

6. Replace the render block at the bottom (lines 497–499):

```tsx
      {detailTransaction && (
        <CashTransactionDetailModal transaction={detailTransaction} onClose={() => setDetailTransaction(null)} />
      )}
```

with:

```tsx
      {detailTransaction && (
        <CashTransactionDetailDrawer
          transaction={detailTransaction}
          loading={detailLoading}
          error={detailError}
          onClose={closeDetail}
        />
      )}
```

- [ ] **Step 6: Run the test file again and verify it passes**

Run: `cd "c:\Users\Rafael Cordero\x7-pos-backoffice" && npx vitest run src/components/MerchantFrame/views/restaurant-operations/CashTransactionsView.test.tsx`
Expected: PASS — all tests in the file, including every other pre-existing `describe` block (grid rendering, filters, pagination, search, Quick Launch nav), since none of those touch the drawer or the row's `onClick`.

- [ ] **Step 7: Commit**

```bash
cd "c:\Users\Rafael Cordero\x7-pos-backoffice"
git add src/types/cash-transaction.ts src/components/MerchantFrame/views/restaurant-operations/CashTransactionsView.tsx src/components/MerchantFrame/views/restaurant-operations/CashTransactionsView.test.tsx
git commit -m "feat(cash-transactions): open detail drawer on row click and fetch full detail on open"
```

---

## Task 3: Frontend — Status badge, Collaborator name, Cashier Shift section

**Files:**
- Modify: `c:\Users\Rafael Cordero\x7-pos-backoffice\src\components\MerchantFrame\views\restaurant-operations\CashTransactionsView.tsx`
- Test: `c:\Users\Rafael Cordero\x7-pos-backoffice\src\components\MerchantFrame\views\restaurant-operations\CashTransactionsView.test.tsx`

**Interfaces:**
- Consumes: `CashTransactionDetailDrawer`, `openDetail`, `detailTransaction`/`detailLoading`/`detailError` state from Task 2; `transaction.collaborator?: BasicCollaboratorInfo`, `transaction.cashShift?: CashTransactionCashShift | null` from Task 2's type extension.
- Produces: no new exports — this task only changes what's rendered inside `CashTransactionDetailDrawer`.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `CashTransactionsView.test.tsx`, after the `describe('CashTransactionsView — View Details drawer', ...)` block added in Task 2:

```ts
describe('CashTransactionsView — drawer status, collaborator, and shift', () => {
  function mockFetchWithDetail(list: CashTransaction[], detail: CashTransaction) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          status: 200,
          ok: true,
          json: async () =>
            url.includes(`/cash-transactions/${detail.id}`)
              ? { statusCode: 200, message: 'ok', data: detail }
              : { statusCode: 200, message: 'ok', data: list, paginationMeta },
        }),
      ),
    );
  }

  const shiftTxn: CashTransaction = {
    ...saleTxn,
    collaborator: { id: 5, name: 'Jane Cashier', role: 'cashier' },
    cashShift: {
      id: 7,
      status: 'OPEN',
      openedAt: '2026-08-07T07:00:00Z',
      closedAt: null,
      openingBalance: 100,
      systemAmount: null,
      declaredAmount: null,
      difference: null,
      openedByCollaborator: { id: 5, name: 'Jane Cashier', role: 'cashier' },
      closedByCollaborator: null,
    },
    loyaltyPointTransactions: [],
  };

  it('shows the status badge and collaborator name once the detail resolves', async () => {
    const user = userEvent.setup();
    mockFetchWithDetail([saleTxn], shiftTxn);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await user.click(screen.getByRole('button', { name: /view cash transaction 1 details/i }));
    const dialog = screen.getByRole('dialog', { name: /cash transaction details/i });

    expect(await within(dialog).findByText('active')).toBeInTheDocument();
    expect(await within(dialog).findByText(/Jane Cashier/)).toBeInTheDocument();
  });

  it('shows the shift id and status once resolved', async () => {
    const user = userEvent.setup();
    mockFetchWithDetail([saleTxn], shiftTxn);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await user.click(screen.getByRole('button', { name: /view cash transaction 1 details/i }));
    const dialog = screen.getByRole('dialog', { name: /cash transaction details/i });

    expect(await within(dialog).findByText('#SHIFT-7')).toBeInTheDocument();
    expect(within(dialog).getByText('OPEN')).toBeInTheDocument();
  });

  it('shows "No shift linked" when cashShift resolves to null', async () => {
    const user = userEvent.setup();
    const noShiftTxn: CashTransaction = { ...saleTxn, collaborator: { id: 5, name: 'Jane Cashier', role: 'cashier' }, cashShift: null, loyaltyPointTransactions: [] };
    mockFetchWithDetail([saleTxn], noShiftTxn);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await user.click(screen.getByRole('button', { name: /view cash transaction 1 details/i }));
    const dialog = screen.getByRole('dialog', { name: /cash transaction details/i });

    expect(await within(dialog).findByText('No shift linked')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test file to see the new tests fail**

Run: `cd "c:\Users\Rafael Cordero\x7-pos-backoffice" && npx vitest run src/components/MerchantFrame/views/restaurant-operations/CashTransactionsView.test.tsx`
Expected: FAIL — the drawer doesn't render a status badge, collaborator name, or shift section yet.

- [ ] **Step 3: Add the status badge, collaborator name, and shift section to the drawer**

In `CashTransactionsView.tsx`, add a status-badge class map near the other formatting helpers (right after `export function formatDateTime(...)`, before the `CashTransactionDetailModal`/`CashTransactionDetailDrawer` component):

```ts
export const CASH_TRANSACTION_STATUS_BADGE_CLASSES: Record<string, string> = {
  active: 'bg-green-500/10 text-green-600',
  deleted: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
};
```

In `CashTransactionDetailDrawer`, replace the header `<span>` block (the `#CT-{transaction.id} Details` span) with a header row that also carries the status badge:

```tsx
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[11px] uppercase tracking-widest">#CT-{transaction.id} Details</span>
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                CASH_TRANSACTION_STATUS_BADGE_CLASSES[transaction.status] ?? 'bg-white/10 text-white'
              }`}
            >
              {transaction.status}
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
```

Replace the "Collaborator" field's `<p>` (currently `<p>#EMP-{transaction.collaboratorId}</p>`) with:

```tsx
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Collaborator</p>
              <p>
                #EMP-{transaction.collaboratorId}
                {transaction.collaborator ? ` — ${transaction.collaborator.name}` : ''}
              </p>
            </div>
```

Add a new "Cashier Shift" block right after the "Cash Drawer"/"Type" grid row and before the "Amount"/"Collaborator" grid row:

```tsx
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Cashier Shift</p>
            {loading ? (
              <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32 mt-1" data-testid="shift-section-loading" />
            ) : error ? (
              <p className="text-[#ae001a] text-xs mt-1">{error}</p>
            ) : transaction.cashShift ? (
              <p>
                #SHIFT-{transaction.cashShift.id}{' '}
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#ece8e0] text-[#5f5e5e]">
                  {transaction.cashShift.status}
                </span>
              </p>
            ) : (
              <p>No shift linked</p>
            )}
          </div>
```

Finally, remove the now-redundant bottom-of-body `{loading && (...)}` block added in Task 2 Step 3 (the generic "Loading shift and loyalty details…" line) — the shift section (and the loyalty section added in Task 4) now each show their own inline skeleton, so the generic message is no longer needed. Keep the `{error && (...)}` top-level block removed too, since Shift/Loyalty sections now render their own inline error text — delete both:

```tsx
          {error && (
            <p className="text-[#ae001a] text-xs" role="alert">
              {error}
            </p>
          )}
          {loading && (
            <p className="text-[#5f5e5e] text-xs" data-testid="detail-loading-indicator">
              Loading shift and loyalty details…
            </p>
          )}
```

(This also means the Task 2 "shows an inline error and keeps the base fields when the detail fetch fails" test's assertion `within(dialog).getAllByText(/could not load/i).length >= 1` still passes, because the Shift section now renders that same `error` string inline.)

- [ ] **Step 4: Run the test file again and verify it passes**

Run: `cd "c:\Users\Rafael Cordero\x7-pos-backoffice" && npx vitest run src/components/MerchantFrame/views/restaurant-operations/CashTransactionsView.test.tsx`
Expected: PASS — all tests, including Task 2's tests (the error-fallback test still finds "could not load" text, now via the Shift section instead of the removed generic block).

- [ ] **Step 5: Commit**

```bash
cd "c:\Users\Rafael Cordero\x7-pos-backoffice"
git add src/components/MerchantFrame/views/restaurant-operations/CashTransactionsView.tsx src/components/MerchantFrame/views/restaurant-operations/CashTransactionsView.test.tsx
git commit -m "feat(cash-transactions): show status badge, collaborator name, and cashier shift in the detail drawer"
```

---

## Task 4: Frontend — Loyalty Points Ledger nested table

**Files:**
- Modify: `c:\Users\Rafael Cordero\x7-pos-backoffice\src\components\MerchantFrame\views\restaurant-operations\CashTransactionsView.tsx`
- Test: `c:\Users\Rafael Cordero\x7-pos-backoffice\src\components\MerchantFrame\views\restaurant-operations\CashTransactionsView.test.tsx`

**Interfaces:**
- Consumes: `transaction.loyaltyPointTransactions?: LoyaltyPointTransaction[]` from Task 2's type extension; `formatDateTime` (already exported, Task 1-era code).
- Produces: `formatLoyaltySource(source: string): string` — exported helper, humanizes enum values like `MANUAL_ADJUST` into `MANUAL ADJUST`.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `CashTransactionsView.test.tsx`, after the `describe('CashTransactionsView — drawer status, collaborator, and shift', ...)` block added in Task 3:

```ts
describe('CashTransactionsView — Loyalty Points Ledger panel', () => {
  function mockFetchWithDetail(list: CashTransaction[], detail: CashTransaction) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          status: 200,
          ok: true,
          json: async () =>
            url.includes(`/cash-transactions/${detail.id}`)
              ? { statusCode: 200, message: 'ok', data: detail }
              : { statusCode: 200, message: 'ok', data: list, paginationMeta },
        }),
      ),
    );
  }

  const baseDetail: CashTransaction = {
    ...saleTxn,
    collaborator: { id: 5, name: 'Jane Cashier', role: 'cashier' },
    cashShift: null,
  };

  it('renders loyalty point rows with source, description, and signed points', async () => {
    const user = userEvent.setup();
    const detail: CashTransaction = {
      ...baseDetail,
      loyaltyPointTransactions: [
        { id: 1, description: 'Points earned from order', source: 'ORDER', points: 150, loyaltyCustomerId: 3, createdAt: '2026-08-07T08:00:00Z' },
        { id: 2, description: 'Redeemed for reward', source: 'REDEMPTION', points: -50, loyaltyCustomerId: 3, createdAt: '2026-08-07T09:00:00Z' },
      ],
    };
    mockFetchWithDetail([saleTxn], detail);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await user.click(screen.getByRole('button', { name: /view cash transaction 1 details/i }));
    const table = await screen.findByTestId('loyalty-points-table');

    expect(within(table).getByText('Points earned from order')).toBeInTheDocument();
    expect(within(table).getByText('+150')).toBeInTheDocument();
    const earnedCell = within(table).getByText('+150');
    expect(earnedCell.className).toContain('text-green-600');

    expect(within(table).getByText('Redeemed for reward')).toBeInTheDocument();
    expect(within(table).getByText('-50')).toBeInTheDocument();
    const redeemedCell = within(table).getByText('-50');
    expect(redeemedCell.className).toContain('text-[#ae001a]');
  });

  it('humanizes the source enum value', () => {
    expect(formatLoyaltySource('MANUAL_ADJUST')).toBe('MANUAL ADJUST');
    expect(formatLoyaltySource('ORDER')).toBe('ORDER');
  });

  it('shows the exact empty-state copy when there is no loyalty activity', async () => {
    const user = userEvent.setup();
    const detail: CashTransaction = { ...baseDetail, loyaltyPointTransactions: [] };
    mockFetchWithDetail([saleTxn], detail);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await user.click(screen.getByRole('button', { name: /view cash transaction 1 details/i }));
    expect(
      await screen.findByText('No loyalty point activity linked to this transaction.'),
    ).toBeInTheDocument();
  });
});
```

Also add `formatLoyaltySource` to the existing named import at the top of the test file:

```ts
import { CashTransactionsView, formatDateTime, formatTypeLabel, formatLoyaltySource } from './CashTransactionsView';
```

- [ ] **Step 2: Run the test file to see the new tests fail**

Run: `cd "c:\Users\Rafael Cordero\x7-pos-backoffice" && npx vitest run src/components/MerchantFrame/views/restaurant-operations/CashTransactionsView.test.tsx`
Expected: FAIL — `formatLoyaltySource` doesn't exist (import error) and no loyalty table/empty-state is rendered yet.

- [ ] **Step 3: Add `formatLoyaltySource` and the Loyalty Points Ledger section**

In `CashTransactionsView.tsx`, add `formatLoyaltySource` next to the other formatting helpers (right after `formatTypeLabel`):

```ts
export function formatLoyaltySource(source: string): string {
  return source.replace(/_/g, ' ');
}
```

In `CashTransactionDetailDrawer`, add the Loyalty Points Ledger block at the end of the body `<div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">`, right after the "Cashier Shift" block added in Task 3 and before the closing `</div>`:

```tsx
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Loyalty Points Ledger</p>
            {loading ? (
              <div className="h-16 bg-[#ece8e0] rounded animate-pulse mt-2" data-testid="loyalty-section-loading" />
            ) : error ? (
              <p className="text-[#ae001a] text-xs mt-1">{error}</p>
            ) : transaction.loyaltyPointTransactions && transaction.loyaltyPointTransactions.length > 0 ? (
              <table className="w-full mt-2 border-collapse" data-testid="loyalty-points-table">
                <thead>
                  <tr className="border-b border-[#e8e2d8] text-left">
                    <th className="py-1 text-[11px] uppercase text-[#5f5e5e]">Date</th>
                    <th className="py-1 text-[11px] uppercase text-[#5f5e5e]">Source</th>
                    <th className="py-1 text-[11px] uppercase text-[#5f5e5e]">Description</th>
                    <th className="py-1 text-[11px] uppercase text-[#5f5e5e] text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {transaction.loyaltyPointTransactions.map((lpt) => (
                    <tr key={lpt.id} className="border-b border-[#e8e2d8]/60">
                      <td className="py-1.5">{formatDateTime(lpt.createdAt)}</td>
                      <td className="py-1.5">{formatLoyaltySource(lpt.source)}</td>
                      <td className="py-1.5">{lpt.description || '—'}</td>
                      <td
                        className={`py-1.5 text-right font-bold ${
                          lpt.points > 0 ? 'text-green-600' : lpt.points < 0 ? 'text-[#ae001a]' : 'text-[#5f5e5e]'
                        }`}
                      >
                        {lpt.points > 0 ? `+${lpt.points}` : lpt.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-[#5f5e5e] mt-1">No loyalty point activity linked to this transaction.</p>
            )}
          </div>
```

- [ ] **Step 4: Run the full test file and verify everything passes**

Run: `cd "c:\Users\Rafael Cordero\x7-pos-backoffice" && npx vitest run src/components/MerchantFrame/views/restaurant-operations/CashTransactionsView.test.tsx`
Expected: PASS — every test in the file (all four `describe` blocks touching the drawer, plus every pre-existing block).

- [ ] **Step 5: Run the full frontend test suite to check for regressions elsewhere**

Run: `cd "c:\Users\Rafael Cordero\x7-pos-backoffice" && npm run test`
Expected: PASS (no other file imports `CashTransactionDetailModal` or relies on the old dash-only notes fallback — confirmed during planning via a repo-wide grep).

- [ ] **Step 6: Commit**

```bash
cd "c:\Users\Rafael Cordero\x7-pos-backoffice"
git add src/components/MerchantFrame/views/restaurant-operations/CashTransactionsView.tsx src/components/MerchantFrame/views/restaurant-operations/CashTransactionsView.test.tsx
git commit -m "feat(cash-transactions): add Loyalty Points Ledger table to the detail drawer"
```

---

## Post-implementation manual check

After Task 4, start both servers and manually verify the golden path in a browser (per this project's convention for UI changes):

1. Backend: `cd "C:\Users\Rafael Cordero\x7-pos-back-end" && npm run start:dev`
2. Frontend: `cd "c:\Users\Rafael Cordero\x7-pos-backoffice" && npm run dev`, open `http://localhost:5173`, navigate to Cash Management → Cash Transactions.
3. Click a row (not the button) — drawer should open instantly showing base fields, then the Shift/Loyalty sections should populate a moment later.
4. Click the visibility button on a different row — same behavior.
5. Confirm the Status badge, Collaborator name, Notes fallback sentence (on a transaction with no notes), Shift info or "No shift linked", and the Loyalty table or its empty-state sentence.
