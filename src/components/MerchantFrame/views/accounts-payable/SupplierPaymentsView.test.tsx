import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { SupplierPaymentsView } from './SupplierPaymentsView';
import type {
  SupplierPayment,
  InvoiceSupplierRef,
  SupplierPaymentAllocation,
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
    company_id: 1,
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
    company_id: 1,
    supplier_id: 20,
    payment_number: 'PAY-2026-0002',
    payment_date: '2026-01-15',
    payment_method: 'cash',
    reference: null,
    total_amount: 500,
    allocated_amount: 120,
    status: 'partially_allocated',
  },
  {
    id: 3,
    company_id: 1,
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

function jsonRes(body: unknown, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

interface InstallOpts {
  payments?: SupplierPayment[];
  suppliers?: InvoiceSupplierRef[];
  allocations?: SupplierPaymentAllocation[];
  items?: unknown[];
}

function installFetch({
  payments = PAYMENTS,
  suppliers = SUPPLIERS,
  allocations = [],
  items = [],
}: InstallOpts = {}) {
  const spy = vi.fn(async (url: string, options?: RequestInit) => {
    const u = String(url);
    const method = options?.method ?? 'GET';

    if (u.includes('/supplier-payment-allocations')) {
      return jsonRes({ data: allocations });
    }
    if (u.includes('/supplier-payment-items')) {
      return jsonRes({ data: items });
    }
    if (u.includes('/suppliers')) {
      return jsonRes({ data: suppliers });
    }
    if (u.includes('/supplier-payments')) {
      const detailMatch = u.match(/supplier-payments\/(\d+)$/);
      if (method === 'GET') {
        if (detailMatch) {
          const p = payments.find((x) => String(x.id) === detailMatch[1]);
          return jsonRes({ data: p ?? null });
        }
        return jsonRes({ data: payments });
      }
      return jsonRes({ data: {} });
    }
    return jsonRes({ data: [] });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('SupplierPaymentsView — states', () => {
  it('shows a loading indicator', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<SupplierPaymentsView />);
    expect(screen.getByText(/Loading\.\.\./i)).toBeInTheDocument();
  });

  it('shows the empty state with the message', async () => {
    installFetch({ payments: [] });
    render(<SupplierPaymentsView />);
    expect(await screen.findByTestId('supplier-payments-empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(/No supplier payments recorded\. Click 'Record Payment' to register a new vendor disbursement\./i),
    ).toBeInTheDocument();
  });

  it('filters out soft-deleted payments', async () => {
    installFetch({ payments: [PAYMENTS[0], { ...PAYMENTS[1], deleted_at: '2026-03-01T00:00:00.000Z' }] });
    render(<SupplierPaymentsView />);
    expect(await screen.findByText('PAY-2026-0001')).toBeInTheDocument();
    expect(screen.queryByText('PAY-2026-0002')).not.toBeInTheDocument();
  });

  it('redirects to login on a 401', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({}, 401)));
    render(<SupplierPaymentsView />);
    await waitFor(() => expect(window.location.href).toBe('/login'));
    // @ts-expect-error restoring
    window.location = originalLocation;
  });
});

describe('SupplierPaymentsView — grid', () => {
  beforeEach(() => installFetch());

  it('renders number, supplier, method and currency', async () => {
    render(<SupplierPaymentsView />);
    expect(await screen.findByText('PAY-2026-0001')).toBeInTheDocument();
    expect(screen.getAllByText('Coca-Cola FEMSA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bank Transfer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$1,000.00').length).toBeGreaterThan(0);
  });

  it('computes the unallocated balance (total - allocated)', async () => {
    render(<SupplierPaymentsView />);
    await screen.findByText('PAY-2026-0002');
    // 500 - 120 = 380
    expect(screen.getByText('$380.00')).toBeInTheDocument();
  });

  it('renders a status badge per payment', async () => {
    render(<SupplierPaymentsView />);
    const row = (await screen.findByText('PAY-2026-0002')).closest('tr')!;
    expect(within(row).getByText('Partially Allocated')).toBeInTheDocument();
  });

  it('renders the transaction reference badge next to the vendor', async () => {
    render(<SupplierPaymentsView />);
    const row = (await screen.findByText('PAY-2026-0001')).closest('tr')!;
    expect(within(row).getByText('TRX-1')).toBeInTheDocument();
  });

  it("labels a 'cancelled' payment as VOIDED", async () => {
    installFetch({
      payments: [{ ...PAYMENTS[0], id: 9, payment_number: 'PAY-VOID-9', status: 'cancelled' }],
    });
    render(<SupplierPaymentsView />);
    const row = (await screen.findByText('PAY-VOID-9')).closest('tr')!;
    expect(within(row).getByText('Voided')).toBeInTheDocument();
  });
});

describe('SupplierPaymentsView — filters', () => {
  beforeEach(() => installFetch());

  it('searches by number, supplier or reference', async () => {
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    await screen.findByText('PAY-2026-0001');

    await user.type(screen.getByLabelText('Search payments'), 'Nestlé');
    expect(screen.getByText('PAY-2026-0002')).toBeInTheDocument();
    expect(screen.queryByText('PAY-2026-0001')).not.toBeInTheDocument();
  });

  it('filters by status', async () => {
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    await screen.findByText('PAY-2026-0001');

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'fully_allocated');
    expect(screen.getByText('PAY-2026-0003')).toBeInTheDocument();
    expect(screen.queryByText('PAY-2026-0001')).not.toBeInTheDocument();
  });

  it('filters by supplier', async () => {
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    await screen.findByText('PAY-2026-0001');

    await user.selectOptions(screen.getByLabelText('Filter by supplier'), '20');
    expect(screen.getByText('PAY-2026-0002')).toBeInTheDocument();
    expect(screen.queryByText('PAY-2026-0001')).not.toBeInTheDocument();
  });

  it('filters by payment method', async () => {
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    await screen.findByText('PAY-2026-0001');

    await user.selectOptions(screen.getByLabelText('Filter by payment method'), 'cash');
    expect(screen.getByText('PAY-2026-0002')).toBeInTheDocument(); // cash
    expect(screen.queryByText('PAY-2026-0001')).not.toBeInTheDocument(); // bank_transfer
    expect(screen.queryByText('PAY-2026-0003')).not.toBeInTheDocument(); // check
  });
});

