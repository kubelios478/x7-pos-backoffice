import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CashShiftsView, formatDateTime } from './CashShiftsView';
import type { CashShift } from '../../../../types/cash-shift';
import type { CashDrawer } from '../../../../types/cash-drawer';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

export function mockFetchOnce(data: CashShift[], status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: async () => ({ statusCode: status, message: 'ok', data }),
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const openShift: CashShift = {
  id: 1,
  merchantId: 10,
  cashDrawerId: 3,
  openingBalance: 100,
  systemAmount: null,
  declaredAmount: null,
  difference: null,
  status: 'OPEN',
  openedAt: '2026-08-05T08:00:00Z',
  closedAt: null,
  openedByCollaborator: { id: 10, name: 'John Doe', role: 'WAITER' },
  closedByCollaborator: null,
};

const closedShift: CashShift = {
  ...openShift,
  id: 2,
  cashDrawerId: 4,
  systemAmount: 120,
  declaredAmount: 120,
  difference: 0,
  status: 'CLOSED',
  closedAt: '2026-08-05T16:00:00Z',
  openedByCollaborator: { id: 12, name: 'Alice Brown', role: 'HOST' },
  closedByCollaborator: { id: 11, name: 'Jane Smith', role: 'MANAGER' },
};

const discrepancyShift: CashShift = {
  ...closedShift,
  id: 5,
  cashDrawerId: 6,
  systemAmount: 120,
  declaredAmount: 100,
  difference: -20,
  status: 'DISCREPANCY',
};

describe('CashShiftsView — data fetch', () => {
  it('fetches cash shifts on mount with no query params', async () => {
    mockFetchOnce([]);
    render(<CashShiftsView />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/cash-shifts'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }),
        }),
      );
    });
    const calledUrl = (fetch as any).mock.calls[0][0] as string;
    expect(calledUrl.endsWith('/cash-shifts')).toBe(true);
  });

  it('shows a loading indicator while fetching', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<CashShiftsView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error card with retry when the fetch fails', async () => {
    mockFetchOnce([], 500);
    render(<CashShiftsView />);

    expect(await screen.findByText(/Failed to load cash shift sessions/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
  });

  it('redirects to login on a 401 response', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };

    mockFetchOnce([], 401);
    render(<CashShiftsView />);

    await waitFor(() => expect(window.location.href).toBe('/login'));

    // @ts-expect-error restoring original Location object
    window.location = originalLocation;
  });

  it('shows the empty state when there are no sessions', async () => {
    mockFetchOnce([]);
    render(<CashShiftsView />);
    expect(await screen.findByTestId('cash-shifts-empty-state')).toBeInTheDocument();
  });
});

describe('CashShiftsView — grid rendering', () => {
  it('renders session id, drawer badge, balances, staff, and status for each row', async () => {
    mockFetchOnce([openShift, closedShift]);
    render(<CashShiftsView />);

    expect(await screen.findByText('#CS-1')).toBeInTheDocument();
    expect(screen.getByText('#CD-3')).toBeInTheDocument();
    // Both openShift and closedShift share the same literal openingBalance (100)
    // in this fixture set, so "$100.00" legitimately appears in more than one
    // row — assert presence, not singularity, matching the OPEN/CLOSED pattern below.
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('In Service')).toBeInTheDocument();
    expect(screen.getAllByText('OPEN').length).toBeGreaterThan(0);

    expect(screen.getByText('#CS-2')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getAllByText('CLOSED').length).toBeGreaterThan(0);
  });

  it('renders a Discrepancy badge for shifts with a non-zero difference', async () => {
    mockFetchOnce([discrepancyShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-5');
    expect(screen.getByText('DISCREPANCY')).toBeInTheDocument();
  });

  it('never renders raw foreign key values as bare text', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    expect(screen.queryByText('10', { selector: 'td' })).not.toBeInTheDocument();
  });
});

