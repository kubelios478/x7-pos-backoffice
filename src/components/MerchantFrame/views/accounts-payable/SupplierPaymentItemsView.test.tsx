import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { SupplierPaymentItemsView } from './SupplierPaymentItemsView';
import type { SupplierPayment, SupplierPaymentItem } from '../../../../types/accounts-payable';

vi.mock('../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const PAYMENTS: SupplierPayment[] = [
  {
    id: 1,
    company_id: 3,
    supplier_id: 10,
    payment_number: 'PAY-2026-0001',
    payment_date: '2026-02-01',
    payment_method: 'bank_transfer',
    reference: 'TRX-1',
    total_amount: 1000,
    allocated_amount: 0,
    status: 'draft',
  },
  {
    id: 2,
    company_id: 3,
    supplier_id: 20,
    payment_number: 'PAY-2026-0002',
    payment_date: '2026-01-15',
    payment_method: 'cash',
    reference: null,
    total_amount: 500,
    allocated_amount: 0,
    status: 'draft',
  },
  // Immobilised parent: posted + fully allocated.
  {
    id: 3,
    company_id: 3,
    supplier_id: 10,
    payment_number: 'PAY-2026-0003',
    payment_date: '2026-03-01',
    payment_method: 'check',
    reference: null,
    total_amount: 300,
    allocated_amount: 300,
    status: 'fully_allocated',
  },
];

const ITEMS: SupplierPaymentItem[] = [
  { id: 11, payment_id: 1, document_number: 'INV-A-001', document_type: 'invoice', amount: 400 },
  { id: 12, payment_id: 1, document_number: 'ADV-A-002', document_type: 'advance', amount: 150 },
  { id: 13, payment_id: 2, document_number: 'DN-B-001', document_type: 'debit_note', amount: 90 },
  // Child of the frozen payment.
  { id: 14, payment_id: 3, document_number: 'INV-C-001', document_type: 'invoice', amount: 300 },
];

function jsonRes(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

/** Default backend: items list, per-payment sibling list, and the payments catalogue. */
function defaultFetch(items: SupplierPaymentItem[] = ITEMS) {
  return vi.fn((url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/supplier-payment-items')) {
      const match = u.match(/payment_id=(\d+)/);
      if (match) {
        const pid = Number(match[1]);
        return jsonRes({ data: items.filter((i) => i.payment_id === pid) });
      }
      return jsonRes({ data: items });
    }
    if (u.includes('/supplier-payments')) {
      return jsonRes({ data: PAYMENTS });
    }
    return jsonRes({ data: [] });
  });
}

