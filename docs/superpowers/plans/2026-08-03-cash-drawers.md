# Cash Drawers Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cash Drawers monitoring view under MerchantFrame → Restaurant Operations, backed by the already-working `GET/POST/PUT /api/v1/cash-drawers` backend, so Merchant Admins, Store Supervisors, and Head Cashiers can search/filter cash drawer sessions, open new sessions, and close active ones.

**Architecture:** Single-file React view (`CashDrawersView.tsx`) mirroring the existing `OvertimeRulesView.tsx`/`JournalEntriesView.tsx` pattern — colocated form modal, confirm dialog, detail modal, and list, all built on `fetch` + local component state (no external state library). New types live in `src/types/cash-drawer.ts`. Wired into `MerchantFrame.tsx`'s `activeTab` switch; the sidebar menu entry (`cash-drawers` feature under "Restaurant Operations") already exists in `public/Applications.txt`/`Features.txt` — no menu-data changes needed.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4, Vitest + React Testing Library + `@testing-library/user-event`.

## Global Constraints

- Full design spec: `docs/superpowers/specs/2026-08-03-cash-drawers-design.md` — read it before starting; this plan implements it exactly.
- Currency fields render as `$#,##0.00` (`toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`), never raw numbers.
- Never render raw foreign keys (`merchant_id`, `shift_id`, `opened_by`, `closed_by`) in the grid or detail view — always the resolved `name` fields from the API response.
- Status enum is exactly `'Open' | 'Close' | 'Pause'` (the real backend enum) — do not use the story's `OPEN/CLOSED/BALANCED/DISCREPANCY/AUDITING` wording anywhere in code.
- No Edit or Delete actions anywhere in this feature. Only Open (create), Close (update), and View Details (read-only).
- `Shift ID` / `Opened By` / `Closed By` are plain numeric ID inputs in forms — never dropdowns (the list endpoints they'd need are `MERCHANT_ADMIN`-only).
- Follow existing auth/fetch conventions exactly: `getAccessToken()`/`clearAuthSession()` from `src/lib/auth-storage.ts`, `Bearer` header, redirect to `/login` on `401`, `API_BASE = import.meta.env.VITE_API_URL ?? '/api'`.
- Base endpoint is `${API_BASE}/cash-drawers` (no `/v1` segment in code — `API_BASE` already resolves to the versioned prefix, same as every sibling view).

---

## File Structure

```
src/types/cash-drawer.ts                                                  (new)
src/components/MerchantFrame/views/restaurant-operations/
  CashDrawersView.tsx                                                     (new)
  CashDrawersView.test.tsx                                                (new)
src/components/MerchantFrame/MerchantFrame.tsx                            (modify: import + activeTab branch)
```

---

### Task 1: Types + data hydration (fetch on mount, loading, error, 401)

**Files:**
- Create: `src/types/cash-drawer.ts`
- Create: `src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx`
- Test: `src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx`

**Interfaces:**
- Produces: `CashDrawerStatus`, `CashDrawer`, `CreateCashDrawerDto`, `CloseCashDrawerDto`, `CashDrawerPaginationMeta` (all exported from `src/types/cash-drawer.ts`) — every later task imports from here.
- Produces: `CashDrawersView` React component (default + named export) — Task 6 imports this into `MerchantFrame.tsx`.

- [ ] **Step 1: Create the types file**

`src/types/cash-drawer.ts`:

```ts
export type CashDrawerStatus = 'Open' | 'Close' | 'Pause';

export interface CashDrawerMerchantRef {
  id: number;
  name: string;
}

export interface CashDrawerShiftRef {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  status: string;
  merchant: CashDrawerMerchantRef;
}

export interface CashDrawerCollaboratorRef {
  id: number;
  name: string;
  role: string;
}

export interface CashDrawer {
  id: number;
  openingBalance: number;
  currentBalance: number;
  closingBalance: number | null;
  createdAt: string;
  updatedAt: string;
  status: CashDrawerStatus;
  merchant: CashDrawerMerchantRef;
  shift: CashDrawerShiftRef;
  openedByCollaborator: CashDrawerCollaboratorRef;
  closedByCollaborator: CashDrawerCollaboratorRef | null;
}

export interface CreateCashDrawerDto {
  shiftId: number;
  openingBalance: number;
  openedBy: number;
}

export interface CloseCashDrawerDto {
  closingBalance: number;
  closedBy: number;
}

export interface CashDrawerPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
```

- [ ] **Step 2: Write the failing tests for data hydration**

`src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx`:

```tsx
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- CashDrawersView`
Expected: FAIL — `Cannot find module './CashDrawersView'` (file doesn't exist yet).

- [ ] **Step 4: Write the minimal implementation**

`src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type { CashDrawer } from '../../../../types/cash-drawer';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const CashDrawersView: React.FC = () => {
  const [drawers, setDrawers] = useState<CashDrawer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCashDrawers = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const params = new URLSearchParams({ limit: '100', sortBy: 'createdAt', sortOrder: 'DESC' });
      const res = await fetch(`${API_BASE}/cash-drawers?${params.toString()}`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Error al cargar las sesiones de caja');
      }

      const json = await res.json();
      setDrawers(json.data ?? []);
    } catch (err) {
      console.error('Error fetching cash drawers:', err);
      setError('Failed to load cash drawer sessions. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashDrawers();
  }, []);

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchCashDrawers}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      {loading && <p>Loading...</p>}
    </div>
  );
};

export default CashDrawersView;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- CashDrawersView`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/cash-drawer.ts src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx
git commit -m "feat(cash-drawers): add types and data hydration for Cash Drawers view"
```

---

### Task 2: Grid rendering (columns, currency, status badges, true empty state)

**Files:**
- Modify: `src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx`
- Test: `src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx`

**Interfaces:**
- Consumes: `CashDrawer`, `CashDrawerStatus` from `src/types/cash-drawer.ts` (Task 1).
- Produces: exported `formatCurrency(n: number): string`, `formatDateTime(value: string): string`, `STATUS_BADGE_CLASSES: Record<CashDrawerStatus, string>` — reused by Task 5's detail modal.

- [ ] **Step 1: Write the failing tests for grid rendering and true-empty state**

Append to `CashDrawersView.test.tsx` (add these fixtures near the top, after the imports, and these `describe` blocks at the end of the file):

```tsx
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
  closingBalance: 150.5,
  currentBalance: 150.5,
  status: 'Close',
  closedByCollaborator: { id: 11, name: 'Jane Smith', role: 'MANAGER' },
};

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- CashDrawersView`
Expected: FAIL — no table/empty-state markup exists yet.

- [ ] **Step 3: Implement the grid**

Replace the whole file content of `CashDrawersView.tsx` with:

```tsx
import React, { useEffect, useState } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type { CashDrawer, CashDrawerStatus } from '../../../../types/cash-drawer';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const STATUS_BADGE_CLASSES: Record<CashDrawerStatus, string> = {
  Open: 'bg-green-500/10 text-green-600',
  Close: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  Pause: 'bg-amber-500/10 text-amber-600',
};

export function formatCurrency(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDateTime(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export const CashDrawersView: React.FC = () => {
  const [drawers, setDrawers] = useState<CashDrawer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCashDrawers = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const params = new URLSearchParams({ limit: '100', sortBy: 'createdAt', sortOrder: 'DESC' });
      const res = await fetch(`${API_BASE}/cash-drawers?${params.toString()}`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Error al cargar las sesiones de caja');
      }

      const json = await res.json();
      setDrawers(json.data ?? []);
    } catch (err) {
      console.error('Error fetching cash drawers:', err);
      setError('Failed to load cash drawer sessions. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashDrawers();
  }, []);

  const isTrueEmpty = !loading && !error && drawers.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchCashDrawers}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      {isTrueEmpty && (
        <div
          data-testid="cash-drawers-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">point_of_sale</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No cash drawer sessions found. Click &apos;Open Cash Drawer&apos; to initialize a new
            drawer session.
          </p>
        </div>
      )}

      {(loading || drawers.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              CASH DRAWER SESSIONS
            </span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${drawers.length} sessions`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Session ID &amp; Shift
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Opening Balance
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Current Balance
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Closing Balance
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Opened By
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Closed By
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {loading
                  ? [1, 2, 3].map((i) => (
                      <tr key={i}>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                      </tr>
                    ))
                  : drawers.map((drawer) => (
                      <tr key={drawer.id} data-testid={`cash-drawer-row-${drawer.id}`} className="hover:bg-[#f8f3eb] transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17]">
                            #CD-{drawer.id}{' '}
                            <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-700">
                              {drawer.shift.name}
                            </span>
                          </p>
                        </td>
                        <td className="px-6 py-4">{formatCurrency(drawer.openingBalance)}</td>
                        <td className="px-6 py-4">{formatCurrency(drawer.currentBalance)}</td>
                        <td className="px-6 py-4">
                          {drawer.closingBalance == null ? '--' : formatCurrency(drawer.closingBalance)}
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-[#1d1c17]">{drawer.openedByCollaborator.name}</p>
                          <p className="text-[11px] text-[#5f5e5e] mt-1">{formatDateTime(drawer.createdAt)}</p>
                        </td>
                        <td className="px-6 py-4">
                          {drawer.closedByCollaborator ? (
                            <p className="font-semibold text-[#1d1c17]">{drawer.closedByCollaborator.name}</p>
                          ) : (
                            <span className="bg-blue-500/10 text-blue-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              In Service
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[drawer.status]}`}
                          >
                            {drawer.status}
                          </span>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashDrawersView;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- CashDrawersView`
Expected: PASS (all tests from Task 1 and Task 2).

- [ ] **Step 5: Commit**

```bash
git add src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx
git commit -m "feat(cash-drawers): render session grid with currency formatting and status badges"
```

---

### Task 3: Search + status filter + shift ID filter + filtered-empty state

**Files:**
- Modify: `src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx`
- Test: `src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx`

**Interfaces:**
- Consumes: `formatCurrency`, `formatDateTime`, `STATUS_BADGE_CLASSES` (Task 2, unchanged).
- Produces: no new exports — internal filter state only. Later tasks are unaffected by this task's internals.

- [ ] **Step 1: Write the failing tests for filters**

Append to `CashDrawersView.test.tsx`:

```tsx
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
});
```

Add `import userEvent from '@testing-library/user-event';` and `import { waitFor } from '@testing-library/react';` to the existing import list at the top of the file if not already present (`waitFor` is already imported from Task 1; add `userEvent`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- CashDrawersView`
Expected: FAIL — no search/filter controls exist yet.

- [ ] **Step 3: Implement filters**

In `CashDrawersView.tsx`, inside the `CashDrawersView` component:

1. Add filter state right after the existing `drawers`/`loading`/`error` state:

```tsx
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | CashDrawerStatus>('');
  const [shiftIdFilter, setShiftIdFilter] = useState('');
```

2. Replace the `fetchCashDrawers` function's `params` construction with:

```tsx
      const params = new URLSearchParams({ limit: '100', sortBy: 'createdAt', sortOrder: 'DESC' });
      if (statusFilter) params.set('status', statusFilter);
      if (shiftIdFilter.trim()) params.set('shiftId', shiftIdFilter.trim());
```

3. Replace the mount-only `useEffect` with one that also refetches on filter change:

```tsx
  useEffect(() => {
    fetchCashDrawers();
  }, [statusFilter, shiftIdFilter]);
```

4. Add derived filtering and helpers right after `isTrueEmpty`:

```tsx
  const filteredDrawers = React.useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return drawers;
    return drawers.filter((drawer) => {
      const sessionId = `#cd-${drawer.id}`;
      const openedByName = drawer.openedByCollaborator.name.toLowerCase();
      const closedByName = drawer.closedByCollaborator?.name.toLowerCase() ?? '';
      const shiftName = drawer.shift.name.toLowerCase();
      return (
        sessionId.includes(term) ||
        openedByName.includes(term) ||
        closedByName.includes(term) ||
        shiftName.includes(term)
      );
    });
  }, [drawers, searchQuery]);

  const hasActiveFilter = Boolean(searchQuery || statusFilter || shiftIdFilter);
  const isFilteredEmpty = !loading && !error && hasActiveFilter && filteredDrawers.length === 0;

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setShiftIdFilter('');
  };
