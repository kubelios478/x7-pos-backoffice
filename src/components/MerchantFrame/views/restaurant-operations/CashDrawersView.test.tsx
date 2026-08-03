import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByText('Open')).toBeInTheDocument();

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

