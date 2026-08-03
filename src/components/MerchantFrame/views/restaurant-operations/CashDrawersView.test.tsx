import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CashDrawersView } from './CashDrawersView';
import type { CashDrawer } from '../../../../types/cash-drawer';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

export function mockFetchOnce(data: CashDrawer[], status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: async () => ({
        statusCode: status,
        message: 'ok',
        data,
        paginationMeta: { page: 1, limit: 100, total: data.length, totalPages: 1, hasNext: false, hasPrev: false },
      }),
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const openDrawer: CashDrawer = {
  id: 1,
  openingBalance: 100,
  currentBalance: 125.5,
  closingBalance: null,
  createdAt: '2026-08-01T08:00:00Z',
  updatedAt: '2026-08-01T08:00:00Z',
  status: 'Open',
  merchant: { id: 1, name: 'Restaurant ABC' },
  shift: {
    id: 3,
    name: 'Shift 3',
    startTime: '2026-08-01T08:00:00Z',
    endTime: '2026-08-01T16:00:00Z',
    status: 'ACTIVE',
    merchant: { id: 1, name: 'Restaurant ABC' },
  },
  openedByCollaborator: { id: 10, name: 'John Doe', role: 'WAITER' },
  closedByCollaborator: null,
};

const closedDrawer: CashDrawer = {
  ...openDrawer,
  id: 2,
  openingBalance: 150,
  closingBalance: 155.0,
  currentBalance: 150.5,
  status: 'Close',
  openedByCollaborator: { id: 12, name: 'Alice Brown', role: 'HOST' },
  closedByCollaborator: { id: 11, name: 'Jane Smith', role: 'MANAGER' },
};

describe('CashDrawersView — data fetch', () => {
  it('fetches cash drawers on mount with the expected query params', async () => {
    mockFetchOnce([]);
    render(<CashDrawersView />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/cash-drawers?limit=100&sortBy=createdAt&sortOrder=DESC'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }),
        }),
      );
    });
  });

  it('shows a loading indicator while fetching', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<CashDrawersView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error card with retry when the fetch fails', async () => {
    mockFetchOnce([], 500);
    render(<CashDrawersView />);

    expect(await screen.findByText(/Failed to load cash drawer sessions/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
  });

  it('redirects to login on a 401 response', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };

    mockFetchOnce([], 401);
    render(<CashDrawersView />);

    await waitFor(() => expect(window.location.href).toBe('/login'));

    // @ts-expect-error restoring original Location object
    window.location = originalLocation;
  });
});

describe('CashDrawersView — grid rendering', () => {
  it('renders session id, shift badge, balances, staff, and status for each row', async () => {
    mockFetchOnce([openDrawer, closedDrawer]);
    render(<CashDrawersView />);

    expect(await screen.findByText('#CD-1')).toBeInTheDocument();
    expect(screen.getAllByText('Shift 3').length).toBeGreaterThan(0);
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('$125.50')).toBeInTheDocument();
    expect(screen.getByText('--')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('In Service')).toBeInTheDocument();
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);

    expect(screen.getByText('$150.50')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('never renders raw foreign key values', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('10')).not.toBeInTheDocument();
  });
});

describe('CashDrawersView — true empty state', () => {
  it('shows the true-empty state when the API returns zero sessions', async () => {
    mockFetchOnce([]);
    render(<CashDrawersView />);

    expect(await screen.findByTestId('cash-drawers-empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(/No cash drawer sessions found\. Click 'Open Cash Drawer' to initialize a new drawer session\./i),
    ).toBeInTheDocument();
  });
});

describe('CashDrawersView — search and filters', () => {
  it('filters by search text against opener name, closer name, shift name, and session id', async () => {
    mockFetchOnce([openDrawer, closedDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    await userEvent.type(screen.getByLabelText(/search cash drawer sessions/i), 'Jane');

    expect(screen.queryByText('#CD-1')).not.toBeInTheDocument();
    expect(screen.getByText('#CD-2')).toBeInTheDocument();
  });

  it('refetches with a status query param when the status filter changes', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    mockFetchOnce([openDrawer]);
    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'Open');

    await waitFor(() => {
      expect(fetch).toHaveBeenLastCalledWith(
        expect.stringContaining('status=Open'),
        expect.anything(),
      );
    });
  });

  it('refetches with a shiftId query param when the shift ID filter changes', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    mockFetchOnce([openDrawer]);
    await userEvent.type(screen.getByLabelText(/filter by shift id/i), '3');

    await waitFor(() => {
      expect(fetch).toHaveBeenLastCalledWith(
        expect.stringContaining('shiftId=3'),
        expect.anything(),
      );
    });
  });

  it('shows the filtered-empty state and a clear-filters action when a filter matches nothing', async () => {
    mockFetchOnce([openDrawer, closedDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    await userEvent.type(screen.getByLabelText(/search cash drawer sessions/i), 'nonexistent-name');

    expect(screen.getByText(/no cash drawer sessions match your active filters/i)).toBeInTheDocument();
    const clearButton = screen.getByRole('button', { name: /clear filters/i });
    await userEvent.click(clearButton);

    expect(screen.getByText('#CD-1')).toBeInTheDocument();
  });

  it('shows the filtered-empty state and a clear-filters action when a server-side filter legitimately returns zero rows', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    mockFetchOnce([]);
    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'Pause');

    await waitFor(() => {
      expect(fetch).toHaveBeenLastCalledWith(
        expect.stringContaining('status=Pause'),
        expect.anything(),
      );
    });

    expect(screen.getByText(/no cash drawer sessions match your active filters/i)).toBeInTheDocument();
    const clearButton = screen.getByRole('button', { name: /clear filters/i });
    expect(clearButton).toBeInTheDocument();

    mockFetchOnce([openDrawer]);
    await userEvent.click(clearButton);

    expect(await screen.findByText('#CD-1')).toBeInTheDocument();
  });
});

