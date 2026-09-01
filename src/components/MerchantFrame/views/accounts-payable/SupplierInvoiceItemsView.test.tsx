import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { SupplierInvoiceItemsView } from './SupplierInvoiceItemsView';
import type {
  SupplierInvoice,
  SupplierInvoiceItem,
  InvoiceProductRef,
} from '../../../../types/accounts-payable';

vi.mock('../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// Factura 1: sin pagos -> mutable. Factura 2: con pagos -> bloqueada.
const INVOICES: SupplierInvoice[] = [
  {
    id: 1,
    company_id: 1,
    supplier_id: 10,
    supplier: { id: 10, name: 'Coca-Cola FEMSA' },
    invoice_number: 'INV-2026-0001',
    invoice_date: '2026-01-05',
    due_date: '2026-02-05',
    subtotal: 700,
    tax_total: 95,
    total_amount: 795,
    paid_amount: 0,
    balance_due: 795,
    status: 'pending',
  },
  {
    id: 2,
    company_id: 1,
    supplier_id: 20,
    supplier: { id: 20, name: 'Nestlé Foods' },
    invoice_number: 'INV-2026-0002',
    invoice_date: '2026-01-10',
    due_date: '2026-02-10',
    subtotal: 10,
    tax_total: 0,
    total_amount: 10,
    paid_amount: 5,
    balance_due: 5,
    status: 'partially_paid',
  },
];

const PRODUCTS: InvoiceProductRef[] = [
  {
    id: 55,
    name: 'Coffee Beans',
    sku: 'CFB-1',
    last_cost: 48,
    variants: [{ id: 561, name: 'Default', sku: 'CFB-1-D', isActive: true }],
  },
  {
    id: 77,
    name: 'Tea Leaves',
    sku: 'TEA-1',
    last_cost: 30,
    variants: [
      { id: 771, name: 'Green', sku: 'TEA-G', isActive: true },
      { id: 772, name: 'Black', sku: 'TEA-B', isActive: true },
    ],
  },
];

const ITEMS: SupplierInvoiceItem[] = [
  {
    id: 101,
    invoice_id: 1,
    invoice: { id: 1, invoice_number: 'INV-2026-0001' },
    product_id: 55,
    variant_id: 561,
    product: { id: 55, name: 'Coffee Beans', sku: 'CFB-1' },
    description: 'Premium coffee beans',
    quantity: 10,
    unit_price: 50,
    tax_amount: 95,
    line_subtotal: 500,
    line_total: 595,
  },
  {
    id: 102,
    invoice_id: 1,
    invoice: { id: 1, invoice_number: 'INV-2026-0001' },
    product_id: null,
    description: 'Consulting service fee',
    quantity: 2,
    unit_price: 100,
    tax_amount: 0,
    line_subtotal: 200,
    line_total: 200,
  },
  {
    id: 103,
    invoice_id: 2,
    invoice: { id: 2, invoice_number: 'INV-2026-0002' },
    product_id: null,
    description: 'Locked settled line',
    quantity: 1,
    unit_price: 10,
    tax_amount: 0,
    line_subtotal: 10,
    line_total: 10,
  },
];

function jsonRes(body: unknown, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

interface InstallOpts {
  items?: SupplierInvoiceItem[];
  invoices?: SupplierInvoice[];
  products?: InvoiceProductRef[];
}

function installFetch({ items = ITEMS, invoices = INVOICES, products = PRODUCTS }: InstallOpts = {}) {
  const spy = vi.fn(async (url: string, options?: RequestInit) => {
    const u = String(url);
    const method = options?.method ?? 'GET';

    if (u.includes('/products')) {
      return jsonRes({ data: products });
    }

    if (u.includes('/supplier-invoice-items')) {
      if (method === 'POST') {
        const body = JSON.parse(String(options?.body ?? '{}'));
        return jsonRes({ data: { id: 999, deleted_at: null, ...body } }, 201);
      }
      if (method === 'PUT') {
        const idMatch = u.match(/supplier-invoice-items\/(\d+)/);
        const body = JSON.parse(String(options?.body ?? '{}'));
        const existing = items.find((it) => String(it.id) === idMatch?.[1]);
        return jsonRes({ data: { ...existing, ...body } });
      }
      if (method === 'DELETE') {
        return jsonRes({});
      }
      return jsonRes({ data: items });
    }

    if (u.includes('/supplier-invoices')) {
      const detailMatch = u.match(/supplier-invoices\/(\d+)/);
      if (detailMatch) {
        const inv = invoices.find((i) => String(i.id) === detailMatch[1]);
        return jsonRes({ data: inv ?? null });
      }
      return jsonRes({ data: invoices });
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

describe('SupplierInvoiceItemsView — loading & empty', () => {
  it('shows a loading indicator while fetching', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<SupplierInvoiceItemsView />);
    expect(screen.getByText(/Loading\.\.\./i)).toBeInTheDocument();
  });

  it('shows the empty-state message when there are zero line items', async () => {
    installFetch({ items: [] });
    render(<SupplierInvoiceItemsView />);
    expect(await screen.findByTestId('supplier-invoice-items-empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(/No itemized invoice lines found\./i),
    ).toBeInTheDocument();
  });
});

describe('SupplierInvoiceItemsView — grid & precision', () => {
  beforeEach(() => installFetch());

  it('renders description, parent invoice number and inventory badge', async () => {
    render(<SupplierInvoiceItemsView />);
    expect(await screen.findByText('Premium coffee beans')).toBeInTheDocument();
    expect(screen.getAllByText('INV-2026-0001').length).toBeGreaterThan(0);
    const row = screen.getByText('Premium coffee beans').closest('tr')!;
    expect(within(row).getByText(/Coffee Beans/)).toBeInTheDocument();
  });

  it('renders quantity without trailing zeros and all money with 2 decimals', async () => {
    render(<SupplierInvoiceItemsView />);
    const row = (await screen.findByText('Premium coffee beans')).closest('tr')!;
    expect(row).toHaveTextContent('10 @ $50.00'); // qty trimmed, unit price money (2 dec)
    expect(row).not.toHaveTextContent('$50.0000'); // ya no 4 decimales en dinero
    expect(row).toHaveTextContent('$595.00'); // line_total
    expect(row).toHaveTextContent('$500.00'); // line_subtotal
  });

  it('marks an unmapped line as a direct expense', async () => {
    render(<SupplierInvoiceItemsView />);
    const row = (await screen.findByText('Consulting service fee')).closest('tr')!;
    expect(within(row).getByText(/Direct Expense/i)).toBeInTheDocument();
  });

  it('resolves the product name from the products list on a flat line', async () => {
    installFetch({
      items: [
        {
          id: 201,
          invoice_id: 1,
          invoice: { id: 1, invoice_number: 'INV-2026-0001' },
          product_id: 55, // sin product embebido → se resuelve desde la lista
          description: 'Flat mapped line',
          quantity: 1,
          unit_price: 10,
          tax_amount: 0,
          line_subtotal: 10,
          line_total: 10,
        },
      ],
    });
    render(<SupplierInvoiceItemsView />);
    const row = (await screen.findByText('Flat mapped line')).closest('tr')!;
    expect(await within(row).findByText(/Coffee Beans/)).toBeInTheDocument();
  });
});

describe('SupplierInvoiceItemsView — filters', () => {
  beforeEach(() => installFetch());

  it('searches across description, product and invoice number', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoiceItemsView />);
    await screen.findByText('Premium coffee beans');

    await user.type(screen.getByLabelText('Search invoice line items'), 'consulting');
    expect(screen.getByText('Consulting service fee')).toBeInTheDocument();
    expect(screen.queryByText('Premium coffee beans')).not.toBeInTheDocument();
  });

  it('filters unmapped (direct expense) lines', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoiceItemsView />);
    await screen.findByText('Premium coffee beans');

    await user.selectOptions(screen.getByLabelText('Filter by inventory link'), 'unmapped');
    expect(screen.getByText('Consulting service fee')).toBeInTheDocument();
    expect(screen.queryByText('Premium coffee beans')).not.toBeInTheDocument();
  });

  it('filters mapped-to-inventory lines', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoiceItemsView />);
    await screen.findByText('Premium coffee beans');

    await user.selectOptions(screen.getByLabelText('Filter by inventory link'), 'mapped');
    expect(screen.getByText('Premium coffee beans')).toBeInTheDocument();
    expect(screen.queryByText('Consulting service fee')).not.toBeInTheDocument();
  });

  it('filters by parent invoice', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoiceItemsView />);
    await screen.findByText('Premium coffee beans');

    await user.selectOptions(screen.getByLabelText('Filter by parent invoice'), '2');
    expect(screen.getByText('Locked settled line')).toBeInTheDocument();
    expect(screen.queryByText('Premium coffee beans')).not.toBeInTheDocument();
  });
});