```

5. Update `isTrueEmpty` to only apply when no filter is active:

```tsx
  const isTrueEmpty = !loading && !error && drawers.length === 0 && !hasActiveFilter;
```

   (Move this line below the `hasActiveFilter` declaration since it now depends on it.)

6. Insert the filter bar as the first child inside the outer `<div className="flex flex-col gap-6 ...">`, right before the `{isTrueEmpty && (...)}` block:

```tsx
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by staff name, shift, or session ID..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search cash drawer sessions"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | CashDrawerStatus)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="Open">Open</option>
          <option value="Close">Closed</option>
          <option value="Pause">Pause</option>
        </select>
        <input
          type="number"
          value={shiftIdFilter}
          onChange={(e) => setShiftIdFilter(e.target.value)}
          placeholder="Shift ID"
          className="w-28 px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by shift ID"
        />
        {hasActiveFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>
```

7. Change the grid section's render condition from `{(loading || drawers.length > 0) && !isTrueEmpty && (` to `{(loading || drawers.length > 0) && !isTrueEmpty && (` — unchanged; but change the count label to reflect filtering:

```tsx
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredDrawers.length} sessions`}
            </span>
```

8. Replace `drawers.map((drawer) => (` in the table body with `filteredDrawers.map((drawer) => (`, and insert a filtered-empty row right before it (inside the ternary, alongside the `loading` branch):

```tsx
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                        <p className="text-sm text-[#5f5e5e]">No cash drawer sessions match your active filters</p>
                        <button type="button" onClick={clearFilters} className="text-[#ae001a] text-sm font-semibold hover:underline">
                          Clear filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDrawers.map((drawer) => (
```

   (Close the added ternary branch's parenthesis/brace to match the existing `))}` that closes the `.map(...)` call — the rest of the row JSX from Task 2 is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- CashDrawersView`
Expected: PASS (all tests from Tasks 1–3).

- [ ] **Step 5: Commit**

```bash
git add src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx
git commit -m "feat(cash-drawers): add search, status/shift filters, and filtered-empty state"
```

---

### Task 4: Open Cash Drawer (create)

**Files:**
- Modify: `src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx`
- Test: `src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx`

**Interfaces:**
- Consumes: `CreateCashDrawerDto` from `src/types/cash-drawer.ts` (Task 1).
- Produces: no new exports — internal `OpenCashDrawerFormModal` component and `toast` state. Task 5 reuses the same `toast` state variable and setter.

- [ ] **Step 1: Write the failing tests for Open Cash Drawer**

Append to `CashDrawersView.test.tsx`:

```tsx
describe('CashDrawersView — Open Cash Drawer', () => {
  it('opens the create modal, validates fields, and submits a new session', async () => {
    mockFetchOnce([]);
    render(<CashDrawersView />);
    await screen.findByTestId('cash-drawers-empty-state');

    await userEvent.click(screen.getByRole('button', { name: /open cash drawer/i }));
    const submitButton = screen.getByRole('button', { name: /open drawer/i });
    expect(submitButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/shift id/i), '3');
    await userEvent.type(screen.getByLabelText(/opening balance/i), '100');
    await userEvent.type(screen.getByLabelText(/opened by/i), '10');
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
    await userEvent.type(screen.getByLabelText(/shift id/i), '3');
    await userEvent.type(screen.getByLabelText(/opening balance/i), '100');
    await userEvent.type(screen.getByLabelText(/opened by/i), '10');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
        json: async () => ({ message: 'There is already an open cash drawer for this shift' }),
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: /open drawer/i }));

    expect(
      await screen.findByText(/there is already an open cash drawer for this shift/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- CashDrawersView`
Expected: FAIL — no "Open Cash Drawer" button/modal exists yet.

- [ ] **Step 3: Implement Open Cash Drawer**

In `CashDrawersView.tsx`:

1. Add imports at the top:

```tsx
import { createPortal } from 'react-dom';
import type { CashDrawer, CashDrawerStatus, CreateCashDrawerDto } from '../../../../types/cash-drawer';
```

(replace the existing `import type { CashDrawer, CashDrawerStatus }` line with the one above, adding `CreateCashDrawerDto`.)

2. Add the form modal component above `CashDrawersView`, after the `formatDateTime` function:

```tsx
interface OpenCashDrawerFormModalProps {
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (dto: CreateCashDrawerDto) => void;
}

const OpenCashDrawerFormModal: React.FC<OpenCashDrawerFormModalProps> = ({ submitting, onCancel, onSubmit }) => {
  const [shiftId, setShiftId] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openedBy, setOpenedBy] = useState('');

  const shiftIdNum = parseInt(shiftId, 10);
  const shiftIdValid = shiftId.trim() !== '' && Number.isInteger(shiftIdNum) && shiftIdNum > 0;

  const openingBalanceNum = parseFloat(openingBalance);
  const openingBalanceValid = openingBalance.trim() !== '' && !isNaN(openingBalanceNum) && openingBalanceNum >= 0;

  const openedByNum = parseInt(openedBy, 10);
  const openedByValid = openedBy.trim() !== '' && Number.isInteger(openedByNum) && openedByNum > 0;

  const isValid = shiftIdValid && openingBalanceValid && openedByValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({ shiftId: shiftIdNum, openingBalance: openingBalanceNum, openedBy: openedByNum });
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Open Cash Drawer"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Open Cash Drawer</span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cash-drawer-shift-id" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Shift ID
              </label>
              <input
                id="cash-drawer-shift-id"
                type="number"
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cash-drawer-opening-balance" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Opening Balance ($)
              </label>
              <input
                id="cash-drawer-opening-balance"
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cash-drawer-opened-by" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Opened By (Collaborator ID)
              </label>
              <input
                id="cash-drawer-opened-by"
                type="number"
                value={openedBy}
                onChange={(e) => setOpenedBy(e.target.value)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
              />
            </div>
          </div>
          <div className="p-4 border-t border-[#e8e2d8] flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
            >
              Open Drawer
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};
```

3. Add state and handler inside `CashDrawersView`, after `clearFilters`:

```tsx
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCreateSubmit = async (dto: CreateCashDrawerDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/cash-drawers`, {
        method: 'POST',
        headers,
        body: JSON.stringify(dto),
      });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to open cash drawer');
      }

      setDrawers((prev) => [json.data, ...prev]);
      setFormModalOpen(false);
      setToast({ message: 'Cash drawer opened successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(false);
      setToast({ message: err.message || 'Failed to open cash drawer', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };
```

4. Add the header "Open Cash Drawer" button inside the filter bar `<div>` from Task 3, right after the `{hasActiveFilter && (...)}` block:

```tsx
        {!isTrueEmpty && (
          <button
            type="button"
            onClick={() => setFormModalOpen(true)}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Open Cash Drawer
          </button>
        )}
```

5. Add a CTA button inside the true-empty state block, right after the message `<p>`:

```tsx
          <button
            type="button"
            onClick={() => setFormModalOpen(true)}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Open Cash Drawer
          </button>
```

6. Add the modal and toast rendering at the end of the component's returned JSX, just before the closing `</div>` of the outer `<div className="flex flex-col gap-6 ...">`:

```tsx
      {formModalOpen && (
        <OpenCashDrawerFormModal
          submitting={formSubmitting}
          onCancel={() => setFormModalOpen(false)}
          onSubmit={handleCreateSubmit}
        />
      )}

      {toast && (
        <div
          className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-3.5 shadow-lg text-white text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          <span className="material-symbols-outlined text-lg">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100 transition-opacity">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- CashDrawersView`
Expected: PASS (all tests from Tasks 1–4).

- [ ] **Step 5: Commit**

```bash
git add src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx
git commit -m "feat(cash-drawers): add Open Cash Drawer creation flow"
```

---

### Task 5: Row actions — View Details and Close Drawer

**Files:**
- Modify: `src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx`
- Test: `src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx`

**Interfaces:**
- Consumes: `CloseCashDrawerDto` from `src/types/cash-drawer.ts` (Task 1); `formatCurrency`, `formatDateTime`, `STATUS_BADGE_CLASSES` (Task 2); `toast`/`setToast` state (Task 4).
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests for View Details and Close Drawer**

Append to `CashDrawersView.test.tsx`:

```tsx
describe('CashDrawersView — View Details', () => {
  it('opens a read-only detail view showing merchant, shift window, balances, and staff roles', async () => {
    mockFetchOnce([closedDrawer]);
    render(<CashDrawersView />);
    await screen.findByText('#CD-2');

    await userEvent.click(screen.getByRole('button', { name: /view cash drawer 2 details/i }));

    expect(await screen.findByRole('dialog', { name: /cash drawer details/i })).toBeInTheDocument();
    expect(screen.getByText('Restaurant ABC')).toBeInTheDocument();
    expect(screen.getByText(/John Doe \(WAITER\)/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith \(MANAGER\)/)).toBeInTheDocument();
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- CashDrawersView`
Expected: FAIL — no Actions column, detail modal, or close dialog exist yet.

- [ ] **Step 3: Implement View Details and Close Drawer**

In `CashDrawersView.tsx`:

1. Update the type import to include `CloseCashDrawerDto`:

```tsx
import type {
  CashDrawer,
  CashDrawerStatus,
  CreateCashDrawerDto,
  CloseCashDrawerDto,
} from '../../../../types/cash-drawer';
```

2. Add the detail modal component, after `OpenCashDrawerFormModal`:

```tsx
interface CashDrawerDetailModalProps {
  drawer: CashDrawer;
  onClose: () => void;
}

const CashDrawerDetailModal: React.FC<CashDrawerDetailModalProps> = ({ drawer, onClose }) => {
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Cash Drawer Details"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">#CD-{drawer.id} Details</span>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Merchant</p>
            <p className="font-bold text-[#1d1c17]">{drawer.merchant.name}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Shift</p>
              <p>{drawer.shift.name}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Shift Window</p>
              <p>
                {formatDateTime(drawer.shift.startTime)} – {formatDateTime(drawer.shift.endTime)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Opening</p>
              <p>{formatCurrency(drawer.openingBalance)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Current</p>
              <p>{formatCurrency(drawer.currentBalance)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Closing</p>
              <p>{drawer.closingBalance == null ? '--' : formatCurrency(drawer.closingBalance)}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Opened By</p>
            <p>
              {drawer.openedByCollaborator.name} ({drawer.openedByCollaborator.role}) —{' '}
              {formatDateTime(drawer.createdAt)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Closed By</p>
            <p>
              {drawer.closedByCollaborator
                ? `${drawer.closedByCollaborator.name} (${drawer.closedByCollaborator.role}) — ${formatDateTime(drawer.updatedAt)}`
                : 'In Service'}
            </p>
          </div>
          <div>
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[drawer.status]}`}
            >
              {drawer.status}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
```

3. Add the close-confirm dialog component, after `CashDrawerDetailModal`:

```tsx
interface CloseCashDrawerDialogProps {
  drawer: CashDrawer;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (dto: CloseCashDrawerDto) => void;
}

const CloseCashDrawerDialog: React.FC<CloseCashDrawerDialogProps> = ({ drawer, submitting, onCancel, onConfirm }) => {
  const [closingBalance, setClosingBalance] = useState(String(drawer.currentBalance));
  const [closedBy, setClosedBy] = useState('');

  const closingBalanceNum = parseFloat(closingBalance);
  const closingBalanceValid = closingBalance.trim() !== '' && !isNaN(closingBalanceNum) && closingBalanceNum >= 0;

  const closedByNum = parseInt(closedBy, 10);
  const closedByValid = closedBy.trim() !== '' && Number.isInteger(closedByNum) && closedByNum > 0;

  const isValid = closingBalanceValid && closedByValid;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-center p-4">
      <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left">
        <p className="font-bold text-[#1d1c17]">Close cash drawer #CD-{drawer.id}?</p>
        <p className="text-sm text-[#5f5e5e] mt-2">
          Enter the final closing balance and the collaborator closing this session.
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="close-drawer-balance" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Closing Balance ($)
            </label>
            <input
              id="close-drawer-balance"
              type="number"
              step="0.01"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
              className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="close-drawer-closed-by" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Closed By (Collaborator ID)
            </label>
            <input
              id="close-drawer-closed-by"
              type="number"
              value={closedBy}
              onChange={(e) => setClosedBy(e.target.value)}
              className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isValid || submitting}
            onClick={() => onConfirm({ closingBalance: closingBalanceNum, closedBy: closedByNum })}
            className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] disabled:opacity-40 text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
          >
            Confirm Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
```

4. Add state and a submit handler inside `CashDrawersView`, after `handleCreateSubmit`:

```tsx
  const [detailDrawer, setDetailDrawer] = useState<CashDrawer | null>(null);
  const [closingDrawer, setClosingDrawer] = useState<CashDrawer | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);

  const handleCloseSubmit = async (dto: CloseCashDrawerDto) => {
    if (!closingDrawer) return;
    setCloseSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/cash-drawers/${closingDrawer.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(dto),
      });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to close cash drawer');
      }

      setDrawers((prev) => prev.map((d) => (d.id === json.data.id ? json.data : d)));
      setClosingDrawer(null);
      setToast({ message: 'Cash drawer closed successfully', type: 'success' });
    } catch (err: any) {
      setClosingDrawer(null);
      setToast({ message: err.message || 'Failed to close cash drawer', type: 'error' });
    } finally {
      setCloseSubmitting(false);
    }
  };
```

5. Add an "Actions" column header, right after the "Status" `<th>`:

```tsx
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Actions
                  </th>
```

6. Add an actions cell to each data row, right after the status `<td>` (inside `filteredDrawers.map`):

```tsx
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setDetailDrawer(drawer)}
                              aria-label={`View cash drawer ${drawer.id} details`}
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                            >
                              <span className="material-symbols-outlined text-[20px]">visibility</span>
                            </button>
                            {drawer.status === 'Open' && (
                              <button
                                type="button"
                                onClick={() => setClosingDrawer(drawer)}
                                aria-label={`Close cash drawer ${drawer.id}`}
                                className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                              >
                                <span className="material-symbols-outlined text-[20px]">lock</span>
                              </button>
                            )}
                          </div>
                        </td>
```

7. Update `colSpan={7}` to `colSpan={8}` in both the skeleton loading `<tr>` (add one more skeleton `<td>`) and the filtered-empty `<tr>` from Task 3:

```tsx
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
```

   Add this as an 8th skeleton `<td>` in the loading row, and change `colSpan={7}` to `colSpan={8}` in the `isFilteredEmpty` row.

8. Render the new modals at the end of the JSX, alongside `formModalOpen`/`toast`:

```tsx
      {detailDrawer && <CashDrawerDetailModal drawer={detailDrawer} onClose={() => setDetailDrawer(null)} />}

      {closingDrawer && (
        <CloseCashDrawerDialog
          drawer={closingDrawer}
          submitting={closeSubmitting}
          onCancel={() => setClosingDrawer(null)}
          onConfirm={handleCloseSubmit}
        />
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- CashDrawersView`
Expected: PASS (all tests from Tasks 1–5).

- [ ] **Step 5: Commit**

```bash
git add src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.tsx src/components/MerchantFrame/views/restaurant-operations/CashDrawersView.test.tsx
git commit -m "feat(cash-drawers): add View Details and Close Drawer row actions"
```

---

### Task 6: Wire into MerchantFrame.tsx + manual smoke test

**Files:**
- Modify: `src/components/MerchantFrame/MerchantFrame.tsx`

**Interfaces:**
- Consumes: `CashDrawersView` default/named export from Task 1–5's `CashDrawersView.tsx`.
- Produces: nothing new — this is the final integration point.

- [ ] **Step 1: Add the import**

In `src/components/MerchantFrame/MerchantFrame.tsx`, add this line right after the existing `import { PayrollRulesView } from './views/PayrollRulesView';` line (currently line 52):

```tsx
import { CashDrawersView } from './views/restaurant-operations/CashDrawersView';
```

- [ ] **Step 2: Add the `activeTab` branch**

In the same file, find the existing block:

```tsx
    if (activeTab === 'merchant-payroll-rules') {
      return <PayrollRulesView onNavigate={(view) => setActiveTab(view)} />;
    }
```

Add this immediately after it:

```tsx

    if (activeTab === 'cash-drawers') {
      return <CashDrawersView />;
    }
```

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

In the browser:
1. Log in (or use the existing role-simulation controls) as a Merchant Admin on a plan-1 merchant.
2. Confirm "Cash Drawers" appears in the sidebar under "Restaurant Operations" and navigating to it renders the view (empty state if the backend has no cash drawer rows yet, or the grid if it does).
3. Click "Open Cash Drawer", fill in a real `shiftId`/`openedBy` pair that exists in the local backend's seed data, submit, and confirm the new row appears with resolved shift/collaborator names (not raw IDs).
4. Click the lock icon on that new row, close it, and confirm the status badge flips to "Close" and "Closed By" shows a name.
5. Click the eye icon and confirm the detail modal shows merchant/shift/balances/audit info with no edit controls.
6. Type in the search box and confirm client-side filtering narrows the grid; change the Status/Shift ID filters and confirm the network tab shows a refetch with the right query params.

If step 3.2 fails to show "Cash Drawers" in the sidebar, check that the logged-in test user's `Plan_id` is `1` (the `cash-drawers` feature in `public/Features.txt` is gated to `Plan_Id=1`) — this is a test-data issue, not a code bug, and doesn't require touching `Applications.txt`/`Features.txt`.

- [ ] **Step 4: Commit**

```bash
git add src/components/MerchantFrame/MerchantFrame.tsx
git commit -m "feat(cash-drawers): wire Cash Drawers view into the MerchantFrame shell"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass, including the new `CashDrawersView.test.tsx` suite and every pre-existing test file (no regressions).

- [ ] **Step 2: Run a real type check**

Run: `npx tsc --build --noEmit --force`
Expected: no type errors. (Plain `tsc --noEmit` at the repo root is a no-op in this project — it must be `--build --noEmit --force` to actually type-check, per `docs/superpowers/specs`/project memory.)

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no new lint errors introduced by `CashDrawersView.tsx`, `CashDrawersView.test.tsx`, `cash-drawer.ts`, or the `MerchantFrame.tsx` edit.

- [ ] **Step 4: Fix any failures**

If any of Steps 1–3 fail, fix the underlying issue in the relevant task's files and re-run the failing command until it passes. Do not skip or suppress failures.
