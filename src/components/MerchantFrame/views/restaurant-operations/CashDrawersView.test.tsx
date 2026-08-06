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
  vi.useRealTimers();
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
    // "Close" also appears as the status filter dropdown's option label now
    // (Finding 7), so this must tolerate multiple matches.
    expect(screen.getAllByText('Close').length).toBeGreaterThan(0);
  });

  it('never renders raw foreign key values', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('10')).not.toBeInTheDocument();
  });

  it('normalizes numeric-string balances from the API (real decimal-column behavior) and formats them correctly', async () => {
    // The backend's `decimal` columns serialize as JSON strings, e.g. "12345.00".
    // This mocks that real shape (no artificial cast) to verify normalizeDrawer
    // converts it before it ever reaches formatCurrency/state.
    const rawApiDrawer = {
      ...openDrawer,
      id: 3,
      openingBalance: '12345.00',
      currentBalance: '125.50',
    };
    mockFetchOnce([rawApiDrawer as unknown as CashDrawer]);
    render(<CashDrawersView />);
    expect(await screen.findByText('$12,345.00')).toBeInTheDocument();
    expect(await screen.findByText('$125.50')).toBeInTheDocument();
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

  it('labels the status dropdown Close option to match the badge/detail-modal wording (not "Closed")', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    const statusSelect = screen.getByLabelText(/filter by status/i);
    const closeOption = within(statusSelect).getByRole('option', { name: 'Close' });
    expect(closeOption).toHaveValue('Close');
    expect(within(statusSelect).queryByRole('option', { name: 'Closed' })).not.toBeInTheDocument();
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

  it('refetches with a shiftId query param when the shift ID filter changes (after the debounce settles)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    mockFetchOnce([openDrawer]);
    await user.type(screen.getByLabelText(/filter by shift id/i), '3');

    await vi.runAllTimersAsync();

    await waitFor(() => {
      expect(fetch).toHaveBeenLastCalledWith(
        expect.stringContaining('shiftId=3'),
        expect.anything(),
      );
    });

    vi.useRealTimers();
  });

  it('debounces the shift ID filter so rapid typing only triggers one refetch, with the final value', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    // Use a single stable mock for the whole test (rather than re-stubbing
    // via mockFetchOnce mid-test) so its call count accumulates correctly.
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ statusCode: 200, message: 'ok', data: [openDrawer] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    const callsBeforeTyping = fetchMock.mock.calls.length;

    const shiftIdInput = screen.getByLabelText(/filter by shift id/i);
    await user.type(shiftIdInput, '12');

    await vi.runAllTimersAsync();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('shiftId=12'),
        expect.anything(),
      );
    });
    // Exactly one additional fetch fired for the whole rapid-typing sequence.
    expect(fetchMock.mock.calls.length).toBe(callsBeforeTyping + 1);

    vi.useRealTimers();
  });

  it('recovers from a stuck skeleton when Clear Filters is clicked immediately after typing a shiftId, before the debounce commits (regression)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    // A single stable mock (not mockFetchOnce) so its call count accumulates
    // correctly across the whole interaction.
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ statusCode: 200, message: 'ok', data: [openDrawer] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    const callsBeforeInteraction = fetchMock.mock.calls.length;

    // Type into the Shift ID filter, then click Clear Filters *immediately*
    // — well within the 300ms debounce window, before debouncedShiftIdFilter
    // has caught up to what was typed. This is the exact race that used to
    // leave `loading` stuck true forever (the effect never noticing '' -> ''
    // as a change and thus never firing the fetch that flips it back).
    const shiftIdInput = screen.getByLabelText(/filter by shift id/i);
    await user.type(shiftIdInput, '5');
    await user.click(screen.getByRole('button', { name: 'Clear Filters' }));

    // No stuck skeleton: loading must resolve back to false once the fetch
    // clearFilters triggers explicitly resolves.
    await vi.runAllTimersAsync();
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // The grid is back to its real, unfiltered state.
    expect(await screen.findByText('#CD-1')).toBeInTheDocument();
    expect(shiftIdInput).toHaveValue(null);
    expect(screen.queryByRole('button', { name: 'Clear Filters' })).not.toBeInTheDocument();

    // Exactly one additional fetch happened for the whole clear-filters
    // action — no duplicate/racing fetch from the debounce effect also
    // noticing a (would-be) dependency change.
    expect(fetchMock.mock.calls.length).toBe(callsBeforeInteraction + 1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/cash-drawers?limit=100&sortBy=createdAt&sortOrder=DESC'),
      expect.anything(),
    );

    vi.useRealTimers();
  });

  it('ignores a stale in-flight response when a newer filter request has already superseded it', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    let resolveFirst: (value: unknown) => void = () => {};
    let resolveSecond: (value: unknown) => void = () => {};
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    const fetchMock = vi.fn().mockReturnValueOnce(firstResponse).mockReturnValueOnce(secondResponse);
    vi.stubGlobal('fetch', fetchMock);

    // statusFilter is not debounced, so these two selections fire two distinct
    // fetches back to back — the second supersedes the first.
    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'Open');
    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'Pause');

    // The newer (second) request resolves first.
    resolveSecond({
      status: 200,
      ok: true,
      json: async () => ({ statusCode: 200, message: 'ok', data: [closedDrawer] }),
    });
    await screen.findByText('#CD-2');

    // The stale (first) request resolves late — it must be ignored.
    resolveFirst({
      status: 200,
      ok: true,
      json: async () => ({ statusCode: 200, message: 'ok', data: [openDrawer] }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText('#CD-2')).toBeInTheDocument();
    expect(screen.queryByText('#CD-1')).not.toBeInTheDocument();
  });

  it('shows the filtered-empty state and a clear-filters action when a filter matches nothing', async () => {
    mockFetchOnce([openDrawer, closedDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    await userEvent.type(screen.getByLabelText(/search cash drawer sessions/i), 'nonexistent-name');

    expect(screen.getByText(/no cash drawer sessions match your active filters/i)).toBeInTheDocument();
    // Both the toolbar "Clear Filters" button and the in-table "Clear filters"
    // link stay visible while the filtered set is empty — that's intentional
    // redundancy, not a bug (the toolbar button no longer hides itself here).
    const toolbarClearButton = screen.getByRole('button', { name: 'Clear Filters' });
    expect(toolbarClearButton).toBeInTheDocument();
    const inTableClearButton = screen.getByRole('button', { name: 'Clear filters' });
    await userEvent.click(inTableClearButton);

    expect(screen.getByText('#CD-1')).toBeInTheDocument();
  });

  it('keeps the toolbar Clear Filters button visible (no layout shift) even when the filtered result set is empty', async () => {
    mockFetchOnce([openDrawer, closedDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    await userEvent.type(screen.getByLabelText(/search cash drawer sessions/i), 'nonexistent-name');
    expect(screen.getByRole('button', { name: 'Clear Filters' })).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/search cash drawer sessions/i));
    await userEvent.type(screen.getByLabelText(/search cash drawer sessions/i), 'Jane');
    expect(screen.getByRole('button', { name: 'Clear Filters' })).toBeInTheDocument();
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
    const toolbarClearButton = screen.getByRole('button', { name: 'Clear Filters' });
    expect(toolbarClearButton).toBeInTheDocument();

    mockFetchOnce([openDrawer]);
    await userEvent.click(toolbarClearButton);

    expect(await screen.findByText('#CD-1')).toBeInTheDocument();
  });

  it('shows the loading state immediately when clearing filters, avoiding a flash of the true-empty state', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    // Filter down to a legitimate empty server-side result first.
    mockFetchOnce([]);
    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'Pause');
    await screen.findByText(/no cash drawer sessions match your active filters/i);

    // Stall the refetch triggered by Clear Filters so we can inspect the
    // in-between render before it resolves.
    let resolveRefetch: (value: unknown) => void = () => {};
    const pendingRefetch = new Promise((resolve) => {
      resolveRefetch = resolve;
    });
    vi.stubGlobal('fetch', vi.fn(() => pendingRefetch));

    await userEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));

    // clearFilters() sets loading=true synchronously (before the reset filter
    // states even trigger a refetch), so the loading skeleton must be showing
    // now — never the true-empty "no sessions" call-to-action.
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByTestId('cash-drawers-empty-state')).not.toBeInTheDocument();

    resolveRefetch({
      status: 200,
      ok: true,
      json: async () => ({ statusCode: 200, message: 'ok', data: [openDrawer] }),
    });

    expect(await screen.findByText('#CD-1')).toBeInTheDocument();
  });
});