describe('SupplierInvoiceItemsView — line arithmetic', () => {
  beforeEach(() => installFetch());

  it('computes line subtotal and total in real time', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoiceItemsView />);
    await screen.findByText('Premium coffee beans');
    await user.click(screen.getByRole('button', { name: /add item/i }));

    await user.selectOptions(screen.getByLabelText(/Parent Invoice/), '1');
    await user.type(screen.getByLabelText(/Description/), 'New widget');
    await user.type(screen.getByLabelText(/Quantity/), '10');
    await user.type(screen.getByLabelText(/Unit Price/), '5');
    await user.type(screen.getByLabelText(/Tax Amount/), '2');

    expect(screen.getByTestId('line-subtotal-preview')).toHaveTextContent('$50.00');
    expect(screen.getByTestId('line-total-preview')).toHaveTextContent('$52.00');
  });

  it('auto-fills description and unit price when a product is selected', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoiceItemsView />);
    await screen.findByText('Premium coffee beans');
    await user.click(screen.getByRole('button', { name: /add item/i }));

    await user.selectOptions(screen.getByLabelText(/Inventory Product/), '55');
    expect(screen.getByLabelText(/Description/)).toHaveValue('Coffee Beans');
    expect(screen.getByLabelText(/Unit Price/)).toHaveValue(48);
    // El producto tiene una sola variante activa → se auto-selecciona.
    expect(screen.getByLabelText(/Variant/)).toHaveValue('561');
  });

  it('sends product_id AND variant_id when a product is linked', async () => {
    const spy = installFetch();
    const user = userEvent.setup();
    render(<SupplierInvoiceItemsView />);
    await screen.findByText('Premium coffee beans');
    await user.click(screen.getByRole('button', { name: /add item/i }));

    await user.selectOptions(screen.getByLabelText(/Parent Invoice/), '1');
    await user.selectOptions(screen.getByLabelText(/Inventory Product/), '55');
    await user.type(screen.getByLabelText(/Quantity/), '2');
    await user.click(screen.getByRole('button', { name: /save item/i }));

    await screen.findByText('Line item added successfully');

    const postCall = spy.mock.calls.find(
      ([url, opts]) =>
        (opts as RequestInit)?.method === 'POST' && String(url).includes('supplier-invoice-items'),
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.product_id).toBe(55);
    expect(body.variant_id).toBe(561);
  });

  it('requires a variant before saving when a product with multiple variants is picked', async () => {
    const user = userEvent.setup();
    render(
      <SupplierInvoiceItemsView />,
    );
    await screen.findByText('Premium coffee beans');
    await user.click(screen.getByRole('button', { name: /add item/i }));

    await user.selectOptions(screen.getByLabelText(/Parent Invoice/), '1');
    await user.type(screen.getByLabelText(/Description/), 'Widget');
    await user.type(screen.getByLabelText(/Quantity/), '2');
    await user.type(screen.getByLabelText(/Unit Price/), '5');
    // Selecciona un producto multi-variante → Save queda bloqueado hasta elegir variante.
    await user.selectOptions(screen.getByLabelText(/Inventory Product/), '77');
    expect(screen.getByRole('button', { name: /save item/i })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/Variant/), '772');
    expect(screen.getByRole('button', { name: /save item/i })).toBeEnabled();
  });
});

