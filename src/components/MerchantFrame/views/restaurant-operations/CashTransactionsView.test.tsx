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

describe('CashTransactionsView — View Details modal', () => {
  it('opens the detail modal with full transaction info when View Details is clicked', async () => {
    const user = userEvent.setup();
    mockFetchOnce([saleTxn]);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await user.click(screen.getByRole('button', { name: /view cash transaction 1 details/i }));

    const dialog = screen.getByRole('dialog', { name: /cash transaction details/i });
    expect(within(dialog).getByText('#CT-1')).toBeInTheDocument();
    expect(within(dialog).getByText('#CD-3')).toBeInTheDocument();
    expect(within(dialog).getByText('SALE')).toBeInTheDocument();
    expect(within(dialog).getByText('$125.50')).toBeInTheDocument();
    expect(within(dialog).getByText('#EMP-5')).toBeInTheDocument();
    expect(within(dialog).getByText('Order #200')).toBeInTheDocument();
    expect(within(dialog).getByText('Table 4 dine-in')).toBeInTheDocument();
  });

  it('closes the detail modal when the close button is clicked', async () => {
    const user = userEvent.setup();
    mockFetchOnce([saleTxn]);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-1');

    await user.click(screen.getByRole('button', { name: /view cash transaction 1 details/i }));
    expect(screen.getByRole('dialog', { name: /cash transaction details/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog', { name: /cash transaction details/i })).not.toBeInTheDocument();
  });

  it('shows a dash for orderId and notes when the transaction has neither', async () => {
    const user = userEvent.setup();
    const bareTxn: CashTransaction = { ...saleTxn, id: 9, orderId: null, notes: null };
    mockFetchOnce([bareTxn]);
    render(<CashTransactionsView />);
    await screen.findByText('#CT-9');

    await user.click(screen.getByRole('button', { name: /view cash transaction 9 details/i }));
    const dialog = screen.getByRole('dialog', { name: /cash transaction details/i });
    expect(within(dialog).getAllByText('—').length).toBeGreaterThanOrEqual(2);
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
});