describe('CashDrawersView — Open Cash Drawer', () => {
  it('opens the create modal, validates the opening balance, submits a new session, closes the dialog, and refetches the list', async () => {
    mockFetchOnce([]);
    render(<CashDrawersView />);
    await screen.findByTestId('cash-drawers-empty-state');

    await userEvent.click(screen.getByRole('button', { name: /open cash drawer/i }));
    const dialog = screen.getByRole('dialog', { name: /open cash drawer/i });
    const submitButton = within(dialog).getByRole('button', { name: /open drawer/i });
    expect(submitButton).toBeDisabled();

    expect(
      within(dialog).getByText(/your active shift and collaborator profile are assigned automatically/i),
    ).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/shift id/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/opened by/i)).not.toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/opening balance/i), '100');
    expect(submitButton).toBeEnabled();

    // The success path refetches the list instead of splicing the raw POST
    // response into state, so the mock must answer both requests.
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === 'POST') {
        return {
          status: 201,
          ok: true,
          json: async () => ({ statusCode: 201, message: 'ok', data: openDrawer }),
        };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ statusCode: 200, message: 'ok', data: [openDrawer] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/cash-drawers'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ openingBalance: 100 }),
        }),
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/cash-drawers?'),
        expect.objectContaining({ headers: expect.anything() }),
      );
    });
    expect(await screen.findByText(/cash drawer opened successfully/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /open cash drawer/i })).not.toBeInTheDocument();
    expect(await screen.findByText('#CD-1')).toBeInTheDocument();
  });

  it('shows the backend conflict message inline in the dialog, keeps the dialog open, and preserves the typed opening balance on error', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    await userEvent.click(screen.getByRole('button', { name: /open cash drawer/i }));
    const dialog = screen.getByRole('dialog', { name: /open cash drawer/i });
    await userEvent.type(within(dialog).getByLabelText(/opening balance/i), '100');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
        json: async () => ({
          message:
            'An active cash drawer session (#CD-12) is already open for this shift. Please close the active session before opening a new drawer.',
        }),
      }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /open drawer/i }));

    await screen.findByText(/an active cash drawer session \(#cd-12\) is already open for this shift/i);

    const persistedDialog = screen.getByRole('dialog', { name: /open cash drawer/i });
    expect(persistedDialog).toBeInTheDocument();
    expect(
      within(persistedDialog).getByText(/an active cash drawer session \(#cd-12\) is already open for this shift/i),
    ).toBeInTheDocument();
    expect(within(persistedDialog).getByLabelText(/opening balance/i)).toHaveValue(100);
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

  it('closes a drawer with just the closing balance, closes the dialog, and refetches the list', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash drawer 1/i }));
    expect(screen.queryByLabelText(/closed by/i)).not.toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: /confirm close/i });
    await userEvent.clear(screen.getByLabelText(/closing balance/i));
    await userEvent.type(screen.getByLabelText(/closing balance/i), '125.50');

    const closedResponse: CashDrawer = {
      ...openDrawer,
      closingBalance: 125.5,
      currentBalance: 125.5,
      status: 'Close',
      closedByCollaborator: { id: 11, name: 'Jane Smith', role: 'MANAGER' },
    };
    const fetchMock = vi.fn(async (_url: unknown, options?: { method?: string }) => {
      if (options?.method === 'PUT') {
        return {
          status: 200,
          ok: true,
          json: async () => ({ statusCode: 200, message: 'ok', data: closedResponse }),
        };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ statusCode: 200, message: 'ok', data: [closedResponse] }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/cash-drawers/1'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ closingBalance: 125.5 }),
        }),
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/cash-drawers?'),
        expect.objectContaining({ headers: expect.anything() }),
      );
    });
    expect(await screen.findByText(/cash drawer closed successfully/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm close/i })).not.toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('shows a close-drawer error inline in the dialog, keeps it open, and preserves the typed closing balance on error', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    await userEvent.click(screen.getByRole('button', { name: /close cash drawer 1/i }));
    await userEvent.clear(screen.getByLabelText(/closing balance/i));
    await userEvent.type(screen.getByLabelText(/closing balance/i), '150.50');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ message: 'No collaborator profile is linked to your account.' }),
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: /confirm close/i }));

    await screen.findByText(/no collaborator profile is linked to your account/i);

    expect(screen.getByRole('button', { name: /confirm close/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/closing balance/i)).toHaveValue(150.5);
  });

  it('marks the row and detail modal with a Discrepancy badge and a highlighted variance when the closing balance does not match the current balance', async () => {
    const discrepancyDrawer: CashDrawer = {
      ...openDrawer,
      id: 3,
      closingBalance: 90.0,
      currentBalance: 100.0,
      status: 'Discrepancy',
      closedByCollaborator: { id: 11, name: 'Jane Smith', role: 'MANAGER' },
    };
    mockFetchOnce([discrepancyDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-3');

    expect(within(screen.getByTestId('cash-drawer-row-3')).getByText('Discrepancy')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /view cash drawer 3 details/i }));
    const dialog = await screen.findByRole('dialog', { name: /cash drawer details/i });
    expect(within(dialog).getByText('Variance')).toBeInTheDocument();
    expect(within(dialog).getByText('-$10.00')).toBeInTheDocument();
  });
});

