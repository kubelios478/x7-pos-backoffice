import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CashTransactionsView, formatDateTime, formatTypeLabel } from './CashTransactionsView';
import type { CashTransaction } from '../../../../types/cash-transaction';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const paginationMeta = { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false };

export function mockFetchOnce(data: CashTransaction[], meta = paginationMeta, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: async () => ({ statusCode: status, message: 'ok', data, paginationMeta: meta }),
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const saleTxn: CashTransaction = {
  id: 1,
  cashDrawerId: 3,
  orderId: 200,
  type: 'sale',
  amount: 125.5,
  collaboratorId: 5,
  status: 'active',
  notes: 'Table 4 dine-in',
  createdAt: '2026-08-07T08:00:00Z',
  updatedAt: '2026-08-07T08:00:00Z',
};

describe('CashTransactionsView — data fetch', () => {
  it('fetches cash transactions on mount with page 1', async () => {
    mockFetchOnce([]);
    render(<CashTransactionsView />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/cash-transactions'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }),
        }),
      );
    });
    const calledUrl = (fetch as any).mock.calls[0][0] as string;
    expect(calledUrl).toContain('page=1');
  });

  it('shows a loading indicator while fetching', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<CashTransactionsView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error card with retry when the fetch fails', async () => {
    mockFetchOnce([], paginationMeta, 500);
    render(<CashTransactionsView />);

    expect(await screen.findByText(/Failed to load cash transactions/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
  });

  it('redirects to login on a 401 response', async () => {
    const originalLocation = window.location;
    // @ts-expect-error test override
    delete window.location;
    // @ts-expect-error test override
    window.location = { ...originalLocation, href: '' } as Location;

    mockFetchOnce([], paginationMeta, 401);
    render(<CashTransactionsView />);

    await waitFor(() => expect(window.location.href).toBe('/login'));
    // @ts-expect-error test override
    window.location = originalLocation;
  });

  it('shows the true-empty state when there are no transactions at all', async () => {
    mockFetchOnce([], { ...paginationMeta, total: 0 });
    render(<CashTransactionsView />);
    expect(await screen.findByTestId('cash-transactions-empty-state')).toBeInTheDocument();
  });
});

describe('CashTransactionsView — grid rendering', () => {
  it('renders a transaction row with id, drawer, type, amount, collaborator, and date', async () => {
    mockFetchOnce([saleTxn]);
    render(<CashTransactionsView />);

    expect(await screen.findByText('#CT-1')).toBeInTheDocument();
    expect(screen.getByText('#CD-3')).toBeInTheDocument();
    expect(screen.getByText('SALE')).toBeInTheDocument();
    expect(screen.getByText('$125.50')).toBeInTheDocument();
    expect(screen.getByText('#EMP-5')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === formatDateTime(saleTxn.createdAt))).toBeInTheDocument();
  });

  it('formats snake_case types as spaced uppercase labels', () => {
    expect(formatTypeLabel('adjustment_up')).toBe('ADJUSTMENT UP');
  });

  it('colors the amount green for balance-increasing types and red for decreasing types', async () => {
    const refundTxn: CashTransaction = { ...saleTxn, id: 2, type: 'refund', amount: 40 };
    mockFetchOnce([saleTxn, refundTxn]);
    render(<CashTransactionsView />);

    const saleAmount = await screen.findByText('$125.50');
    expect(saleAmount.className).toContain('text-green-600');
    const refundAmount = screen.getByText('$40.00');
    expect(refundAmount.className).toContain('text-[#ae001a]');
  });

  it('normalizes a string amount from the backend into a formatted number', async () => {
    const stringAmountTxn = { ...saleTxn, amount: '125.50' as unknown as number };
    mockFetchOnce([stringAmountTxn]);
    render(<CashTransactionsView />);
    expect(await screen.findByText('$125.50')).toBeInTheDocument();
  });
});

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
    const detailTxn: CashTransaction = { ...saleTxn, updatedAt: '2026-08-07T09:15:00Z' };
    mockFetchWithDetail([saleTxn], detailTxn);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await user.click(screen.getByRole('button', { name: /view cash transaction 1 details/i }));
    const dialog = screen.getByRole('dialog', { name: /cash transaction details/i });
    expect(within(dialog).getByText(saleTxn.createdAt)).toBeInTheDocument();
    expect(within(dialog).getByText(detailTxn.updatedAt)).toBeInTheDocument();
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

