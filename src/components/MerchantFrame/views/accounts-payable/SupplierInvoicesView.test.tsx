import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { SupplierInvoicesView } from './SupplierInvoicesView';
import type { SupplierInvoice, InvoiceSupplierRef } from '../../../../types/accounts-payable';

vi.mock('../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const SUPPLIERS: InvoiceSupplierRef[] = [
  { id: 10, name: 'Coca-Cola FEMSA', email: 'sales@femsa.com', phone: '+56 9 1111 2222' },
  { id: 20, name: 'Nestlé Foods', email: 'orders@nestle.com' },
];

// Fecha de vencimiento muy en el pasado para forzar el estado "overdue".
const PAST_DUE_DATE = '2020-01-15';
// Fecha de vencimiento muy en el futuro para garantizar que NO esté vencida.
const FUTURE_DUE_DATE = '2999-12-31';

const MOCK_INVOICES: SupplierInvoice[] = [
  {
    id: 1,
    company_id: 1,
    supplier_id: 10,
    supplier: SUPPLIERS[0],
    invoice_number: 'INV-2026-0001',
    invoice_date: '2026-01-05',
    due_date: FUTURE_DUE_DATE,
    subtotal: 1000,
    tax_total: 190,
    total_amount: 1190,
    paid_amount: 0,
    balance_due: 1190,
    status: 'pending',
    notes: 'Monthly beverage restock',
  },
  {
    id: 2,
    company_id: 1,
    supplier_id: 20,
    supplier: SUPPLIERS[1],
    invoice_number: 'INV-2026-0002',
    invoice_date: '2025-12-01',
    due_date: PAST_DUE_DATE,
    subtotal: 500,
    tax_total: 95,
    total_amount: 595,
    paid_amount: 200,
    balance_due: 395,
    status: 'partially_paid',
    notes: 'Dry goods',
  },
  {
    id: 3,
    company_id: 1,
    supplier_id: 10,
    supplier: SUPPLIERS[0],
    invoice_number: 'INV-2026-0003',
    invoice_date: '2026-02-01',
    due_date: FUTURE_DUE_DATE,
    total_amount: 300,
    subtotal: 300,
    tax_total: 0,
    paid_amount: 300,
    balance_due: 0,
    status: 'paid',
    notes: 'Cleaning supplies',
  },
];