describe('CashDrawersView — Open Cash Drawer', () => {
  it('opens the create modal, validates fields, and submits a new session', async () => {
    mockFetchOnce([]);
    render(<CashDrawersView />);
    await screen.findByTestId('cash-drawers-empty-state');

    await userEvent.click(screen.getByRole('button', { name: /open cash drawer/i }));
    const dialog = screen.getByRole('dialog', { name: /open cash drawer/i });
    const submitButton = within(dialog).getByRole('button', { name: /open drawer/i });
    expect(submitButton).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText(/shift id/i), '3');
    await userEvent.type(within(dialog).getByLabelText(/opening balance/i), '100');
    await userEvent.type(within(dialog).getByLabelText(/opened by/i), '10');
    expect(submitButton).toBeEnabled();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 201,
        ok: true,
        json: async () => ({ statusCode: 201, message: 'ok', data: openDrawer }),
      }),
    );
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/cash-drawers'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ shiftId: 3, openingBalance: 100, openedBy: 10 }),
        }),
      );
    });
    expect(await screen.findByText(/cash drawer opened successfully/i)).toBeInTheDocument();
  });

  it('shows the backend conflict message when a shift already has an open drawer', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    await userEvent.click(screen.getByRole('button', { name: /open cash drawer/i }));
    const dialog = screen.getByRole('dialog', { name: /open cash drawer/i });
    await userEvent.type(within(dialog).getByLabelText(/shift id/i), '3');
    await userEvent.type(within(dialog).getByLabelText(/opening balance/i), '100');
    await userEvent.type(within(dialog).getByLabelText(/opened by/i), '10');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
        json: async () => ({ message: 'There is already an open cash drawer for this shift' }),
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /open drawer/i }));

    expect(
      await screen.findByText(/there is already an open cash drawer for this shift/i),
    ).toBeInTheDocument();
  });
});

describe('CashDrawersView — View Details', () => {
  it('opens a read-only detail view showing merchant, shift window, balances, and staff roles', async () => {
    mockFetchOnce([closedDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-2');

    await userEvent.click(screen.getByRole('button', { name: /view cash drawer 2 details/i }));

    const dialog = await screen.findByRole('dialog', { name: /cash drawer details/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Restaurant ABC')).toBeInTheDocument();
    expect(within(dialog).getByText(/Alice Brown \(HOST\)/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Jane Smith \(MANAGER\)/)).toBeInTheDocument();
  });
});

describe('CashDrawersView — Close Drawer', () => {
  it('only shows the close action for Open sessions', async () => {
    mockFetchOnce([openDrawer, closedDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    expect(screen.getByRole('button', { name: /close cash drawer 1/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close cash drawer 2/i })).not.toBeInTheDocument();
  });

  it('closes a drawer with closing balance and closed by, updating the row in place', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash drawer 1/i }));
    const confirmButton = screen.getByRole('button', { name: /confirm close/i });
    await userEvent.clear(screen.getByLabelText(/closing balance/i));
    await userEvent.type(screen.getByLabelText(/closing balance/i), '150.50');
    await userEvent.type(screen.getByLabelText(/closed by/i), '11');

    const closedResponse: CashDrawer = {
      ...openDrawer,
      closingBalance: 150.5,
      currentBalance: 150.5,
      status: 'Close',
      closedByCollaborator: { id: 11, name: 'Jane Smith', role: 'MANAGER' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ statusCode: 200, message: 'ok', data: closedResponse }),
      }),
    );
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/cash-drawers/1'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ closingBalance: 150.5, closedBy: 11 }),
        }),
      );
    });
    expect(await screen.findByText(/cash drawer closed successfully/i)).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });
});

