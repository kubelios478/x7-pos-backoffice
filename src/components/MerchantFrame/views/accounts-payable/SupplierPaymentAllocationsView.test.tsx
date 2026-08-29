import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { SupplierPaymentAllocationsView } from './SupplierPaymentAllocationsView';
import type {
  SupplierPayment,
  SupplierPaymentAllocation,
  SupplierCreditNote,
  SupplierInvoice,
  InvoiceSupplierRef,
} from '../../../../types/accounts-payable';

vi.mock('../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const SUPPLIERS: InvoiceSupplierRef[] = [
  { id: 10, name: 'Coca-Cola FEMSA' },
  { id: 20, name: 'Nestlé Foods' },
];

const PAYMENTS: SupplierPayment[] = [
  {
    id: 1,
    company_id: 3,
    supplier_id: 10,
    payment_number: 'PAY-2026-0001',
    payment_date: '2026-02-01',
    payment_method: 'bank_transfer',
    reference: null,
    total_amount: 1000,
    allocated_amount: 350,
    status: 'partially_allocated',
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
    allocated_amount: 500,
    status: 'fully_allocated',
  },
];

const CREDIT_NOTES: SupplierCreditNote[] = [
  {
    id: 7,
    company_id: 3,
    supplier_id: 10,
    credit_note_number: 'CN-2026-0007',
    issue_date: '2026-02-10',
    total_amount: 400,
    applied_amount: 120,
    status: 'partially_applied',
  },
];

const INVOICES: SupplierInvoice[] = [
  {
    id: 30,
    company_id: 3,
    supplier_id: 10,
    invoice_number: 'FAC-2026-001',
    invoice_date: '2026-01-05',
    due_date: '2026-02-05',
    subtotal: 800,
    tax_total: 0,
    total_amount: 800,
    paid_amount: 350,
    balance_due: 450,
    status: 'partially_paid',
  },
];

const ALLOCATIONS: SupplierPaymentAllocation[] = [
  {
    id: 101,
    payment_id: 1,
    credit_note_id: null,
    supplier_id: 10,
    document_number: 'FAC-2026-001',
    document_type: 'invoice',
    allocated_amount: 350,
    created_at: '2026-03-03T10:30:00.000Z',
  },
  {
    id: 102,
    payment_id: null,
    credit_note_id: 7,
    supplier_id: 10,
    document_number: 'DN-2026-004',
    document_type: 'debit_note',
    allocated_amount: 120,
    created_at: '2026-03-04T09:00:00.000Z',
  },
];

function jsonRes(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function defaultFetch(allocations: SupplierPaymentAllocation[] = ALLOCATIONS) {
  return vi.fn((url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/supplier-payment-allocations')) return jsonRes({ data: allocations });
    if (u.includes('/supplier-payments')) return jsonRes({ data: PAYMENTS });
    if (u.includes('/supplier-credit-notes')) return jsonRes({ data: CREDIT_NOTES });
    if (u.includes('/supplier-invoices')) return jsonRes({ data: INVOICES });
    if (u.includes('/suppliers')) return jsonRes({ data: SUPPLIERS });
    return jsonRes({ data: [] });
  });
}

/** Opens the allocation drawer from the toolbar. */
async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Allocate Payment / Credit' }));
  return screen.findByRole('dialog', { name: /allocate payment \/ credit/i });
}