describe('CashTransactionsView — type and drawer filters', () => {
  it('populates the drawer filter from GET /cash-drawers (not from transaction ids) and requests it as a query param on selection', async () => {
    const user = userEvent.setup();
    // URL-aware mock: /cash-drawers returns distinct drawer ids (3, 7) that don't overlap
    // with saleTxn's id (1) or cashDrawerId (3-as-transaction-field), so we can tell the
    // dropdown options really came from the drawers endpoint mapped via `d.id`.
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({
        status: 200,
        ok: true,
        json: async () =>
          url.includes('/cash-drawers')
            ? { statusCode: 200, message: 'ok', data: [{ id: 3 }, { id: 7 }] }
            : { statusCode: 200, message: 'ok', data: [saleTxn], paginationMeta },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/cash-drawers?limit=100'), expect.anything());
    });

    const drawerSelect = screen.getByRole('combobox', { name: /filter by cash drawer/i });
    await waitFor(() => {
      expect(within(drawerSelect).getByText('#CD-3')).toBeInTheDocument();
      expect(within(drawerSelect).getByText('#CD-7')).toBeInTheDocument();
    });
    // saleTxn.id (1) must not leak into the options via a wrong-field/wrong-endpoint mapping
    expect(within(drawerSelect).queryByText('#CD-1')).not.toBeInTheDocument();

    await user.selectOptions(drawerSelect, '3');

    await waitFor(() => {
      const cashTransactionsCalls = fetchMock.mock.calls.filter(([url]) => (url as string).includes('/cash-transactions'));
      expect(cashTransactionsCalls[cashTransactionsCalls.length - 1]?.[0]).toContain('cashDrawerId=3');
    });
  });

  it('requests the selected type as a query param and resets to page 1', async () => {
    const user = userEvent.setup();
    const pageTwoMeta = { page: 2, limit: 10, total: 15, totalPages: 2, hasNext: false, hasPrev: true };
    mockFetchOnce([saleTxn], pageTwoMeta);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    mockFetchOnce([saleTxn]);
    await user.selectOptions(screen.getByRole('combobox', { name: /filter by transaction type/i }), 'refund');

    await waitFor(() => {
      const calledUrl = (fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).toContain('type=refund');
      expect(calledUrl).toContain('page=1');
    });
  });

  it('shows a Clear Filters button once a filter is active and clears it on click', async () => {
    const user = userEvent.setup();
    mockFetchOnce([saleTxn]);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    mockFetchOnce([saleTxn]);
    await user.selectOptions(screen.getByRole('combobox', { name: /filter by transaction type/i }), 'refund');
    expect(await screen.findByRole('button', { name: /clear filters/i })).toBeInTheDocument();

    mockFetchOnce([saleTxn]);
    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
  });
});

describe('CashTransactionsView — pagination', () => {
  const pageOneMeta = { page: 1, limit: 10, total: 15, totalPages: 2, hasNext: true, hasPrev: false };
  const pageTwoMeta = { page: 2, limit: 10, total: 15, totalPages: 2, hasNext: false, hasPrev: true };

  it('disables Previous on page 1 and enables Next when hasNext is true', async () => {
    mockFetchOnce([saleTxn], pageOneMeta);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next page/i })).toBeEnabled();
  });

  it('fetches page 2 and flips button state when Next is clicked', async () => {
    const user = userEvent.setup();
    mockFetchOnce([saleTxn], pageOneMeta);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    mockFetchOnce([{ ...saleTxn, id: 11 }], pageTwoMeta);
    await user.click(screen.getByRole('button', { name: /next page/i }));

    await screen.findByText('#CT-11');
    const calledUrl = (fetch as any).mock.calls[0][0] as string;
    expect(calledUrl).toContain('page=2');
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /previous page/i })).toBeEnabled();
  });

  it('shows the current page and total count', async () => {
    mockFetchOnce([saleTxn], pageOneMeta);
    render(<CashTransactionsView />);
    expect(await screen.findByText(/page 1 of 2/i)).toBeInTheDocument();
  });

  it('fetches the previous page when Previous is clicked', async () => {
    const user = userEvent.setup();
    // The component's page counter is local state starting at 1, so to reach page 2
    // (where Previous is enabled) we first click Next, then click Previous.
    mockFetchOnce([saleTxn], pageOneMeta);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    mockFetchOnce([{ ...saleTxn, id: 11 }], pageTwoMeta);
    await user.click(screen.getByRole('button', { name: /next page/i }));
    await screen.findByText('#CT-11');
    expect(screen.getByRole('button', { name: /previous page/i })).toBeEnabled();

    mockFetchOnce([saleTxn], pageOneMeta);
    await user.click(screen.getByRole('button', { name: /previous page/i }));

    await screen.findByText('#CT-1');
    const calledUrl = (fetch as any).mock.calls[0][0] as string;
    expect(calledUrl).toContain('page=1');
  });
});

