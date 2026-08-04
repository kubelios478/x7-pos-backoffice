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
