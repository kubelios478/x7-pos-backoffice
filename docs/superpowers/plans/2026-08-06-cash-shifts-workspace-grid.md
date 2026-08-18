# Cash Shifts Workspace Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `CashShiftsView.tsx`'s grid into a full audit workspace — financial columns (System Total, Declared Amount, Variance) directly in the table, a Cash Drawer filter, an `AUDITED` status, and copy fixes — per `docs/superpowers/specs/2026-08-06-cash-shifts-workspace-grid-design.md`.

**Architecture:** All frontend work lands in the existing `CashShiftsView.tsx` (one component, already the sole home of the Cash Shifts feature) plus its type file. One backend change adds the `AUDITED` enum value for schema readiness — no service/controller/DTO logic changes anywhere. No new endpoints.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library (frontend); NestJS + TypeORM with `synchronize: true` (backend, enum-only change).

## Global Constraints

- Backend `synchronize: true` is active — adding an enum member needs no migration (same mechanism already used for `DISCREPANCY`).
- `AUDITED` gets no endpoint, controller route, or service branch. It exists in the enum/type and UI only, for display and filtering — this is a deliberate scope boundary, not an oversight.
- Multi-tenant isolation stays exactly as implemented today (`GET /cash-shifts`, `merchantId` resolved server-side from the JWT) — do not add a client-supplied `?merchantId=` query param.
- Keep the existing "Opening Balance" column header text — do not rename it to "Opening Float".
- Empty-state copy must be exactly: `No cashier shift sessions found. Click 'Open Cash Shift' to start a new cashier session.`
- The "no closer yet" badge label must read exactly `Active Shift` (replacing "In Service") everywhere it appears — the grid's Closed-By cell and the Detail Modal's Closed-By row.
- Variance coloring (grid column, Detail Modal, Result Modal — all three, via one shared helper): `difference === 0` → `text-[#1d1c17]` (neutral), `difference > 0` → `text-green-600 font-bold` (surplus), `difference < 0` → `text-[#ae001a] font-bold` (shortage), `difference == null` → `text-[#5f5e5e]`.
- Existing test suite must stay green throughout — run the full `npx vitest run` at the end, not just the file under test.

---

## Task 1: Backend — add the `AUDITED` status enum value

**Files:**
- Modify: `x7-pos-back-end/src/restaurant-operations/cashdrawer/cash-shifts/constants/cash-shift-status.enum.ts`

**Interfaces:**
- Produces: `CashShiftStatus.AUDITED` (backend enum member, string value `'AUDITED'`), consumed by no backend code yet — this task only makes the value legal for the `@Column({ type: 'enum', enum: CashShiftStatus })` on `CashShift.status` (in `entities/cash-shift.entity.ts`, unchanged by this task) so a future write path can use it without a migration.

This is a pure enum-literal addition with no new branching logic anywhere in the service or controller, so there is no new behavior to drive with a failing test. Verification here is "nothing broke," not "new behavior works."

- [ ] **Step 1: Add the enum member**

Current file:
```ts
export enum CashShiftStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  DISCREPANCY = 'DISCREPANCY',
}
```

New file:
```ts
export enum CashShiftStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  DISCREPANCY = 'DISCREPANCY',
  AUDITED = 'AUDITED',
}
```

- [ ] **Step 2: Run the existing Cash Shifts backend test suite to confirm no regression**

Run (from `x7-pos-back-end/`): `npx jest cash-shifts.service.spec.ts`
Expected: PASS, same test count as before this change.

- [ ] **Step 3: Run the backend build to confirm the entity/enum still compile together**

Run (from `x7-pos-back-end/`): `npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/restaurant-operations/cashdrawer/cash-shifts/constants/cash-shift-status.enum.ts
git commit -m "feat(cash-shifts): add AUDITED status enum value"
```
(Run from `x7-pos-back-end/`.)

---

## Task 2: Frontend — shared variance color/format helpers, unify Detail Modal and Result Modal

**Files:**
- Modify: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx`
- Test: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx`

**Interfaces:**
- Consumes: `formatCurrency(n: number): string` (already exported in this file).
- Produces: `varianceColorClass(difference: number | null): string` and `formatVariance(difference: number): string`, both exported — Task 4's new grid Variance column consumes both.

