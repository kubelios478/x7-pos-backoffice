import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { JournalEntryLinesView, flattenJournalEntryLines, isLeafAccount } from './JournalEntryLinesView';
import type { JournalEntry, LedgerAccount } from '../../../../types/accounting';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const entryA: JournalEntry = {
  id: 1,
  entry_number: 'JE-2024-0001',
  entry_date: '2024-01-15',
  description: 'Monthly payroll expense',
  status: 'POSTED',
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
    {
      id: 2,
      account: { id: 2, code: '5000', name: 'Payroll Expense' },
      debit: 0,
      credit: 1500,
      description: 'Bi-weekly payroll run',
    },
  ],
};

const entryB: JournalEntry = {
  ...entryA,
  id: 2,
  entry_number: 'JE-2024-0002',
  entry_date: '2024-02-01',
  description: 'Cash sale',
  reference_type: 'ORDER',
  reference_id: 7,
  lines: [{ id: 3, account: { id: 3, code: '4000', name: 'Sales Revenue' }, debit: 0, credit: 200, description: null }],
};

const draftEntry: JournalEntry = {
  ...entryA,
  id: 3,
  entry_number: 'JE-2024-0003',
  status: 'DRAFT',
  description: 'Draft adjustment',
  lines: [],
};

const cashAccount: LedgerAccount = { id: 1, code: '1000', name: 'Cash', type: 'ASSET', is_active: true, parent_account_id: null };
const payrollAccount: LedgerAccount = { id: 2, code: '5000', name: 'Payroll Expense', type: 'EXPENSE', is_active: true, parent_account_id: null };
const revenueAccount: LedgerAccount = { id: 3, code: '4000', name: 'Sales Revenue', type: 'REVENUE', is_active: true, parent_account_id: null };

function mockFetch(entries: JournalEntry[], ledgerAccounts: LedgerAccount[] = [cashAccount, payrollAccount, revenueAccount], status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('/ledger-accounts')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({ data: ledgerAccounts, page: 1, limit: 100, total: ledgerAccounts.length, totalPages: 1 }),
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

describe('flattenJournalEntryLines', () => {
  it('flattens every entry into one row per line, keyed by entry and line id', () => {
    const flattened = flattenJournalEntryLines([entryA, entryB]);
    expect(flattened).toHaveLength(3);
    expect(flattened.map((f) => f.key)).toEqual(['1-1', '1-2', '2-3']);
    expect(flattened[0].entry).toBe(entryA);
    expect(flattened[0].line).toBe(entryA.lines[0]);
  });
});

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

  it('returns true when the only referencing account is inactive', () => {
    const parent: LedgerAccount = { id: 1, code: '1000', name: 'Assets', type: 'ASSET', is_active: true, parent_account_id: null };
    const inactiveChild: LedgerAccount = { id: 2, code: '1010', name: 'Cash', type: 'ASSET', is_active: false, parent_account_id: 1 };
    expect(isLeafAccount(parent, [parent, inactiveChild])).toBe(true);
  });
});

describe('JournalEntryLinesView — data fetch', () => {
  it('fetches journal entries and ledger accounts on mount', async () => {
    mockFetch([entryA]);
    render(<JournalEntryLinesView />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/journal-entry?limit=100'),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }) }),
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/ledger-accounts?limit=100'),
        expect.anything(),
      );
    });
  });

  it('shows a loading indicator while fetching', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<JournalEntryLinesView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error card with retry when the fetch fails', async () => {
    mockFetch([], [], 500);
    render(<JournalEntryLinesView />);
    expect(await screen.findByText(/Failed to load journal entry lines/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
  });

  it('redirects to login on a 401 response', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };

    mockFetch([], [], 401);
    render(<JournalEntryLinesView />);

    await waitFor(() => expect(window.location.href).toBe('/login'));

    // @ts-expect-error restoring original Location object
    window.location = originalLocation;
  });
});

describe('JournalEntryLinesView — empty state', () => {
  it('shows the exact empty-state copy when there are zero posting lines', async () => {
    mockFetch([]);
    render(<JournalEntryLinesView />);

    expect(await screen.findByTestId('journal-entry-lines-empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No posting line items recorded. Select a Journal Entry or clear filters to view detailed ledger movements.',
      ),
    ).toBeInTheDocument();
  });
});

describe('JournalEntryLinesView — grid rendering', () => {
  it('renders one row per line with entry, account badge, description fallback, and currency', async () => {
    mockFetch([entryA, entryB]);
    render(<JournalEntryLinesView />);

    expect(await screen.findByText('3 lines')).toBeInTheDocument();

    const row1 = within(screen.getByTestId('journal-entry-line-row-1-1'));
    expect(row1.getByText('JE-2024-0001')).toBeInTheDocument();
    expect(row1.getByText('1000 - Cash')).toBeInTheDocument();
    // line.description is null on this line, falls back italic to the parent entry description
    expect(row1.getByText('Monthly payroll expense')).toBeInTheDocument();
    expect(row1.getByText('$1,500.00')).toBeInTheDocument(); // debit
    expect(row1.getByText('$0.00')).toBeInTheDocument(); // credit, muted

    const row2 = within(screen.getByTestId('journal-entry-line-row-1-2'));
    expect(row2.getByText('5000 - Payroll Expense')).toBeInTheDocument();
    expect(row2.getByText('Bi-weekly payroll run')).toBeInTheDocument();

    const row3 = within(screen.getByTestId('journal-entry-line-row-2-3'));
    expect(row3.getByText('JE-2024-0002')).toBeInTheDocument();
    expect(row3.getByText('4000 - Sales Revenue')).toBeInTheDocument();
  });

  it('applies a muted class to zero-amount debit/credit cells', async () => {
    mockFetch([entryB]);
    render(<JournalEntryLinesView />);

    const row = within(await screen.findByTestId('journal-entry-line-row-2-3'));
    const debitCell = row.getByText('$0.00');
    expect(debitCell.className).toContain('text-[#5f5e5e]');
  });
});

