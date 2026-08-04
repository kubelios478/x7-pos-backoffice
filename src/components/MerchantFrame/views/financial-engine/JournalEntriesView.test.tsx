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
    expect(within(row1).getAllByText('$1,500.00')).toHaveLength(2);
    expect(within(row1).getByText('Balanced')).toBeInTheDocument();
    expect(within(row1).getByText('DRAFT')).toBeInTheDocument();

    const row2 = within(screen.getByTestId('journal-entry-row-2'));
    expect(row2.getByText('$200.00')).toBeInTheDocument();
    expect(row2.getByText('$150.00')).toBeInTheDocument();
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

  it('calls onViewLines with the open entry when View Line Items is clicked', async () => {
    mockJournalEntriesFetch([draftEntry]);
    const onViewLines = vi.fn();
    render(<JournalEntriesView onViewLines={onViewLines} />);
    await userEvent.click(await screen.findByTestId('journal-entry-row-1'));

    await userEvent.click(screen.getByRole('button', { name: /view line items/i }));

    expect(onViewLines).toHaveBeenCalledWith(draftEntry);
  });
});

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
    await screen.findByTestId('journal-entries-empty-state');

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
    await screen.findByTestId('journal-entries-empty-state');

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

  it('caps the entry number input at 100 characters', async () => {
    mockWithLedgerAccounts([]);
    render(<JournalEntriesView />);
    await screen.findByTestId('journal-entries-empty-state');

    await userEvent.click(await screen.findByRole('button', { name: /new journal entry/i }));
    const dialog = screen.getByRole('dialog', { name: /new journal entry/i });
    expect(within(dialog).getByLabelText(/entry number/i)).toHaveAttribute('maxLength', '100');
  });

  it('keeps the drawer open with an inline error and preserved input when the server rejects the submission', async () => {
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
          return Promise.resolve({
            status: 409,
            ok: false,
            json: async () => ({ message: "Entry number 'JE-2024-0099' already exists for this company." }),
          });
        }
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({ data: [], page: 1, limit: 100, total: 0, totalPages: 1 }),
        });
      }),
    );
    render(<JournalEntriesView />);
    await screen.findByTestId('journal-entries-empty-state');

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

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/already exists/i);
    expect(screen.getByRole('dialog', { name: /new journal entry/i })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/entry number/i)).toHaveValue('JE-2024-0099');
  });
});

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

    const description = within(dialog).getByLabelText(/^description$/i);
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

describe('JournalEntriesView — quick links bar', () => {
  it('renders all four accounting shortcut anchors', async () => {
    mockJournalEntriesFetch([draftEntry]);
    render(<JournalEntriesView />);
    await screen.findByText('JE-2024-0001');

    const nav = screen.getByRole('navigation', { name: /related accounting shortcuts/i });
    expect(within(nav).getByText('CHART OF ACCOUNTS')).toBeInTheDocument();
    expect(within(nav).getByText('JOURNAL ENTRIES')).toBeInTheDocument();
    expect(within(nav).getByText('JOURNAL LINE ITEMS')).toBeInTheDocument();
    expect(within(nav).getByText('TAX RULES CONFIGURATION')).toBeInTheDocument();
  });

  it('marks JOURNAL ENTRIES as the active, non-clickable anchor', async () => {
    mockJournalEntriesFetch([draftEntry]);
    render(<JournalEntriesView />);
    await screen.findByText('JE-2024-0001');

    const nav = screen.getByRole('navigation', { name: /related accounting shortcuts/i });
    const active = within(nav).getByText('JOURNAL ENTRIES').closest('span');
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByRole('button', { name: /^journal entries$/i })).not.toBeInTheDocument();
  });

  it('navigates to ledger-accounts on click', async () => {
    const onNavigate = vi.fn();
    mockJournalEntriesFetch([draftEntry]);
    render(<JournalEntriesView onNavigate={onNavigate} />);
    await screen.findByText('JE-2024-0001');

    const nav = screen.getByRole('navigation', { name: /related accounting shortcuts/i });
    await userEvent.click(within(nav).getByRole('button', { name: /chart of accounts/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('ledger-accounts');
  });
});

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
