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
  // The real backend computes a live systemAmount for OPEN shifts too (not just
  // closed ones) — a non-null value here matches actual GET /cash-shifts behavior
  // and guards against the detail modal ever leaking it before close.
  systemAmount: 250,
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

const surplusShift: CashShift = {
  ...closedShift,
  id: 8,
  cashDrawerId: 8,
  systemAmount: 100,
  declaredAmount: 115,
  difference: 15,
  status: 'DISCREPANCY',
};

const auditedShift: CashShift = {
  ...closedShift,
  id: 9,
  cashDrawerId: 9,
  status: 'AUDITED',
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

  it('shows the exact cashier-facing empty state copy', async () => {
    mockFetchOnce([]);
    render(<CashShiftsView />);
    expect(
      await screen.findByText(
        "No cashier shift sessions found. Click 'Open Cash Shift' to start a new cashier session.",
      ),
    ).toBeInTheDocument();
  });
});

describe('CashShiftsView — grid rendering', () => {
  it('renders session id, drawer badge, balances, staff, and status for each row', async () => {
    mockFetchOnce([openShift, closedShift]);
    render(<CashShiftsView />);

    expect(await screen.findByText('#CS-1')).toBeInTheDocument();
    const row1 = screen.getByTestId('cash-shift-row-1');
    expect(within(row1).getByText('#CD-3')).toBeInTheDocument();
    // Both openShift and closedShift share the same literal openingBalance (100)
    // in this fixture set, so "$100.00" legitimately appears in more than one
    // row — assert presence, not singularity, matching the OPEN/CLOSED pattern below.
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
    expect(screen.getByText('John Doe (WAITER)')).toBeInTheDocument();
    expect(screen.getByText('Active Shift')).toBeInTheDocument();
    expect(screen.getAllByText('OPEN').length).toBeGreaterThan(0);

    expect(screen.getByText('#CS-2')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith (MANAGER)')).toBeInTheDocument();
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

  it('shows System Total, Declared Amount, and Variance columns for a closed reconciliation', async () => {
    mockFetchOnce([discrepancyShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-5');

    const row = screen.getByTestId('cash-shift-row-5');
    expect(within(row).getByText('$120.00')).toBeInTheDocument(); // System Total
    // discrepancyShift's openingBalance (100) and declaredAmount (100) share the
    // same literal value, so "$100.00" legitimately appears twice in this row.
    expect(within(row).getAllByText('$100.00').length).toBe(2);
    expect(within(row).getByText('-$20.00')).toHaveClass('text-[#ae001a]');
  });

  it('hides System Total in the grid while the shift is OPEN, even though the fetched record has a non-null value', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    const row = screen.getByTestId('cash-shift-row-1');
    expect(within(row).queryByText('$250.00')).not.toBeInTheDocument();
    // System Total, Declared Amount, and Variance are all "--" while OPEN.
    expect(within(row).getAllByText('--').length).toBe(3);
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

  it('never reveals the live system amount in the detail modal while the shift is OPEN (blind count)', async () => {
    // openShift.systemAmount is a realistic non-null live balance (250), matching
    // real backend behavior for OPEN shifts. The detail modal must still gate it —
    // otherwise a cashier could read it here, close the modal, and type the exact
    // figure into the "blind" Close Shift dialog, defeating the blind-count.
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /view cash shift 1 details/i }));
    const dialog = await screen.findByRole('dialog', { name: /cash shift details/i });

    expect(within(dialog).queryByText('$250.00')).not.toBeInTheDocument();
    expect(within(dialog).getAllByText(/available after close/i).length).toBeGreaterThan(0);
  });

  it('colors the Detail Modal variance green for a surplus', async () => {
    mockFetchOnce([surplusShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-8');

    await userEvent.click(screen.getByRole('button', { name: /view cash shift 8 details/i }));
    const dialog = await screen.findByRole('dialog', { name: /cash shift details/i });

    expect(within(dialog).getByText('+$15.00')).toHaveClass('text-green-600');
  });

  it('colors the Detail Modal variance red for a shortage', async () => {
    mockFetchOnce([discrepancyShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-5');

    await userEvent.click(screen.getByRole('button', { name: /view cash shift 5 details/i }));
    const dialog = await screen.findByRole('dialog', { name: /cash shift details/i });

    expect(within(dialog).getByText('-$20.00')).toHaveClass('text-[#ae001a]');
  });

  it('shows "Active Shift" in the Detail Modal Closed By row for an open shift', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /view cash shift 1 details/i }));
    const dialog = await screen.findByRole('dialog', { name: /cash shift details/i });

    expect(within(dialog).getByText('Active Shift')).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole('button', { name: /open cash shift/i }));
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

    await userEvent.click(screen.getByRole('button', { name: /open cash shift/i }));
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

describe('CashShiftsView — Close Shift', () => {
  it('only shows the close action for OPEN sessions', async () => {
    mockFetchOnce([openShift, closedShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    expect(screen.getByRole('button', { name: /close cash shift 1/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close cash shift 2/i })).not.toBeInTheDocument();
  });

  it('never fetches or renders the system amount in the close dialog (blind count)', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash shift 1/i }));
    const dialog = await screen.findByRole('dialog', { name: /close cash shift/i });

    expect(within(dialog).queryByText(/system amount/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/system/i)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/declared amount/i)).toBeInTheDocument();
  });

  it('closes a shift with just the declared amount and shows a CLOSED reconciliation result', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash shift 1/i }));
    const dialog = await screen.findByRole('dialog', { name: /close cash shift/i });
    await userEvent.type(within(dialog).getByLabelText(/declared amount/i), '120');

    const closedResponse: CashShift = {
      ...openShift,
      systemAmount: 120,
      declaredAmount: 120,
      difference: 0,
      status: 'CLOSED',
      closedAt: '2026-08-05T16:00:00Z',
      closedByCollaborator: { id: 10, name: 'John Doe', role: 'WAITER' },
    };
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === 'POST') {
        return { status: 200, ok: true, json: async () => ({ statusCode: 200, message: 'ok', data: closedResponse }) };
      }
      return { status: 200, ok: true, json: async () => ({ statusCode: 200, message: 'ok', data: [closedResponse] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    await userEvent.click(within(dialog).getByRole('button', { name: /confirm close/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/cash-shifts/1/close'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ declaredAmount: 120 }),
        }),
      );
    });

    const resultDialog = await screen.findByRole('dialog', { name: /shift closed/i });
    // closedResponse is a matched reconciliation (systemAmount === declaredAmount === 120),
    // so "$120.00" legitimately renders in both the System and Declared fields —
    // assert presence, not singularity, matching the same pattern used for the detail modal above.
    expect(within(resultDialog).getAllByText('$120.00').length).toBeGreaterThan(0);
    expect(within(resultDialog).getByText('CLOSED')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /close cash shift/i })).not.toBeInTheDocument();
  });

  it('shows a DISCREPANCY result when the declared amount does not match the system amount', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash shift 1/i }));
    const dialog = await screen.findByRole('dialog', { name: /close cash shift/i });
    await userEvent.type(within(dialog).getByLabelText(/declared amount/i), '100');

    const discrepancyResponse: CashShift = {
      ...openShift,
      systemAmount: 120,
      declaredAmount: 100,
      difference: -20,
      status: 'DISCREPANCY',
      closedAt: '2026-08-05T16:00:00Z',
      closedByCollaborator: { id: 10, name: 'John Doe', role: 'WAITER' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, options?: { method?: string }) => {
        if (options?.method === 'POST') {
          return { status: 200, ok: true, json: async () => ({ statusCode: 200, message: 'ok', data: discrepancyResponse }) };
        }
        return { status: 200, ok: true, json: async () => ({ statusCode: 200, message: 'ok', data: [discrepancyResponse] }) };
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /confirm close/i }));

    const resultDialog = await screen.findByRole('dialog', { name: /shift closed/i });
    expect(within(resultDialog).getByText('DISCREPANCY')).toBeInTheDocument();
    expect(within(resultDialog).getByText('-$20.00')).toBeInTheDocument();
    expect(within(resultDialog).getByText('-$20.00')).toHaveClass('text-[#ae001a]');
  });

  it('shows a green surplus variance in the reconciliation result modal', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash shift 1/i }));
    const dialog = await screen.findByRole('dialog', { name: /close cash shift/i });
    await userEvent.type(within(dialog).getByLabelText(/declared amount/i), '115');

    const surplusResponse: CashShift = {
      ...openShift,
      systemAmount: 100,
      declaredAmount: 115,
      difference: 15,
      status: 'DISCREPANCY',
      closedAt: '2026-08-05T16:00:00Z',
      closedByCollaborator: { id: 10, name: 'John Doe', role: 'WAITER' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, options?: { method?: string }) => {
        if (options?.method === 'POST') {
          return { status: 200, ok: true, json: async () => ({ statusCode: 200, message: 'ok', data: surplusResponse }) };
        }
        return { status: 200, ok: true, json: async () => ({ statusCode: 200, message: 'ok', data: [surplusResponse] }) };
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /confirm close/i }));

    const resultDialog = await screen.findByRole('dialog', { name: /shift closed/i });
    expect(within(resultDialog).getByText('+$15.00')).toHaveClass('text-green-600');
  });

  it('shows a close-shift error inline in the dialog and keeps it open', async () => {
    mockFetchOnce([openShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash shift 1/i }));
    const dialog = await screen.findByRole('dialog', { name: /close cash shift/i });
    await userEvent.type(within(dialog).getByLabelText(/declared amount/i), '100');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ message: 'The cash shift is already closed. Only OPEN cash shifts can be closed.' }),
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /confirm close/i }));

    await screen.findByText(/the cash shift is already closed/i);
    expect(screen.getByRole('dialog', { name: /close cash shift/i })).toBeInTheDocument();
  });
});