describe('SupplierInvoiceItemsView — paid invoice lock', () => {
  beforeEach(() => installFetch());

  it('disables row edit/delete actions when the parent invoice is settled', async () => {
    render(<SupplierInvoiceItemsView />);
    const row = (await screen.findByText('Locked settled line')).closest('tr')!;
    expect(within(row).getByLabelText('Edit line item')).toBeDisabled();
    expect(within(row).getByLabelText('Delete line item')).toBeDisabled();
  });

  it('keeps actions enabled when the parent invoice is unpaid', async () => {
    render(<SupplierInvoiceItemsView />);
    const row = (await screen.findByText('Premium coffee beans')).closest('tr')!;
    expect(within(row).getByLabelText('Edit line item')).toBeEnabled();
  });

  it('blocks submission in the form when a locked invoice is selected', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoiceItemsView />);
    await screen.findByText('Premium coffee beans');
    await user.click(screen.getByRole('button', { name: /add item/i }));

    await user.selectOptions(screen.getByLabelText(/Parent Invoice/), '2');
    expect(screen.getByText(/parent invoice has recorded payments/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save item/i })).toBeDisabled();
  });
});

describe('SupplierInvoiceItemsView — parent recalculation', () => {
  it('re-fetches the parent invoice after adding a line item', async () => {
    const spy = installFetch();
    const user = userEvent.setup();
    render(<SupplierInvoiceItemsView />);
    await screen.findByText('Premium coffee beans');
    await user.click(screen.getByRole('button', { name: /add item/i }));

    await user.selectOptions(screen.getByLabelText(/Parent Invoice/), '1');
    await user.type(screen.getByLabelText(/Description/), 'New widget');
    await user.type(screen.getByLabelText(/Quantity/), '3');
    await user.type(screen.getByLabelText(/Unit Price/), '7');
    await user.click(screen.getByRole('button', { name: /save item/i }));

    await screen.findByText('Line item added successfully');

    const postCall = spy.mock.calls.find(
      ([url, opts]) =>
        (opts as RequestInit)?.method === 'POST' && String(url).includes('supplier-invoice-items'),
    );
    expect(postCall).toBeTruthy();

    // Recálculo del padre: GET a la factura padre tras la mutación.
    const refreshCall = spy.mock.calls.find(
      ([url, opts]) =>
        (opts?.method ?? 'GET') === 'GET' && String(url).includes('supplier-invoices/1'),
    );
    expect(refreshCall).toBeTruthy();
  });
});

