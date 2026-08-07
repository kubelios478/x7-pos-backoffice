# Journal Entry Lines CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `JournalEntryLinesView` (currently read-only) into a full CRUD workspace — Create, View Details, Update, and Soft-Delete for individual `JournalEntryLine` records — using form drawers, without any backend changes.

**Architecture:** Add two new drawer components (`JournalEntryLineFormDrawer` for create+edit, `JournalEntryLineDetailDrawer` for read) and one confirmation dialog (`ConfirmDeleteLineDialog`) directly inside `JournalEntryLinesView.tsx`, following the exact `createPortal`-to-`document.body` drawer pattern already used by `LedgerAccountsView.tsx` and `JournalEntriesView.tsx`. Wire them to the real nested backend routes (`/journal-entries/:entryId/lines[...]`), and after every mutation refetch `GET /journal-entry?limit=100` so recalculated totals/`is_balanced` stay accurate (no manual client-side recalculation).

**Tech Stack:** React 19 + TypeScript, Vitest + @testing-library/react + `@testing-library/user-event`, Tailwind v4 utility classes (no component library), `vi.stubGlobal('fetch', ...)` mocking (no MSW).

## Global Constraints

- No backend changes. Use only the real endpoints confirmed in `docs/superpowers/specs/2026-07-28-journal-entry-lines-crud-design.md` §2: `POST/PATCH/DELETE /journal-entries/:entryId/lines[/:id]`.
- Soft-delete uses the real `DELETE` verb (backend sets `is_active=false` internally) — never invent a `PATCH .../journal-entry-lines/{id}` endpoint.
- Leaf-account filtering is computed client-side (no `children` field from the API): an account is a leaf iff no other active account has `parent_account_id` equal to its id.
- Mutual exclusion: entering a value `> 0` in Debit zeroes and disables Credit, and vice versa. Blocked-submit message (verbatim): `"A line item must have either a Debit or Credit amount greater than zero."`
- Non-leaf account guard message (verbatim, defense-in-depth only — the dropdown itself never lists non-leaf accounts): `"Cannot post transactions directly to summary accounts. Please select a detailed leaf account."`
- Create/Edit/Delete of a line is only reachable when the parent `JournalEntry.status === 'DRAFT'` (Posted Parent Immobility Lock). No new client-side balance check is added anywhere (Draft Balance Tolerance — the existing DRAFT→POSTED balance gate in `JournalEntriesView` is untouched).
- Every mutation follows the existing `JournalEntriesView` conventions exactly: 401 → `clearAuthSession()` + redirect `/login`; success → refetch + close + 3s-auto-dismiss toast; create/edit failure → inline `formError` in the drawer (drawer stays open); delete failure → close the confirm dialog + error toast (mirrors `handleConfirmAction` in `JournalEntriesView.tsx:494-543`).
- All new interactive elements need accessible `aria-label`s consistent with the rest of the file (e.g. existing `aria-label="Search posting line items"`).

---

### Task 1: `UpdateJournalEntryLineDto` type + `isLeafAccount` helper

**Files:**
- Modify: `src/types/accounting.ts:61-66`
- Modify: `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.tsx` (add helper near `flattenJournalEntryLines`)
- Test: `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.test.tsx`

**Interfaces:**
- Produces: `UpdateJournalEntryLineDto` (type, from `src/types/accounting.ts`), `isLeafAccount(account: LedgerAccount, accounts: LedgerAccount[]): boolean` (exported from `JournalEntryLinesView.tsx`), used by Tasks 2–6.

- [ ] **Step 1: Add `UpdateJournalEntryLineDto` to `accounting.ts`**

In `src/types/accounting.ts`, right after the `CreateJournalEntryLineDto` interface (ends line 66) and before `export interface CreateJournalEntryDto {`, insert:

```ts
export type UpdateJournalEntryLineDto = Partial<CreateJournalEntryLineDto>;
```

- [ ] **Step 2: Write the failing test for `isLeafAccount`**

In `JournalEntryLinesView.test.tsx`, add this import to the existing import line:

```ts
import { JournalEntryLinesView, flattenJournalEntryLines, isLeafAccount } from './JournalEntryLinesView';
```

Then add a new describe block (place it after the existing `describe('flattenJournalEntryLines', ...)` block):

```ts
describe('isLeafAccount', () => {
  it('returns true when no other account references it as a parent', () => {
    const parent: LedgerAccount = { id: 1, code: '1000', name: 'Assets', type: 'ASSET', is_active: true, parent_account_id: null };
    const leaf: LedgerAccount = { id: 2, code: '1010', name: 'Cash', type: 'ASSET', is_active: true, parent_account_id: 1 };
    expect(isLeafAccount(leaf, [parent, leaf])).toBe(true);
  });

  it('returns false when another account has it as parent_account_id', () => {
    const parent: LedgerAccount = { id: 1, code: '1000', name: 'Assets', type: 'ASSET', is_active: true, parent_account_id: null };
    const leaf: LedgerAccount = { id: 2, code: '1010', name: 'Cash', type: 'ASSET', is_active: true, parent_account_id: 1 };
    expect(isLeafAccount(parent, [parent, leaf])).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- JournalEntryLinesView.test.tsx`
Expected: FAIL — `isLeafAccount` is not exported from `./JournalEntryLinesView`.

- [ ] **Step 4: Implement `isLeafAccount`**

In `JournalEntryLinesView.tsx`, directly below the `flattenJournalEntryLines` function (after line 19), add:

```ts
export function isLeafAccount(account: LedgerAccount, accounts: LedgerAccount[]): boolean {
  return !accounts.some((a) => a.parent_account_id === account.id);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- JournalEntryLinesView.test.tsx`