describe('SupplierPaymentAllocationsView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', defaultFetch());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('dataset hydration and grid mapping', () => {
    it('renders the empty state message when no allocations exist', async () => {
      vi.stubGlobal('fetch', defaultFetch([]));
      render(<SupplierPaymentAllocationsView />);

      const empty = await screen.findByTestId('supplier-payment-allocations-empty-state');
      expect(empty).toHaveTextContent(
        "No payment allocations found. Click 'Allocate Payment' to apply funds or credit notes against pending vendor documents.",
      );
    });

    it('shows the allocation id and formatted timestamp', async () => {
      render(<SupplierPaymentAllocationsView />);

      expect(await screen.findByText('#101')).toBeInTheDocument();
      const grid = within(screen.getByRole('table'));
      expect(grid.getByText('FAC-2026-001')).toBeInTheDocument();
      expect(grid.getByText('$350.00')).toBeInTheDocument();
    });

    it('disambiguates payment-funded from credit-note-funded allocations', async () => {
      render(<SupplierPaymentAllocationsView />);

      await screen.findByText('#101');
      const grid = within(screen.getByRole('table'));
      // Payment-funded row resolves the payment number and carries the voucher badge.
      expect(grid.getByText('PAY-2026-0001')).toBeInTheDocument();
      expect(grid.getByText('Payment Voucher')).toBeInTheDocument();
      // Credit-note-funded row resolves the credit note number instead.
      expect(grid.getByText('CN-2026-0007')).toBeInTheDocument();
      expect(grid.getByText('Credit Note')).toBeInTheDocument();
    });

    it('excludes soft-deleted allocations', async () => {
      vi.stubGlobal(
        'fetch',
        defaultFetch([
          ...ALLOCATIONS,
          {
            id: 999,
            payment_id: 1,
            credit_note_id: null,
            supplier_id: 10,
            document_number: 'ARCHIVED-001',
            document_type: 'invoice',
            allocated_amount: 5,
            created_at: '2026-03-05T09:00:00.000Z',
            deleted_at: '2026-03-06T09:00:00.000Z',
          },
        ]),
      );
      render(<SupplierPaymentAllocationsView />);

      await screen.findByText('#101');
      expect(screen.queryByText('ARCHIVED-001')).not.toBeInTheDocument();
    });

    it('scopes the request when navigated from a payment voucher', async () => {
      const fetchMock = defaultFetch();
      vi.stubGlobal('fetch', fetchMock);
      render(<SupplierPaymentAllocationsView payment={PAYMENTS[0]} />);

      await screen.findByText('#101');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('payment_id=1'),
        expect.anything(),
      );
      expect(screen.getByText(/showing allocations for/i)).toBeInTheDocument();
    });

    it('filters client-side when navigated from a target document', async () => {
      render(<SupplierPaymentAllocationsView documentNumber="DN-2026-004" />);

      await screen.findByText('#102');
      expect(screen.queryByText('#101')).not.toBeInTheDocument();
    });
  });

  describe('search and filters', () => {
    it('searches by target document number', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentAllocationsView />);

      await screen.findByText('#101');
      await user.type(screen.getByLabelText('Search allocations'), 'DN-2026');

      expect(screen.getByText('#102')).toBeInTheDocument();
      expect(screen.queryByText('#101')).not.toBeInTheDocument();
    });

    it('searches by credit note number', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentAllocationsView />);

      await screen.findByText('#101');
      await user.type(screen.getByLabelText('Search allocations'), 'CN-2026-0007');

      expect(screen.getByText('#102')).toBeInTheDocument();
      expect(screen.queryByText('#101')).not.toBeInTheDocument();
    });

    it('filters by direct payment source', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentAllocationsView />);

      await screen.findByText('#101');
      await user.selectOptions(screen.getByLabelText('Filter by allocation source'), 'payment');

      expect(screen.getByText('#101')).toBeInTheDocument();
      expect(screen.queryByText('#102')).not.toBeInTheDocument();
    });

    it('filters by credit note application source', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentAllocationsView />);

      await screen.findByText('#101');
      await user.selectOptions(screen.getByLabelText('Filter by allocation source'), 'credit_note');

      expect(screen.getByText('#102')).toBeInTheDocument();
      expect(screen.queryByText('#101')).not.toBeInTheDocument();
    });

    it('filters by target document type', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentAllocationsView />);

      await screen.findByText('#101');
      await user.selectOptions(screen.getByLabelText('Filter by document type'), 'debit_note');

      expect(screen.getByText('#102')).toBeInTheDocument();
      expect(screen.queryByText('#101')).not.toBeInTheDocument();
    });
  });

  describe('mutual exclusion of funding sources', () => {
    it('disables the credit note selector while the payment source is active', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentAllocationsView />);
      await screen.findByText('#101');
      const dialog = await openDrawer(user);

      expect(within(dialog).getByLabelText(/^payment voucher$/i)).toBeEnabled();
      expect(within(dialog).getByLabelText(/^credit note$/i)).toBeDisabled();
    });

    it('switching to credit note disables and resets the payment selector', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentAllocationsView />);
      await screen.findByText('#101');
      const dialog = await openDrawer(user);

      await user.selectOptions(within(dialog).getByLabelText(/^supplier/i), '10');
      await user.selectOptions(within(dialog).getByLabelText(/^payment voucher$/i), '1');
      expect(within(dialog).getByLabelText(/^payment voucher$/i)).toHaveValue('1');

      await user.click(within(dialog).getByRole('button', { name: /^credit note$/i }));

      expect(within(dialog).getByLabelText(/^payment voucher$/i)).toBeDisabled();
      expect(within(dialog).getByLabelText(/^payment voucher$/i)).toHaveValue('');
      expect(within(dialog).getByLabelText(/^credit note$/i)).toBeEnabled();
    });

    it('keeps submission blocked while no funding source is selected', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentAllocationsView />);
      await screen.findByText('#101');
      const dialog = await openDrawer(user);

      await user.selectOptions(within(dialog).getByLabelText(/^supplier/i), '10');
      await user.selectOptions(within(dialog).getByLabelText(/target document/i), 'FAC-2026-001');
      await user.type(within(dialog).getByLabelText(/allocated amount/i), '50');

      expect(within(dialog).getByRole('button', { name: /allocate funds/i })).toBeDisabled();
    });
  });

  describe('over-allocation prevention', () => {
    it('blocks an amount above the funding source available balance', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentAllocationsView />);
      await screen.findByText('#101');
      const dialog = await openDrawer(user);

      await user.selectOptions(within(dialog).getByLabelText(/^supplier/i), '10');
      await user.selectOptions(within(dialog).getByLabelText(/^payment voucher$/i), '1');
      await user.selectOptions(within(dialog).getByLabelText(/target document/i), 'FAC-2026-001');
      // Payment 1 has 1000 - 350 = 650 available.
      await user.type(within(dialog).getByLabelText(/allocated amount/i), '700');

      expect(
        await within(dialog).findByText(
          'Allocation amount ($700.00) exceeds the available unallocated balance ($650.00) of the selected funding source.',
        ),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /allocate funds/i })).toBeDisabled();
    });

    it('blocks an amount above the credit note unapplied balance', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentAllocationsView />);
      await screen.findByText('#101');
      const dialog = await openDrawer(user);

      await user.selectOptions(within(dialog).getByLabelText(/^supplier/i), '10');
      await user.click(within(dialog).getByRole('button', { name: /^credit note$/i }));
      await user.selectOptions(within(dialog).getByLabelText(/^credit note$/i), '7');
      await user.selectOptions(within(dialog).getByLabelText(/target document/i), 'FAC-2026-001');
      // Credit note 7 has 400 - 120 = 280 available.
      await user.type(within(dialog).getByLabelText(/allocated amount/i), '300');

      expect(
        await within(dialog).findByText(
          'Allocation amount ($300.00) exceeds the available unallocated balance ($280.00) of the selected funding source.',
        ),
      ).toBeInTheDocument();
    });

    it('blocks an amount above the target document outstanding balance', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentAllocationsView />);
      await screen.findByText('#101');
      const dialog = await openDrawer(user);

      await user.selectOptions(within(dialog).getByLabelText(/^supplier/i), '10');
      await user.selectOptions(within(dialog).getByLabelText(/^payment voucher$/i), '1');
      await user.selectOptions(within(dialog).getByLabelText(/target document/i), 'FAC-2026-001');
      // Source allows 650 but the invoice only owes 450.
      await user.type(within(dialog).getByLabelText(/allocated amount/i), '500');

      expect(
        await within(dialog).findByText(
          'Allocation amount ($500.00) exceeds the outstanding balance ($450.00) of the target document.',
        ),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /allocate funds/i })).toBeDisabled();
    });

    it('excludes fully allocated payments from the funding source selector', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentAllocationsView />);
      await screen.findByText('#101');
      const dialog = await openDrawer(user);

      const select = within(dialog).getByLabelText(/^payment voucher$/i);
      // PAY-2026-0002 is fully allocated (500 of 500) → no available balance.
      expect(within(select).queryByText(/PAY-2026-0002/)).not.toBeInTheDocument();
      expect(within(select).getByText(/PAY-2026-0001/)).toBeInTheDocument();
    });
  });

  describe('creation and balance sync', () => {
    it('posts exactly one funding source and nulls the other', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/supplier-payment-allocations') && opts?.method === 'POST') {
          return jsonRes({ data: { id: 200 } }, 201);
        }
        if (u.includes('/supplier-payment-allocations')) return jsonRes({ data: ALLOCATIONS });
        if (u.includes('/supplier-payments')) return jsonRes({ data: PAYMENTS });
        if (u.includes('/supplier-credit-notes')) return jsonRes({ data: CREDIT_NOTES });
        if (u.includes('/supplier-invoices')) return jsonRes({ data: INVOICES });
        if (u.includes('/suppliers')) return jsonRes({ data: SUPPLIERS });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<SupplierPaymentAllocationsView />);
      await screen.findByText('#101');
      const dialog = await openDrawer(user);

      await user.selectOptions(within(dialog).getByLabelText(/^supplier/i), '10');
      await user.click(within(dialog).getByRole('button', { name: /^credit note$/i }));
      await user.selectOptions(within(dialog).getByLabelText(/^credit note$/i), '7');
      await user.selectOptions(within(dialog).getByLabelText(/target document/i), 'FAC-2026-001');
      await user.type(within(dialog).getByLabelText(/allocated amount/i), '100');
      await user.click(within(dialog).getByRole('button', { name: /allocate funds/i }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/supplier-payment-allocations'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              payment_id: null,
              credit_note_id: 7,
              supplier_id: 10,
              document_number: 'FAC-2026-001',
              document_type: 'invoice',
              allocated_amount: 100,
            }),
          }),
        );
      });
      expect(await screen.findByText(/allocation applied successfully/i)).toBeInTheDocument();
    });

    it('re-reads payments and credit notes so recomputed balances surface', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/supplier-payment-allocations') && opts?.method === 'POST') {
          return jsonRes({ data: { id: 200 } }, 201);
        }
        if (u.includes('/supplier-payment-allocations')) return jsonRes({ data: ALLOCATIONS });
        if (u.includes('/supplier-payments')) return jsonRes({ data: PAYMENTS });
        if (u.includes('/supplier-credit-notes')) return jsonRes({ data: CREDIT_NOTES });
        if (u.includes('/supplier-invoices')) return jsonRes({ data: INVOICES });
        if (u.includes('/suppliers')) return jsonRes({ data: SUPPLIERS });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<SupplierPaymentAllocationsView />);
      await screen.findByText('#101');
      const paymentReadsBefore = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/supplier-payments'),
      ).length;

      const dialog = await openDrawer(user);
      await user.selectOptions(within(dialog).getByLabelText(/^supplier/i), '10');
      await user.selectOptions(within(dialog).getByLabelText(/^payment voucher$/i), '1');
      await user.selectOptions(within(dialog).getByLabelText(/target document/i), 'FAC-2026-001');
      await user.type(within(dialog).getByLabelText(/allocated amount/i), '100');
      await user.click(within(dialog).getByRole('button', { name: /allocate funds/i }));

      await waitFor(() => {
        const after = fetchMock.mock.calls.filter((c) =>
          String(c[0]).includes('/supplier-payments'),
        ).length;
        expect(after).toBeGreaterThan(paymentReadsBefore);
      });
    });

    it('surfaces a backend rejection inline and keeps the drawer open', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/supplier-payment-allocations') && opts?.method === 'POST') {
          return jsonRes(
            {
              message:
                'An allocation must be funded by exactly one source: either a payment or a credit note.',
            },
            400,
          );
        }
        if (u.includes('/supplier-payment-allocations')) return jsonRes({ data: ALLOCATIONS });
        if (u.includes('/supplier-payments')) return jsonRes({ data: PAYMENTS });
        if (u.includes('/supplier-credit-notes')) return jsonRes({ data: CREDIT_NOTES });
        if (u.includes('/supplier-invoices')) return jsonRes({ data: INVOICES });
        if (u.includes('/suppliers')) return jsonRes({ data: SUPPLIERS });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<SupplierPaymentAllocationsView />);
      await screen.findByText('#101');
      const dialog = await openDrawer(user);

      await user.selectOptions(within(dialog).getByLabelText(/^supplier/i), '10');
      await user.selectOptions(within(dialog).getByLabelText(/^payment voucher$/i), '1');
      await user.selectOptions(within(dialog).getByLabelText(/target document/i), 'FAC-2026-001');
      await user.type(within(dialog).getByLabelText(/allocated amount/i), '100');
      await user.click(within(dialog).getByRole('button', { name: /allocate funds/i }));

      expect(
        await screen.findByText(
          'An allocation must be funded by exactly one source: either a payment or a credit note.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('dialog', { name: /allocate payment \/ credit/i }),
      ).toBeInTheDocument();
    });
  });

  describe('unlink and balance reversion', () => {
    it('warns which balances are restored before unlinking', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentAllocationsView />);

      await screen.findByText('#101');
      await user.click(screen.getByRole('button', { name: 'Unlink allocation 101' }));

      const dialog = await screen.findByRole('dialog', { name: /unlink allocation/i });
      expect(within(dialog).getByText(/balances will be restored/i)).toBeInTheDocument();
      expect(within(dialog).getByText('PAY-2026-0001')).toBeInTheDocument();
      expect(within(dialog).getByText('FAC-2026-001')).toBeInTheDocument();
    });

    it('soft-deletes the allocation and refreshes the aggregates', async () => {
      const user = userEvent.setup();
      let deleted = false;
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/supplier-payment-allocations/101') && opts?.method === 'DELETE') {
          deleted = true;
          return jsonRes({ data: { id: 101 } });
        }
        if (u.includes('/supplier-payment-allocations')) {
          return jsonRes({ data: deleted ? ALLOCATIONS.slice(1) : ALLOCATIONS });
        }
        if (u.includes('/supplier-payments')) return jsonRes({ data: PAYMENTS });
        if (u.includes('/supplier-credit-notes')) return jsonRes({ data: CREDIT_NOTES });
        if (u.includes('/supplier-invoices')) return jsonRes({ data: INVOICES });
        if (u.includes('/suppliers')) return jsonRes({ data: SUPPLIERS });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<SupplierPaymentAllocationsView />);
      await screen.findByText('#101');
      await user.click(screen.getByRole('button', { name: 'Unlink allocation 101' }));

      const dialog = await screen.findByRole('dialog', { name: /unlink allocation/i });
      await user.click(within(dialog).getByRole('button', { name: /unlink allocation/i }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/supplier-payment-allocations/101'),
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
      await waitFor(() => expect(screen.queryByText('#101')).not.toBeInTheDocument());
      expect(
        await screen.findByText(/allocation unlinked and balances restored/i),
      ).toBeInTheDocument();
    });

    it('reports a failed unlink through an error toast and keeps the row', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/supplier-payment-allocations/101') && opts?.method === 'DELETE') {
          return jsonRes({ message: 'Allocation is locked' }, 400);
        }
        if (u.includes('/supplier-payment-allocations')) return jsonRes({ data: ALLOCATIONS });
        if (u.includes('/supplier-payments')) return jsonRes({ data: PAYMENTS });
        if (u.includes('/supplier-credit-notes')) return jsonRes({ data: CREDIT_NOTES });
        if (u.includes('/supplier-invoices')) return jsonRes({ data: INVOICES });
        if (u.includes('/suppliers')) return jsonRes({ data: SUPPLIERS });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<SupplierPaymentAllocationsView />);
      await screen.findByText('#101');
      await user.click(screen.getByRole('button', { name: 'Unlink allocation 101' }));

      const dialog = await screen.findByRole('dialog', { name: /unlink allocation/i });
      await user.click(within(dialog).getByRole('button', { name: /unlink allocation/i }));

      expect(await screen.findByText('Allocation is locked')).toBeInTheDocument();
      expect(screen.getByText('#101')).toBeInTheDocument();
    });
  });

  describe('detail drawer and navigation hub', () => {
    it('opens the detail drawer with both sides of the allocation', async () => {
      const user = userEvent.setup();
      render(<SupplierPaymentAllocationsView />);

      await user.click(await screen.findByText('#102'));

      const drawer = await screen.findByRole('dialog', { name: /allocation details/i });
      expect(within(drawer).getByText('CN-2026-0007')).toBeInTheDocument();
      expect(within(drawer).getByText('DN-2026-004')).toBeInTheDocument();
      expect(within(drawer).getByText(/Coca-Cola FEMSA/)).toBeInTheDocument();
    });

    it('renders the accounts payable hub with PAYMENT ALLOCATIONS active', async () => {
      render(<SupplierPaymentAllocationsView />);

      await screen.findByText('#101');
      const hub = within(
        screen.getByRole('navigation', { name: /accounts payable workspace shortcuts/i }),
      );
      expect(hub.getByText('PAYMENT ALLOCATIONS')).toHaveAttribute('aria-current', 'page');
      expect(hub.getByRole('button', { name: /supplier invoices/i })).toBeInTheDocument();
    });

    it('routes to another workspace from the hub', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      render(<SupplierPaymentAllocationsView onNavigate={onNavigate} />);

      await screen.findByText('#101');
      const hub = within(
        screen.getByRole('navigation', { name: /accounts payable workspace shortcuts/i }),
      );
      await user.click(hub.getByRole('button', { name: /payments & disbursements/i }));

      expect(onNavigate).toHaveBeenCalledWith('supplier-payments');
    });
  });
});