describe('SupplierPaymentsView — record & lifecycle', () => {
  beforeEach(() => installFetch());

  it('opens the record drawer from the toolbar', async () => {
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    await screen.findByText('PAY-2026-0001');

    await user.click(screen.getByRole('button', { name: /record payment/i }));
    expect(screen.getByRole('dialog', { name: /record payment/i })).toBeInTheDocument();
  });

  it('locks supplier and total when allocated amount > 0', async () => {
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    const row = (await screen.findByText('PAY-2026-0002')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit payment'));
    expect(screen.getByRole('dialog', { name: /edit payment/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Supplier/)).toBeDisabled();
    expect(screen.getByLabelText(/Total Amount/)).toBeDisabled();
    expect(screen.getByLabelText(/Payment Date/)).toBeEnabled();
  });

  it('locks header attributes once the payment is posted (out of draft)', async () => {
    // Posting transition: un pago POSTED con allocated 0 igual bloquea supplier/total.
    installFetch({
      payments: [{ ...PAYMENTS[0], id: 8, payment_number: 'PAY-POSTED-8', status: 'posted', allocated_amount: 0 }],
    });
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    const row = (await screen.findByText('PAY-POSTED-8')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit payment'));
    expect(screen.getByLabelText(/^Supplier/)).toBeDisabled();
    expect(screen.getByLabelText(/Total Amount/)).toBeDisabled();
  });

  it('blocks Fully Allocated unless allocated equals total', async () => {
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    const row = (await screen.findByText('PAY-2026-0002')).closest('tr')!; // allocated 120 !== total 500

    await user.click(within(row).getByLabelText('Edit payment'));
    await user.selectOptions(screen.getByLabelText('Status'), 'fully_allocated');

    expect(screen.getByText(/Cannot mark as Fully Allocated/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save payment/i })).toBeDisabled();
  });

  it('keeps fields editable for a draft payment', async () => {
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    const row = (await screen.findByText('PAY-2026-0001')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit payment'));
    expect(screen.getByLabelText(/^Supplier/)).toBeEnabled();
    expect(screen.getByLabelText(/Total Amount/)).toBeEnabled();
  });
});

describe('SupplierPaymentsView — soft delete', () => {
  it('deletes a zero-allocated payment after confirmation', async () => {
    const spy = installFetch();
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    const row = (await screen.findByText('PAY-2026-0001')).closest('tr')!;

    await user.click(within(row).getByLabelText('Delete payment'));
    expect(screen.getByRole('dialog', { name: /delete payment/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(screen.queryByText('PAY-2026-0001')).not.toBeInTheDocument());
    expect(screen.getByText('Payment deleted successfully')).toBeInTheDocument();

    const deleteCall = spy.mock.calls.find(
      ([url, opts]) =>
        (opts as RequestInit)?.method === 'DELETE' && String(url).includes('supplier-payments/1'),
    );
    expect(deleteCall).toBeTruthy();
  });

  it('blocks deleting a payment with allocations', async () => {
    installFetch();
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    const row = (await screen.findByText('PAY-2026-0002')).closest('tr')!; // allocated 120

    await user.click(within(row).getByLabelText('Delete payment'));

    expect(screen.getByText(/Cannot delete: unlink active allocations/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /delete payment/i })).not.toBeInTheDocument();
  });
});

describe('SupplierPaymentsView — create & edit persistence', () => {
  it('records a payment via POST and prepends it', async () => {
    installFetch();
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    await screen.findByText('PAY-2026-0001');

    const created: SupplierPayment = {
      id: 99,
      company_id: 1,
      supplier_id: 10,
      payment_number: 'PAY-NEW-99',
      payment_date: '2026-05-01',
      payment_method: 'bank_transfer',
      reference: null,
      total_amount: 400,
      allocated_amount: 0,
      status: 'draft',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({ data: created }, 201)));

    await user.click(screen.getByRole('button', { name: /record payment/i }));
    const dialog = screen.getByRole('dialog', { name: /record payment/i });
    await user.selectOptions(within(dialog).getByLabelText(/^Supplier/), '10');
    await user.type(within(dialog).getByLabelText(/Payment Number/), 'PAY-NEW-99');
    await user.type(within(dialog).getByLabelText(/Payment Date/), '2026-05-01');
    await user.type(within(dialog).getByLabelText(/Total Amount/), '400');
    await user.click(within(dialog).getByRole('button', { name: /record payment/i }));

    expect(await screen.findByText('PAY-NEW-99')).toBeInTheDocument();
    expect(screen.getByText('Payment recorded successfully')).toBeInTheDocument();
  });

  it('transitions a draft to Posted via PUT', async () => {
    installFetch();
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    const row = (await screen.findByText('PAY-2026-0001')).closest('tr')!;

    const updated: SupplierPayment = { ...PAYMENTS[0], status: 'posted' };
    const spy = vi.fn().mockResolvedValue(jsonRes({ data: updated }));
    vi.stubGlobal('fetch', spy);

    await user.click(within(row).getByLabelText('Edit payment'));
    await user.selectOptions(screen.getByLabelText('Status'), 'posted');
    await user.click(screen.getByRole('button', { name: /save payment/i }));

    expect(await screen.findByText('Payment updated successfully')).toBeInTheDocument();
    const putCall = spy.mock.calls.find(([, opts]) => (opts as RequestInit)?.method === 'PUT');
    expect(putCall).toBeTruthy();
  });

  it('applies the payment to an outstanding invoice (creates an allocation)', async () => {
    const created: SupplierPayment = {
      id: 99,
      company_id: 1,
      supplier_id: 10,
      payment_number: 'PAY-ALLOC',
      payment_date: '2026-05-01',
      payment_method: 'cash',
      reference: null,
      total_amount: 200,
      allocated_amount: 0,
      status: 'draft',
    };
    const outstanding = [
      {
        id: 501,
        company_id: 1,
        supplier_id: 10,
        invoice_number: 'FAC-500',
        invoice_date: '2026-04-01',
        due_date: '2026-05-01',
        subtotal: 200,
        tax_total: 0,
        total_amount: 200,
        paid_amount: 0,
        balance_due: 200,
        status: 'pending',
      },
    ];
    const spy = vi.fn(async (url: string, options?: RequestInit) => {
      const u = String(url);
      const method = options?.method ?? 'GET';
      if (u.includes('/v1/inventory/suppliers')) return jsonRes({ data: SUPPLIERS });
      if (u.includes('/supplier-invoices')) return jsonRes({ data: outstanding });
      if (u.includes('/supplier-payment-allocations')) return jsonRes({ data: { id: 1 } }, 201);
      if (u.includes('/supplier-payments')) {
        if (method === 'POST') return jsonRes({ data: created }, 201);
        return jsonRes({ data: PAYMENTS });
      }
      return jsonRes({ data: [] });
    });
    vi.stubGlobal('fetch', spy);

    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    await screen.findByText('PAY-2026-0001');
    await user.click(screen.getByRole('button', { name: /record payment/i }));
    const dialog = screen.getByRole('dialog', { name: /record payment/i });

    await user.selectOptions(within(dialog).getByLabelText(/^Supplier/), '10');
    await user.type(within(dialog).getByLabelText(/Payment Number/), 'PAY-ALLOC');
    await user.type(within(dialog).getByLabelText(/Payment Date/), '2026-05-01');
    await user.type(within(dialog).getByLabelText(/Total Amount/), '200');

    // La factura pendiente aparece tras cargar; asignamos 150.
    await user.type(await within(dialog).findByLabelText('Allocate to FAC-500'), '150');
    await user.click(within(dialog).getByRole('button', { name: /record payment/i }));

    expect(await screen.findByText('Payment recorded successfully')).toBeInTheDocument();

    const allocCall = spy.mock.calls.find(
      ([url, opts]) =>
        String(url).includes('/supplier-payment-allocations') &&
        (opts as RequestInit)?.method === 'POST',
    );
    expect(allocCall).toBeTruthy();
    const body = JSON.parse((allocCall![1] as RequestInit).body as string);
    expect(body.payment_id).toBe(99);
    expect(body.document_number).toBe('FAC-500');
    expect(body.document_type).toBe('invoice');
    expect(body.allocated_amount).toBe(150);
  });
});

describe('SupplierPaymentsView — detail & quick links', () => {
  it('opens the detail drawer and loads allocations', async () => {
    installFetch({
      allocations: [
        {
          id: 501,
          payment_id: 2,
          credit_note_id: null,
          supplier_id: 20,
          document_number: 'INV-777',
          document_type: 'invoice',
          allocated_amount: 120,
        },
      ],
    });
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    await user.click(await screen.findByText('PAY-2026-0002'));

    const dialog = await screen.findByRole('dialog', { name: /payment details/i });
    expect(await within(dialog).findByText('INV-777')).toBeInTheDocument();
  });

  it('shows the payment breakdown items in the detail drawer', async () => {
    installFetch({
      items: [
        {
          id: 601,
          payment_id: 2,
          document_number: 'FAC-555',
          document_type: 'invoice',
          amount: 250,
        },
      ],
    });
    const user = userEvent.setup();
    render(<SupplierPaymentsView />);
    await user.click(await screen.findByText('PAY-2026-0002'));

    const dialog = await screen.findByRole('dialog', { name: /payment details/i });
    expect(within(dialog).getByText(/Breakdown Items/i)).toBeInTheDocument();
    expect(await within(dialog).findByText('FAC-555')).toBeInTheDocument();
  });

  it('exposes a PAYMENT ALLOCATIONS shortcut that navigates', async () => {
    installFetch();
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SupplierPaymentsView onNavigate={onNavigate} />);
    await screen.findByText('PAY-2026-0001');

    await user.click(screen.getByRole('button', { name: /payment allocations/i }));
    expect(onNavigate).toHaveBeenCalledWith('supplier-payments-allocation');
  });

  it('excludes the active workspace (payments) from the quick-launch panel', async () => {
    installFetch();
    render(<SupplierPaymentsView />);
    await screen.findByText('PAY-2026-0001');

    // El workspace activo no se ofrece como acción; los otros sí.
    expect(
      screen.queryByRole('button', { name: /payments & disbursements/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /credit notes/i })).toBeInTheDocument();
  });

  it('navigates to supplier invoices from the quick links', async () => {
    installFetch();
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SupplierPaymentsView onNavigate={onNavigate} />);
    await screen.findByText('PAY-2026-0001');

    await user.click(screen.getByRole('button', { name: /supplier invoices/i }));
    expect(onNavigate).toHaveBeenCalledWith('supplier-invoices');
  });
});