describe('SupplierInvoiceItemsView — edit & delete persistence', () => {
  it('updates a line item via PATCH and refreshes the parent invoice', async () => {
    const spy = installFetch();
    const user = userEvent.setup();
    render(<SupplierInvoiceItemsView />);
    const row = (await screen.findByText('Premium coffee beans')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit line item'));
    const desc = screen.getByLabelText(/Description/);
    await user.clear(desc);
    await user.type(desc, 'Premium arabica beans');
    await user.click(screen.getByRole('button', { name: /save item/i }));

    expect(await screen.findByText('Line item updated successfully')).toBeInTheDocument();
    expect(await screen.findByText('Premium arabica beans')).toBeInTheDocument();

    const patchCall = spy.mock.calls.find(
      ([url, opts]) =>
        (opts as RequestInit)?.method === 'PUT' && String(url).includes('supplier-invoice-items/101'),
    );
    expect(patchCall).toBeTruthy();
    const refreshCall = spy.mock.calls.find(
      ([url, opts]) =>
        (opts?.method ?? 'GET') === 'GET' && String(url).includes('supplier-invoices/1'),
    );
    expect(refreshCall).toBeTruthy();
  });

  it('soft-deletes a line item and refreshes the parent invoice', async () => {
    const spy = installFetch();
    const user = userEvent.setup();
    render(<SupplierInvoiceItemsView />);
    const row = (await screen.findByText('Premium coffee beans')).closest('tr')!;

    await user.click(within(row).getByLabelText('Delete line item'));
    expect(screen.getByRole('dialog', { name: /delete line item/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(screen.queryByText('Premium coffee beans')).not.toBeInTheDocument());
    expect(screen.getByText('Line item deleted successfully')).toBeInTheDocument();

    const deleteCall = spy.mock.calls.find(
      ([url, opts]) =>
        (opts as RequestInit)?.method === 'DELETE' && String(url).includes('supplier-invoice-items/101'),
    );
    expect(deleteCall).toBeTruthy();
    const refreshCall = spy.mock.calls.find(
      ([url, opts]) =>
        (opts?.method ?? 'GET') === 'GET' && String(url).includes('supplier-invoices/1'),
    );
    expect(refreshCall).toBeTruthy();
  });

  it('disables save in edit mode when nothing has changed', async () => {
    installFetch();
    const user = userEvent.setup();
    render(<SupplierInvoiceItemsView />);
    const row = (await screen.findByText('Premium coffee beans')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit line item'));
    expect(screen.getByRole('dialog', { name: /edit item/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save item/i })).toBeDisabled();
  });

  it('closes the add-item drawer on Escape', async () => {
    installFetch();
    const user = userEvent.setup();
    render(<SupplierInvoiceItemsView />);
    await screen.findByText('Premium coffee beans');

    await user.click(screen.getByRole('button', { name: /add item/i }));
    expect(screen.getByRole('dialog', { name: /add item/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /add item/i })).not.toBeInTheDocument(),
    );
  });
});

describe('SupplierInvoiceItemsView — quick links & errors', () => {
  it('excludes the active workspace and navigates from the quick-launch panel', async () => {
    installFetch();
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SupplierInvoiceItemsView onNavigate={onNavigate} />);
    await screen.findByText('Premium coffee beans');

    // El workspace activo (line items) no se ofrece como acción del panel.
    expect(screen.queryByRole('button', { name: /invoice line items/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /credit notes/i }));
    expect(onNavigate).toHaveBeenCalledWith('supplier-credit-notes');
  });

  it('navigates to supplier invoices when the parent invoice link is clicked', async () => {
    installFetch();
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SupplierInvoiceItemsView onNavigate={onNavigate} />);
    const row = (await screen.findByText('Premium coffee beans')).closest('tr')!;

    await user.click(within(row).getByRole('button', { name: /INV-2026-0001/ }));
    expect(onNavigate).toHaveBeenCalledWith('supplier-invoices');
  });

  it('redirects to login on a 401', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({}, 401)));
    render(<SupplierInvoiceItemsView />);
    await waitFor(() => expect(window.location.href).toBe('/login'));

    // @ts-expect-error restoring original Location object
    window.location = originalLocation;
  });
});