describe('CashTransactionsView — search and row indicators', () => {
  it('filters the current page client-side by transaction id, drawer id, collaborator id, or notes', async () => {
    const user = userEvent.setup();
    const otherTxn: CashTransaction = { ...saleTxn, id: 2, cashDrawerId: 9, notes: 'Register recount' };
    mockFetchOnce([saleTxn, otherTxn]);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');
    expect(screen.getByText('#CT-2')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/search cash transactions/i), 'recount');
    expect(screen.queryByText('#CT-1')).not.toBeInTheDocument();
    expect(screen.getByText('#CT-2')).toBeInTheDocument();
  });

  it('shows a filtered count in the header when a search query narrows the results, and the server total when cleared', async () => {
    const user = userEvent.setup();
    const otherTxn: CashTransaction = { ...saleTxn, id: 2, cashDrawerId: 9, notes: 'Register recount' };
    mockFetchOnce([saleTxn, otherTxn], { ...paginationMeta, total: 15 });
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');
    expect(screen.getByText('15 transactions')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/search cash transactions/i), 'recount');
    expect(await screen.findByText('1 of 15 transactions')).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/search cash transactions/i));
    expect(await screen.findByText('15 transactions')).toBeInTheDocument();
  });

  it('shows a filtered-empty state with a clear-filters link when search matches nothing', async () => {
    const user = userEvent.setup();
    mockFetchOnce([saleTxn]);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await user.type(screen.getByLabelText(/search cash transactions/i), 'nonexistent-term');
    expect(await screen.findByText(/no cash transactions match your active filters/i)).toBeInTheDocument();
    // Both the filter-bar and the in-table "Clear Filters" buttons are visible here;
    // target the in-table one specifically via its distinct accessible name.
    await user.click(screen.getByRole('button', { name: /clear filters and show all transactions/i }));
    expect(await screen.findByText('#CT-1')).toBeInTheDocument();
  });

  it('shows a Linked Order indicator with a tooltip when orderId is present, and a dash otherwise', async () => {
    const noOrderTxn: CashTransaction = { ...saleTxn, id: 3, orderId: null };
    mockFetchOnce([saleTxn, noOrderTxn]);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    const row1 = screen.getByTestId('cash-transaction-row-1');
    expect(within(row1).getByTitle('Linked to Order #200')).toBeInTheDocument();

    const row3 = screen.getByTestId('cash-transaction-row-3');
    expect(within(row3).queryByTitle(/linked to order/i)).not.toBeInTheDocument();
  });

  it('shows a Notes indicator with a tooltip when notes are present, and a dash otherwise', async () => {
    const noNotesTxn: CashTransaction = { ...saleTxn, id: 4, notes: null };
    mockFetchOnce([saleTxn, noNotesTxn]);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    const row1 = screen.getByTestId('cash-transaction-row-1');
    expect(within(row1).getByTitle('Table 4 dine-in')).toBeInTheDocument();

    const row4 = screen.getByTestId('cash-transaction-row-4');
    expect(within(row4).getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the filtered-empty state (not the true-empty state) when a server-side type filter matches nothing, and recovers via Clear Filters', async () => {
    const user = userEvent.setup();
    mockFetchOnce([saleTxn]);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    mockFetchOnce([], { ...paginationMeta, total: 0 });
    await user.selectOptions(screen.getByRole('combobox', { name: /filter by transaction type/i }), 'refund');

    expect(await screen.findByText(/no cash transactions match your active filters/i)).toBeInTheDocument();
    expect(screen.queryByTestId('cash-transactions-empty-state')).not.toBeInTheDocument();

    mockFetchOnce([saleTxn]);
    // Both the filter-bar and the in-table "Clear Filters" buttons are visible here;
    // target the in-table one specifically via its distinct accessible name.
    await user.click(screen.getByRole('button', { name: /clear filters and show all transactions/i }));
    expect(await screen.findByText('#CT-1')).toBeInTheDocument();
  });
});

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

describe('CashTransactionsView — Quick Launch nav bar', () => {
  it('renders the Quick Launch panel title and description', async () => {
    mockFetchOnce([saleTxn]);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    const nav = screen.getByRole('navigation', { name: /related cash management shortcuts/i });
    expect(within(nav).getByText('Cash Management Shortcuts')).toBeInTheDocument();
  });

  it('marks CASH TRANSACTIONS as the active anchor and does not render it as a button', async () => {
    mockFetchOnce([saleTxn]);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    const nav = screen.getByRole('navigation', { name: /related cash management shortcuts/i });
    const activeAnchor = within(nav).getByText('CASH TRANSACTIONS');
    expect(activeAnchor.closest('[aria-current="page"]')).toBeInTheDocument();
    expect(activeAnchor.closest('button')).not.toBeInTheDocument();
  });

  it.each([
    ['CASH DRAWERS', 'cash-drawers'],
    ['CASH SHIFTS', 'cash-shifts'],
    ['DRAWER HISTORY', 'cash-drawer-history'],
    ['DRAWER MOVEMENTS', 'cash-movements'],
  ])('calls onNavigate with the correct id when %s is clicked', async (label, id) => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    mockFetchOnce([saleTxn]);
    render(<CashTransactionsView onNavigate={onNavigate} />);
    await screen.findByText('#CT-1');

    await user.click(screen.getByRole('button', { name: new RegExp(label, 'i') }));
    expect(onNavigate).toHaveBeenCalledWith(id);
  });

  it('renders the shortcut bar in the true-empty state', async () => {
    mockFetchOnce([], { ...paginationMeta, total: 0 });
    render(<CashTransactionsView />);
    await screen.findByTestId('cash-transactions-empty-state');

    const nav = screen.getByRole('navigation', { name: /related cash management shortcuts/i });
    expect(within(nav).getByText('DRAWER MOVEMENTS')).toBeInTheDocument();
  });
});