describe('SupplierPaymentItemsView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', defaultFetch());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('dataset hydration and grid mapping', () => {
    it('renders the empty state message when no items exist', async () => {
      vi.stubGlobal('fetch', defaultFetch([]));
      render(<SupplierPaymentItemsView />);

      const empty = await screen.findByTestId('supplier-payment-items-empty-state');
      expect(empty).toHaveTextContent(
        "No payment items found for this record. Click 'Add Payment Item' to register document payment details.",
      );
    });

    it('joins each item with its parent payment number', async () => {
      render(<SupplierPaymentItemsView />);

      expect(await screen.findByText('INV-A-001')).toBeInTheDocument();
      // Two items belong to PAY-2026-0001.
      expect(screen.getAllByRole('button', { name: 'PAY-2026-0001' })).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'PAY-2026-0002' })).toBeInTheDocument();
    });

    it('renders the document type as a styled badge and the amount as currency', async () => {
      render(<SupplierPaymentItemsView />);

      await screen.findByText('INV-A-001');
      // Scoped to the grid: the filter dropdown carries the same type labels.
      const grid = within(screen.getByRole('table'));
      expect(grid.getByText('Advance Payment')).toBeInTheDocument();
      expect(grid.getByText('Debit Note')).toBeInTheDocument();
      expect(grid.getByText('$400.00')).toBeInTheDocument();
      expect(grid.getByText('$90.00')).toBeInTheDocument();
    });

    it('excludes soft-deleted items from the active grid', async () => {
      vi.stubGlobal(
        'fetch',
        defaultFetch([
          ...ITEMS,
          {
            id: 99,
            payment_id: 1,
            document_number: 'ARCHIVED-001',
            document_type: 'invoice',
            amount: 10,
            deleted_at: '2026-05-01T00:00:00.000Z',
          },
        ]),
      );
      render(<SupplierPaymentItemsView />);

      await screen.findByText('INV-A-001');
      expect(screen.queryByText('ARCHIVED-001')).not.toBeInTheDocument();
    });

    it('navigates to the payments workspace from the voucher shortcut', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      render(<SupplierPaymentItemsView onNavigate={onNavigate} />);

      await screen.findByText('INV-A-001');
      await user.click(screen.getAllByRole('button', { name: 'PAY-2026-0001' })[0]);

      expect(onNavigate).toHaveBeenCalledWith('supplier-payments');
    });

    it('scopes the request to a parent payment when navigated from a voucher', async () => {
      const fetchMock = defaultFetch();
      vi.stubGlobal('fetch', fetchMock);
      render(<SupplierPaymentItemsView payment={PAYMENTS[1]} />);

      await screen.findByText('DN-B-001');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/supplier-payment-items?payment_id=2'),
        expect.anything(),
      );
      expect(screen.queryByText('INV-A-001')).not.toBeInTheDocument();
      expect(
        screen.getByText(/showing breakdown items for voucher/i),
      ).toBeInTheDocument();
    });
  });

  describe('search and filters', () => {
    it('filters by document number', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentItemsView />);

      await screen.findByText('INV-A-001');
      await user.type(screen.getByLabelText('Search payment items'), 'DN-B');

      expect(screen.getByText('DN-B-001')).toBeInTheDocument();
      expect(screen.queryByText('INV-A-001')).not.toBeInTheDocument();
    });

    it('filters by parent payment number', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentItemsView />);

      await screen.findByText('INV-A-001');
      await user.type(screen.getByLabelText('Search payment items'), 'PAY-2026-0002');

      expect(screen.getByText('DN-B-001')).toBeInTheDocument();
      expect(screen.queryByText('INV-A-001')).not.toBeInTheDocument();
    });

    it('filters by document type', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentItemsView />);

      await screen.findByText('INV-A-001');
      await user.selectOptions(screen.getByLabelText('Filter by document type'), 'advance');

      expect(screen.getByText('ADV-A-002')).toBeInTheDocument();
      expect(screen.queryByText('INV-A-001')).not.toBeInTheDocument();
    });

    it('filters by parent payment selector', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentItemsView />);

      await screen.findByText('INV-A-001');
      await user.selectOptions(screen.getByLabelText('Filter by payment voucher'), '2');

      expect(screen.getByText('DN-B-001')).toBeInTheDocument();
      expect(screen.queryByText('INV-A-001')).not.toBeInTheDocument();
    });

    it('shows a filtered empty state with a clear action', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentItemsView />);

      await screen.findByText('INV-A-001');
      await user.type(screen.getByLabelText('Search payment items'), 'zzzz-nope');

      expect(screen.getByText(/no payment items match your active filters/i)).toBeInTheDocument();
      // The in-grid reset link, not the toolbar one.
      await user.click(
        within(screen.getByRole('table')).getByRole('button', { name: /clear filters/i }),
      );
      expect(screen.getByText('INV-A-001')).toBeInTheDocument();
    });
  });

  describe('create workflow and parent sum validation', () => {
    it('blocks submission until every mandatory field is filled', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentItemsView />);

      await screen.findByText('INV-A-001');
      await user.click(screen.getByRole('button', { name: /^add payment item$/i }));

      const dialog = await screen.findByRole('dialog', { name: /add payment item/i });
      const submit = within(dialog).getByRole('button', { name: /^add payment item$/i });
      expect(submit).toBeDisabled();

      await user.selectOptions(within(dialog).getByLabelText(/payment voucher/i), '1');
      await user.type(within(dialog).getByLabelText(/document number/i), 'INV-NEW-1');
      await user.type(within(dialog).getByLabelText(/^amount/i), '100');

      await waitFor(() => expect(submit).toBeEnabled());
    });

    it('blocks a create whose cumulative total exceeds the parent voucher total', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentItemsView />);

      await screen.findByText('INV-A-001');
      await user.click(screen.getByRole('button', { name: /^add payment item$/i }));

      const dialog = await screen.findByRole('dialog', { name: /add payment item/i });
      await user.selectOptions(within(dialog).getByLabelText(/payment voucher/i), '1');
      await user.type(within(dialog).getByLabelText(/document number/i), 'INV-NEW-1');
      // Payment 1 totals 1000 with 550 already recorded → 500 more overflows it.
      await user.type(within(dialog).getByLabelText(/^amount/i), '500');

      expect(
        await within(dialog).findByText(
          'The total amount of payment items ($1,050.00) cannot exceed the parent payment voucher total ($1,000.00).',
        ),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', { name: /^add payment item$/i }),
      ).toBeDisabled();
    });

    it('posts the new item and refreshes the grid', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/supplier-payment-items') && opts?.method === 'POST') {
          return jsonRes({ data: { id: 20 } }, 201);
        }
        if (u.includes('/supplier-payment-items')) {
          const match = u.match(/payment_id=(\d+)/);
          if (match) {
            const pid = Number(match[1]);
            return jsonRes({ data: ITEMS.filter((i) => i.payment_id === pid) });
          }
          return jsonRes({ data: ITEMS });
        }
        if (u.includes('/supplier-payments')) return jsonRes({ data: PAYMENTS });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<SupplierPaymentItemsView />);
      await screen.findByText('INV-A-001');
      await user.click(screen.getByRole('button', { name: /^add payment item$/i }));

      const dialog = await screen.findByRole('dialog', { name: /add payment item/i });
      await user.selectOptions(within(dialog).getByLabelText(/payment voucher/i), '2');
      await user.type(within(dialog).getByLabelText(/document number/i), 'INV-NEW-9');
      await user.type(within(dialog).getByLabelText(/^amount/i), '100');
      await user.click(within(dialog).getByRole('button', { name: /^add payment item$/i }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/supplier-payment-items'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              payment_id: 2,
              document_number: 'INV-NEW-9',
              document_type: 'invoice',
              amount: 100,
            }),
          }),
        );
      });
      expect(await screen.findByText(/payment item added successfully/i)).toBeInTheDocument();
    });

    it('surfaces a backend rejection inline and keeps the drawer open', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/supplier-payment-items') && opts?.method === 'POST') {
          return jsonRes({ message: 'Backend refused this item' }, 400);
        }
        if (u.includes('/supplier-payment-items')) {
          const match = u.match(/payment_id=(\d+)/);
          if (match) {
            const pid = Number(match[1]);
            return jsonRes({ data: ITEMS.filter((i) => i.payment_id === pid) });
          }
          return jsonRes({ data: ITEMS });
        }
        if (u.includes('/supplier-payments')) return jsonRes({ data: PAYMENTS });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<SupplierPaymentItemsView />);
      await screen.findByText('INV-A-001');
      await user.click(screen.getByRole('button', { name: /^add payment item$/i }));

      const dialog = await screen.findByRole('dialog', { name: /add payment item/i });
      await user.selectOptions(within(dialog).getByLabelText(/payment voucher/i), '2');
      await user.type(within(dialog).getByLabelText(/document number/i), 'INV-NEW-9');
      await user.type(within(dialog).getByLabelText(/^amount/i), '100');
      await user.click(within(dialog).getByRole('button', { name: /^add payment item$/i }));

      expect(await screen.findByText('Backend refused this item')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: /add payment item/i })).toBeInTheDocument();
    });
  });

  describe('posted payment immobility lock', () => {
    it('disables edit and delete for items of a frozen payment', async () => {
      render(<SupplierPaymentItemsView />);

      await screen.findByText('INV-C-001');
      expect(screen.getByRole('button', { name: 'Edit payment item INV-C-001' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Delete payment item INV-C-001' })).toBeDisabled();
      // Items of a draft payment stay editable.
      expect(screen.getByRole('button', { name: 'Edit payment item INV-A-001' })).toBeEnabled();
    });

    it('keeps frozen payments out of the form voucher selector', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentItemsView />);

      await screen.findByText('INV-A-001');
      await user.click(screen.getByRole('button', { name: /^add payment item$/i }));

      const dialog = await screen.findByRole('dialog', { name: /add payment item/i });
      const select = within(dialog).getByLabelText(/payment voucher/i);
      expect(within(select).queryByText(/PAY-2026-0003/)).not.toBeInTheDocument();
      expect(within(select).getByText(/PAY-2026-0001/)).toBeInTheDocument();
    });
  });

  describe('edit workflow', () => {
    it('pre-populates the drawer and PUTs the update', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/supplier-payment-items/12') && opts?.method === 'PUT') {
          return jsonRes({ data: { id: 12 } });
        }
        if (u.includes('/supplier-payment-items')) {
          const match = u.match(/payment_id=(\d+)/);
          if (match) {
            const pid = Number(match[1]);
            return jsonRes({ data: ITEMS.filter((i) => i.payment_id === pid) });
          }
          return jsonRes({ data: ITEMS });
        }
        if (u.includes('/supplier-payments')) return jsonRes({ data: PAYMENTS });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<SupplierPaymentItemsView />);
      await screen.findByText('ADV-A-002');
      await user.click(screen.getByRole('button', { name: 'Edit payment item ADV-A-002' }));

      const dialog = await screen.findByRole('dialog', { name: /edit payment item/i });
      expect(within(dialog).getByLabelText(/document number/i)).toHaveValue('ADV-A-002');
      expect(within(dialog).getByLabelText(/^amount/i)).toHaveValue(150);

      const amountInput = within(dialog).getByLabelText(/^amount/i);
      await user.clear(amountInput);
      await user.type(amountInput, '200');
      await user.click(within(dialog).getByRole('button', { name: /save payment item/i }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/supplier-payment-items/12'),
          expect.objectContaining({ method: 'PUT' }),
        );
      });
    });

    it('excludes the edited item from its own parent sum check', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentItemsView />);

      await screen.findByText('INV-A-001');
      // Item 11 is 400 of payment 1 (total 1000, sibling 150) → 850 is still valid.
      await user.click(screen.getByRole('button', { name: 'Edit payment item INV-A-001' }));

      const dialog = await screen.findByRole('dialog', { name: /edit payment item/i });
      const amountInput = within(dialog).getByLabelText(/^amount/i);
      await user.clear(amountInput);
      await user.type(amountInput, '850');

      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: /save payment item/i })).toBeEnabled(),
      );
      expect(within(dialog).queryByText(/cannot exceed the parent payment voucher/i)).toBeNull();
    });
  });

  describe('soft delete', () => {
    it('deletes the item through the confirmation dialog and drops the row', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/supplier-payment-items/13') && opts?.method === 'DELETE') {
          return jsonRes({ data: { id: 13 } });
        }
        if (u.includes('/supplier-payment-items')) {
          const match = u.match(/payment_id=(\d+)/);
          if (match) {
            const pid = Number(match[1]);
            return jsonRes({ data: ITEMS.filter((i) => i.payment_id === pid) });
          }
          return jsonRes({ data: ITEMS });
        }
        if (u.includes('/supplier-payments')) return jsonRes({ data: PAYMENTS });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<SupplierPaymentItemsView />);
      await screen.findByText('DN-B-001');
      await user.click(screen.getByRole('button', { name: 'Delete payment item DN-B-001' }));

      const dialog = await screen.findByRole('dialog', { name: /delete payment item/i });
      await user.click(within(dialog).getByRole('button', { name: /delete item/i }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/supplier-payment-items/13'),
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
      await waitFor(() => expect(screen.queryByText('DN-B-001')).not.toBeInTheDocument());
    });

    it('reports a failed delete through an error toast', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/supplier-payment-items/13') && opts?.method === 'DELETE') {
          return jsonRes({ message: 'Parent voucher is posted' }, 400);
        }
        if (u.includes('/supplier-payment-items')) return jsonRes({ data: ITEMS });
        if (u.includes('/supplier-payments')) return jsonRes({ data: PAYMENTS });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<SupplierPaymentItemsView />);
      await screen.findByText('DN-B-001');
      await user.click(screen.getByRole('button', { name: 'Delete payment item DN-B-001' }));

      const dialog = await screen.findByRole('dialog', { name: /delete payment item/i });
      await user.click(within(dialog).getByRole('button', { name: /delete item/i }));

      expect(await screen.findByText('Parent voucher is posted')).toBeInTheDocument();
      expect(screen.getByText('DN-B-001')).toBeInTheDocument();
    });
  });

  describe('detail drawer and navigation hub', () => {
    it('opens the detail drawer with the parent voucher summary', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentItemsView />);

      await user.click(await screen.findByText('INV-A-001'));

      const drawer = await screen.findByRole('dialog', { name: /payment item details/i });
      expect(within(drawer).getByText('PAY-2026-0001')).toBeInTheDocument();
      expect(within(drawer).getByText('$400.00')).toBeInTheDocument();
    });

    it('renders the accounts payable hub with PAYMENT ITEMS active', async () => {
      render(<SupplierPaymentItemsView />);

      await screen.findByText('INV-A-001');
      // Scoped to the hub: the grid caption uses the same wording.
      const hub = within(
        screen.getByRole('navigation', { name: /accounts payable workspace shortcuts/i }),
      );
      expect(hub.getByText('PAYMENT ITEMS')).toHaveAttribute('aria-current', 'page');
      expect(hub.getByRole('button', { name: /payment allocations/i })).toBeInTheDocument();
    });
  });
});
