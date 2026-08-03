import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { LedgerAccountsView } from './LedgerAccountsView';
import type { LedgerAccount } from '../../../../types/accounting';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const cashAccount: LedgerAccount = {
  id: 1,
  code: '1000',
  name: 'Cash',
  type: 'ASSET',
  is_active: true,
  parent_account_id: null,
};

const pettyCashAccount: LedgerAccount = {
  id: 2,
  code: '1010',
  name: 'Petty Cash',
  type: 'ASSET',
  is_active: false,
  parent_account_id: 1,
};

function mockFetchOnce(data: LedgerAccount[], status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: async () => ({
        data,
        total: data.length,
        page: 1,
        limit: 100,
        totalPages: 1,
      }),
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('LedgerAccountsView — data fetch', () => {
  it('fetches ledger accounts on mount', async () => {
    mockFetchOnce([cashAccount]);
    render(<LedgerAccountsView />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/ledger-accounts?limit=100'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }),
        }),
      );
    });
  });

  it('shows a loading indicator while fetching', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<LedgerAccountsView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error card with retry when the fetch fails', async () => {
    mockFetchOnce([], 500);
    render(<LedgerAccountsView />);

    expect(await screen.findByText(/Failed to load ledger accounts/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
  });

  it('redirects to login on a 401 response', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };

    mockFetchOnce([], 401);
    render(<LedgerAccountsView />);

    await waitFor(() => expect(window.location.href).toBe('/login'));

    // @ts-expect-error restoring original Location object
    window.location = originalLocation;
  });
});

describe('LedgerAccountsView — empty state', () => {
  it('shows the real empty state when the API returns zero accounts', async () => {
    mockFetchOnce([]);
    render(<LedgerAccountsView />);

    expect(await screen.findByTestId('ledger-accounts-empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(
        /No ledger accounts defined for this company profile\. Click 'Add Account' to set up your Chart of Accounts\./i,
      ),
    ).toBeInTheDocument();
  });
});

describe('LedgerAccountsView — filters', () => {
  it('filters by search text against code or name', async () => {
    mockFetchOnce([cashAccount, { ...cashAccount, id: 3, code: '2000', name: 'Accounts Payable' }]);
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await userEvent.type(screen.getByLabelText(/search ledger accounts/i), '2000');

    expect(screen.queryByText('Cash')).not.toBeInTheDocument();
    expect(screen.getByText('Accounts Payable')).toBeInTheDocument();
  });

  it('filters by account type', async () => {
    mockFetchOnce([cashAccount, { ...cashAccount, id: 3, code: '4000', name: 'Sales', type: 'REVENUE' }]);
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await userEvent.selectOptions(screen.getByLabelText(/filter by account type/i), 'REVENUE');

    expect(screen.queryByText('Cash')).not.toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    mockFetchOnce([cashAccount, pettyCashAccount]);
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'inactive');

    expect(screen.queryByText('Cash')).not.toBeInTheDocument();
    expect(screen.getByText('Petty Cash')).toBeInTheDocument();
  });

  it('shows a filtered-empty state with a clear-filters action when no row matches', async () => {
    mockFetchOnce([cashAccount]);
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await userEvent.type(screen.getByLabelText(/search ledger accounts/i), 'zzzznomatch');

    expect(screen.getByText(/no ledger accounts match your active filters/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });
});

describe('LedgerAccountsView — grid row formatting', () => {
  it('renders the type badge and status badge for each account', async () => {
    mockFetchOnce([cashAccount, pettyCashAccount]);
    render(<LedgerAccountsView />);

    const row1 = await screen.findByTestId('ledger-account-row-1');
    expect(within(row1).getByText('ASSET')).toBeInTheDocument();
    expect(within(row1).getByText('Active')).toBeInTheDocument();

    const row2 = screen.getByTestId('ledger-account-row-2');
    expect(within(row2).getByText('Inactive')).toBeInTheDocument();
  });

  it('shows the Root Account marker when parent_account_id is null', async () => {
    mockFetchOnce([cashAccount]);
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');
    expect(screen.getByText('Root Account')).toBeInTheDocument();
  });

  it("resolves the parent's code and name when parent_account_id is set", async () => {
    mockFetchOnce([cashAccount, pettyCashAccount]);
    render(<LedgerAccountsView />);
    await screen.findByText('Petty Cash');
    expect(screen.getByText('1000 — Cash')).toBeInTheDocument();
  });

  it('shows a "Parent not found" fallback when parent_account_id does not resolve', async () => {
    mockFetchOnce([{ ...pettyCashAccount, parent_account_id: 999 }]);
    render(<LedgerAccountsView />);
    await screen.findByText('Petty Cash');
    expect(screen.getByText('Parent not found')).toBeInTheDocument();
  });
});

describe('LedgerAccountsView — create workflow', () => {
  it('creates a new account and shows it in the table', async () => {
    mockFetchOnce([cashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await user.click(screen.getByRole('button', { name: /add account/i }));
    const dialog = screen.getByRole('dialog', { name: /add account/i });
    expect(dialog).toBeInTheDocument();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 201,
        ok: true,
        json: async () => ({
          data: { id: 9, code: '4000', name: 'Sales', type: 'REVENUE', is_active: true, parent_account_id: null },
        }),
      }),
    );

    await user.type(within(dialog).getByLabelText(/account code/i), '4000');
    await user.type(within(dialog).getByLabelText(/account name/i), 'Sales');
    await user.selectOptions(within(dialog).getByLabelText(/account type/i), 'REVENUE');
    await user.click(within(dialog).getByRole('button', { name: /save account/i }));

    await screen.findByText('Sales');
    expect(screen.getByText('Ledger account created successfully')).toBeInTheDocument();
  });

  it('shows the empty-state "Add Account" button when there are zero accounts', async () => {
    mockFetchOnce([]);
    render(<LedgerAccountsView />);
    await screen.findByTestId('ledger-accounts-empty-state');
    expect(screen.getByRole('button', { name: /add account/i })).toBeInTheDocument();
  });
});