- [ ] **Step 1: Write the failing tests**

Add a new fixture right after `discrepancyShift` in the test file:

```ts
const surplusShift: CashShift = {
  ...closedShift,
  id: 8,
  cashDrawerId: 8,
  systemAmount: 100,
  declaredAmount: 115,
  difference: 15,
  status: 'DISCREPANCY',
};
```

Add two new `it`s inside `describe('CashShiftsView — detail modal', ...)`, after the existing tests:

```ts
  it('colors the Detail Modal variance green for a surplus', async () => {
    mockFetchOnce([surplusShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-8');

    await userEvent.click(screen.getByRole('button', { name: /view cash shift 8 details/i }));
    const dialog = await screen.findByRole('dialog', { name: /cash shift details/i });

    expect(within(dialog).getByText('+$15.00')).toHaveClass('text-green-600');
  });

  it('colors the Detail Modal variance red for a shortage', async () => {
    mockFetchOnce([discrepancyShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-5');

    await userEvent.click(screen.getByRole('button', { name: /view cash shift 5 details/i }));
    const dialog = await screen.findByRole('dialog', { name: /cash shift details/i });

    expect(within(dialog).getByText('-$20.00')).toHaveClass('text-[#ae001a]');
  });
```

Add a new `it` inside `describe('CashShiftsView — Close Shift', ...)`, after the existing "shows a DISCREPANCY result..." test, and also append one assertion line to that existing DISCREPANCY test:

```ts
  it('shows a green surplus variance in the reconciliation result modal', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash shift 1/i }));
    const dialog = await screen.findByRole('dialog', { name: /close cash shift/i });
    await userEvent.type(within(dialog).getByLabelText(/declared amount/i), '115');

    const surplusResponse: CashShift = {
      ...openShift,
      systemAmount: 100,
      declaredAmount: 115,
      difference: 15,
      status: 'DISCREPANCY',
      closedAt: '2026-08-05T16:00:00Z',
      closedByCollaborator: { id: 10, name: 'John Doe', role: 'WAITER' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, options?: { method?: string }) => {
        if (options?.method === 'POST') {
          return { status: 200, ok: true, json: async () => ({ statusCode: 200, message: 'ok', data: surplusResponse }) };
        }
        return { status: 200, ok: true, json: async () => ({ statusCode: 200, message: 'ok', data: [surplusResponse] }) };
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /confirm close/i }));

    const resultDialog = await screen.findByRole('dialog', { name: /shift closed/i });
    expect(within(resultDialog).getByText('+$15.00')).toHaveClass('text-green-600');
  });
```

In the existing `'shows a DISCREPANCY result when the declared amount does not match the system amount'` test, add this line right after the existing `expect(within(resultDialog).getByText('-$20.00')).toBeInTheDocument();`:

```ts
    expect(within(resultDialog).getByText('-$20.00')).toHaveClass('text-[#ae001a]');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: FAIL — the new/amended assertions fail because `varianceColorClass`/`formatVariance` don't exist yet and the modals still render binary orange styling (e.g. `'+$15.00'` isn't found because the Detail Modal doesn't format a positive sign yet).

- [ ] **Step 3: Add the shared helpers**

In `CashShiftsView.tsx`, immediately after the existing `formatDateTime` function:

```ts
export function formatDateTime(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function varianceColorClass(difference: number | null): string {
  if (difference == null) return 'text-[#5f5e5e]';
  if (difference === 0) return 'text-[#1d1c17]';
  return difference > 0 ? 'text-green-600 font-bold' : 'text-[#ae001a] font-bold';
}

export function formatVariance(difference: number): string {
  return difference === 0
    ? formatCurrency(0)
    : `${difference > 0 ? '+' : '-'}${formatCurrency(Math.abs(difference))}`;
}
```

- [ ] **Step 4: Use the helpers in `CashShiftDetailModal`**

Replace this block:
```tsx
          {!isOpenShift && shift.difference != null && (
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Difference</p>
              <p className={shift.difference === 0 ? 'text-[#1d1c17]' : 'font-bold text-orange-700'}>
                {shift.difference === 0
                  ? formatCurrency(0)
                  : `${shift.difference > 0 ? '+' : '-'}${formatCurrency(Math.abs(shift.difference))}`}
              </p>
            </div>
          )}
```

with:
```tsx
          {!isOpenShift && shift.difference != null && (
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Difference</p>
              <p className={varianceColorClass(shift.difference)}>{formatVariance(shift.difference)}</p>
            </div>
          )}
```

- [ ] **Step 5: Use the helpers in `CashShiftResultModal`**

Replace:
```tsx
const CashShiftResultModal: React.FC<CashShiftResultModalProps> = ({ shift, onClose }) => {
  const difference = shift.difference ?? 0;
  const isBalanced = difference === 0;

  return createPortal(
```

with:
```tsx
const CashShiftResultModal: React.FC<CashShiftResultModalProps> = ({ shift, onClose }) => {
  const difference = shift.difference ?? 0;

  return createPortal(
```

Replace:
```tsx
        <div className="mt-4">
          <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Variance</p>
          <p className={isBalanced ? 'text-[#1d1c17]' : 'font-bold text-orange-700'}>
            {isBalanced ? formatCurrency(0) : `${difference > 0 ? '+' : '-'}${formatCurrency(Math.abs(difference))}`}
          </p>
        </div>
```

with:
```tsx
        <div className="mt-4">
          <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Variance</p>
          <p className={varianceColorClass(difference)}>{formatVariance(difference)}</p>
        </div>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: PASS, entire file.

- [ ] **Step 7: Commit**

```bash
git add src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx \
        src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx
git commit -m "feat(cash-shifts): unify variance coloring into a shared 3-color helper"
```

---

## Task 3: Frontend — `AUDITED` status support (type, badge, status filter option)

**Files:**
- Modify: `src/types/cash-shift.ts`
- Modify: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx`
- Test: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx`

**Interfaces:**
- Produces: `CashShiftStatus` now includes `'AUDITED'`; `STATUS_BADGE_CLASSES.AUDITED` (purple badge class string).

- [ ] **Step 1: Write the failing tests**

Add a new fixture after `surplusShift` in the test file:

```ts
const auditedShift: CashShift = {
  ...closedShift,
  id: 9,
  cashDrawerId: 9,
  status: 'AUDITED',
};
```

Add a new `describe` block at the end of the test file:

```ts
describe('CashShiftsView — Audited status', () => {
  it('renders a purple Audited badge for AUDITED shifts', async () => {
    mockFetchOnce([auditedShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-9');

    expect(screen.getAllByText('AUDITED')[0]).toHaveClass('text-purple-700');
  });

  it('offers an Audited option in the status filter', async () => {
    mockFetchOnce([]);
    render(<CashShiftsView />);
    await screen.findByTestId('cash-shifts-empty-state');

    const select = screen.getByLabelText(/filter by status/i);
    expect(within(select).getByRole('option', { name: /audited/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: FAIL — TypeScript rejects `status: 'AUDITED'` (not yet a member of `CashShiftStatus`), and once that's fixed, the badge/option assertions fail because neither exists yet.

- [ ] **Step 3: Add `AUDITED` to the type**

In `src/types/cash-shift.ts`, replace:
```ts
export type CashShiftStatus = 'OPEN' | 'CLOSED' | 'DISCREPANCY';
```
with:
```ts
export type CashShiftStatus = 'OPEN' | 'CLOSED' | 'DISCREPANCY' | 'AUDITED';
```

- [ ] **Step 4: Add the badge class**

In `CashShiftsView.tsx`, replace:
```ts
export const STATUS_BADGE_CLASSES: Record<CashShiftStatus, string> = {
  OPEN: 'bg-green-500/10 text-green-600',
  CLOSED: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  DISCREPANCY: 'bg-orange-500/10 text-orange-700',
};
```
with:
```ts
export const STATUS_BADGE_CLASSES: Record<CashShiftStatus, string> = {
  OPEN: 'bg-green-500/10 text-green-600',
  CLOSED: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  DISCREPANCY: 'bg-orange-500/10 text-orange-700',
  AUDITED: 'bg-purple-500/10 text-purple-700',
};
```

- [ ] **Step 5: Add the filter option**

In the status filter `<select>`, replace:
```tsx
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="DISCREPANCY">Discrepancy</option>
        </select>
```
with:
```tsx
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="DISCREPANCY">Discrepancy</option>
          <option value="AUDITED">Audited</option>
        </select>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: PASS, entire file.

- [ ] **Step 7: Commit**

```bash
git add src/types/cash-shift.ts \
        src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx \
        src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx
git commit -m "feat(cash-shifts): add AUDITED status badge and filter option"
```

---

## Task 4: Frontend — System Total, Declared Amount, and Variance grid columns

**Files:**
- Modify: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx`
- Test: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx`

**Interfaces:**
- Consumes: `varianceColorClass`/`formatVariance` from Task 2.

- [ ] **Step 1: Write the failing tests**

Add two new `it`s inside `describe('CashShiftsView — grid rendering', ...)`, after the existing tests:

```ts
  it('shows System Total, Declared Amount, and Variance columns for a closed reconciliation', async () => {
    mockFetchOnce([discrepancyShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-5');

    const row = screen.getByTestId('cash-shift-row-5');
    expect(within(row).getByText('$120.00')).toBeInTheDocument(); // System Total
    // discrepancyShift's openingBalance (100) and declaredAmount (100) share the
    // same literal value, so "$100.00" legitimately appears twice in this row.
    expect(within(row).getAllByText('$100.00').length).toBe(2);
    expect(within(row).getByText('-$20.00')).toHaveClass('text-[#ae001a]');
  });

  it('hides System Total in the grid while the shift is OPEN, even though the fetched record has a non-null value', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    const row = screen.getByTestId('cash-shift-row-1');
    expect(within(row).queryByText('$250.00')).not.toBeInTheDocument();
    // System Total, Declared Amount, and Variance are all "--" while OPEN.
    expect(within(row).getAllByText('--').length).toBe(3);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: FAIL — the new columns don't exist yet, so the row has no `$120.00`/`-$20.00`/`--` cells to find.

- [ ] **Step 3: Add the header cells**

Replace:
```tsx
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
```
with:
```tsx
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Session ID &amp; Drawer
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Opening Balance
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    System Total
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Declared Amount
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Variance
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
```

- [ ] **Step 4: Update the loading skeleton row**

Replace:
```tsx
                      <tr key={i}>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                      </tr>
```
with:
```tsx
                      <tr key={i}>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                      </tr>
```

- [ ] **Step 5: Update the filtered-empty row's `colSpan`**

Replace:
```tsx
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center">
```
with:
```tsx
                    <tr>
                      <td colSpan={9} className="px-6 py-10 text-center">
```

- [ ] **Step 6: Add the data cells**

Replace:
```tsx
                        <td className="px-6 py-4">{formatCurrency(shift.openingBalance)}</td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-[#1d1c17]">{shift.openedByCollaborator.name}</p>
                          <p className="text-[11px] text-[#5f5e5e] mt-1">{formatDateTime(shift.openedAt)}</p>
                        </td>
```
with:
```tsx
                        <td className="px-6 py-4">{formatCurrency(shift.openingBalance)}</td>
                        <td className="px-6 py-4">
                          {shift.status === 'OPEN'
                            ? '--'
                            : shift.systemAmount == null
                              ? '--'
                              : formatCurrency(shift.systemAmount)}
                        </td>
                        <td className="px-6 py-4">
                          {shift.declaredAmount == null ? '--' : formatCurrency(shift.declaredAmount)}
                        </td>
                        <td className={`px-6 py-4 ${varianceColorClass(shift.difference)}`}>
                          {shift.difference == null ? '--' : formatVariance(shift.difference)}
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-[#1d1c17]">{shift.openedByCollaborator.name}</p>
                          <p className="text-[11px] text-[#5f5e5e] mt-1">{formatDateTime(shift.openedAt)}</p>
                        </td>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: PASS, entire file.

- [ ] **Step 8: Commit**

```bash
git add src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx \
        src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx
git commit -m "feat(cash-shifts): add System Total, Declared Amount, and Variance columns to the grid"
```

---

## Task 5: Frontend — Cash Drawer filter

**Files:**
- Modify: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx`
- Test: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx`

**Interfaces:**
- Consumes: `shifts: CashShift[]` state (already in the component).
- Produces: `drawerFilter` state, used only inside this component.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the end of the test file:

```ts
describe('CashShiftsView — Cash Drawer filter', () => {
  it('lists only the drawer IDs present in the fetched shifts', async () => {
    mockFetchOnce([openShift, closedShift]); // drawers #3 and #4
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    const select = screen.getByLabelText(/filter by cash drawer/i);
    expect(within(select).getByRole('option', { name: '#CD-3' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: '#CD-4' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: '#CD-6' })).not.toBeInTheDocument();
  });

  it('filters the grid to only the selected drawer', async () => {
    mockFetchOnce([openShift, closedShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.selectOptions(screen.getByLabelText(/filter by cash drawer/i), '4');

    expect(screen.queryByText('#CS-1')).not.toBeInTheDocument();
    expect(screen.getByText('#CS-2')).toBeInTheDocument();
  });

  it('clears the drawer filter along with the other filters', async () => {
    mockFetchOnce([openShift, closedShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.selectOptions(screen.getByLabelText(/filter by cash drawer/i), '4');
    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(screen.getByLabelText(/filter by cash drawer/i)).toHaveValue('');
    expect(screen.getByText('#CS-1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: FAIL — `getByLabelText(/filter by cash drawer/i)` finds nothing, the select doesn't exist yet.

- [ ] **Step 3: Add `drawerFilter` state and derived options**

Immediately after the `const [statusFilter, setStatusFilter] = useState<'' | CashShiftStatus>('');` line, add:

```ts
  const [drawerFilter, setDrawerFilter] = useState<'' | number>('');
```

Immediately before the `const filteredShifts = React.useMemo(...)` block, add:

```ts
  const drawerOptions = React.useMemo(
    () => Array.from(new Set(shifts.map((s) => s.cashDrawerId))).sort((a, b) => a - b),
    [shifts],
  );
```

- [ ] **Step 4: Wire the filter into `filteredShifts` and `hasActiveFilter`**

Replace:
```ts
  const filteredShifts = React.useMemo(() => {
    return shifts.filter((shift) => {
      if (statusFilter && shift.status !== statusFilter) return false;
      const term = searchQuery.trim().toLowerCase();
```
with:
```ts
  const filteredShifts = React.useMemo(() => {
    return shifts.filter((shift) => {
      if (statusFilter && shift.status !== statusFilter) return false;
      if (drawerFilter !== '' && shift.cashDrawerId !== drawerFilter) return false;
      const term = searchQuery.trim().toLowerCase();
```

Replace:
```ts
  }, [shifts, searchQuery, statusFilter]);

  const hasActiveFilter = Boolean(searchQuery || statusFilter);
```
with:
```ts
  }, [shifts, searchQuery, statusFilter, drawerFilter]);

  const hasActiveFilter = Boolean(searchQuery || statusFilter || drawerFilter !== '');
```

- [ ] **Step 5: Reset the drawer filter in `clearFilters`**

Replace:
```ts
  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
  };
```
with:
```ts
  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setDrawerFilter('');
  };
```

- [ ] **Step 6: Add the dropdown to the toolbar**

Replace:
```tsx
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="DISCREPANCY">Discrepancy</option>
          <option value="AUDITED">Audited</option>
        </select>
        {hasActiveFilter && (
```
with:
```tsx
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="DISCREPANCY">Discrepancy</option>
          <option value="AUDITED">Audited</option>
        </select>
        <select
          value={drawerFilter}
          onChange={(e) => setDrawerFilter(e.target.value === '' ? '' : Number(e.target.value))}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by cash drawer"
        >
          <option value="">All Drawers</option>
          {drawerOptions.map((id) => (
            <option key={id} value={id}>
              #CD-{id}
            </option>
          ))}
        </select>
        {hasActiveFilter && (
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: PASS, entire file.

- [ ] **Step 8: Commit**

```bash
git add src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx \
        src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx
git commit -m "feat(cash-shifts): add Cash Drawer filter to the workspace grid"
```

---

## Task 6: Frontend — copy fixes (empty state, "Active Shift" label)

**Files:**
- Modify: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx`
- Test: `src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx`

- [ ] **Step 1: Update the existing test that asserts the old "In Service" text, and add a new empty-state copy test**

In `describe('CashShiftsView — grid rendering', ...)`, in the `'renders session id, drawer badge, balances, staff, and status for each row'` test, replace:
```ts
    expect(screen.getByText('In Service')).toBeInTheDocument();
```
with:
```ts
    expect(screen.getByText('Active Shift')).toBeInTheDocument();
```

In `describe('CashShiftsView — data fetch', ...)`, add a new `it` after `'shows the empty state when there are no sessions'`:

```ts
  it('shows the exact cashier-facing empty state copy', async () => {
    mockFetchOnce([]);
    render(<CashShiftsView />);
    expect(
      await screen.findByText(
        "No cashier shift sessions found. Click 'Open Cash Shift' to start a new cashier session.",
      ),
    ).toBeInTheDocument();
  });
```

Add a new `it` in `describe('CashShiftsView — detail modal', ...)`:

```ts
  it('shows "Active Shift" in the Detail Modal Closed By row for an open shift', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /view cash shift 1 details/i }));
    const dialog = await screen.findByRole('dialog', { name: /cash shift details/i });

    expect(within(dialog).getByText('Active Shift')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: FAIL — the component still renders "In Service" and the old empty-state copy.

- [ ] **Step 3: Update the empty-state copy**

Replace:
```tsx
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No cash shift sessions found. Click &apos;Open Cash Shift&apos; to start a new session.
          </p>
```
with:
```tsx
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No cashier shift sessions found. Click &apos;Open Cash Shift&apos; to start a new cashier session.
          </p>
```

- [ ] **Step 4: Rename the grid's "In Service" badge**

Replace:
```tsx
                            <span className="bg-blue-500/10 text-blue-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              In Service
                            </span>
```
with:
```tsx
                            <span className="bg-blue-500/10 text-blue-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              Active Shift
                            </span>
```

- [ ] **Step 5: Rename the Detail Modal's "In Service" text**

Replace:
```tsx
                : 'In Service'}
```
with:
```tsx
                : 'Active Shift'}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run CashShiftsView.test.tsx`
Expected: PASS, entire file.

- [ ] **Step 7: Run the full frontend test suite and the type check**

Run: `npx vitest run` — confirm no regressions elsewhere.
Run: `npx tsc --build --noEmit --force` — confirm zero errors (this repo's root `tsc --noEmit` is a no-op; the `--build --force` form is required to actually typecheck, per project convention).

- [ ] **Step 8: Commit**

```bash
git add src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.tsx \
        src/components/MerchantFrame/views/restaurant-operations/CashShiftsView.test.tsx
git commit -m "fix(cash-shifts): match story copy for empty state and active-shift label"
```

---

## Self-Review Notes

- **Spec coverage:** Financial columns (System Total/Declared Amount/Variance) in the grid → Task 4. Blind System Total while OPEN → Task 4 Step 6, directly asserted in Step 1's "hides System Total... even though the fetched record has a non-null value" test. Cash Drawer filter → Task 5. `AUDITED` status (enum, badge, filter option) → Task 1 (backend) + Task 3 (frontend). Unified 3-color variance scheme across grid/Detail Modal/Result Modal → Task 2 (helpers + modal unification) and Task 4 (grid column consumes the same helpers). Empty-state copy and "Active Shift" label → Task 6. "Opening Balance" header kept as-is → no task renames it (explicit Global Constraint). Multi-tenant isolation mechanism kept as-is → no task touches `fetchCashShifts`'s URL construction.
- **Placeholder scan:** no TBD/TODO; every step ships real code or a real verification command.
- **Type consistency:** `varianceColorClass(difference: number | null): string` and `formatVariance(difference: number): string` (Task 2) are called with matching signatures in Task 4's grid cell (`shift.difference` is `number | null`, guarded before calling `formatVariance` with a plain `number`). `CashShiftStatus` gains `'AUDITED'` in Task 3 and `STATUS_BADGE_CLASSES` is a `Record<CashShiftStatus, string>`, so the `AUDITED` key addition in the same task keeps the type satisfied — no dangling union member without a badge class.
- **Task boundary check:** Each task's `npx vitest run CashShiftsView.test.tsx` step is green before the next task starts. Task 6 additionally runs the full suite (`npx vitest run`) and the real type check (`tsc --build --noEmit --force`) as the final gate, per this repo's own documented gotcha that a bare `tsc --noEmit` is a no-op.