describe('CashDrawersView — cash management quick links', () => {
  it('renders all five shortcut anchors', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    const nav = screen.getByRole('navigation', { name: /related cash management shortcuts/i });
    expect(within(nav).getByText('CASH DRAWERS')).toBeInTheDocument();
    expect(within(nav).getByText('CASH SHIFTS')).toBeInTheDocument();
    expect(within(nav).getByText('CASH TRANSACTIONS')).toBeInTheDocument();
    expect(within(nav).getByText('DRAWER HISTORY')).toBeInTheDocument();
    expect(within(nav).getByText('DRAWER MOVEMENTS')).toBeInTheDocument();
  });

  it('renders the Quick Launch panel title and description', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    const nav = screen.getByRole('navigation', { name: /related cash management shortcuts/i });
    expect(within(nav).getByText('Cash Management Shortcuts')).toBeInTheDocument();
    expect(
      within(nav).getByText(
        'Pivot across Cash Drawers, Shifts, Transactions, History, and Movements without leaving the cash management workspace context.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the shortcut bar in the true-empty state', async () => {
    mockFetchOnce([]);
    render(<CashDrawersView />);
    await screen.findByTestId('cash-drawers-empty-state');

    const nav = screen.getByRole('navigation', { name: /related cash management shortcuts/i });
    expect(within(nav).getByText('DRAWER MOVEMENTS')).toBeInTheDocument();
  });

  it('marks CASH DRAWERS as the active anchor and does not render it as a button', async () => {
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    const nav = screen.getByRole('navigation', { name: /related cash management shortcuts/i });
    const activeAnchor = within(nav).getByText('CASH DRAWERS');
    expect(activeAnchor.closest('[aria-current="page"]')).toBeInTheDocument();
    expect(activeAnchor.closest('button')).not.toBeInTheDocument();
  });

  it('calls onNavigate with the cash-shifts id when CASH SHIFTS is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView onNavigate={onNavigate} />);
    await screen.findByText('#CD-1');

    await user.click(screen.getByRole('button', { name: /cash shifts/i }));
    expect(onNavigate).toHaveBeenCalledWith('cash-shifts');
  });

  it('calls onNavigate with the cash-transactions id when CASH TRANSACTIONS is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView onNavigate={onNavigate} />);
    await screen.findByText('#CD-1');

    await user.click(screen.getByRole('button', { name: /cash transactions/i }));
    expect(onNavigate).toHaveBeenCalledWith('cash-transactions');
  });

  it('calls onNavigate with the cash-drawer-history id when DRAWER HISTORY is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView onNavigate={onNavigate} />);
    await screen.findByText('#CD-1');

    await user.click(screen.getByRole('button', { name: /drawer history/i }));
    expect(onNavigate).toHaveBeenCalledWith('cash-drawer-history');
  });

  it('calls onNavigate with the cash-movements id when DRAWER MOVEMENTS is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView onNavigate={onNavigate} />);
    await screen.findByText('#CD-1');

    await user.click(screen.getByRole('button', { name: /drawer movements/i }));
    expect(onNavigate).toHaveBeenCalledWith('cash-movements');
  });

  it('does not throw when a shortcut is clicked and onNavigate is not provided', async () => {
    const user = userEvent.setup();
    mockFetchOnce([openDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-1');

    await user.click(screen.getByRole('button', { name: /cash shifts/i }));
    expect(screen.getByText('#CD-1')).toBeInTheDocument();
  });
});

describe('CashDrawersView — quick create button', () => {
  it('renders a floating quick-create button that opens the Open Cash Drawer modal', async () => {
    mockFetchOnce([]);
    render(<CashDrawersView />);
    await screen.findByTestId('cash-drawers-empty-state');

    await userEvent.click(screen.getByRole('button', { name: /quick create cash drawer/i }));
    expect(await screen.findByRole('dialog', { name: /open cash drawer/i })).toBeInTheDocument();
  });
});