describe('CashShiftsView — Audited status', () => {
  it('renders a purple Audited badge for AUDITED shifts', async () => {
    mockFetchOnce([auditedShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-9');

    expect(screen.getAllByText('AUDITED')[0]).toHaveClass('text-purple-700');
  });

  it('offers an Audited option in the status filter', async () => {
    mockFetchOnce([]);
    render(<CashShiftsView />);
    await screen.findByTestId('cash-shifts-empty-state');

    const select = screen.getByLabelText(/filter by status/i);
    expect(within(select).getByRole('option', { name: /audited/i })).toBeInTheDocument();
  });
});

describe('CashShiftsView — Cash Drawer filter', () => {
  it('lists only the drawer IDs present in the fetched shifts', async () => {
    mockFetchOnce([openShift, closedShift]); // drawers #3 and #4
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    const select = screen.getByLabelText(/filter by cash drawer/i);
    expect(within(select).getByRole('option', { name: '#CD-3' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: '#CD-4' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: '#CD-6' })).not.toBeInTheDocument();
  });

  it('filters the grid to only the selected drawer', async () => {
    mockFetchOnce([openShift, closedShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.selectOptions(screen.getByLabelText(/filter by cash drawer/i), '4');

    expect(screen.queryByText('#CS-1')).not.toBeInTheDocument();
    expect(screen.getByText('#CS-2')).toBeInTheDocument();
  });

  it('clears the drawer filter along with the other filters', async () => {
    mockFetchOnce([openShift, closedShift]);
    render(<CashShiftsView />);
    await screen.findByText('#CS-1');

    await userEvent.selectOptions(screen.getByLabelText(/filter by cash drawer/i), '4');
    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(screen.getByLabelText(/filter by cash drawer/i)).toHaveValue('');
    expect(screen.getByText('#CS-1')).toBeInTheDocument();
  });
});

describe('CashShiftsView — quick create button', () => {
  it('renders a floating quick-create button that opens the Open Cash Shift modal', async () => {
    mockFetchOnce([]);
    render(<CashShiftsView />);
    await screen.findByTestId('cash-shifts-empty-state');

    await userEvent.click(screen.getByRole('button', { name: /quick create cash shift/i }));
    expect(await screen.findByRole('dialog', { name: /open cash shift/i })).toBeInTheDocument();
  });
});