Expected: PASS (all prior tests still pass, plus the two new `isLeafAccount` tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/accounting.ts src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.tsx src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.test.tsx
git commit -m "feat(financial-engine): add UpdateJournalEntryLineDto and isLeafAccount helper"
```

---

### Task 2: Create Line drawer (unscoped) — form, mutual exclusion, POST wiring

**Files:**
- Modify: `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.tsx`
- Test: `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.test.tsx`

**Interfaces:**
- Consumes: `isLeafAccount` (Task 1), `CreateJournalEntryLineDto`, `JournalEntry`, `LedgerAccount` (types), `getAccessToken`/`clearAuthSession` (existing imports), `API_BASE` (existing const).
- Produces: `JournalEntryLineFormDrawer` component (props below) — reused unmodified by Task 3 (scoped lock) and Task 5 (edit mode). State additions on `JournalEntryLinesView`: `formDrawer`, `formSubmitting`, `formError`. Handler: `handleFormSubmit(entryId: number, dto: CreateJournalEntryLineDto): Promise<void>`.

```ts
interface JournalEntryLineFormDrawerProps {
  mode: 'create' | 'edit';
  lockedEntry?: JournalEntry | null;
  draftEntries: JournalEntry[];
  initialLine?: JournalEntryLine;
  leafAccounts: LedgerAccount[];
  submitting: boolean;
  submitError: string | null;
  onCancel: () => void;
  onSubmit: (entryId: number, dto: CreateJournalEntryLineDto) => void;
}
```

- [ ] **Step 1: Write the failing test for opening the drawer and the DRAFT-only entry combobox**

Add to `JournalEntryLinesView.test.tsx`, in a new `describe('JournalEntryLinesView — create line', ...)` block. First add a DRAFT entry fixture near the top of the file, right after `entryB`:

```ts
const draftEntry: JournalEntry = {
  ...entryA,
  id: 3,
  entry_number: 'JE-2024-0003',
  status: 'DRAFT',
  description: 'Draft adjustment',
  lines: [],
};
```

Then the test block:

```ts
describe('JournalEntryLinesView — create line', () => {
  it('opens the Add Line Item drawer and lists only DRAFT entries in the combobox', async () => {
    mockFetch([entryA, entryB, draftEntry]);
    render(<JournalEntryLinesView />);
    await screen.findByText('3 lines');

    await userEvent.click(screen.getByRole('button', { name: /add line item/i }));

    expect(screen.getByRole('dialog', { name: /add line item/i })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/journal entry/i));

    expect(screen.getByRole('option', { name: 'JE-2024-0003' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'JE-2024-0001' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'JE-2024-0002' })).not.toBeInTheDocument();
  });

  it('lists only leaf accounts in the ledger account combobox', async () => {
    const parentAccount: LedgerAccount = { id: 10, code: '1000', name: 'Current Assets', type: 'ASSET', is_active: true, parent_account_id: null };
    const childAccount: LedgerAccount = { id: 11, code: '1010', name: 'Cash', type: 'ASSET', is_active: true, parent_account_id: 10 };
    mockFetch([draftEntry], [parentAccount, childAccount]);
    render(<JournalEntryLinesView />);
    await screen.findByRole('button', { name: /add line item/i });

    await userEvent.click(screen.getByRole('button', { name: /add line item/i }));
    await userEvent.click(screen.getByLabelText(/ledger account/i));

    expect(screen.getByRole('option', { name: /1010 — Cash/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /1000 — Current Assets/i })).not.toBeInTheDocument();
  });

  it('mutual exclusion: entering a debit value zeroes and disables credit', async () => {
    mockFetch([draftEntry]);
    render(<JournalEntryLinesView />);
    await screen.findByRole('button', { name: /add line item/i });

    await userEvent.click(screen.getByRole('button', { name: /add line item/i }));
    await userEvent.type(screen.getByLabelText(/^debit$/i), '100');

    expect(screen.getByLabelText(/^credit$/i)).toBeDisabled();
    expect(screen.getByLabelText(/^credit$/i)).toHaveValue(0);
  });

  it('blocks submit when both debit and credit are zero', async () => {
    mockFetch([draftEntry]);
    render(<JournalEntryLinesView />);
    await screen.findByRole('button', { name: /add line item/i });

    await userEvent.click(screen.getByRole('button', { name: /add line item/i }));
    await userEvent.click(screen.getByLabelText(/journal entry/i));
    await userEvent.click(screen.getByRole('option', { name: 'JE-2024-0003' }));
    await userEvent.click(screen.getByLabelText(/ledger account/i));
    await userEvent.click((await screen.findAllByRole('option'))[0]);

    expect(screen.getByRole('button', { name: /save line item/i })).toBeDisabled();
  });

  it('submits a POST to the nested endpoint and refetches on success', async () => {
    const cash: LedgerAccount = { id: 1, code: '1000', name: 'Cash', type: 'ASSET', is_active: true, parent_account_id: null };
    let postBody: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/ledger-accounts')) {
          return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: [cash], page: 1, limit: 100, total: 1, totalPages: 1 }) });
        }
        if (url.endsWith('/journal-entries/3/lines') && init?.method === 'POST') {
          postBody = JSON.parse(init.body as string);
          return Promise.resolve({ status: 201, ok: true, json: async () => ({ statusCode: 201, message: 'ok', data: { id: 99, account: cash, debit: 100, credit: 0, description: null } }) });
        }
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: [draftEntry], page: 1, limit: 100, total: 1, totalPages: 1, hasNext: false, hasPrev: false }) });
      }),
    );
    render(<JournalEntryLinesView />);
    await screen.findByRole('button', { name: /add line item/i });

    await userEvent.click(screen.getByRole('button', { name: /add line item/i }));
    await userEvent.click(screen.getByLabelText(/journal entry/i));
    await userEvent.click(screen.getByRole('option', { name: 'JE-2024-0003' }));
    await userEvent.click(screen.getByLabelText(/ledger account/i));
    await userEvent.click(screen.getByRole('option', { name: /1000 — Cash/i }));
    await userEvent.type(screen.getByLabelText(/^debit$/i), '100');
    await userEvent.click(screen.getByRole('button', { name: /save line item/i }));

    await waitFor(() => expect(postBody).toEqual({ account_id: 1, debit: 100, credit: 0 }));
    expect(await screen.findByText(/journal entry line created successfully/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /add line item/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- JournalEntryLinesView.test.tsx`
Expected: FAIL — no "Add Line Item" button exists yet.

- [ ] **Step 3: Implement `JournalEntryLineFormDrawer` and wire it into the view**

In `JournalEntryLinesView.tsx`:

1. Update imports at the top of the file:

```ts
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type { CreateJournalEntryLineDto, JournalEntry, JournalEntryLine, LedgerAccount } from '../../../../types/accounting';
import { formatCurrency, formatEntryDate, STATUS_BADGE_CLASSES } from './JournalEntriesView';
import { LedgerQuickLinks } from './LedgerQuickLinks';
```

2. Directly below the `isLeafAccount` function (Task 1), add the drawer component:

```tsx
interface JournalEntryLineFormDrawerProps {
  mode: 'create' | 'edit';
  lockedEntry?: JournalEntry | null;
  draftEntries: JournalEntry[];
  initialLine?: JournalEntryLine;
  leafAccounts: LedgerAccount[];
  submitting: boolean;
  submitError: string | null;
  onCancel: () => void;
  onSubmit: (entryId: number, dto: CreateJournalEntryLineDto) => void;
}

const JournalEntryLineFormDrawer: React.FC<JournalEntryLineFormDrawerProps> = ({
  mode,
  lockedEntry,
  draftEntries,
  initialLine,
  leafAccounts,
  submitting,
  submitError,
  onCancel,
  onSubmit,
}) => {
  const [entryId, setEntryId] = useState<number | null>(lockedEntry?.id ?? null);
  const [entryQuery, setEntryQuery] = useState('');
  const [entryListOpen, setEntryListOpen] = useState(false);
  const entryBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [accountId, setAccountId] = useState<number | null>(initialLine?.account?.id ?? null);
  const [accountQuery, setAccountQuery] = useState(
    initialLine?.account ? `${initialLine.account.code} — ${initialLine.account.name}` : '',
  );
  const [accountListOpen, setAccountListOpen] = useState(false);
  const accountBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [debit, setDebit] = useState(initialLine && initialLine.debit > 0 ? String(initialLine.debit) : '');
  const [credit, setCredit] = useState(initialLine && initialLine.credit > 0 ? String(initialLine.credit) : '');
  const [description, setDescription] = useState(initialLine?.description ?? '');
  const [touched, setTouched] = useState(false);

  const clearEntryBlur = () => {
    if (entryBlurTimeoutRef.current != null) {
      clearTimeout(entryBlurTimeoutRef.current);
      entryBlurTimeoutRef.current = null;
    }
  };
  const clearAccountBlur = () => {
    if (accountBlurTimeoutRef.current != null) {
      clearTimeout(accountBlurTimeoutRef.current);
      accountBlurTimeoutRef.current = null;
    }
  };

  const filteredEntries = draftEntries.filter((e) => {
    const term = entryQuery.trim().toLowerCase();
    return !term || e.entry_number.toLowerCase().includes(term);
  });

  const filteredAccounts = leafAccounts.filter((a) => {
    const term = accountQuery.trim().toLowerCase();
    return !term || a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term);
  });

  const selectEntry = (entry: JournalEntry) => {
    clearEntryBlur();
    setEntryId(entry.id);
    setEntryQuery(entry.entry_number);
    setEntryListOpen(false);
  };

  const selectAccount = (account: LedgerAccount) => {
    clearAccountBlur();
    setAccountId(account.id);
    setAccountQuery(`${account.code} — ${account.name}`);
    setAccountListOpen(false);
  };

  const handleDebitChange = (value: string) => {
    setDebit(value);
    if ((parseFloat(value) || 0) > 0) setCredit('0');
  };
  const handleCreditChange = (value: string) => {
    setCredit(value);
    if ((parseFloat(value) || 0) > 0) setDebit('0');
  };

  const debitAmount = parseFloat(debit) || 0;
  const creditAmount = parseFloat(credit) || 0;
  const isNonLeafSelected = accountId != null && !leafAccounts.some((a) => a.id === accountId);
  const isMovementValid = debitAmount > 0 || creditAmount > 0;
  const isValid = entryId != null && accountId != null && !isNonLeafSelected && isMovementValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || entryId == null || accountId == null) {
      setTouched(true);
      return;
    }
    onSubmit(entryId, {
      account_id: accountId,
      debit: debitAmount,
      credit: creditAmount,
      ...(description.trim() ? { description: description.trim() } : {}),
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end font-sans">
      <div
        data-testid="drawer-backdrop"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-label={mode === 'create' ? 'Add Line Item' : 'Edit Line Item'}
        className="relative bg-white border-l border-[#e8e2d8] shadow-2xl w-full max-w-md h-full overflow-hidden animate-slide-in text-left flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">
            {mode === 'create' ? 'Add Line Item' : 'Edit Line Item'}
          </span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {submitError && (
              <div className="bg-red-50 border border-red-300 text-red-700 text-sm px-3 py-2 rounded">
                {submitError}
              </div>
            )}
            <div className="flex flex-col gap-1.5 relative">
              <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">Journal Entry</label>
              {lockedEntry ? (
                <p
                  data-testid="line-form-locked-entry"
                  className="px-3 py-2 border border-[#e8e2d8] rounded text-sm bg-[#f2ede5] text-[#1d1c17]"
                >
                  {lockedEntry.entry_number}
                </p>
              ) : (
                <>
                  <input
                    type="text"
                    role="combobox"
                    aria-expanded={entryListOpen}
                    aria-label="Journal entry"
                    autoComplete="off"
                    value={entryQuery}
                    onFocus={() => {
                      clearEntryBlur();
                      setEntryListOpen(true);
                    }}
                    onChange={(e) => {
                      setEntryQuery(e.target.value);
                      setEntryId(null);
                    }}
                    onBlur={() => {
                      entryBlurTimeoutRef.current = setTimeout(() => setEntryListOpen(false), 100);
                    }}
                    placeholder="Search DRAFT journal entries..."
                    className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
                  />
                  {entryListOpen && (
                    <ul
                      role="listbox"
                      aria-label="Journal entry options"
                      className="absolute top-full mt-1 left-0 right-0 bg-white border border-[#e8e2d8] rounded shadow-lg max-h-40 overflow-y-auto z-10"
                    >
                      {filteredEntries.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-[#5f5e5e]">No DRAFT journal entries found</li>
                      ) : (
                        filteredEntries.map((entry) => (
                          <li
                            key={entry.id}
                            role="option"
                            onMouseDown={() => selectEntry(entry)}
                            className="px-3 py-2 text-sm hover:bg-[#f8f3eb] cursor-pointer"
                          >
                            {entry.entry_number}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </>
              )}
              {touched && entryId == null && (
                <p className="text-xs text-red-600 font-medium">A journal entry must be selected.</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 relative">
              <label className="text-[11px] font-bold text-[#5f5e5e] uppercase">Ledger Account</label>
              <input
                type="text"
                role="combobox"
                aria-expanded={accountListOpen}
                aria-label="Ledger account"
                autoComplete="off"
                value={accountQuery}
                onFocus={() => {
                  clearAccountBlur();
                  setAccountListOpen(true);
                }}
                onChange={(e) => {
                  setAccountQuery(e.target.value);
                  setAccountId(null);
                }}
                onBlur={() => {
                  accountBlurTimeoutRef.current = setTimeout(() => setAccountListOpen(false), 100);
                }}
                placeholder="Search leaf accounts..."
                className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              />
              {accountListOpen && (
                <ul
                  role="listbox"
                  aria-label="Account options"
                  className="absolute top-full mt-1 left-0 right-0 bg-white border border-[#e8e2d8] rounded shadow-lg max-h-40 overflow-y-auto z-10"
                >
                  {filteredAccounts.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-[#5f5e5e]">No matching leaf accounts</li>
                  ) : (
                    filteredAccounts.map((a) => (
                      <li
                        key={a.id}
                        role="option"
                        onMouseDown={() => selectAccount(a)}
                        className="px-3 py-2 text-sm hover:bg-[#f8f3eb] cursor-pointer"
                      >
                        {a.code} — {a.name}
                      </li>
                    ))
                  )}
                </ul>
              )}
              {touched && isNonLeafSelected && (
                <p className="text-xs text-red-600 font-medium">
                  Cannot post transactions directly to summary accounts. Please select a detailed leaf account.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="line-form-debit" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Debit
                </label>
                <input
                  id="line-form-debit"
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label="Debit"
                  value={debit}
                  disabled={creditAmount > 0}
                  onChange={(e) => handleDebitChange(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="line-form-credit" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Credit
                </label>
                <input
                  id="line-form-credit"
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label="Credit"
                  value={credit}
                  disabled={debitAmount > 0}
                  onChange={(e) => handleCreditChange(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            {touched && !isMovementValid && (
              <p className="text-xs text-red-600 font-medium">
                A line item must have either a Debit or Credit amount greater than zero.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="line-form-description" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Description
              </label>
              <input
                id="line-form-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              />
            </div>
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
              {submitting ? 'Saving…' : 'Save Line Item'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};
```

3. Inside the `JournalEntryLinesView` component, add new state (near the existing `scopedEntry` state):

```ts
const [formDrawer, setFormDrawer] = useState<
  null | { mode: 'create' } | { mode: 'edit'; item: FlattenedJournalEntryLine }
>(null);
const [formSubmitting, setFormSubmitting] = useState(false);
const [formError, setFormError] = useState<string | null>(null);
const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
```

4. Add the toast auto-dismiss effect (mirrors `JournalEntriesView.tsx:545-549`), near the existing `useEffect` that fetches on mount:

```ts
useEffect(() => {
  if (!toast) return;
  const t = setTimeout(() => setToast(null), 3000);
  return () => clearTimeout(t);
}, [toast]);
```

5. Add derived values (near `flattenedLines`):

```ts
const draftEntries = useMemo(() => entries.filter((e) => e.status === 'DRAFT'), [entries]);
const leafAccounts = useMemo(
  () => ledgerAccounts.filter((a) => isLeafAccount(a, ledgerAccounts)),
  [ledgerAccounts],
);
```

6. Add handlers (near `clearScope`):

```ts
const openCreateDrawer = () => {
  setFormError(null);
  setFormDrawer({ mode: 'create' });
};

const closeFormDrawer = () => {
  setFormDrawer(null);
  setFormError(null);
};

const handleFormSubmit = async (entryId: number, dto: CreateJournalEntryLineDto) => {
  if (!formDrawer) return;
  setFormSubmitting(true);
  setFormError(null);
  try {
    const token = getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const isEdit = formDrawer.mode === 'edit';
    const url = isEdit
      ? `${API_BASE}/journal-entries/${entryId}/lines/${formDrawer.item.line.id}`
      : `${API_BASE}/journal-entries/${entryId}/lines`;

    const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers, body: JSON.stringify(dto) });

    if (res.status === 401) {
      clearAuthSession();
      window.location.href = '/login';
      return;
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || `Failed to ${isEdit ? 'update' : 'create'} journal entry line`);
    }

    await fetchJournalEntries();
    setFormDrawer(null);
    setToast({ message: `Journal entry line ${isEdit ? 'updated' : 'created'} successfully`, type: 'success' });
  } catch (err: any) {
    setFormError(err.message || 'Failed to save journal entry line');
  } finally {
    setFormSubmitting(false);
  }
};
```

7. Add the "Add Line Item" button in the filter toolbar row, right after the "Ledger Account" `<select>` and before the `hasActiveFilter && !isFilteredEmpty` Clear Filters button:

```tsx
<button
  type="button"
  onClick={openCreateDrawer}
  className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
>
  <span className="material-symbols-outlined text-base">add</span>
  Add Line Item
</button>
```

8. Render the drawer at the bottom of the component's JSX, right before the closing `<LedgerQuickLinks ... />` line:

```tsx
{formDrawer && (
  <JournalEntryLineFormDrawer
    mode={formDrawer.mode}
    lockedEntry={formDrawer.mode === 'edit' ? formDrawer.item.entry : null}
    draftEntries={draftEntries}
    initialLine={formDrawer.mode === 'edit' ? formDrawer.item.line : undefined}
    leafAccounts={leafAccounts}
    submitting={formSubmitting}
    submitError={formError}
    onCancel={closeFormDrawer}
    onSubmit={handleFormSubmit}
  />
)}

{toast &&
  createPortal(
    <div
      className={`fixed top-6 right-6 z-[10001] flex items-center gap-3 px-5 py-3.5 shadow-lg text-white text-sm font-medium ${
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
    </div>,
    document.body,
  )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- JournalEntryLinesView.test.tsx`
Expected: PASS — all 5 new tests plus every pre-existing test.

- [ ] **Step 5: Commit**

```bash
git add src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.tsx src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.test.tsx
git commit -m "feat(financial-engine): add Create Line Item drawer with leaf-account filter and mutual exclusion"
```

---

### Task 3: Scoped-entry lock on Create

**Files:**
- Modify: `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.tsx`
- Test: `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.test.tsx`

**Interfaces:**
- Consumes: `JournalEntryLineFormDrawer`'s existing `lockedEntry` prop (Task 2 — no component changes needed, only wiring).

- [ ] **Step 1: Write the failing tests**

Add to `JournalEntryLinesView.test.tsx`, inside (or right after) `describe('JournalEntryLinesView — create line', ...)`:

```ts
it('pre-fills and locks the Journal Entry field when arriving scoped to a DRAFT entry', async () => {
  mockFetch([draftEntry]);
  render(<JournalEntryLinesView entry={draftEntry} />);
  await screen.findByRole('button', { name: /add line item/i });

  await userEvent.click(screen.getByRole('button', { name: /add line item/i }));

  expect(screen.getByTestId('line-form-locked-entry')).toHaveTextContent('JE-2024-0003');
  expect(screen.queryByLabelText(/^journal entry$/i)).not.toBeInTheDocument();
});

it('disables Add Line Item when the scoped entry is not DRAFT', async () => {
  mockFetch([entryA]);
  render(<JournalEntryLinesView entry={entryA} />);
  await screen.findByText('2 lines');

  expect(screen.getByRole('button', { name: /add line item/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- JournalEntryLinesView.test.tsx`
Expected: FAIL — the Create drawer currently always renders the combobox and the button is never disabled.

- [ ] **Step 3: Wire the scoped lock**

In `JournalEntryLinesView.tsx`:

1. Update the `formDrawer` state's `create` variant is unchanged, but the render call from Step 8 of Task 2 needs `lockedEntry` to also cover the scoped-create case. Replace that block's `lockedEntry` line with:

```tsx
lockedEntry={formDrawer.mode === 'edit' ? formDrawer.item.entry : scopedEntry}
```

2. Disable the "Add Line Item" button when scoped to a non-DRAFT entry. Replace the button added in Task 2 Step 7 with:

```tsx
<button
  type="button"
  onClick={openCreateDrawer}
  disabled={scopedEntry != null && scopedEntry.status !== 'DRAFT'}
  title={
    scopedEntry != null && scopedEntry.status !== 'DRAFT'
      ? 'This journal entry is POSTED — line items are locked.'
      : undefined
  }
  className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
>
  <span className="material-symbols-outlined text-base">add</span>
  Add Line Item
</button>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- JournalEntryLinesView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.tsx src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.test.tsx
git commit -m "feat(financial-engine): lock Journal Entry field and Add button when scoped to a non-DRAFT entry"
```

---

### Task 4: Detail Drawer (row click)

**Files:**
- Modify: `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.tsx`
- Test: `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.test.tsx`

**Interfaces:**
- Consumes: `STATUS_BADGE_CLASSES`, `formatCurrency`, `formatEntryDate` (already imported from `JournalEntriesView` in Task 2), `ledgerAccounts` (existing state, for account-type lookup).
- Produces: `JournalEntryLineDetailDrawer` component, `detailItem` state, `accountsById` derived map (reused by Task 5).

```ts
interface JournalEntryLineDetailDrawerProps {
  item: FlattenedJournalEntryLine;
  accountsById: Map<number, LedgerAccount>;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}
```

- [ ] **Step 1: Write the failing tests**

Add to `JournalEntryLinesView.test.tsx`, new `describe` block:

```ts
describe('JournalEntryLinesView — detail drawer', () => {
  it('opens on row click and shows line, account type, and parent entry header', async () => {
    mockFetch([entryA]);
    render(<JournalEntryLinesView />);
    await screen.findByText('2 lines');

    await userEvent.click(screen.getByTestId('journal-entry-line-row-1-1'));

    const dialog = screen.getByRole('dialog', { name: /journal entry line details/i });
    expect(within(dialog).getByText('1000 — Cash')).toBeInTheDocument();
    expect(within(dialog).getByText('ASSET')).toBeInTheDocument();
    expect(within(dialog).getByText('JE-2024-0001')).toBeInTheDocument();
    expect(within(dialog).getByText('POSTED')).toBeInTheDocument();
  });

  it('shows Edit and Delete actions when the parent entry is DRAFT', async () => {
    mockFetch([draftEntryWithLine]);
    render(<JournalEntryLinesView />);
    await screen.findByText('1 lines');

    await userEvent.click(screen.getByTestId(`journal-entry-line-row-3-5`));

    const dialog = screen.getByRole('dialog', { name: /journal entry line details/i });
    expect(within(dialog).getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });

  it('hides actions and shows a locked note when the parent entry is POSTED', async () => {
    mockFetch([entryA]);
    render(<JournalEntryLinesView />);
    await screen.findByText('2 lines');

    await userEvent.click(screen.getByTestId('journal-entry-line-row-1-1'));

    const dialog = screen.getByRole('dialog', { name: /journal entry line details/i });
    expect(within(dialog).queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/this journal entry is posted — line items are locked/i)).toBeInTheDocument();
  });

  it('the parent-entry navigation link inside the row does not also open the detail drawer', async () => {
    const onNavigate = vi.fn();
    mockFetch([entryA]);
    render(<JournalEntryLinesView onNavigate={onNavigate} />);
    await screen.findByText('2 lines');

    await userEvent.click(screen.getByText('JE-2024-0001'));

    expect(onNavigate).toHaveBeenCalledWith('journal-entries');
    expect(screen.queryByRole('dialog', { name: /journal entry line details/i })).not.toBeInTheDocument();
  });
});
```

Add the `draftEntryWithLine` fixture near `draftEntry` (Task 2):

```ts
const draftEntryWithLine: JournalEntry = {
  ...draftEntry,
  id: 3,
  lines: [{ id: 5, account: { id: 1, code: '1000', name: 'Cash' }, debit: 50, credit: 0, description: 'Adjustment' }],
};
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- JournalEntryLinesView.test.tsx`
Expected: FAIL — rows are not clickable and no detail drawer exists.

- [ ] **Step 3: Implement the Detail Drawer and row click wiring**

In `JournalEntryLinesView.tsx`:

1. Add the component, directly below `JournalEntryLineFormDrawer` (Task 2):

```tsx
interface JournalEntryLineDetailDrawerProps {
  item: FlattenedJournalEntryLine;
  accountsById: Map<number, LedgerAccount>;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const JournalEntryLineDetailDrawer: React.FC<JournalEntryLineDetailDrawerProps> = ({
  item,
  accountsById,
  onClose,
  onEdit,
  onDelete,
}) => {
  const { line, entry } = item;
  const accountType = line.account ? accountsById.get(line.account.id)?.type : undefined;
  const isEditable = entry.status === 'DRAFT';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end font-sans">
      <div
        data-testid="drawer-backdrop"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Journal Entry Line Details"
        className="relative bg-white border-l border-[#e8e2d8] shadow-2xl w-full max-w-md h-full overflow-hidden animate-slide-in text-left flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Journal Entry Line Details</span>
          <div className="flex items-center gap-3">
            {isEditable && (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  className="text-white/70 hover:text-white transition-colors text-[11px] font-bold uppercase tracking-widest"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  className="text-white/70 hover:text-red-400 transition-colors text-[11px] font-bold uppercase tracking-widest"
                >
                  Delete
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Ledger Account</p>
            <p className="font-bold text-[#1d1c17]">
              {line.account ? `${line.account.code} — ${line.account.name}` : '—'}
            </p>
            {accountType && <p className="text-xs text-[#5f5e5e]">{accountType}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Debit</p>
              <p>{formatCurrency(line.debit)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Credit</p>
              <p>{formatCurrency(line.credit)}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Description</p>
            <p>{line.description || '—'}</p>
          </div>
          <div className="pt-2 border-t border-[#e8e2d8] space-y-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Parent Journal Entry</p>
              <p className="font-bold text-[#1d1c17]">{entry.entry_number}</p>
              <p className="text-xs text-[#5f5e5e]">{formatEntryDate(entry.entry_date)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Status</p>
              <span
                className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[entry.status]}`}
              >
                {entry.status}
              </span>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Entry Description</p>
              <p>{entry.description || '—'}</p>
            </div>
          </div>
          {!isEditable && (
            <p data-testid="line-locked-note" className="text-xs text-[#5f5e5e] italic pt-2">
              This journal entry is POSTED — line items are locked.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
```

2. Add `detailItem` state and `accountsById`, near the `formDrawer` state added in Task 2:

```ts
const [detailItem, setDetailItem] = useState<FlattenedJournalEntryLine | null>(null);
const accountsById = useMemo(() => new Map(ledgerAccounts.map((a) => [a.id, a])), [ledgerAccounts]);
```

3. Make rows clickable and stop the parent-entry link from bubbling. In the `filteredLines.map((item) => (...))` block, change the `<tr>` and the first `<td>`'s button:

```tsx
<tr
  key={item.key}
  data-testid={`journal-entry-line-row-${item.key}`}
  onClick={() => setDetailItem(item)}
  className="hover:bg-[#f8f3eb] transition-colors cursor-pointer"
>
  <td className="px-6 py-4">
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onNavigate?.('journal-entries');
      }}
      className="text-left hover:underline"
    >
      <span className="font-bold text-[#1d1c17]">{item.entry.entry_number}</span>
      <div className="text-xs text-[#5f5e5e]">{formatEntryDate(item.entry.entry_date)}</div>
    </button>
  </td>
```

(Leave the Ledger Account, Description, Debit, and Credit `<td>`s exactly as they are — only the `<tr>` tag and the first `<td>`'s button gain handlers here.)

4. Render the drawer at the bottom of the component's JSX, right after the `formDrawer &&` block added in Task 2:

```tsx
{detailItem && (
  <JournalEntryLineDetailDrawer
    item={detailItem}
    accountsById={accountsById}
    onClose={() => setDetailItem(null)}
    onEdit={() => {}}
    onDelete={() => {}}
  />
)}
```

(`onEdit`/`onDelete` are wired to real handlers in Tasks 5 and 6 — left as no-ops here so this task's own tests, which only check visibility of the buttons, pass without depending on later tasks.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- JournalEntryLinesView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.tsx src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.test.tsx
git commit -m "feat(financial-engine): add Journal Entry Line detail drawer on row click"
```

---

### Task 5: Edit Drawer (PATCH)

**Files:**
- Modify: `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.tsx`
- Test: `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.test.tsx`

**Interfaces:**
- Consumes: `JournalEntryLineFormDrawer` (Task 2, unmodified — `mode="edit"` + `lockedEntry` + `initialLine` already supported), `handleFormSubmit` (Task 2, already branches on `formDrawer.mode === 'edit'` for the URL/verb).
- Produces: `openEditDrawer(item: FlattenedJournalEntryLine): void`, wired as the Detail Drawer's `onEdit`.

- [ ] **Step 1: Write the failing tests**

Add to `JournalEntryLinesView.test.tsx`, new `describe` block:

```ts
describe('JournalEntryLinesView — edit line', () => {
  it('opens the Edit drawer pre-filled, with Journal Entry shown as a static label', async () => {
    mockFetch([draftEntryWithLine]);
    render(<JournalEntryLinesView />);
    await screen.findByText('1 lines');

    await userEvent.click(screen.getByTestId('journal-entry-line-row-3-5'));
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    expect(screen.getByRole('dialog', { name: /edit line item/i })).toBeInTheDocument();
    expect(screen.getByTestId('line-form-locked-entry')).toHaveTextContent('JE-2024-0003');
    expect(screen.getByLabelText(/^debit$/i)).toHaveValue(50);
    expect(screen.queryByRole('dialog', { name: /journal entry line details/i })).not.toBeInTheDocument();
  });

  it('submits a PATCH to the nested endpoint and refetches on success', async () => {
    const cash: LedgerAccount = { id: 1, code: '1000', name: 'Cash', type: 'ASSET', is_active: true, parent_account_id: null };
    let patchBody: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/ledger-accounts')) {
          return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: [cash], page: 1, limit: 100, total: 1, totalPages: 1 }) });
        }
        if (url.endsWith('/journal-entries/3/lines/5') && init?.method === 'PATCH') {
          patchBody = JSON.parse(init.body as string);
          return Promise.resolve({ status: 201, ok: true, json: async () => ({ statusCode: 201, message: 'ok', data: { id: 5, account: cash, debit: 75, credit: 0, description: 'Adjustment' } }) });
        }
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: [draftEntryWithLine], page: 1, limit: 100, total: 1, totalPages: 1, hasNext: false, hasPrev: false }) });
      }),
    );
    render(<JournalEntryLinesView />);
    await screen.findByText('1 lines');

    await userEvent.click(screen.getByTestId('journal-entry-line-row-3-5'));
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    const debitInput = screen.getByLabelText(/^debit$/i);
    await userEvent.clear(debitInput);
    await userEvent.type(debitInput, '75');
    await userEvent.click(screen.getByRole('button', { name: /save line item/i }));

    await waitFor(() => expect(patchBody).toEqual({ account_id: 1, debit: 75, credit: 0, description: 'Adjustment' }));
    expect(await screen.findByText(/journal entry line updated successfully/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- JournalEntryLinesView.test.tsx`
Expected: FAIL — the Detail Drawer's Edit button is currently a no-op (`onEdit={() => {}}` from Task 4).

- [ ] **Step 3: Wire the Edit action**

In `JournalEntryLinesView.tsx`, add `openEditDrawer` near `openCreateDrawer` (Task 2):

```ts
const openEditDrawer = (item: FlattenedJournalEntryLine) => {
  setFormError(null);
  setFormDrawer({ mode: 'edit', item });
  setDetailItem(null);
};
```

Then update the `JournalEntryLineDetailDrawer` render call from Task 4 to use it:

```tsx
{detailItem && (
  <JournalEntryLineDetailDrawer
    item={detailItem}
    accountsById={accountsById}
    onClose={() => setDetailItem(null)}
    onEdit={() => openEditDrawer(detailItem)}
    onDelete={() => {}}
  />
)}
```

(`onDelete` stays a no-op until Task 6.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- JournalEntryLinesView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.tsx src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.test.tsx
git commit -m "feat(financial-engine): wire Edit Line Item drawer to PATCH endpoint"
```

---

### Task 6: Delete (Soft-Delete) — icon, confirm dialog, DELETE wiring

**Files:**
- Modify: `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.tsx`
- Test: `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.test.tsx`

**Interfaces:**
- Produces: `ConfirmDeleteLineDialog` component, `deleteItem`/`deleteSubmitting` state, `handleConfirmDelete(): Promise<void>`, wired as both the grid row's delete icon and the Detail Drawer's `onDelete`.

- [ ] **Step 1: Write the failing tests**

Add to `JournalEntryLinesView.test.tsx`, new `describe` block:

```ts
describe('JournalEntryLinesView — delete line', () => {
  it('hides the delete icon on rows whose parent entry is not DRAFT', async () => {
    mockFetch([entryA]);
    render(<JournalEntryLinesView />);
    await screen.findByText('2 lines');

    expect(within(screen.getByTestId('journal-entry-line-row-1-1')).queryByLabelText(/delete line/i)).not.toBeInTheDocument();
  });

  it('clicking the row delete icon opens a confirmation modal; cancel makes no request', async () => {
    mockFetch([draftEntryWithLine]);
    render(<JournalEntryLinesView />);
    await screen.findByText('1 lines');
    (fetch as any).mockClear();

    await userEvent.click(within(screen.getByTestId('journal-entry-line-row-3-5')).getByLabelText(/delete line/i));
    expect(screen.getByText(/delete line item/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByText(/delete line item/i)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('confirming issues DELETE to the nested endpoint, refetches, and shows a success toast', async () => {
    let deleteCalled = false;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/ledger-accounts')) {
          return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: [], page: 1, limit: 100, total: 0, totalPages: 1 }) });
        }
        if (url.endsWith('/journal-entries/3/lines/5') && init?.method === 'DELETE') {
          deleteCalled = true;
          return Promise.resolve({ status: 201, ok: true, json: async () => ({ statusCode: 201, message: 'ok', data: {} }) });
        }
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({
            data: deleteCalled ? [{ ...draftEntryWithLine, lines: [] }] : [draftEntryWithLine],
            page: 1,
            limit: 100,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          }),
        });
      }),
    );
    render(<JournalEntryLinesView />);
    await screen.findByText('1 lines');

    await userEvent.click(within(screen.getByTestId('journal-entry-line-row-3-5')).getByLabelText(/delete line/i));
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }));

    expect(await screen.findByText(/journal entry line deleted successfully/i)).toBeInTheDocument();
    expect(deleteCalled).toBe(true);
  });

  it('is also reachable from the Detail Drawer when the parent entry is DRAFT', async () => {
    mockFetch([draftEntryWithLine]);
    render(<JournalEntryLinesView />);
    await screen.findByText('1 lines');

    await userEvent.click(screen.getByTestId('journal-entry-line-row-3-5'));
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(screen.getByText(/delete line item/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- JournalEntryLinesView.test.tsx`
Expected: FAIL — no delete icon, no confirm dialog exists yet.

- [ ] **Step 3: Implement delete**

In `JournalEntryLinesView.tsx`:

1. Add the confirm dialog component, below `JournalEntryLineDetailDrawer` (Task 4):

```tsx
interface ConfirmDeleteLineDialogProps {
  item: FlattenedJournalEntryLine;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDeleteLineDialog: React.FC<ConfirmDeleteLineDialogProps> = ({ item, submitting, onConfirm, onCancel }) => {
  const { line, entry } = item;
  const accountLabel = line.account ? `${line.account.code} — ${line.account.name}` : 'this line';
  const amount = line.debit > 0 ? formatCurrency(line.debit) : formatCurrency(line.credit);
  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md shadow-2xl">
        <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">DELETE LINE ITEM</span>
          <button type="button" onClick={onCancel} disabled={submitting} className="text-white/50 hover:text-white transition-colors disabled:opacity-50">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-5">
          <p className="text-sm text-[#1d1c17] leading-relaxed">
            This will remove the {accountLabel} line ({amount}) from journal entry "{entry.entry_number}". This
            cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-5 py-2 border border-[#e8e2d8] text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={submitting}
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
            >
              {submitting ? 'Deleting…' : 'Confirm Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
```

2. Add state and the handler near `detailItem` (Task 4):

```ts
const [deleteItem, setDeleteItem] = useState<FlattenedJournalEntryLine | null>(null);
const [deleteSubmitting, setDeleteSubmitting] = useState(false);

const handleConfirmDelete = async () => {
  if (!deleteItem) return;
  setDeleteSubmitting(true);
  try {
    const token = getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/journal-entries/${deleteItem.entry.id}/lines/${deleteItem.line.id}`, {
      method: 'DELETE',
      headers,
    });

    if (res.status === 401) {
      clearAuthSession();
      window.location.href = '/login';
      return;
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to delete journal entry line');

    await fetchJournalEntries();
    setDeleteItem(null);
    setDetailItem(null);
    setToast({ message: 'Journal entry line deleted successfully', type: 'success' });
  } catch (err: any) {
    setDeleteItem(null);
    setToast({ message: err.message || 'Failed to delete journal entry line', type: 'error' });
  } finally {
    setDeleteSubmitting(false);
  }
};
```

3. Add a delete icon column to the grid. Add a new `<th>` after the "Credit" header:

```tsx
<th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
  Actions
</th>
```

Update the loading-skeleton row and the filtered-empty row to account for the new 6th column. Replace:

```tsx
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-28" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 ml-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 ml-auto" /></td>
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center">
```

with:

```tsx
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-28" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 ml-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 ml-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-8 mx-auto" /></td>
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center">
```

Then add the delete-icon `<td>` as the last cell of each data row (after the Credit `<td>`, still inside the `filteredLines.map((item) => (...))` row):

```tsx
<td className="px-6 py-4 text-center">
  {item.entry.status === 'DRAFT' && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setDeleteItem(item);
      }}
      aria-label={`Delete line ${item.key}`}
      className="text-[#5f5e5e] hover:text-red-600 transition-colors"
    >
      <span className="material-symbols-outlined text-xl">delete</span>
    </button>
  )}
</td>
```

4. Wire the Detail Drawer's `onDelete` (Task 4/5's no-op) and render the confirm dialog. Update the `JournalEntryLineDetailDrawer` render call:

```tsx
{detailItem && (
  <JournalEntryLineDetailDrawer
    item={detailItem}
    accountsById={accountsById}
    onClose={() => setDetailItem(null)}
    onEdit={() => openEditDrawer(detailItem)}
    onDelete={() => setDeleteItem(detailItem)}
  />
)}

{deleteItem && (
  <ConfirmDeleteLineDialog
    item={deleteItem}
    submitting={deleteSubmitting}
    onConfirm={handleConfirmDelete}
    onCancel={() => setDeleteItem(null)}
  />
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- JournalEntryLinesView.test.tsx`
Expected: PASS — every test in the file, old and new.

- [ ] **Step 5: Run the full test suite and type-check**

Run: `npm test`
Expected: PASS, no regressions in other files (in particular `JournalEntriesView.test.tsx`, since `STATUS_BADGE_CLASSES`/`formatCurrency`/`formatEntryDate` are now also imported by `JournalEntryLinesView.tsx` — those exports are unchanged, only consumed more widely).

Run: `npx tsc --build --noEmit --force`
Expected: no type errors. (Plain `tsc --noEmit` at the repo root is a no-op in this project — see `docs/superpowers/plans` conventions / project memory — always use `--build --noEmit --force`.)

- [ ] **Step 6: Commit**

```bash
git add src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.tsx src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.test.tsx
git commit -m "feat(financial-engine): add soft-delete for journal entry lines with confirmation dialog"
```

---

## Post-Implementation Manual Check

After Task 6, start the dev server (`npm run dev`) and manually verify against a real backend:
1. Create a line on a DRAFT entry end-to-end (combobox → leaf accounts only → mutual exclusion → submit → toast → row appears).
2. Edit that line, confirm the Journal Entry field is locked and PATCH succeeds.
3. Delete it, confirm the DELETE call and the row disappears after refetch.
4. Open a POSTED entry's lines and confirm no delete icon, no Edit/Delete buttons in the Detail Drawer, "Add Line Item" disabled when scoped to it.
5. Confirm creating an unbalanced DRAFT entry's lines succeeds, and that `JournalEntriesView`'s "Post" action still correctly blocks until balanced (regression check on unrelated existing feature).