function jsonRes(body: unknown, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

interface InstallOpts {
  invoices?: SupplierInvoice[];
  suppliers?: InvoiceSupplierRef[];
  archived?: SupplierInvoice[];
  items?: unknown[];
}

// Mock de fetch consciente de la URL: enruta facturas activas/archivadas, detalle,
// items (para el detalle), proveedores, restore y escrituras.
function installFetch({
  invoices = MOCK_INVOICES,
  suppliers = SUPPLIERS,
  archived = [],
  items = [],
}: InstallOpts = {}) {
  const spy = vi.fn(async (url: string, options?: RequestInit) => {
    const u = String(url);
    const method = options?.method ?? 'GET';

    if (u.includes('/suppliers')) {
      return jsonRes({ data: suppliers });
    }

    if (u.includes('/supplier-invoice-items')) {
      return jsonRes({ data: items });
    }

    const restoreMatch = u.match(/supplier-invoices\/(\d+)\/restore/);
    if (restoreMatch && method === 'POST') {
      const inv = archived.find((i) => String(i.id) === restoreMatch[1]) ?? invoices[0];
      return jsonRes({ data: { ...inv, deleted_at: null } });
    }

    if (u.includes('/supplier-invoices')) {
      const detailMatch = u.match(/supplier-invoices\/(\d+)$/);
      if (method === 'GET') {
        if (detailMatch) {
          const inv = [...invoices, ...archived].find((i) => String(i.id) === detailMatch[1]);
          return jsonRes({ data: inv ?? null });
        }
        // Modo archivado: only_deleted=true en la URL.
        if (u.includes('only_deleted=true')) {
          return jsonRes({ data: archived });
        }
        return jsonRes({ data: invoices });
      }
      // POST / PUT / DELETE default handled by per-test re-stubs.
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

describe('SupplierInvoicesView — loading & empty', () => {
  it('shows a loading indicator while fetching', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<SupplierInvoicesView />);
    expect(screen.getByText(/Loading\.\.\./i)).toBeInTheDocument();
  });

  it('shows the empty-state message when there are zero invoices', async () => {
    installFetch({ invoices: [] });
    render(<SupplierInvoicesView />);
    expect(await screen.findByTestId('supplier-invoices-empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(/No supplier invoices found\. Click 'Register Invoice' to record a new vendor bill\./i),
    ).toBeInTheDocument();
  });

  it('filters out soft-deleted invoices', async () => {
    installFetch({
      invoices: [
        MOCK_INVOICES[0],
        { ...MOCK_INVOICES[1], deleted_at: '2026-03-01T00:00:00.000Z' },
      ],
    });
    render(<SupplierInvoicesView />);
    expect(await screen.findByText('INV-2026-0001')).toBeInTheDocument();
    expect(screen.queryByText('INV-2026-0002')).not.toBeInTheDocument();
  });
});

describe('SupplierInvoicesView — grid', () => {
  beforeEach(() => installFetch());

  it('renders invoice number, supplier name and formatted currency', async () => {
    render(<SupplierInvoicesView />);
    expect(await screen.findByText('INV-2026-0001')).toBeInTheDocument();
    expect(screen.getAllByText('Coca-Cola FEMSA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$1,190.00').length).toBeGreaterThan(0);
  });

  it('renders the stored status badge for a non-overdue invoice', async () => {
    render(<SupplierInvoicesView />);
    const row = (await screen.findByText('INV-2026-0001')).closest('tr')!;
    expect(within(row).getByText('Pending')).toBeInTheDocument();
  });

  it('shows an OVERDUE badge for a past-due invoice with an outstanding balance', async () => {
    render(<SupplierInvoicesView />);
    const row = (await screen.findByText('INV-2026-0002')).closest('tr')!;
    expect(within(row).getByText('Overdue')).toBeInTheDocument();
    expect(within(row).queryByText('Partially Paid')).not.toBeInTheDocument();
  });

  it('applies red alert styling to a past-due date with an outstanding balance', async () => {
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0002');
    const dueCell = screen.getByTestId('invoice-due-2');
    expect(dueCell.className).toContain('text-red-600');
  });

  it('does not apply red styling to a fully paid invoice', async () => {
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0003');
    const dueCell = screen.getByTestId('invoice-due-3');
    expect(dueCell.className).not.toContain('text-red-600');
  });
});

describe('SupplierInvoicesView — filters', () => {
  beforeEach(() => installFetch());

  it('searches across invoice number, supplier name and notes', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');

    await user.type(screen.getByLabelText('Search supplier invoices'), 'Nestlé');
    expect(screen.getByText('INV-2026-0002')).toBeInTheDocument();
    expect(screen.queryByText('INV-2026-0001')).not.toBeInTheDocument();
  });

  it('filters by status', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'paid');
    expect(screen.getByText('INV-2026-0003')).toBeInTheDocument();
    expect(screen.queryByText('INV-2026-0001')).not.toBeInTheDocument();
  });

  it('filters by the derived Overdue status option', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'overdue');
    expect(screen.getByText('INV-2026-0002')).toBeInTheDocument(); // past due
    expect(screen.queryByText('INV-2026-0001')).not.toBeInTheDocument();
    expect(screen.queryByText('INV-2026-0003')).not.toBeInTheDocument();
  });

  it('filters by supplier', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');

    await user.selectOptions(screen.getByLabelText('Filter by supplier'), '20');
    expect(screen.getByText('INV-2026-0002')).toBeInTheDocument();
    expect(screen.queryByText('INV-2026-0001')).not.toBeInTheDocument();
  });

  it('toggles the Overdue Only quick filter', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');

    await user.click(screen.getByRole('button', { name: /overdue only/i }));
    expect(screen.getByText('INV-2026-0002')).toBeInTheDocument();
    expect(screen.queryByText('INV-2026-0001')).not.toBeInTheDocument();
    expect(screen.queryByText('INV-2026-0003')).not.toBeInTheDocument();
  });
});

describe('SupplierInvoicesView — register drawer & maturity guard', () => {
  beforeEach(() => installFetch());

  it('opens the register drawer from the toolbar', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');

    await user.click(screen.getByRole('button', { name: /register invoice/i }));
    expect(screen.getByRole('dialog', { name: /register invoice/i })).toBeInTheDocument();
  });

  it('blocks submit and shows an alert when the due date precedes the invoice date', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');
    await user.click(screen.getByRole('button', { name: /register invoice/i }));

    await user.selectOptions(screen.getByLabelText(/^Supplier/), '10');
    await user.type(screen.getByLabelText(/Invoice Number/), 'INV-NEW-1');
    await user.type(screen.getByLabelText(/Invoice Date/), '2026-05-10');
    await user.type(screen.getByLabelText(/Due Date/), '2026-05-01');

    expect(
      screen.getByText('Due date cannot be earlier than the invoice issuance date.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save invoice/i })).toBeDisabled();
  });

  it('enables submit for a valid maturity schedule and previews the total', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');
    await user.click(screen.getByRole('button', { name: /register invoice/i }));

    await user.selectOptions(screen.getByLabelText(/^Supplier/), '10');
    await user.type(screen.getByLabelText(/Invoice Number/), 'INV-NEW-1');
    await user.type(screen.getByLabelText(/Invoice Date/), '2026-05-01');
    await user.type(screen.getByLabelText(/Due Date/), '2026-06-01');
    await user.type(screen.getByLabelText(/Subtotal/), '1000');
    await user.type(screen.getByLabelText(/Tax Total/), '190');

    expect(screen.getByTestId('invoice-total-preview')).toHaveTextContent('$1,190.00');
    expect(screen.getByRole('button', { name: /save invoice/i })).toBeEnabled();
  });
});

