# Journal Entries Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Journal Entries workspace inside the MerchantFrame shell (`financial-engine` area) that lists, filters, creates, edits, and manages the lifecycle (Post/Void/Delete) of `JournalEntry` records against the real backend at `/api/journal-entry`.

**Architecture:** Mirrors the existing Ledger Accounts feature exactly: a single top-level view component (`JournalEntriesView`) owns fetch/state/filters/grid, a reusable line-builder component (`JournalEntryLinesEditor`) handles the debit/credit rows shared by create and edit, and a small shared nav component (`LedgerQuickLinks`) is generalized to support both views' active-anchor highlighting.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4, Vitest + Testing Library + `@testing-library/user-event`.

## Global Constraints

- Backend contract is `/api/journal-entry` (global prefix `/api`, controller path `journal-entry`), **not** the ticket's literal `/api/v1/accounting/journal-entries?companyId={id}` — merchant scoping is automatic via JWT, no `companyId` param.
- `JournalEntryStatus`: `DRAFT | POSTED | VOIDED`. `JournalEntryReferenceType`: `ORDER | PAYMENT | PAYROLL | TAX | INVENTORY | ADJUSTMENT | MANUAL`.
- True-empty state copy is exact: `No journal entries recorded for this company profile. Click 'New Journal Entry' to create a manual accounting record.`
- Edit/Delete/Post are only reachable when `status === 'DRAFT'`; Void only when `status === 'POSTED'`. These are backend-enforced rules the UI must mirror (hide/disable, don't just rely on the 400 response).
- `is_balanced`, `total_debit`, `total_credit` are computed server-side and must be trusted as returned — the frontend never recomputes them for a saved entry (only for in-progress line drafts in the editor).
- Currency formatting: `$1,500.00` style (`toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`, prefixed with `$`).
- Follow the exact auth/fetch conventions already used by `LedgerAccountsView.tsx`: `getAccessToken()` / `clearAuthSession()` from `../../../../lib/auth-storage`, `Authorization: Bearer` header, `401` → `clearAuthSession()` + `window.location.href = '/login'`, error message from `json.message`.
- Test runner: `npx vitest run <path>` (see `package.json` → `"test": "vitest run"`).
- Type-check with `npx tsc --build --noEmit --force` (plain `tsc --noEmit` at repo root is a no-op in this project).

---

### Task 1: Journal Entry types

**Files:**
- Modify: `src/types/accounting.ts`

**Interfaces:**
- Produces: `JournalEntryStatus`, `JournalEntryReferenceType`, `JournalEntryLine`, `JournalEntry`, `CreateJournalEntryLineDto`, `CreateJournalEntryDto`, `UpdateJournalEntryDto` — used by every later task.

- [ ] **Step 1: Append the new types to `src/types/accounting.ts`**

Add at the end of the file (after the existing `UpdateLedgerAccountDto` export):

```ts
export type JournalEntryStatus = 'DRAFT' | 'POSTED' | 'VOIDED';

export type JournalEntryReferenceType =
  | 'ORDER'
  | 'PAYMENT'
  | 'PAYROLL'
  | 'TAX'
  | 'INVENTORY'
  | 'ADJUSTMENT'
  | 'MANUAL';

export interface JournalEntryLine {
  id: number;
  account: { id: number; code: string; name: string } | null;
  debit: number;
  credit: number;
  description: string | null;
}

export interface JournalEntry {
  id: number;
  entry_number: string;
  entry_date: string;
  description: string | null;
  status: JournalEntryStatus;
  total_debit: number;
  total_credit: number;
  is_balanced: boolean;
  reference_type: JournalEntryReferenceType | null;
  reference_id: number | null;
  created_at: string;
  updated_at: string;
  company: { id: number; name: string } | null;
  lines: JournalEntryLine[];
}

export interface CreateJournalEntryLineDto {
  account_id: number;
  debit: number;
  credit: number;
  description?: string;
}

export interface CreateJournalEntryDto {
  entry_number: string;
  entry_date: string;
  description?: string;
  status?: JournalEntryStatus;
  reference_type?: JournalEntryReferenceType;
  reference_id?: number;
  lines: CreateJournalEntryLineDto[];
}

export type UpdateJournalEntryDto = Partial<CreateJournalEntryDto>;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --build --noEmit --force`
Expected: no errors (this is a pure additive type change; nothing consumes these types yet).

- [ ] **Step 3: Commit**

```bash
git add src/types/accounting.ts
git commit -m "feat(accounting): add JournalEntry types"
```

---

### Task 2: Generalize `LedgerQuickLinks` with a `current` prop

**Files:**
- Modify: `src/components/MerchantFrame/views/financial-engine/LedgerQuickLinks.tsx`
- Test (regression only, no new file): `src/components/MerchantFrame/views/financial-engine/LedgerAccountsView.test.tsx`

**Interfaces:**
- Produces: `LedgerQuickLinks` now accepts `current?: string` (default `'chart-of-accounts'`); the anchor whose `target` equals `current` renders as the active, non-clickable anchor. Existing callers that don't pass `current` see identical behavior to today.

- [ ] **Step 1: Confirm the baseline passes before changing anything**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine/LedgerAccountsView.test.tsx`
Expected: PASS (all existing tests, including the two "quick links bar" tests that assert `CHART OF ACCOUNTS` is the active anchor).

- [ ] **Step 2: Replace the hardcoded `active` flag with a computed `current` prop**

Replace the full contents of `src/components/MerchantFrame/views/financial-engine/LedgerQuickLinks.tsx` with:

```tsx
import React from 'react';

interface LedgerQuickLinksProps {
  current?: string;
  onNavigate?: (view: string) => void;
}

interface LedgerQuickLinkAnchor {
  key: string;
  label: string;
  icon: string;
  target: string;
}

const LEDGER_QUICK_LINKS: LedgerQuickLinkAnchor[] = [
  { key: 'chart-of-accounts', label: 'CHART OF ACCOUNTS', icon: 'account_balance', target: 'ledger-accounts' },
  { key: 'journal-entries', label: 'JOURNAL ENTRIES', icon: 'menu_book', target: 'journal-entries' },
  { key: 'journal-line-items', label: 'JOURNAL LINE ITEMS', icon: 'receipt', target: 'journal-entries-lines' },
  { key: 'tax-rules', label: 'TAX RULES CONFIGURATION', icon: 'percent', target: 'merchant-tax-rules' },
];

export const LedgerQuickLinks: React.FC<LedgerQuickLinksProps> = ({
  current = 'chart-of-accounts',
  onNavigate,
}) => {
  return (
    <nav
      aria-label="Related accounting shortcuts"
      className="bg-white border border-[#e8e2d8] rounded shadow-sm px-6 py-4 flex flex-wrap items-center gap-6"
    >
      {LEDGER_QUICK_LINKS.map((anchor) => {
        const isActive = anchor.target === current;
        if (isActive) {
          return (
            <span
              key={anchor.key}
              aria-current="page"
              className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-primary underline underline-offset-4"
            >
              <span className="material-symbols-outlined text-base">{anchor.icon}</span>
              {anchor.label}
            </span>
          );
        }
        return (
          <button
            key={anchor.key}
            type="button"
            onClick={() => onNavigate?.(anchor.target)}
            className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-primary transition-colors duration-200"
          >
            <span className="material-symbols-outlined text-base">{anchor.icon}</span>
            {anchor.label}
          </button>
        );
      })}
    </nav>
  );
};

export default LedgerQuickLinks;
```

Note: `LedgerAccountsView.tsx` renders `<LedgerQuickLinks onNavigate={onNavigate} />` with no `current` prop, so it keeps defaulting to `'chart-of-accounts'` — no change needed there.

- [ ] **Step 3: Re-run the regression suite**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine/LedgerAccountsView.test.tsx`
Expected: PASS, unchanged from Step 1.

- [ ] **Step 4: Commit**

```bash
git add src/components/MerchantFrame/views/financial-engine/LedgerQuickLinks.tsx
git commit -m "refactor(financial-engine): parameterize LedgerQuickLinks active anchor"
```

---

### Task 3: `JournalEntryLinesEditor` — reusable debit/credit line builder

**Files:**
- Create: `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesEditor.tsx`
- Test: `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesEditor.test.tsx`

**Interfaces:**
- Consumes: `LedgerAccount` from `src/types/accounting.ts` (Task 1's file, unchanged type).
- Produces: `JournalEntryLineDraft` type, `createEmptyLine()`, `computeLineTotals(lines)`, `toCreateLineDtos(lines)`, `linesAreValidAndBalanced(lines)`, and the `JournalEntryLinesEditor` component (`props: { accounts: LedgerAccount[]; lines: JournalEntryLineDraft[]; onChange: (lines: JournalEntryLineDraft[]) => void }`) — all consumed by Task 5's `JournalEntryFormDrawer`.

- [ ] **Step 1: Write the failing test file**

Create `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesEditor.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  JournalEntryLinesEditor,
  createEmptyLine,
  computeLineTotals,
  toCreateLineDtos,
  linesAreValidAndBalanced,
  type JournalEntryLineDraft,
} from './JournalEntryLinesEditor';
import type { LedgerAccount } from '../../../../types/accounting';

afterEach(() => {
  cleanup();
});

const cashAccount: LedgerAccount = {
  id: 1,
  code: '1000',
  name: 'Cash',
  type: 'ASSET',
  is_active: true,
  parent_account_id: null,
};

const revenueAccount: LedgerAccount = {
  id: 2,
  code: '4000',
  name: 'Sales Revenue',
  type: 'REVENUE',
  is_active: true,
  parent_account_id: null,
};

describe('computeLineTotals', () => {
  it('sums debit and credit across lines and reports balance', () => {
    const lines: JournalEntryLineDraft[] = [
      { key: '1', account_id: 1, accountQuery: '', debit: '100', credit: '', description: '' },
      { key: '2', account_id: 2, accountQuery: '', debit: '', credit: '100', description: '' },
    ];
    expect(computeLineTotals(lines)).toEqual({ totalDebit: 100, totalCredit: 100, isBalanced: true });
  });

  it('reports unbalanced when totals differ', () => {
    const lines: JournalEntryLineDraft[] = [
      { key: '1', account_id: 1, accountQuery: '', debit: '150', credit: '', description: '' },
      { key: '2', account_id: 2, accountQuery: '', debit: '', credit: '100', description: '' },
    ];
    expect(computeLineTotals(lines).isBalanced).toBe(false);
  });
});

describe('toCreateLineDtos', () => {
  it('drops rows without an account or without a positive amount', () => {
    const lines: JournalEntryLineDraft[] = [
      { key: '1', account_id: 1, accountQuery: '', debit: '100', credit: '', description: 'Cash in' },
      { key: '2', account_id: null, accountQuery: '', debit: '50', credit: '', description: '' },
      { key: '3', account_id: 2, accountQuery: '', debit: '', credit: '0', description: '' },
    ];
    expect(toCreateLineDtos(lines)).toEqual([
      { account_id: 1, debit: 100, credit: 0, description: 'Cash in' },
    ]);
  });
});

describe('linesAreValidAndBalanced', () => {
  it('is false with no valid lines', () => {
    expect(linesAreValidAndBalanced([createEmptyLine()])).toBe(false);
  });

  it('is true with balanced, complete lines', () => {
    const lines: JournalEntryLineDraft[] = [
      { key: '1', account_id: 1, accountQuery: '', debit: '100', credit: '', description: '' },
      { key: '2', account_id: 2, accountQuery: '', debit: '', credit: '100', description: '' },
    ];
    expect(linesAreValidAndBalanced(lines)).toBe(true);
  });
});

describe('JournalEntryLinesEditor', () => {
  it('renders one account combobox per line and a totals bar', () => {
    const lines = [createEmptyLine(), createEmptyLine()];
    render(<JournalEntryLinesEditor accounts={[cashAccount, revenueAccount]} lines={lines} onChange={() => {}} />);
    expect(screen.getAllByLabelText('Ledger account')).toHaveLength(2);
    expect(screen.getByText(/Total Debit:/)).toBeInTheDocument();
    expect(screen.getByText(/Total Credit:/)).toBeInTheDocument();
  });

  it('adds a new empty line when Add Line is clicked', async () => {
    const lines = [createEmptyLine()];
    const onChange = vi.fn();
    render(<JournalEntryLinesEditor accounts={[cashAccount]} lines={lines} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /add line/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const nextLines = onChange.mock.calls[0][0] as JournalEntryLineDraft[];
    expect(nextLines).toHaveLength(2);
    expect(nextLines[0]).toEqual(lines[0]);
  });

  it('removes a line when its remove button is clicked', async () => {
    const lines = [createEmptyLine(), createEmptyLine()];
    const onChange = vi.fn();
    render(<JournalEntryLinesEditor accounts={[cashAccount]} lines={lines} onChange={onChange} />);

    const removeButtons = screen.getAllByRole('button', { name: /remove line/i });
    await userEvent.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledWith([lines[1]]);
  });

  it('filters the account combobox by code or name and selects on click', async () => {
    const lines = [createEmptyLine()];
    const onChange = vi.fn();
    render(<JournalEntryLinesEditor accounts={[cashAccount, revenueAccount]} lines={lines} onChange={onChange} />);

    const input = screen.getByLabelText('Ledger account');
    await userEvent.click(input);
    await userEvent.type(input, 'Sales');

    const option = await screen.findByRole('option', { name: '4000 — Sales Revenue' });
    await userEvent.click(option);

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ account_id: 2, accountQuery: '4000 — Sales Revenue' }),
    ]);
  });

  it('shows an Unbalanced badge when debit and credit differ', () => {
    const lines: JournalEntryLineDraft[] = [
      { key: '1', account_id: 1, accountQuery: '1000 — Cash', debit: '100', credit: '', description: '' },
    ];
    render(<JournalEntryLinesEditor accounts={[cashAccount]} lines={lines} onChange={() => {}} />);
    expect(screen.getByText('Unbalanced')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine/JournalEntryLinesEditor.test.tsx`
Expected: FAIL — `Cannot find module './JournalEntryLinesEditor'`.

- [ ] **Step 3: Implement `JournalEntryLinesEditor.tsx`**

Create `src/components/MerchantFrame/views/financial-engine/JournalEntryLinesEditor.tsx`:

```tsx
import React, { useRef, useState } from 'react';
import type { CreateJournalEntryLineDto, LedgerAccount } from '../../../../types/accounting';

export interface JournalEntryLineDraft {
  key: string;
  account_id: number | null;
  accountQuery: string;
  debit: string;
  credit: string;
  description: string;
}

let lineKeySeq = 0;
export function createEmptyLine(): JournalEntryLineDraft {
  lineKeySeq += 1;
  return {
    key: `line-${lineKeySeq}`,
    account_id: null,
    accountQuery: '',
    debit: '',
    credit: '',
    description: '',
  };
}

export function computeLineTotals(lines: JournalEntryLineDraft[]): {
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
} {
  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  return { totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.001 };
}

export function toCreateLineDtos(lines: JournalEntryLineDraft[]): CreateJournalEntryLineDto[] {
  return lines
    .filter((l) => l.account_id != null && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0))
    .map((l) => ({
      account_id: l.account_id as number,
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
      ...(l.description.trim() ? { description: l.description.trim() } : {}),
    }));
}

export function linesAreValidAndBalanced(lines: JournalEntryLineDraft[]): boolean {
  const dtos = toCreateLineDtos(lines);
  if (dtos.length === 0) return false;
  const totalDebit = dtos.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = dtos.reduce((sum, l) => sum + l.credit, 0);
  return totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.001;
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface JournalEntryLinesEditorProps {
  accounts: LedgerAccount[];
  lines: JournalEntryLineDraft[];
  onChange: (lines: JournalEntryLineDraft[]) => void;
}

export const JournalEntryLinesEditor: React.FC<JournalEntryLinesEditorProps> = ({
  accounts,
  lines,
  onChange,
}) => {
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBlurTimeout = () => {
    if (blurTimeoutRef.current != null) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  };

  const updateLine = (key: string, patch: Partial<JournalEntryLineDraft>) => {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    onChange(lines.filter((l) => l.key !== key));
  };

  const addLine = () => {
    onChange([...lines, createEmptyLine()]);
  };

  const selectAccount = (key: string, account: LedgerAccount) => {
    clearBlurTimeout();
    updateLine(key, { account_id: account.id, accountQuery: `${account.code} — ${account.name}` });
    setOpenRowKey(null);
  };

  const { totalDebit, totalCredit, isBalanced } = computeLineTotals(lines);

  return (
    <div className="flex flex-col gap-3" data-testid="journal-entry-lines-editor">
      {lines.map((line) => {
        const term = line.accountQuery.trim().toLowerCase();
        const filteredAccounts = accounts.filter(
          (a) => !term || a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term),
        );
        return (
          <div
            key={line.key}
            className="grid grid-cols-12 gap-2 items-start border border-[#e8e2d8] p-3 rounded relative"
          >
            <div className="col-span-5 relative">
              <input
                type="text"
                role="combobox"
                aria-expanded={openRowKey === line.key}
                aria-label="Ledger account"
                autoComplete="off"
                value={line.accountQuery}
                onFocus={() => {
                  clearBlurTimeout();
                  setOpenRowKey(line.key);
                }}
                onChange={(e) => updateLine(line.key, { accountQuery: e.target.value, account_id: null })}
                onBlur={() => {
                  blurTimeoutRef.current = setTimeout(() => setOpenRowKey(null), 100);
                }}
                placeholder="Search account..."
                className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              />
              {openRowKey === line.key && (
                <ul
                  role="listbox"
                  aria-label="Account options"
                  className="absolute top-full mt-1 left-0 right-0 bg-white border border-[#e8e2d8] rounded shadow-lg max-h-40 overflow-y-auto z-10"
                >
                  {filteredAccounts.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-[#5f5e5e]">No matching accounts</li>
                  ) : (
                    filteredAccounts.map((a) => (
                      <li
                        key={a.id}
                        role="option"
                        onMouseDown={() => selectAccount(line.key, a)}
                        className="px-3 py-2 text-sm hover:bg-[#f8f3eb] cursor-pointer"
                      >
                        {a.code} — {a.name}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
            <div className="col-span-2">
              <input
                type="number"
                min="0"
                step="0.01"
                aria-label="Debit"
                value={line.debit}
                onChange={(e) => updateLine(line.key, { debit: e.target.value })}
                className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              />
            </div>
            <div className="col-span-2">
              <input
                type="number"
                min="0"
                step="0.01"
                aria-label="Credit"
                value={line.credit}
                onChange={(e) => updateLine(line.key, { credit: e.target.value })}
                className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              />
            </div>
            <div className="col-span-2">
              <input
                type="text"
                aria-label="Line description"
                value={line.description}
                onChange={(e) => updateLine(line.key, { description: e.target.value })}
                placeholder="Description"
                className="w-full px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              />
            </div>
            <div className="col-span-1 flex justify-center pt-2">
              <button
                type="button"
                onClick={() => removeLine(line.key)}
                aria-label="Remove line"
                className="text-[#5f5e5e] hover:text-red-600 transition-colors"
              >
                <span className="material-symbols-outlined text-xl">delete</span>
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addLine}
        className="self-start px-4 py-2 border border-[#e8e2d8] text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:bg-[#f2ede5] transition-colors"
      >
        + Add Line
      </button>
      <div className="flex justify-end gap-6 pt-2 border-t border-[#e8e2d8] text-sm">
        <span className="font-semibold">{`Total Debit: ${formatCurrency(totalDebit)}`}</span>
        <span className="font-semibold">{`Total Credit: ${formatCurrency(totalCredit)}`}</span>
        <span
          className={`font-bold uppercase text-[11px] px-2 py-0.5 rounded ${
            isBalanced ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
          }`}
        >
          {isBalanced ? 'Balanced' : 'Unbalanced'}
        </span>
      </div>
    </div>
  );
};

export default JournalEntryLinesEditor;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine/JournalEntryLinesEditor.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/MerchantFrame/views/financial-engine/JournalEntryLinesEditor.tsx src/components/MerchantFrame/views/financial-engine/JournalEntryLinesEditor.test.tsx
git commit -m "feat(financial-engine): add JournalEntryLinesEditor"
```

---

### Task 4: `JournalEntriesView` — read-only workspace (fetch, filters, grid, empty states, detail drawer)

**Files:**
- Create: `src/components/MerchantFrame/views/financial-engine/JournalEntriesView.tsx`
- Test: `src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx`

**Interfaces:**
- Consumes: `JournalEntry`, `JournalEntryStatus`, `JournalEntryReferenceType`, `LedgerAccount` (Task 1).
- Produces: `JournalEntriesView` component (no props yet — added in Task 8). Internal helpers `formatCurrency`, `formatEntryDate`, and the `REFERENCE_TYPE_OPTIONS` / `STATUS_BADGE_CLASSES` constants are reused by Task 5's `JournalEntryFormDrawer` (same file).

- [ ] **Step 1: Write the failing test file**

Create `src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx`:

```tsx
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { JournalEntriesView } from './JournalEntriesView';
import type { JournalEntry } from '../../../../types/accounting';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const draftEntry: JournalEntry = {
  id: 1,
  entry_number: 'JE-2024-0001',
  entry_date: '2024-01-15',
  description: 'Monthly payroll expense',
  status: 'DRAFT',
  total_debit: 1500,
  total_credit: 1500,
  is_balanced: true,
  reference_type: 'PAYROLL',
  reference_id: 42,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  company: { id: 1, name: 'Acme Corp' },
  lines: [
    { id: 1, account: { id: 1, code: '1000', name: 'Cash' }, debit: 1500, credit: 0, description: null },
    { id: 2, account: { id: 2, code: '5000', name: 'Payroll Expense' }, debit: 0, credit: 1500, description: null },
  ],
};

const unbalancedPosted: JournalEntry = {
  ...draftEntry,
  id: 2,
  entry_number: 'JE-2024-0002',
  entry_date: '2024-02-01',
  description: 'Cash sale',
  status: 'POSTED',
  total_debit: 200,
  total_credit: 150,
  is_balanced: false,
  reference_type: 'ORDER',
  reference_id: 7,
};

function mockJournalEntriesFetch(entries: JournalEntry[], status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('/ledger-accounts')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({ data: [], page: 1, limit: 100, total: 0, totalPages: 1 }),
        });
      }
      return Promise.resolve({
        status,
        ok: status >= 200 && status < 300,
        json: async () => ({
          data: entries,
          page: 1,
          limit: 100,
          total: entries.length,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        }),
      });
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('JournalEntriesView — data fetch', () => {
  it('fetches journal entries on mount', async () => {
    mockJournalEntriesFetch([draftEntry]);
    render(<JournalEntriesView />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/journal-entry?limit=100'),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }) }),
      );
    });
  });

  it('shows a loading indicator while fetching', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<JournalEntriesView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error card with retry when the fetch fails', async () => {
    mockJournalEntriesFetch([], 500);
    render(<JournalEntriesView />);
    expect(await screen.findByText(/Failed to load journal entries/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
  });

  it('redirects to login on a 401 response', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };

    mockJournalEntriesFetch([], 401);
    render(<JournalEntriesView />);

    await waitFor(() => expect(window.location.href).toBe('/login'));

    // @ts-expect-error restoring original Location object
    window.location = originalLocation;
  });
});

describe('JournalEntriesView — empty state', () => {
  it('shows the exact empty-state copy when the API returns zero entries', async () => {
    mockJournalEntriesFetch([]);
    render(<JournalEntriesView />);

    expect(await screen.findByTestId('journal-entries-empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(
        "No journal entries recorded for this company profile. Click 'New Journal Entry' to create a manual accounting record.",
      ),
    ).toBeInTheDocument();
  });
});

describe('JournalEntriesView — grid rendering', () => {
  it('renders entry number, date, description, reference badge, currency totals, and badges', async () => {
    mockJournalEntriesFetch([draftEntry, unbalancedPosted]);
    render(<JournalEntriesView />);

    const row1 = await screen.findByTestId('journal-entry-row-1');
    expect(within(row1).getByText('JE-2024-0001')).toBeInTheDocument();
    expect(within(row1).getByText('Monthly payroll expense')).toBeInTheDocument();
    expect(within(row1).getByText(/PAYROLL/)).toBeInTheDocument();
    expect(within(row1).getByText('$1,500.00')).toBeInTheDocument();
    expect(within(row1).getByText('Balanced')).toBeInTheDocument();
    expect(within(row1).getByText('DRAFT')).toBeInTheDocument();

    const row2 = within(screen.getByTestId('journal-entry-row-2'));
    expect(row2.getByText('Unbalanced')).toBeInTheDocument();
    expect(row2.getByText('POSTED')).toBeInTheDocument();
  });
});

describe('JournalEntriesView — filters', () => {
  it('filters by search text against entry number or description', async () => {
    mockJournalEntriesFetch([draftEntry, unbalancedPosted]);
    render(<JournalEntriesView />);
    await screen.findByText('JE-2024-0001');

    await userEvent.type(screen.getByLabelText(/search journal entries/i), 'Cash sale');

    expect(screen.queryByText('JE-2024-0001')).not.toBeInTheDocument();
    expect(screen.getByText('JE-2024-0002')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    mockJournalEntriesFetch([draftEntry, unbalancedPosted]);
    render(<JournalEntriesView />);
    await screen.findByText('JE-2024-0001');

    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'POSTED');

    expect(screen.queryByText('JE-2024-0001')).not.toBeInTheDocument();
    expect(screen.getByText('JE-2024-0002')).toBeInTheDocument();
  });

  it('filters by reference type', async () => {
    mockJournalEntriesFetch([draftEntry, unbalancedPosted]);
    render(<JournalEntriesView />);
    await screen.findByText('JE-2024-0001');

    await userEvent.selectOptions(screen.getByLabelText(/filter by reference type/i), 'ORDER');

    expect(screen.queryByText('JE-2024-0001')).not.toBeInTheDocument();
    expect(screen.getByText('JE-2024-0002')).toBeInTheDocument();
  });

  it('filters by entry date range', async () => {
    mockJournalEntriesFetch([draftEntry, unbalancedPosted]);
    render(<JournalEntriesView />);
    await screen.findByText('JE-2024-0001');

    const from = screen.getByLabelText(/entry date from/i);
    await userEvent.type(from, '2024-02-01');

    expect(screen.queryByText('JE-2024-0001')).not.toBeInTheDocument();
    expect(screen.getByText('JE-2024-0002')).toBeInTheDocument();
  });

  it('shows filtered-empty state with a Clear filters action', async () => {
    mockJournalEntriesFetch([draftEntry]);
    render(<JournalEntriesView />);
    await screen.findByText('JE-2024-0001');

    await userEvent.type(screen.getByLabelText(/search journal entries/i), 'nonexistent');

    expect(screen.getByText('No journal entries match your active filters')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Clear filters'));
    expect(screen.getByText('JE-2024-0001')).toBeInTheDocument();
  });
});

describe('JournalEntriesView — detail drawer', () => {
  it('opens the detail drawer with lines when a row is clicked', async () => {
    mockJournalEntriesFetch([draftEntry]);
    render(<JournalEntriesView />);
    await userEvent.click(await screen.findByTestId('journal-entry-row-1'));

    const dialog = screen.getByRole('dialog', { name: /journal entry details/i });
    expect(within(dialog).getByText('JE-2024-0001')).toBeInTheDocument();
    expect(within(dialog).getByText('1000 — Cash')).toBeInTheDocument();
    expect(within(dialog).getByText('5000 — Payroll Expense')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx`
Expected: FAIL — `Cannot find module './JournalEntriesView'`.

- [ ] **Step 3: Implement `JournalEntriesView.tsx`**

Create `src/components/MerchantFrame/views/financial-engine/JournalEntriesView.tsx`:

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  JournalEntry,
  JournalEntryReferenceType,
  JournalEntryStatus,
  LedgerAccount,
} from '../../../../types/accounting';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const STATUS_BADGE_CLASSES: Record<JournalEntryStatus, string> = {
  DRAFT: 'bg-amber-500/10 text-amber-600',
  POSTED: 'bg-green-500/10 text-green-600',
  VOIDED: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
};

export const REFERENCE_TYPE_OPTIONS: JournalEntryReferenceType[] = [
  'ORDER',
  'PAYMENT',
  'PAYROLL',
  'TAX',
  'INVENTORY',
  'ADJUSTMENT',
  'MANUAL',
];

export function formatCurrency(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatEntryDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

interface JournalEntryDetailDrawerProps {
  entry: JournalEntry;
  onClose: () => void;
}

const JournalEntryDetailDrawer: React.FC<JournalEntryDetailDrawerProps> = ({ entry, onClose }) => {
  return (
    <div className="fixed inset-0 z-[9999] flex justify-end font-sans">
      <div
        data-testid="drawer-backdrop"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Journal Entry Details"
        className="relative bg-white border-l border-[#e8e2d8] shadow-2xl w-full max-w-lg h-full overflow-hidden animate-slide-in text-left flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Journal Entry Details</span>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Entry Number</p>
              <p className="font-bold text-[#1d1c17]">{entry.entry_number}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Entry Date</p>
              <p>{formatEntryDate(entry.entry_date)}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Description</p>
            <p>{entry.description || '—'}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Status</p>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[entry.status]}`}>
                {entry.status}
              </span>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Balance</p>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  entry.is_balanced ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                }`}
              >
                {entry.is_balanced ? 'Balanced' : 'Unbalanced'}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Total Debit</p>
              <p>{formatCurrency(entry.total_debit)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Total Credit</p>
              <p>{formatCurrency(entry.total_credit)}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Reference</p>
            <p>
              {entry.reference_type ?? 'MANUAL'}
              {entry.reference_id != null ? ` — #${entry.reference_id}` : ''}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Lines</p>
            <table className="w-full mt-2 border-collapse">
              <thead>
                <tr className="border-b border-[#e8e2d8] text-left">
                  <th className="py-1 text-[11px] uppercase text-[#5f5e5e]">Account</th>
                  <th className="py-1 text-[11px] uppercase text-[#5f5e5e] text-right">Debit</th>
                  <th className="py-1 text-[11px] uppercase text-[#5f5e5e] text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((line) => (
                  <tr key={line.id} className="border-b border-[#e8e2d8]/60">
                    <td className="py-1.5">
                      {line.account ? `${line.account.code} — ${line.account.name}` : '—'}
                      {line.description && <div className="text-xs text-[#5f5e5e]">{line.description}</div>}
                    </td>
                    <td className="py-1.5 text-right">{line.debit > 0 ? formatCurrency(line.debit) : ''}</td>
                    <td className="py-1.5 text-right">{line.credit > 0 ? formatCurrency(line.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export const JournalEntriesView: React.FC = () => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | JournalEntryStatus>('');
  const [referenceTypeFilter, setReferenceTypeFilter] = useState<'' | JournalEntryReferenceType>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null);

  const fetchJournalEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/journal-entry?limit=100`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Error al cargar los asientos contables');
      }

      const json = await res.json();
      setEntries(json.data ?? []);
    } catch (err) {
      console.error('Error fetching journal entries:', err);
      setError('Failed to load journal entries. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const fetchLedgerAccounts = async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/ledger-accounts?limit=100`, { headers });
      if (!res.ok) return;

      const json = await res.json();
      const active = ((json.data ?? []) as LedgerAccount[]).filter((a) => a.is_active);
      setLedgerAccounts(active);
    } catch (err) {
      console.error('Error fetching ledger accounts:', err);
    }
  };

  useEffect(() => {
    fetchJournalEntries();
    fetchLedgerAccounts();
  }, []);

  const matchesFilters = (entry: JournalEntry): boolean => {
    const term = searchQuery.trim().toLowerCase();
    if (
      term &&
      !entry.entry_number.toLowerCase().includes(term) &&
      !(entry.description ?? '').toLowerCase().includes(term)
    ) {
      return false;
    }
    if (statusFilter && entry.status !== statusFilter) return false;
    if (referenceTypeFilter && entry.reference_type !== referenceTypeFilter) return false;
    if (dateFrom && entry.entry_date < dateFrom) return false;
    if (dateTo && entry.entry_date > dateTo) return false;
    return true;
  };

  const filteredEntries = useMemo(
    () => entries.filter(matchesFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, searchQuery, statusFilter, referenceTypeFilter, dateFrom, dateTo],
  );

  const hasActiveFilter = Boolean(searchQuery || statusFilter || referenceTypeFilter || dateFrom || dateTo);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setReferenceTypeFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const isTrueEmpty = !loading && !error && entries.length === 0;
  const isFilteredEmpty = !loading && !error && entries.length > 0 && filteredEntries.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchJournalEntries}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by entry number or description..."
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
              aria-label="Search journal entries"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | JournalEntryStatus)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="POSTED">Posted</option>
            <option value="VOIDED">Voided</option>
          </select>
          <select
            value={referenceTypeFilter}
            onChange={(e) => setReferenceTypeFilter(e.target.value as '' | JournalEntryReferenceType)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
            aria-label="Filter by reference type"
          >
            <option value="">All References</option>
            {REFERENCE_TYPE_OPTIONS.map((rt) => (
              <option key={rt} value={rt}>
                {rt.charAt(0) + rt.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Entry date from"
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Entry date to"
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          />
          {hasActiveFilter && !isFilteredEmpty && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {isTrueEmpty && (
        <div
          data-testid="journal-entries-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">menu_book</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No journal entries recorded for this company profile. Click &apos;New Journal Entry&apos; to create a
            manual accounting record.
          </p>
        </div>
      )}

      {(loading || entries.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">JOURNAL ENTRIES</span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredEntries.length} entries`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Entry Number & Date
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Description & Reference
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Debit
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Credit
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Balance
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-28" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 ml-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 ml-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-16 mx-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-16 mx-auto" /></td>
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                        <p className="text-sm text-[#5f5e5e]">No journal entries match your active filters</p>
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="text-[#ae001a] text-sm font-semibold hover:underline"
                        >
                          Clear filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      data-testid={`journal-entry-row-${entry.id}`}
                      onClick={() => setDetailEntry(entry)}
                      className="hover:bg-[#f8f3eb] transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <span className="font-bold text-[#1d1c17]">{entry.entry_number}</span>
                        <div className="text-xs text-[#5f5e5e]">{formatEntryDate(entry.entry_date)}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-[#1d1c17]">{entry.description || '—'}</div>
                        <span className="inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#5f5e5e]/10 text-[#5f5e5e]">
                          {entry.reference_type ?? 'MANUAL'}
                          {entry.reference_id != null ? ` #${entry.reference_id}` : ''}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">{formatCurrency(entry.total_debit)}</td>
                      <td className="px-6 py-4 text-right">{formatCurrency(entry.total_credit)}</td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            entry.is_balanced ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                          }`}
                        >
                          {entry.is_balanced ? 'Balanced' : 'Unbalanced'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[entry.status]}`}
                        >
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detailEntry && <JournalEntryDetailDrawer entry={detailEntry} onClose={() => setDetailEntry(null)} />}
    </div>
  );
};

export default JournalEntriesView;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/MerchantFrame/views/financial-engine/JournalEntriesView.tsx src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx
git commit -m "feat(financial-engine): add read-only Journal Entries workspace"
```

---

### Task 5: Create flow — "New Journal Entry" drawer

**Files:**
- Modify: `src/components/MerchantFrame/views/financial-engine/JournalEntriesView.tsx`
- Modify: `src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx`

**Interfaces:**
- Consumes: `JournalEntryLinesEditor`, `createEmptyLine`, `toCreateLineDtos`, `linesAreValidAndBalanced`, `JournalEntryLineDraft` (Task 3); `CreateJournalEntryDto` (Task 1); `REFERENCE_TYPE_OPTIONS`, `STATUS_BADGE_CLASSES`... wait not needed here, only `REFERENCE_TYPE_OPTIONS` (already defined in this file from Task 4).
- Produces: `JournalEntryFormDrawer` component (local to this file, `mode: 'create' | 'edit'`, `initialEntry?: JournalEntry`) — Task 6 extends its usage to the edit path.

- [ ] **Step 1: Add the failing tests for the create flow**

Add to the bottom of `JournalEntriesView.test.tsx` (new `describe` block, keep everything above unchanged):

```tsx
describe('JournalEntriesView — create flow', () => {
  const cashAccount = { id: 1, code: '1000', name: 'Cash', type: 'ASSET' as const, is_active: true, parent_account_id: null };
  const revenueAccount = { id: 2, code: '4000', name: 'Sales Revenue', type: 'REVENUE' as const, is_active: true, parent_account_id: null };

  function mockWithLedgerAccounts(entries: JournalEntry[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/ledger-accounts')) {
          return Promise.resolve({
            status: 200,
            ok: true,
            json: async () => ({ data: [cashAccount, revenueAccount], page: 1, limit: 100, total: 2, totalPages: 1 }),
          });
        }
        if (url.includes('/journal-entry') && init?.method === 'POST') {
          const body = JSON.parse(init.body as string);
          return Promise.resolve({
            status: 201,
            ok: true,
            json: async () => ({
              data: {
                id: 99,
                entry_number: body.entry_number,
                entry_date: body.entry_date,
                description: body.description ?? null,
                status: 'DRAFT',
                total_debit: 100,
                total_credit: 100,
                is_balanced: true,
                reference_type: body.reference_type ?? null,
                reference_id: body.reference_id ?? null,
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
                company: { id: 1, name: 'Acme Corp' },
                lines: [],
              },
            }),
          });
        }
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({ data: entries, page: 1, limit: 100, total: entries.length, totalPages: 1 }),
        });
      }),
    );
  }

  it('opens the create drawer from the empty state CTA', async () => {
    mockWithLedgerAccounts([]);
    render(<JournalEntriesView />);

    await userEvent.click(await screen.findByRole('button', { name: /new journal entry/i }));
    expect(screen.getByRole('dialog', { name: /new journal entry/i })).toBeInTheDocument();
  });

  it('disables Save until entry number, date, and balanced lines are provided', async () => {
    mockWithLedgerAccounts([draftEntry]);
    render(<JournalEntriesView />);
    await screen.findByText('JE-2024-0001');

    await userEvent.click(screen.getByRole('button', { name: /new journal entry/i }));
    const dialog = screen.getByRole('dialog', { name: /new journal entry/i });
    expect(within(dialog).getByRole('button', { name: /save entry/i })).toBeDisabled();
  });

  it('blocks duplicate entry numbers', async () => {
    mockWithLedgerAccounts([draftEntry]);
    render(<JournalEntriesView />);
    await screen.findByText('JE-2024-0001');

    await userEvent.click(screen.getByRole('button', { name: /new journal entry/i }));
    const dialog = screen.getByRole('dialog', { name: /new journal entry/i });
    await userEvent.type(within(dialog).getByLabelText(/entry number/i), 'JE-2024-0001');
    await userEvent.tab();

    expect(within(dialog).getByText(/already exists/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /save entry/i })).toBeDisabled();
  });

  it('creates a balanced manual entry and shows a success toast', async () => {
    mockWithLedgerAccounts([]);
    render(<JournalEntriesView />);

    await userEvent.click(await screen.findByRole('button', { name: /new journal entry/i }));
    const dialog = screen.getByRole('dialog', { name: /new journal entry/i });

    await userEvent.type(within(dialog).getByLabelText(/entry number/i), 'JE-2024-0099');
    await userEvent.type(within(dialog).getByLabelText(/entry date/i), '2024-03-01');

    const accountInput = within(dialog).getByLabelText('Ledger account');
    await userEvent.click(accountInput);
    await userEvent.type(accountInput, 'Cash');
    await userEvent.click(await screen.findByRole('option', { name: '1000 — Cash' }));
    await userEvent.type(within(dialog).getByLabelText('Debit'), '100');

    await userEvent.click(within(dialog).getByRole('button', { name: /add line/i }));
    const creditRowAccountInputs = within(dialog).getAllByLabelText('Ledger account');
    await userEvent.click(creditRowAccountInputs[1]);
    await userEvent.type(creditRowAccountInputs[1], 'Sales');
    await userEvent.click(await screen.findByRole('option', { name: '4000 — Sales Revenue' }));
    await userEvent.type(within(dialog).getAllByLabelText('Credit')[1], '100');

    await userEvent.click(within(dialog).getByRole('button', { name: /save entry/i }));

    expect(await screen.findByText(/journal entry created successfully/i)).toBeInTheDocument();
    expect(screen.getByText('JE-2024-0099')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx`
Expected: FAIL — no `New Journal Entry` button / dialog exists yet.

- [ ] **Step 3: Implement the create flow in `JournalEntriesView.tsx`**

Add the import line (top of file, alongside the existing type-only import):

```tsx
import { createPortal } from 'react-dom';
import {
  JournalEntryLinesEditor,
  createEmptyLine,
  toCreateLineDtos,
  linesAreValidAndBalanced,
  type JournalEntryLineDraft,
} from './JournalEntryLinesEditor';
import type { CreateJournalEntryDto } from '../../../../types/accounting';
```

Add the `JournalEntryFormDrawer` component directly above `export const JournalEntriesView`:

```tsx
interface JournalEntryFormDrawerProps {
  mode: 'create' | 'edit';
  initialEntry?: JournalEntry;
  entries: JournalEntry[];
  ledgerAccounts: LedgerAccount[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (dto: CreateJournalEntryDto) => void;
}

const JournalEntryFormDrawer: React.FC<JournalEntryFormDrawerProps> = ({
  mode,
  initialEntry,
  entries,
  ledgerAccounts,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [entryNumber, setEntryNumber] = useState(initialEntry?.entry_number ?? '');
  const [entryDate, setEntryDate] = useState(initialEntry?.entry_date ?? '');
  const [description, setDescription] = useState(initialEntry?.description ?? '');
  const [referenceType, setReferenceType] = useState<JournalEntryReferenceType>(
    initialEntry?.reference_type ?? 'MANUAL',
  );
  const [referenceId, setReferenceId] = useState(
    initialEntry?.reference_id != null ? String(initialEntry.reference_id) : '',
  );
  const [numberTouched, setNumberTouched] = useState(false);
  const [lines, setLines] = useState<JournalEntryLineDraft[]>(() => {
    if (initialEntry) {
      return initialEntry.lines.map((l) => ({
        key: `existing-${l.id}`,
        account_id: l.account?.id ?? null,
        accountQuery: l.account ? `${l.account.code} — ${l.account.name}` : '',
        debit: l.debit > 0 ? String(l.debit) : '',
        credit: l.credit > 0 ? String(l.credit) : '',
        description: l.description ?? '',
      }));
    }
    return [createEmptyLine()];
  });

  const trimmedNumber = entryNumber.trim();
  const isDuplicateNumber = entries.some(
    (e) => e.entry_number === trimmedNumber && (mode === 'create' || e.id !== initialEntry?.id),
  );
  const numberValid = trimmedNumber.length > 0 && !isDuplicateNumber;
  const dateValid = entryDate.trim().length > 0;
  const needsReferenceId = referenceType !== 'MANUAL';
  const referenceIdValid = !needsReferenceId || referenceId.trim().length > 0;
  const isValid = numberValid && dateValid && referenceIdValid && linesAreValidAndBalanced(lines);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      setNumberTouched(true);
      return;
    }
    onSubmit({
      entry_number: trimmedNumber,
      entry_date: entryDate,
      description: description.trim() || undefined,
      reference_type: referenceType,
      reference_id: needsReferenceId ? Number(referenceId) : undefined,
      lines: toCreateLineDtos(lines),
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end font-sans">
      <div data-testid="drawer-backdrop" className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onCancel} />
      <div
        role="dialog"
        aria-label={mode === 'create' ? 'New Journal Entry' : 'Edit Journal Entry'}
        className="relative bg-white border-l border-[#e8e2d8] shadow-2xl w-full max-w-2xl h-full overflow-hidden animate-slide-in text-left flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">
            {mode === 'create' ? 'New Journal Entry' : 'Edit Journal Entry'}
          </span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="je-entry-number" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Entry Number
                </label>
                <input
                  id="je-entry-number"
                  type="text"
                  value={entryNumber}
                  onChange={(e) => setEntryNumber(e.target.value)}
                  onBlur={() => setNumberTouched(true)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                />
                {numberTouched && isDuplicateNumber && (
                  <p className="text-xs text-red-600 font-medium">Entry number '{trimmedNumber}' already exists.</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="je-entry-date" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Entry Date
                </label>
                <input
                  id="je-entry-date"
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="je-description" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Description
              </label>
              <textarea
                id="je-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="je-reference-type" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Reference Type
                </label>
                <select
                  id="je-reference-type"
                  value={referenceType}
                  onChange={(e) => setReferenceType(e.target.value as JournalEntryReferenceType)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
                >
                  {REFERENCE_TYPE_OPTIONS.map((rt) => (
                    <option key={rt} value={rt}>
                      {rt.charAt(0) + rt.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              {needsReferenceId && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="je-reference-id" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                    Reference ID
                  </label>
                  <input
                    id="je-reference-id"
                    type="number"
                    min="1"
                    value={referenceId}
                    onChange={(e) => setReferenceId(e.target.value)}
                    className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                  />
                </div>
              )}
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase mb-2">Lines</p>
              <JournalEntryLinesEditor accounts={ledgerAccounts} lines={lines} onChange={setLines} />
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
              {mode === 'create' ? 'Save Entry' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};
```

Inside `JournalEntriesView`, add new state right after `const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null);`:

```tsx
  const [formModalOpen, setFormModalOpen] = useState<null | { mode: 'create' | 'edit'; entry?: JournalEntry }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCreateSubmit = async (dto: CreateJournalEntryDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/journal-entry`, {
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
        throw new Error(json.message || 'Failed to create journal entry');
      }

      setEntries((prev) => [json.data, ...prev]);
      setFormModalOpen(null);
      setToast({ message: 'Journal entry created successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(null);
      setToast({ message: err.message || 'Failed to create journal entry', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };
```

Add a "New Journal Entry" button inside the filter bar's `div className="flex flex-wrap items-center gap-3"`, right after the `dateTo` input and before the `Clear Filters` button:

```tsx
          {!isTrueEmpty && (
            <button
              type="button"
              onClick={() => setFormModalOpen({ mode: 'create' })}
              className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-base">add</span>
              New Journal Entry
            </button>
          )}
```

Add a CTA button inside the true-empty state block, right after the closing `</p>` and before the closing `</div>`:

```tsx
          <button
            type="button"
            onClick={() => setFormModalOpen({ mode: 'create' })}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            New Journal Entry
          </button>
```

Finally, right after the `{detailEntry && <JournalEntryDetailDrawer ... />}` block (before the closing `</div>` of the component), add the drawer render and the toast:

```tsx
      {formModalOpen && (
        <JournalEntryFormDrawer
          mode={formModalOpen.mode}
          initialEntry={formModalOpen.entry}
          entries={entries}
          ledgerAccounts={ledgerAccounts}
          submitting={formSubmitting}
          onCancel={() => setFormModalOpen(null)}
          onSubmit={(dto) => handleCreateSubmit(dto)}
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx`
Expected: PASS (all previous tests plus the 4 new create-flow tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --build --noEmit --force`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/MerchantFrame/views/financial-engine/JournalEntriesView.tsx src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx
git commit -m "feat(financial-engine): add Journal Entry create flow"
```

---

### Task 6: Edit flow (DRAFT-only)

**Files:**
- Modify: `src/components/MerchantFrame/views/financial-engine/JournalEntriesView.tsx`
- Modify: `src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx`

**Interfaces:**
- Consumes: `JournalEntryFormDrawer` (Task 5, same file), `UpdateJournalEntryDto`/`CreateJournalEntryDto` (Task 1).
- Produces: `handleEditSubmit(id, dto)` in `JournalEntriesView`; an "Edit" button inside `JournalEntryDetailDrawer`, visible only when `entry.status === 'DRAFT'`.

- [ ] **Step 1: Add the failing tests**

Add to `JournalEntriesView.test.tsx`, in a new `describe` block:

```tsx
describe('JournalEntriesView — edit flow', () => {
  it('shows an Edit button in the detail drawer only for DRAFT entries', async () => {
    mockJournalEntriesFetch([draftEntry, unbalancedPosted]);
    render(<JournalEntriesView />);

    await userEvent.click(await screen.findByTestId('journal-entry-row-1'));
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /close/i }));

    await userEvent.click(screen.getByTestId('journal-entry-row-2'));
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it('opens the edit drawer prefilled and PATCHes the correct id on submit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/ledger-accounts')) {
          return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: [], page: 1, limit: 100, total: 0, totalPages: 1 }) });
        }
        if (url.includes('/journal-entry/1') && init?.method === 'PATCH') {
          return Promise.resolve({
            status: 200,
            ok: true,
            json: async () => ({ data: { ...draftEntry, description: 'Updated description' } }),
          });
        }
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({ data: [draftEntry], page: 1, limit: 100, total: 1, totalPages: 1 }),
        });
      }),
    );
    render(<JournalEntriesView />);

    await userEvent.click(await screen.findByTestId('journal-entry-row-1'));
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    const dialog = screen.getByRole('dialog', { name: /edit journal entry/i });
    expect(within(dialog).getByLabelText(/entry number/i)).toHaveValue('JE-2024-0001');

    const description = within(dialog).getByLabelText(/description/i);
    await userEvent.clear(description);
    await userEvent.type(description, 'Updated description');
    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/journal entry updated successfully/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/journal-entry/1'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx`
Expected: FAIL — no Edit button exists in the detail drawer yet.

- [ ] **Step 3: Wire the edit flow**

In `JournalEntriesView.tsx`, change the `JournalEntryDetailDrawer` props and add the Edit button. Replace:

```tsx
interface JournalEntryDetailDrawerProps {
  entry: JournalEntry;
  onClose: () => void;
}

const JournalEntryDetailDrawer: React.FC<JournalEntryDetailDrawerProps> = ({ entry, onClose }) => {
```

with:

```tsx
interface JournalEntryDetailDrawerProps {
  entry: JournalEntry;
  onClose: () => void;
  onEdit: () => void;
}

const JournalEntryDetailDrawer: React.FC<JournalEntryDetailDrawerProps> = ({ entry, onClose, onEdit }) => {
```

Then, inside the drawer's header `<div className="bg-[#222222] p-4 ...">`, add an Edit button before the close button (only when DRAFT):

```tsx
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Journal Entry Details</span>
          <div className="flex items-center gap-3">
            {entry.status === 'DRAFT' && (
              <button type="button" onClick={onEdit} className="text-white/70 hover:text-white transition-colors text-[11px] font-bold uppercase tracking-widest">
                Edit
              </button>
            )}
            <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
```

(This replaces the previous header `<div>` that only rendered the label and the close button.)

In `JournalEntriesView`, update the render call for the detail drawer:

```tsx
      {detailEntry && (
        <JournalEntryDetailDrawer
          entry={detailEntry}
          onClose={() => setDetailEntry(null)}
          onEdit={() => {
            setFormModalOpen({ mode: 'edit', entry: detailEntry });
            setDetailEntry(null);
          }}
        />
      )}
```

Add `handleEditSubmit` right after `handleCreateSubmit`:

```tsx
  const handleEditSubmit = async (entryId: number, dto: CreateJournalEntryDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/journal-entry/${entryId}`, {
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
        throw new Error(json.message || 'Failed to update journal entry');
      }

      setEntries((prev) => prev.map((e) => (e.id === json.data.id ? json.data : e)));
      setFormModalOpen(null);
      setToast({ message: 'Journal entry updated successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(null);
      setToast({ message: err.message || 'Failed to update journal entry', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };
```

Finally, update the form drawer's `onSubmit` to branch on mode:

```tsx
          onSubmit={(dto) =>
            formModalOpen.mode === 'create'
              ? handleCreateSubmit(dto)
              : handleEditSubmit(formModalOpen.entry!.id, dto)
          }
```

(replacing the Task 5 version that always called `handleCreateSubmit`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --build --noEmit --force`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/MerchantFrame/views/financial-engine/JournalEntriesView.tsx src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx
git commit -m "feat(financial-engine): add Journal Entry edit flow for DRAFT entries"
```

---

### Task 7: Delete / Post / Void lifecycle actions

**Files:**
- Modify: `src/components/MerchantFrame/views/financial-engine/JournalEntriesView.tsx`
- Modify: `src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx`

**Interfaces:**
- Produces: `ConfirmJournalActionDialog` (local component), `confirmAction` state (`{ type: 'delete' | 'post' | 'void'; entry: JournalEntry } | null`), `handleConfirmAction()` in `JournalEntriesView`.

- [ ] **Step 1: Add the failing tests**

Add to `JournalEntriesView.test.tsx`:

```tsx
describe('JournalEntriesView — lifecycle actions', () => {
  it('shows Delete and Post only for DRAFT, and Void only for POSTED', async () => {
    mockJournalEntriesFetch([draftEntry, unbalancedPosted]);
    render(<JournalEntriesView />);

    await userEvent.click(await screen.findByTestId('journal-entry-row-1'));
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^post$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^void$/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /close/i }));

    await userEvent.click(screen.getByTestId('journal-entry-row-2'));
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^post$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^void$/i })).toBeInTheDocument();
  });

  it('posts a DRAFT entry and updates its status in place', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/ledger-accounts')) {
          return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: [], page: 1, limit: 100, total: 0, totalPages: 1 }) });
        }
        if (url.endsWith('/journal-entry/1/post') && init?.method === 'POST') {
          return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: { ...draftEntry, status: 'POSTED' } }) });
        }
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: [draftEntry], page: 1, limit: 100, total: 1, totalPages: 1 }) });
      }),
    );
    render(<JournalEntriesView />);

    await userEvent.click(await screen.findByTestId('journal-entry-row-1'));
    await userEvent.click(screen.getByRole('button', { name: /^post$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^confirm post$/i }));

    expect(await screen.findByText(/journal entry posted successfully/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/journal-entry/1/post'), expect.objectContaining({ method: 'POST' }));
  });

  it('voids a POSTED entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/ledger-accounts')) {
          return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: [], page: 1, limit: 100, total: 0, totalPages: 1 }) });
        }
        if (url.endsWith('/journal-entry/2/void') && init?.method === 'POST') {
          return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: { ...unbalancedPosted, status: 'VOIDED' } }) });
        }
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: [unbalancedPosted], page: 1, limit: 100, total: 1, totalPages: 1 }) });
      }),
    );
    render(<JournalEntriesView />);

    await userEvent.click(await screen.findByTestId('journal-entry-row-2'));
    await userEvent.click(screen.getByRole('button', { name: /^void$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^confirm void$/i }));

    expect(await screen.findByText(/journal entry voided successfully/i)).toBeInTheDocument();
  });

  it('deletes a DRAFT entry and removes it from the grid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/ledger-accounts')) {
          return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: [], page: 1, limit: 100, total: 0, totalPages: 1 }) });
        }
        if (url.includes('/journal-entry/1') && init?.method === 'DELETE') {
          return Promise.resolve({ status: 200, ok: true, json: async () => ({ message: 'Journal Entry deleted successfully' }) });
        }
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: [draftEntry], page: 1, limit: 100, total: 1, totalPages: 1 }) });
      }),
    );
    render(<JournalEntriesView />);

    await userEvent.click(await screen.findByTestId('journal-entry-row-1'));
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^confirm delete$/i }));

    expect(await screen.findByText(/journal entry deleted successfully/i)).toBeInTheDocument();
    expect(screen.queryByText('JE-2024-0001')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx`
Expected: FAIL — no Delete/Post/Void buttons exist yet.

- [ ] **Step 3: Implement lifecycle actions**

Add the `ConfirmJournalActionDialog` component directly above `JournalEntryFormDrawer`:

```tsx
type JournalActionType = 'delete' | 'post' | 'void';

interface ConfirmJournalActionDialogProps {
  action: JournalActionType;
  entry: JournalEntry;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ACTION_COPY: Record<JournalActionType, { title: string; body: (entryNumber: string) => string; confirmLabel: string; busyLabel: string }> = {
  delete: {
    title: 'DELETE JOURNAL ENTRY',
    body: (n) => `This will permanently delete draft entry "${n}" and all of its lines. This cannot be undone.`,
    confirmLabel: 'Confirm Delete',
    busyLabel: 'Deleting…',
  },
  post: {
    title: 'POST JOURNAL ENTRY',
    body: (n) => `Posting "${n}" locks it from further edits or deletion. It can only be reversed with a Void afterwards.`,
    confirmLabel: 'Confirm Post',
    busyLabel: 'Posting…',
  },
  void: {
    title: 'VOID JOURNAL ENTRY',
    body: (n) => `Voiding "${n}" marks it as void for audit purposes. This does not delete the record.`,
    confirmLabel: 'Confirm Void',
    busyLabel: 'Voiding…',
  },
};

const ConfirmJournalActionDialog: React.FC<ConfirmJournalActionDialogProps> = ({
  action,
  entry,
  submitting,
  onConfirm,
  onCancel,
}) => {
  const copy = ACTION_COPY[action];
  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md shadow-2xl">
        <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">{copy.title}</span>
          <button type="button" onClick={onCancel} disabled={submitting} className="text-white/50 hover:text-white transition-colors disabled:opacity-50">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-5">
          <p className="text-sm text-[#1d1c17] leading-relaxed">{copy.body(entry.entry_number)}</p>
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
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? copy.busyLabel : copy.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

Update `JournalEntryDetailDrawerProps` and the header to add Delete/Post/Void buttons. Replace the header block from Task 6 with:

```tsx
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Journal Entry Details</span>
          <div className="flex items-center gap-3">
            {entry.status === 'DRAFT' && (
              <>
                <button type="button" onClick={onEdit} className="text-white/70 hover:text-white transition-colors text-[11px] font-bold uppercase tracking-widest">
                  Edit
                </button>
                <button type="button" onClick={() => onRequestAction('delete')} className="text-white/70 hover:text-red-400 transition-colors text-[11px] font-bold uppercase tracking-widest">
                  Delete
                </button>
                <button type="button" onClick={() => onRequestAction('post')} className="text-white/70 hover:text-green-400 transition-colors text-[11px] font-bold uppercase tracking-widest">
                  Post
                </button>
              </>
            )}
            {entry.status === 'POSTED' && (
              <button type="button" onClick={() => onRequestAction('void')} className="text-white/70 hover:text-amber-400 transition-colors text-[11px] font-bold uppercase tracking-widest">
                Void
              </button>
            )}
            <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
```

Update the props interface accordingly:

```tsx
interface JournalEntryDetailDrawerProps {
  entry: JournalEntry;
  onClose: () => void;
  onEdit: () => void;
  onRequestAction: (action: JournalActionType) => void;
}

const JournalEntryDetailDrawer: React.FC<JournalEntryDetailDrawerProps> = ({ entry, onClose, onEdit, onRequestAction }) => {
```

In `JournalEntriesView`, add state right after `formSubmitting`/`toast`:

```tsx
  const [confirmAction, setConfirmAction] = useState<null | { type: JournalActionType; entry: JournalEntry }>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, entry } = confirmAction;
    setActionSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      if (type === 'delete') {
        const res = await fetch(`${API_BASE}/journal-entry/${entry.id}`, { method: 'DELETE', headers });
        if (res.status === 401) {
          clearAuthSession();
          window.location.href = '/login';
          return;
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || 'Failed to delete journal entry');

        setEntries((prev) => prev.filter((e) => e.id !== entry.id));
        setDetailEntry(null);
        setConfirmAction(null);
        setToast({ message: 'Journal entry deleted successfully', type: 'success' });
        return;
      }

      const path = type === 'post' ? 'post' : 'void';
      const res = await fetch(`${API_BASE}/journal-entry/${entry.id}/${path}`, { method: 'POST', headers });
      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || `Failed to ${type} journal entry`);

      setEntries((prev) => prev.map((e) => (e.id === json.data.id ? json.data : e)));
      setDetailEntry(json.data);
      setConfirmAction(null);
      setToast({
        message: `Journal entry ${type === 'post' ? 'posted' : 'voided'} successfully`,
        type: 'success',
      });
    } catch (err: any) {
      setConfirmAction(null);
      setToast({ message: err.message || `Failed to update journal entry`, type: 'error' });
    } finally {
      setActionSubmitting(false);
    }
  };
```

Update the detail drawer render call:

```tsx
      {detailEntry && (
        <JournalEntryDetailDrawer
          entry={detailEntry}
          onClose={() => setDetailEntry(null)}
          onEdit={() => {
            setFormModalOpen({ mode: 'edit', entry: detailEntry });
            setDetailEntry(null);
          }}
          onRequestAction={(type) => setConfirmAction({ type, entry: detailEntry })}
        />
      )}

      {confirmAction && (
        <ConfirmJournalActionDialog
          action={confirmAction.type}
          entry={confirmAction.entry}
          submitting={actionSubmitting}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx`
Expected: PASS (full suite green).

- [ ] **Step 5: Type-check**

Run: `npx tsc --build --noEmit --force`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/MerchantFrame/views/financial-engine/JournalEntriesView.tsx src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx
git commit -m "feat(financial-engine): add Delete/Post/Void lifecycle actions to Journal Entries"
```

---

### Task 8: Quick links wiring, FAB, and MerchantFrame registration

**Files:**
- Modify: `src/components/MerchantFrame/views/financial-engine/JournalEntriesView.tsx`
- Modify: `src/components/MerchantFrame/MerchantFrame.tsx`

**Interfaces:**
- Consumes: `LedgerQuickLinks` with its `current` prop (Task 2).
- Produces: `JournalEntriesView` now accepts `{ onNavigate?: (view: string) => void }` and is reachable at `activeTab === 'journal-entries'` in `MerchantFrame.tsx`.

- [ ] **Step 1: Give `JournalEntriesView` an `onNavigate` prop and render the quick links + FAB**

In `JournalEntriesView.tsx`, add the import:

```tsx
import { LedgerQuickLinks } from './LedgerQuickLinks';
```

Change the component signature from:

```tsx
export const JournalEntriesView: React.FC = () => {
```

to:

```tsx
interface JournalEntriesViewProps {
  onNavigate?: (view: string) => void;
}

export const JournalEntriesView: React.FC<JournalEntriesViewProps> = ({ onNavigate }) => {
```

Right after the closing `</div>` of the grid/empty-state block and before `{detailEntry && (`, add:

```tsx
      <LedgerQuickLinks current="journal-entries" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={() => setFormModalOpen({ mode: 'create' })}
        aria-label="Quick create journal entry"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>
```

- [ ] **Step 2: Register the view in `MerchantFrame.tsx`**

Add the import next to the existing `LedgerAccountsView` import (around line 53):

```tsx
import { JournalEntriesView } from './views/financial-engine/JournalEntriesView';
```

Add the routing branch right after the `ledger-accounts` branch (around line 479):

```tsx
    if (activeTab === 'journal-entries') {
      return <JournalEntriesView onNavigate={(view) => setActiveTab(view)} />;
    }
```

- [ ] **Step 3: Run the full financial-engine test suite**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine`
Expected: PASS — `LedgerAccountsView.test.tsx`, `LedgerAccountTree.test.tsx`, `JournalEntryLinesEditor.test.tsx`, `JournalEntriesView.test.tsx` all green.

- [ ] **Step 4: Type-check**

Run: `npx tsc --build --noEmit --force`
Expected: no errors.

- [ ] **Step 5: Manual smoke test via the dev server**

`MerchantFrame.tsx` has no automated test coverage of its own routing (consistent with how `ledger-accounts` was wired), so verify this by hand:

Run: `npm run dev` (serves at `http://localhost:5173`; it does not start on its own — start it if it isn't already running)

In the browser: log in as a Merchant Admin, open the Ledger Accounts (Chart of Accounts) view, click the "JOURNAL ENTRIES" quick link — confirm it navigates to the new workspace, the "CHART OF ACCOUNTS" anchor there is now clickable (not active), and "JOURNAL ENTRIES" is the active anchor. Create a manual journal entry with two balanced lines, confirm it appears in the grid, then Post it and confirm the status badge updates to POSTED live.

- [ ] **Step 6: Commit**

```bash
git add src/components/MerchantFrame/views/financial-engine/JournalEntriesView.tsx src/components/MerchantFrame/MerchantFrame.tsx
git commit -m "feat(financial-engine): wire Journal Entries into MerchantFrame navigation"
```

---

## Self-Review Notes

- **Spec coverage:** multi-tenant fetch (Task 4), empty state copy (Task 4), search/status/reference/date filters (Task 4), grid columns incl. currency/balanced/status badges (Task 4), reference badge with type+id (Task 4/Detail drawer), create with line builder (Task 3/5), edit (Task 6), delete/post/void (Task 7), quick links + shell wiring (Task 2/8) — all covered.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `JournalEntry`, `CreateJournalEntryDto`, `JournalEntryLineDraft` names and shapes are identical from Task 1/3 through Task 8; `JournalActionType` introduced in Task 7 and reused consistently in Task 8's absence (not needed there).