describe('LedgerAccountsView — drawer layout', () => {
  it('renders the Add Account drawer sliding in from the right, closable via backdrop click', async () => {
    mockFetchOnce([cashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await user.click(screen.getByRole('button', { name: /add account/i }));
    const dialog = screen.getByRole('dialog', { name: /add account/i });
    const overlay = dialog.parentElement as HTMLElement;

    expect(overlay).toHaveClass('justify-end');
    expect(dialog).toHaveClass('animate-slide-in');

    await user.click(within(overlay).getByTestId('drawer-backdrop'));
    expect(screen.queryByRole('dialog', { name: /add account/i })).not.toBeInTheDocument();
  });

  it('renders the Ledger Account Details drawer sliding in from the right, closable via backdrop click', async () => {
    mockFetchOnce([cashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await user.click(screen.getByText('Cash'));
    const dialog = screen.getByRole('dialog', { name: /ledger account details/i });
    const overlay = dialog.parentElement as HTMLElement;

    expect(overlay).toHaveClass('justify-end');
    expect(dialog).toHaveClass('animate-slide-in');

    await user.click(within(overlay).getByTestId('drawer-backdrop'));
    expect(screen.queryByRole('dialog', { name: /ledger account details/i })).not.toBeInTheDocument();
  });
});

describe('LedgerAccountsView — edit workflow', () => {
  it('edits an existing account', async () => {
    mockFetchOnce([cashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    const row = (await screen.findByText('Cash')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit 1000'));
    expect(screen.getByRole('dialog', { name: /edit account/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /ledger account details/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/account name/i)).toHaveValue('Cash');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: { ...cashAccount, name: 'Cash and Equivalents' } }),
      }),
    );

    await user.clear(screen.getByLabelText(/account name/i));
    await user.type(screen.getByLabelText(/account name/i), 'Cash and Equivalents');
    await user.click(screen.getByRole('button', { name: /save account/i }));

    await screen.findByText('Cash and Equivalents');
    expect(screen.getByText('Ledger account updated successfully')).toBeInTheDocument();
  });

  it("excludes the account being edited and its descendants from its own parent selector", async () => {
    mockFetchOnce([cashAccount, pettyCashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    const row = (await screen.findByText('Cash')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit 1000'));
    const dialog = screen.getByRole('dialog', { name: /edit account/i });

    await user.click(within(dialog).getByLabelText(/parent account/i));
    const listbox = within(dialog).getByRole('listbox');

    expect(within(listbox).queryByText('1000 — Cash')).not.toBeInTheDocument();
    expect(within(listbox).queryByText('1010 — Petty Cash')).not.toBeInTheDocument();
  });
});

describe('LedgerAccountsView — searchable parent dropdown & type lock', () => {
  it('always shows "None (Root Account)" and filters other options by typed code or name', async () => {
    mockFetchOnce([cashAccount, { ...cashAccount, id: 3, code: '4000', name: 'Sales', type: 'REVENUE' }]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await user.click(screen.getByRole('button', { name: /add account/i }));
    const dialog = screen.getByRole('dialog', { name: /add account/i });

    await user.type(within(dialog).getByLabelText(/parent account/i), 'Sales');
    const listbox = within(dialog).getByRole('listbox');

    expect(within(listbox).getByText('4000 — Sales')).toBeInTheDocument();
    expect(within(listbox).queryByText('1000 — Cash')).not.toBeInTheDocument();
    expect(within(listbox).getByText('None (Root Account)')).toBeInTheDocument();
  });

  it('selects a parent from the filtered list, fills the input, and auto-locks the type', async () => {
    mockFetchOnce([cashAccount, { ...cashAccount, id: 3, code: '4000', name: 'Sales', type: 'REVENUE' }]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await user.click(screen.getByRole('button', { name: /add account/i }));
    const dialog = screen.getByRole('dialog', { name: /add account/i });

    await user.type(within(dialog).getByLabelText(/parent account/i), 'Sales');
    await user.click(within(dialog).getByText('4000 — Sales'));

    expect(within(dialog).getByLabelText(/parent account/i)).toHaveValue('4000 — Sales');
    expect(within(dialog).getByLabelText(/account type/i)).toBeDisabled();
    expect(within(dialog).getByLabelText(/account type/i)).toHaveValue('REVENUE');
    expect(within(dialog).getByText(/Locked to parent's type \(REVENUE\)/i)).toBeInTheDocument();
  });

  it('unlocks the type field when the parent is cleared back to root', async () => {
    mockFetchOnce([cashAccount, { ...cashAccount, id: 3, code: '4000', name: 'Sales', type: 'REVENUE' }]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await user.click(screen.getByRole('button', { name: /add account/i }));
    const dialog = screen.getByRole('dialog', { name: /add account/i });

    await user.click(within(dialog).getByLabelText(/parent account/i));
    await user.click(within(dialog).getByText('4000 — Sales'));
    expect(within(dialog).getByLabelText(/account type/i)).toBeDisabled();

    await user.click(within(dialog).getByLabelText(/parent account/i));
    await user.click(within(dialog).getByText('None (Root Account)'));

    expect(within(dialog).getByLabelText(/account type/i)).not.toBeDisabled();
  });

  it('loads pre-locked in edit mode when the account already has a parent', async () => {
    mockFetchOnce([cashAccount, pettyCashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    const row = (await screen.findByText('Petty Cash')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit 1010'));
    const dialog = screen.getByRole('dialog', { name: /edit account/i });

    expect(within(dialog).getByLabelText(/account type/i)).toBeDisabled();
    expect(within(dialog).getByLabelText(/account type/i)).toHaveValue('ASSET');
    expect(within(dialog).getByLabelText(/parent account/i)).toHaveValue('1000 — Cash');
  });
});

describe('LedgerAccountsView — client-side unique code validation', () => {
  it('blocks submission and shows an inline error for a duplicate code', async () => {
    mockFetchOnce([cashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await user.click(screen.getByRole('button', { name: /add account/i }));
    const dialog = screen.getByRole('dialog', { name: /add account/i });

    await user.type(within(dialog).getByLabelText(/account code/i), '1000');
    await user.type(within(dialog).getByLabelText(/account name/i), 'Duplicate Cash');
    await user.tab();

    expect(
      within(dialog).getByText("Account code '1000' already exists for this company."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /save account/i })).toBeDisabled();
  });

  it('does not flag the account being edited for keeping its own unchanged code', async () => {
    mockFetchOnce([cashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    const row = (await screen.findByText('Cash')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit 1000'));
    const dialog = screen.getByRole('dialog', { name: /edit account/i });
    await user.click(within(dialog).getByLabelText(/account code/i));
    await user.tab();

    expect(
      within(dialog).queryByText(/already exists for this company/i),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /save account/i })).not.toBeDisabled();
  });

  it('clears the duplicate error once the code is changed to a unique value', async () => {
    mockFetchOnce([cashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await user.click(screen.getByRole('button', { name: /add account/i }));
    const dialog = screen.getByRole('dialog', { name: /add account/i });

    const codeInput = within(dialog).getByLabelText(/account code/i);
    await user.type(codeInput, '1000');
    await user.tab();
    expect(within(dialog).getByText(/already exists for this company/i)).toBeInTheDocument();

    await user.clear(codeInput);
    await user.type(codeInput, '9999');

    expect(within(dialog).queryByText(/already exists for this company/i)).not.toBeInTheDocument();
  });
});

describe('LedgerAccountsView — detail inspection', () => {
  it('opens the detail modal when a row is clicked and shows resolved parent + child count', async () => {
    mockFetchOnce([cashAccount, pettyCashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await user.click(screen.getByText('Cash'));

    const dialog = screen.getByRole('dialog', { name: /ledger account details/i });
    expect(within(dialog).getByText('1000')).toBeInTheDocument();
    expect(within(dialog).getByText('Root Account')).toBeInTheDocument();
    expect(within(dialog).getByText('1')).toBeInTheDocument(); // 1 child account (Petty Cash)
  });
});

describe('LedgerAccountsView — status toggle', () => {
  it('deactivates an active account after confirmation (PATCH is_active: false)', async () => {
    mockFetchOnce([cashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    const row = (await screen.findByText('Cash')).closest('tr')!;

    const fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ data: { ...cashAccount, is_active: false } }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await user.click(within(row).getByLabelText('Deactivate Cash'));
    expect(
      screen.queryByRole('dialog', { name: /ledger account details/i }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));

    await screen.findByText('Ledger account deactivated successfully');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/ledger-accounts/1'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ is_active: false }) }),
    );
    const updatedRow = (await screen.findByText('Cash')).closest('tr')!;
    expect(within(updatedRow).getByText('Inactive')).toBeInTheDocument();
  });

  it('reactivates an inactive account after confirmation (PATCH is_active: true)', async () => {
    mockFetchOnce([pettyCashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    const row = (await screen.findByText('Petty Cash')).closest('tr')!;

    const fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ data: { ...pettyCashAccount, is_active: true } }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await user.click(within(row).getByLabelText('Activate Petty Cash'));
    expect(
      screen.queryByRole('dialog', { name: /ledger account details/i }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^activate$/i }));

    await screen.findByText('Ledger account reactivated successfully');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/ledger-accounts/2'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ is_active: true }) }),
    );
  });

  it('does not send a request when the confirm dialog is cancelled', async () => {
    mockFetchOnce([cashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    const row = (await screen.findByText('Cash')).closest('tr')!;

    const fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ data: [cashAccount] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    const callsBefore = fetchSpy.mock.calls.length;

    await user.click(within(row).getByLabelText('Deactivate Cash'));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
  });
});

describe('LedgerAccountsView — view mode toggle', () => {
  it('defaults to the Flat Data Table view', async () => {
    mockFetchOnce([cashAccount, pettyCashAccount]);
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');
    expect(screen.getByRole('button', { name: /flat data table/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to the Hierarchical Tree view and indents child accounts', async () => {
    mockFetchOnce([cashAccount, pettyCashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await user.click(screen.getByRole('button', { name: /hierarchical tree/i }));

    expect(screen.getByRole('button', { name: /hierarchical tree/i })).toHaveAttribute('aria-pressed', 'true');
    const rootCell = screen.getByText('1000').closest('td') as HTMLElement;
    const childCell = screen.getByText('1010').closest('td') as HTMLElement;
    expect(childCell.style.paddingLeft).not.toBe(rootCell.style.paddingLeft);
  });

  it('keeps the ancestor chain visible in tree mode when a search filters to a descendant', async () => {
    mockFetchOnce([cashAccount, pettyCashAccount]);
    const user = userEvent.setup();
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    await user.click(screen.getByRole('button', { name: /hierarchical tree/i }));
    await user.type(screen.getByLabelText(/search ledger accounts/i), 'Petty');

    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('Petty Cash')).toBeInTheDocument();
  });
});

describe('LedgerAccountsView — quick links bar', () => {
  it('renders all four accounting shortcut anchors with the panel title and description', async () => {
    mockFetchOnce([cashAccount]);
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    const nav = screen.getByRole('navigation', { name: /related accounting shortcuts/i });
    expect(within(nav).getByText('CHART OF ACCOUNTS')).toBeInTheDocument();
    expect(within(nav).getByText('JOURNAL ENTRIES')).toBeInTheDocument();
    expect(within(nav).getByText('JOURNAL LINE ITEMS')).toBeInTheDocument();
    expect(within(nav).getByText('TAX RULES CONFIGURATION')).toBeInTheDocument();
    expect(within(nav).getByText('Accounting Workspace Shortcuts')).toBeInTheDocument();
    expect(
      within(nav).getByText(
        'Pivot across the Chart of Accounts, Journal Entries, and posting line items without leaving the financial engine context.',
      ),
    ).toBeInTheDocument();
  });

  it('marks CHART OF ACCOUNTS as the active, non-clickable anchor', async () => {
    mockFetchOnce([cashAccount]);
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    const nav = screen.getByRole('navigation', { name: /related accounting shortcuts/i });
    const active = within(nav).getByText('CHART OF ACCOUNTS').closest('span');
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByRole('button', { name: /chart of accounts/i })).not.toBeInTheDocument();
  });

  it('navigates to journal-entries, journal-entries-lines, and merchant-tax-rules on click', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    mockFetchOnce([cashAccount]);
    render(<LedgerAccountsView onNavigate={onNavigate} />);
    await screen.findByText('Cash');

    await user.click(screen.getByRole('button', { name: /journal entries/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('journal-entries');

    await user.click(screen.getByRole('button', { name: /journal line items/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('journal-entries-lines');

    await user.click(screen.getByRole('button', { name: /tax rules configuration/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('merchant-tax-rules');
  });

  it('does not render the quick links bar on the error card', async () => {
    mockFetchOnce([], 500);
    render(<LedgerAccountsView />);

    await screen.findByText(/Failed to load ledger accounts/i);
    expect(screen.queryByRole('navigation', { name: /related accounting shortcuts/i })).not.toBeInTheDocument();
  });
});