describe('SupplierInvoicesView — paid state immobility', () => {
  beforeEach(() => installFetch());

  it('locks core financial fields when the invoice has recorded payments', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    const row = (await screen.findByText('INV-2026-0002')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit invoice'));

    expect(screen.getByRole('dialog', { name: /edit invoice/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Supplier/)).toBeDisabled();
    expect(screen.getByLabelText(/Subtotal/)).toBeDisabled();
    expect(screen.getByLabelText(/Tax Total/)).toBeDisabled();
    // Dates and notes stay editable.
    expect(screen.getByLabelText(/Due Date/)).toBeEnabled();
  });

  it('keeps fields editable for an unpaid invoice', async () => {
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    const row = (await screen.findByText('INV-2026-0001')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit invoice'));
    expect(screen.getByLabelText(/Subtotal/)).toBeEnabled();
  });
});

describe('SupplierInvoicesView — soft delete', () => {
  it('issues a DELETE call and removes the row from the active view', async () => {
    const spy = installFetch();
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    const row = (await screen.findByText('INV-2026-0001')).closest('tr')!;

    await user.click(within(row).getByLabelText('Delete invoice'));
    expect(screen.getByRole('dialog', { name: /delete invoice/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(screen.queryByText('INV-2026-0001')).not.toBeInTheDocument());
    expect(screen.getByText('Invoice deleted successfully')).toBeInTheDocument();

    const deleteCall = spy.mock.calls.find(
      ([url, opts]) => (opts as RequestInit)?.method === 'DELETE' && String(url).includes('supplier-invoices/1'),
    );
    expect(deleteCall).toBeTruthy();
  });
});

describe('SupplierInvoicesView — create & edit persistence', () => {
  it('registers an invoice via POST and prepends it on success', async () => {
    installFetch();
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');

    const created: SupplierInvoice = {
      id: 99,
      company_id: 1,
      supplier_id: 10,
      supplier: SUPPLIERS[0],
      invoice_number: 'INV-NEW-99',
      invoice_date: '2026-05-01',
      due_date: FUTURE_DUE_DATE,
      subtotal: 1000,
      tax_total: 190,
      total_amount: 1190,
      paid_amount: 0,
      balance_due: 1190,
      status: 'pending',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({ data: created }, 201)));

    await user.click(screen.getByRole('button', { name: /register invoice/i }));
    await user.selectOptions(screen.getByLabelText(/^Supplier/), '10');
    await user.type(screen.getByLabelText(/Invoice Number/), 'INV-NEW-99');
    await user.type(screen.getByLabelText(/Invoice Date/), '2026-05-01');
    await user.type(screen.getByLabelText(/Due Date/), '2026-06-01');
    await user.click(screen.getByRole('button', { name: /save invoice/i }));

    expect(await screen.findByText('INV-NEW-99')).toBeInTheDocument();
    expect(screen.getByText('Invoice registered successfully')).toBeInTheDocument();
  });

  it('edits an invoice via PATCH and replaces the row on success', async () => {
    installFetch();
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    const row = (await screen.findByText('INV-2026-0001')).closest('tr')!;

    const updated: SupplierInvoice = { ...MOCK_INVOICES[0], invoice_number: 'INV-2026-0001-R' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({ data: updated })));

    await user.click(within(row).getByLabelText('Edit invoice'));
    const numInput = screen.getByLabelText(/Invoice Number/);
    await user.clear(numInput);
    await user.type(numInput, 'INV-2026-0001-R');
    await user.click(screen.getByRole('button', { name: /save invoice/i }));

    expect(await screen.findByText('INV-2026-0001-R')).toBeInTheDocument();
    expect(screen.getByText('Invoice updated successfully')).toBeInTheDocument();
  });

  it('disables save in edit mode when nothing has changed', async () => {
    installFetch();
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    const row = (await screen.findByText('INV-2026-0001')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit invoice'));
    expect(screen.getByRole('dialog', { name: /edit invoice/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save invoice/i })).toBeDisabled();
  });

  it('closes the register drawer on Escape', async () => {
    installFetch();
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');

    await user.click(screen.getByRole('button', { name: /register invoice/i }));
    expect(screen.getByRole('dialog', { name: /register invoice/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /register invoice/i })).not.toBeInTheDocument(),
    );
  });
});

describe('SupplierInvoicesView — detail drawer', () => {
  beforeEach(() => installFetch());

  it('opens the detail drawer, resolves supplier contact and loads the invoice items', async () => {
    // El backend devuelve la factura plana; los items se cargan desde el endpoint de items.
    installFetch({
      items: [
        {
          id: 101,
          invoice_id: 1,
          product_id: null,
          description: 'Sparkling water crate',
          quantity: 5,
          unit_price: 20,
          tax_amount: 19,
          line_subtotal: 100,
          line_total: 119,
        },
      ],
    });
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await user.click(await screen.findByText('INV-2026-0001'));

    const dialog = await screen.findByRole('dialog', { name: /invoice details/i });
    // Contacto del proveedor resuelto desde la lista de suppliers.
    expect(within(dialog).getByText('sales@femsa.com')).toBeInTheDocument();
    // Items cargados por separado.
    expect(await within(dialog).findByText('Sparkling water crate')).toBeInTheDocument();
  });
});

describe('SupplierInvoicesView — quick links', () => {
  beforeEach(() => installFetch());

  it('excludes the active workspace (supplier invoices) from the quick-launch panel', async () => {
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');

    expect(screen.queryByRole('button', { name: /^supplier invoices$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /credit notes/i })).toBeInTheDocument();
  });

  it('navigates to the line items feature when INVOICE LINE ITEMS is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SupplierInvoicesView onNavigate={onNavigate} />);
    await screen.findByText('INV-2026-0001');

    await user.click(screen.getByRole('button', { name: /invoice line items/i }));
    expect(onNavigate).toHaveBeenCalledWith('supplier-invoice-items');
  });
});

describe('SupplierInvoicesView — archived & restore', () => {
  const ARCHIVED: SupplierInvoice[] = [
    {
      ...MOCK_INVOICES[0],
      id: 77,
      invoice_number: 'INV-ARCH-77',
      deleted_at: '2026-03-01T00:00:00.000Z',
    },
  ];

  it('switches to the archived view and lists soft-deleted invoices', async () => {
    installFetch({ archived: ARCHIVED });
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');

    await user.click(screen.getByRole('tab', { name: /archived/i }));

    expect(await screen.findByText('INV-ARCH-77')).toBeInTheDocument();
    expect(screen.queryByText('INV-2026-0001')).not.toBeInTheDocument();
  });

  it('requests only_deleted=true when loading the archived view', async () => {
    const spy = installFetch({ archived: ARCHIVED });
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');

    await user.click(screen.getByRole('tab', { name: /archived/i }));
    await screen.findByText('INV-ARCH-77');

    expect(spy.mock.calls.some(([url]) => String(url).includes('only_deleted=true'))).toBe(true);
  });

  it('shows a restore action (not delete) in the archived view', async () => {
    installFetch({ archived: ARCHIVED });
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');
    await user.click(screen.getByRole('tab', { name: /archived/i }));

    const row = (await screen.findByText('INV-ARCH-77')).closest('tr')!;
    expect(within(row).getByLabelText('Restore invoice')).toBeInTheDocument();
    expect(within(row).queryByLabelText('Delete invoice')).not.toBeInTheDocument();
  });

  it('restores an archived invoice via POST /:id/restore', async () => {
    const spy = installFetch({ archived: ARCHIVED });
    const user = userEvent.setup();
    render(<SupplierInvoicesView />);
    await screen.findByText('INV-2026-0001');
    await user.click(screen.getByRole('tab', { name: /archived/i }));

    const row = (await screen.findByText('INV-ARCH-77')).closest('tr')!;
    await user.click(within(row).getByLabelText('Restore invoice'));

    expect(screen.getByRole('dialog', { name: /restore invoice/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^restore$/i }));

    await waitFor(() => expect(screen.queryByText('INV-ARCH-77')).not.toBeInTheDocument());
    expect(screen.getByText('Invoice restored successfully')).toBeInTheDocument();

    const restoreCall = spy.mock.calls.find(
      ([url, opts]) =>
        (opts as RequestInit)?.method === 'POST' &&
        String(url).includes('supplier-invoices/77/restore'),
    );
    expect(restoreCall).toBeTruthy();
  });
});

describe('SupplierInvoicesView — errors', () => {
  it('redirects to login on a 401', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({}, 401)));
    render(<SupplierInvoicesView />);
    await waitFor(() => expect(window.location.href).toBe('/login'));

    // @ts-expect-error restoring original Location object
    window.location = originalLocation;
  });

  it('shows a retry button on a generic failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({}, 500)));
    render(<SupplierInvoicesView />);
    expect(await screen.findByText('Retry Connection')).toBeInTheDocument();
  });
});