describe('CashShiftsView — detail modal', () => {
  it('opens the detail modal with full reconciliation data for a closed shift', async () => {
    mockFetchOnce([closedShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-2');

    await userEvent.click(screen.getByRole('button', { name: /view cash shift 2 details/i }));
    const dialog = await screen.findByRole('dialog', { name: /cash shift details/i });

    expect(within(dialog).getByText('#CD-4')).toBeInTheDocument();
    // `formatDateTime` uses `toLocaleString()` with no fixed timezone, so
    // assert on the timezone-independent parts (name/role) rather than a
    // full formatted timestamp, which would be environment-dependent.
    expect(
      within(dialog).getByText((_, el) => el?.textContent === `Jane Smith (MANAGER) — ${formatDateTime(closedShift.closedAt as string)}`),
    ).toBeInTheDocument();
    // closedShift is a matched reconciliation (systemAmount === declaredAmount === 120),
    // so "$120.00" legitimately renders in both the System and Declared fields —
    // assert presence, not singularity.
    expect(within(dialog).getAllByText('$120.00').length).toBeGreaterThan(0);
  });
});

describe('CashShiftsView — Quick Links', () => {
  it('renders the cash management shortcuts bar', async () => {
    mockFetchOnce([]);
    render(<CashShiftsView />);
    await screen.findByTestId('cash-shifts-empty-state');
    expect(screen.getByRole('navigation', { name: /related cash management shortcuts/i })).toBeInTheDocument();
  });
});

const availableDrawer: CashDrawer = {
  id: 7,
  openingBalance: 0,
  currentBalance: 0,
  closingBalance: null,
  createdAt: '2026-08-05T08:00:00Z',
  updatedAt: '2026-08-05T08:00:00Z',
  status: 'Open',
  merchant: { id: 1, name: 'Restaurant ABC' },
  shift: { id: 1, name: 'Shift 1', startTime: '2026-08-05T08:00:00Z', endTime: '2026-08-05T16:00:00Z', status: 'ACTIVE', merchant: { id: 1, name: 'Restaurant ABC' } },
  openedByCollaborator: { id: 10, name: 'John Doe', role: 'WAITER' },
  closedByCollaborator: null,
};

const busyDrawer: CashDrawer = { ...availableDrawer, id: 3 };
const closedDrawer: CashDrawer = { ...availableDrawer, id: 9, status: 'Close' };

function mockFetchSequence(responses: Array<{ status?: number; data: unknown }>) {
  let call = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const r = responses[Math.min(call, responses.length - 1)];
      call += 1;
      const status = r.status ?? 200;
      return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => ({ statusCode: status, message: 'ok', data: r.data }),
      };
    }),
  );
}

describe('CashShiftsView — Open Cash Shift', () => {
  it('lists only drawers that are Open and have no active shift', async () => {
    // openShift occupies drawer #3 (busyDrawer); drawer #9 is Close; drawer #7 is available.
    mockFetchSequence([
      { data: [openShift] }, // initial GET /cash-shifts (openShift.cashDrawerId === 3)
      { data: [availableDrawer, busyDrawer, closedDrawer] }, // GET /cash-drawers when the modal opens
    ]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /open cash shift/i }));
    const dialog = await screen.findByRole('dialog', { name: /open cash shift/i });
    const select = within(dialog).getByLabelText(/cash drawer/i);

    expect(within(select).getByRole('option', { name: /#CD-7/i })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: /#CD-3/i })).not.toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: /#CD-9/i })).not.toBeInTheDocument();
  });

  it('validates drawer selection and opening balance, submits, and refetches the list', async () => {
    mockFetchSequence([
      { data: [] },
      { data: [availableDrawer] },
    ]);
    render(<CashShiftsView />);
    await screen.findByTestId('cash-shifts-empty-state');

    // The empty state renders its own "Open Cash Shift" CTA alongside the toolbar
    // button (both invoke the same handler), so two elements share this accessible
    // name here — disambiguate rather than assert singularity.
    await userEvent.click(screen.getAllByRole('button', { name: /open cash shift/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: /open cash shift/i });
    const submitButton = within(dialog).getByRole('button', { name: /open shift/i });
    expect(submitButton).toBeDisabled();

    await userEvent.selectOptions(within(dialog).getByLabelText(/cash drawer/i), '7');
    await userEvent.type(within(dialog).getByLabelText(/opening balance/i), '100');
    expect(submitButton).toBeEnabled();

    const newShift: CashShift = { ...openShift, id: 6, cashDrawerId: 7, openingBalance: 100 };
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === 'POST') {
        return { status: 201, ok: true, json: async () => ({ statusCode: 201, message: 'ok', data: newShift }) };
      }
      return { status: 200, ok: true, json: async () => ({ statusCode: 200, message: 'ok', data: [newShift] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/cash-shifts'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cashDrawerId: 7, openingBalance: 100 }),
        }),
      );
    });
    expect(await screen.findByText(/cash shift opened successfully/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /open cash shift/i })).not.toBeInTheDocument();
    expect(await screen.findByText('#CS-6')).toBeInTheDocument();
  });

  it('shows the backend conflict message inline in the dialog and keeps it open', async () => {
    mockFetchSequence([
      { data: [] },
      { data: [availableDrawer] },
    ]);
    render(<CashShiftsView />);
    await screen.findByTestId('cash-shifts-empty-state');

    // The empty state renders its own "Open Cash Shift" CTA alongside the toolbar
    // button (both invoke the same handler), so two elements share this accessible
    // name here — disambiguate rather than assert singularity.
    await userEvent.click(screen.getAllByRole('button', { name: /open cash shift/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: /open cash shift/i });
    await userEvent.selectOptions(within(dialog).getByLabelText(/cash drawer/i), '7');
    await userEvent.type(within(dialog).getByLabelText(/opening balance/i), '100');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
        json: async () => ({
          message:
            'Cash Drawer #7 already has an active shift session (#CS-12) in progress. Please close the active shift before opening a new one.',
        }),
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /open shift/i }));

    await screen.findByText(/cash drawer #7 already has an active shift session \(#cs-12\)/i);
    expect(screen.getByRole('dialog', { name: /open cash shift/i })).toBeInTheDocument();
  });
});