describe('JournalEntryLinesView — filters', () => {
  it('filters by search text against description, entry number, or account code', async () => {
    mockFetch([entryA, entryB]);
    render(<JournalEntryLinesView />);
    await screen.findByText('3 lines');

    await userEvent.type(screen.getByLabelText(/search posting line items/i), '4000');

    expect(screen.queryByTestId('journal-entry-line-row-1-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('journal-entry-line-row-2-3')).toBeInTheDocument();
  });

  it('filters by posting type — Debit Only', async () => {
    mockFetch([entryA, entryB]);
    render(<JournalEntryLinesView />);
    await screen.findByText('3 lines');

    await userEvent.selectOptions(screen.getByLabelText(/filter by posting type/i), 'DEBIT');

    expect(screen.getByTestId('journal-entry-line-row-1-1')).toBeInTheDocument();
    expect(screen.queryByTestId('journal-entry-line-row-1-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('journal-entry-line-row-2-3')).not.toBeInTheDocument();
  });

  it('filters by posting type — Credit Only', async () => {
    mockFetch([entryA, entryB]);
    render(<JournalEntryLinesView />);
    await screen.findByText('3 lines');

    await userEvent.selectOptions(screen.getByLabelText(/filter by posting type/i), 'CREDIT');

    expect(screen.queryByTestId('journal-entry-line-row-1-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('journal-entry-line-row-1-2')).toBeInTheDocument();
    expect(screen.getByTestId('journal-entry-line-row-2-3')).toBeInTheDocument();
  });

  it('filters by ledger account', async () => {
    mockFetch([entryA, entryB]);
    render(<JournalEntryLinesView />);
    await screen.findByText('3 lines');

    await userEvent.selectOptions(screen.getByLabelText(/filter by account/i), '3');

    expect(screen.queryByTestId('journal-entry-line-row-1-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('journal-entry-line-row-2-3')).toBeInTheDocument();
  });

  it('shows filtered-empty state with a Clear filters action that restores rows', async () => {
    mockFetch([entryA]);
    render(<JournalEntryLinesView />);
    await screen.findByText('2 lines');

    await userEvent.type(screen.getByLabelText(/search posting line items/i), 'nonexistent-zzz');

    expect(screen.getByText('No posting line items match your active filters')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Clear filters'));
    expect(await screen.findByText('2 lines')).toBeInTheDocument();
  });
});

describe('JournalEntryLinesView — entry-scoped mode', () => {
  it('pre-filters to the scoped entry and shows a dismissible chip', async () => {
    mockFetch([entryA, entryB]);
    render(<JournalEntryLinesView entry={entryA} />);

    expect(await screen.findByText('2 lines')).toBeInTheDocument();
    expect(screen.getByTestId('scoped-entry-chip')).toHaveTextContent('JE-2024-0001');
    expect(screen.queryByTestId('journal-entry-line-row-2-3')).not.toBeInTheDocument();
  });

  it('clearing the scope chip calls onClearEntry and shows all lines', async () => {
    const onClearEntry = vi.fn();
    mockFetch([entryA, entryB]);
    render(<JournalEntryLinesView entry={entryA} onClearEntry={onClearEntry} />);
    await screen.findByText('2 lines');

    await userEvent.click(screen.getByLabelText(/clear journal entry scope/i));

    expect(onClearEntry).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('3 lines')).toBeInTheDocument();
  });
});

describe('JournalEntryLinesView — navigation', () => {
  it('calls onNavigate with journal-entries when the parent entry link is clicked', async () => {
    const onNavigate = vi.fn();
    mockFetch([entryB]);
    render(<JournalEntryLinesView onNavigate={onNavigate} />);

    await userEvent.click(await screen.findByText('JE-2024-0002'));

    expect(onNavigate).toHaveBeenCalledWith('journal-entries');
  });

  it('renders LedgerQuickLinks with journal-entries-lines as the active anchor', async () => {
    mockFetch([entryB]);
    render(<JournalEntryLinesView />);
    await screen.findByText('JE-2024-0002');

    const activeAnchor = screen.getByText('JOURNAL LINE ITEMS').closest('span');
    expect(activeAnchor).toHaveAttribute('aria-current', 'page');
  });
});

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

  it('blocks submit when both debit and credit are zero, and shows the exact validation message on a real submit attempt', async () => {
    mockFetch([draftEntry]);
    render(<JournalEntryLinesView />);
    await screen.findByRole('button', { name: /add line item/i });

    await userEvent.click(screen.getByRole('button', { name: /add line item/i }));
    await userEvent.click(screen.getByLabelText(/journal entry/i));
    await userEvent.click(screen.getByRole('option', { name: 'JE-2024-0003' }));
    await userEvent.click(screen.getByLabelText(/ledger account/i));
    await userEvent.click((await screen.findAllByRole('option'))[0]);

    await userEvent.click(screen.getByRole('button', { name: /save line item/i }));

    expect(
      screen.getByText('A line item must have either a Debit or Credit amount greater than zero.'),
    ).toBeInTheDocument();
    // still open — the blocked submit never called onSubmit/POST
    expect(screen.getByRole('dialog', { name: /add line item/i })).toBeInTheDocument();
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
});
