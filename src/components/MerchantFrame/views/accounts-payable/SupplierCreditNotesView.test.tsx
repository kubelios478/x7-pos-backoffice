import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { SupplierCreditNotesView } from './SupplierCreditNotesView';
import type {
  SupplierCreditNote,
  InvoiceSupplierRef,
  SupplierPaymentAllocation,
} from '../../../../types/accounts-payable';

vi.mock('../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const SUPPLIERS: InvoiceSupplierRef[] = [
  { id: 10, name: 'Coca-Cola FEMSA', email: 'sales@femsa.com' },
  { id: 20, name: 'Nestlé Foods', email: 'orders@nestle.com' },
];

const NOTES: SupplierCreditNote[] = [
  {
    id: 1,
    company_id: 1,
    supplier_id: 10,
    credit_note_number: 'CN-2026-0001',
    issue_date: '2026-02-01',
    total_amount: 500,
    applied_amount: 0,
    status: 'draft',
  },
  {
    id: 2,
    company_id: 1,
    supplier_id: 20,
    credit_note_number: 'CN-2026-0002',
    issue_date: '2026-01-15',
    total_amount: 300,
    applied_amount: 120,
    status: 'partially_applied',
  },
  {
    id: 3,
    company_id: 1,
    supplier_id: 10,
    credit_note_number: 'CN-2026-0003',
    issue_date: '2026-03-01',
    total_amount: 200,
    applied_amount: 200,
    status: 'fully_applied',
  },
];

function jsonRes(body: unknown, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

interface InstallOpts {
  notes?: SupplierCreditNote[];
  suppliers?: InvoiceSupplierRef[];
  allocations?: SupplierPaymentAllocation[];
}

function installFetch({ notes = NOTES, suppliers = SUPPLIERS, allocations = [] }: InstallOpts = {}) {
  const spy = vi.fn(async (url: string, options?: RequestInit) => {
    const u = String(url);
    const method = options?.method ?? 'GET';

    if (u.includes('/supplier-payment-allocations')) {
      return jsonRes({ data: allocations });
    }
    if (u.includes('/suppliers')) {
      return jsonRes({ data: suppliers });
    }
    if (u.includes('/supplier-credit-notes')) {
      const detailMatch = u.match(/supplier-credit-notes\/(\d+)$/);
      if (method === 'GET') {
        if (detailMatch) {
          const cn = notes.find((n) => String(n.id) === detailMatch[1]);
          return jsonRes({ data: cn ?? null });
        }
        return jsonRes({ data: notes });
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

describe('SupplierCreditNotesView — states', () => {
  it('shows a loading indicator', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<SupplierCreditNotesView />);
    expect(screen.getByText(/Loading\.\.\./i)).toBeInTheDocument();
  });

  it('shows the empty state with the exact message', async () => {
    installFetch({ notes: [] });
    render(<SupplierCreditNotesView />);
    expect(await screen.findByTestId('supplier-credit-notes-empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(/No supplier credit notes found\. Click 'Issue Credit Note' to record a new vendor balance adjustment\./i),
    ).toBeInTheDocument();
  });

  it('filters out soft-deleted credit notes', async () => {
    installFetch({
      notes: [NOTES[0], { ...NOTES[1], deleted_at: '2026-03-01T00:00:00.000Z' }],
    });
    render(<SupplierCreditNotesView />);
    expect(await screen.findByText('CN-2026-0001')).toBeInTheDocument();
    expect(screen.queryByText('CN-2026-0002')).not.toBeInTheDocument();
  });

  it('redirects to login on a 401', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({}, 401)));
    render(<SupplierCreditNotesView />);
    await waitFor(() => expect(window.location.href).toBe('/login'));
    // @ts-expect-error restoring
    window.location = originalLocation;
  });
});

describe('SupplierCreditNotesView — grid', () => {
  beforeEach(() => installFetch());

  it('renders number, resolved supplier name, and currency', async () => {
    render(<SupplierCreditNotesView />);
    expect(await screen.findByText('CN-2026-0001')).toBeInTheDocument();
    expect(screen.getAllByText('Coca-Cola FEMSA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$500.00').length).toBeGreaterThan(0);
  });

  it('computes the remaining unapplied balance (total - applied)', async () => {
    render(<SupplierCreditNotesView />);
    await screen.findByText('CN-2026-0002');
    // 300 - 120 = 180
    expect(screen.getByText('$180.00')).toBeInTheDocument();
  });

  it('renders a status badge per credit note', async () => {
    render(<SupplierCreditNotesView />);
    const row = (await screen.findByText('CN-2026-0002')).closest('tr')!;
    expect(within(row).getByText('Partially Applied')).toBeInTheDocument();
  });
});

describe('SupplierCreditNotesView — filters', () => {
  beforeEach(() => installFetch());

  it('searches by number or supplier', async () => {
    const user = userEvent.setup();
    render(<SupplierCreditNotesView />);
    await screen.findByText('CN-2026-0001');

    await user.type(screen.getByLabelText('Search credit notes'), 'Nestlé');
    expect(screen.getByText('CN-2026-0002')).toBeInTheDocument();
    expect(screen.queryByText('CN-2026-0001')).not.toBeInTheDocument();
  });

  it('filters by status', async () => {
    const user = userEvent.setup();
    render(<SupplierCreditNotesView />);
    await screen.findByText('CN-2026-0001');

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'fully_applied');
    expect(screen.getByText('CN-2026-0003')).toBeInTheDocument();
    expect(screen.queryByText('CN-2026-0001')).not.toBeInTheDocument();
  });

  it('filters by supplier', async () => {
    const user = userEvent.setup();
    render(<SupplierCreditNotesView />);
    await screen.findByText('CN-2026-0001');

    await user.selectOptions(screen.getByLabelText('Filter by supplier'), '20');
    expect(screen.getByText('CN-2026-0002')).toBeInTheDocument();
    expect(screen.queryByText('CN-2026-0001')).not.toBeInTheDocument();
  });
});

describe('SupplierCreditNotesView — issue & lifecycle', () => {
  beforeEach(() => installFetch());

  it('opens the issue drawer from the toolbar', async () => {
    const user = userEvent.setup();
    render(<SupplierCreditNotesView />);
    await screen.findByText('CN-2026-0001');

    await user.click(screen.getByRole('button', { name: /issue credit note/i }));
    expect(screen.getByRole('dialog', { name: /issue credit note/i })).toBeInTheDocument();
  });

  it('locks supplier and total when applied amount > 0', async () => {
    const user = userEvent.setup();
    render(<SupplierCreditNotesView />);
    const row = (await screen.findByText('CN-2026-0002')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit credit note'));
    expect(screen.getByRole('dialog', { name: /edit credit note/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Supplier/)).toBeDisabled();
    expect(screen.getByLabelText(/Total Amount/)).toBeDisabled();
    // Issue date stays editable.
    expect(screen.getByLabelText(/Issue Date/)).toBeEnabled();
  });

  it('blocks Fully Applied unless applied equals total', async () => {
    const user = userEvent.setup();
    render(<SupplierCreditNotesView />);
    const row = (await screen.findByText('CN-2026-0002')).closest('tr')!; // applied 120 !== total 300

    await user.click(within(row).getByLabelText('Edit credit note'));
    await user.selectOptions(screen.getByLabelText('Status'), 'fully_applied');

    expect(screen.getByText(/Cannot mark as Fully Applied/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save credit note/i })).toBeDisabled();
  });

  it('keeps fields editable for a draft credit note', async () => {
    const user = userEvent.setup();
    render(<SupplierCreditNotesView />);
    const row = (await screen.findByText('CN-2026-0001')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit credit note'));
    expect(screen.getByLabelText(/^Supplier/)).toBeEnabled();
    expect(screen.getByLabelText(/Total Amount/)).toBeEnabled();
  });
});

describe('SupplierCreditNotesView — soft delete', () => {
  it('deletes a zero-applied credit note after confirmation', async () => {
    const spy = installFetch();
    const user = userEvent.setup();
    render(<SupplierCreditNotesView />);
    const row = (await screen.findByText('CN-2026-0001')).closest('tr')!;

    await user.click(within(row).getByLabelText('Delete credit note'));
    expect(screen.getByRole('dialog', { name: /delete credit note/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(screen.queryByText('CN-2026-0001')).not.toBeInTheDocument());
    expect(screen.getByText('Credit note deleted successfully')).toBeInTheDocument();

    const deleteCall = spy.mock.calls.find(
      ([url, opts]) =>
        (opts as RequestInit)?.method === 'DELETE' && String(url).includes('supplier-credit-notes/1'),
    );
    expect(deleteCall).toBeTruthy();
  });

  it('blocks deleting a credit note with applied allocations', async () => {
    installFetch();
    const user = userEvent.setup();
    render(<SupplierCreditNotesView />);
    const row = (await screen.findByText('CN-2026-0002')).closest('tr')!; // applied 120

    await user.click(within(row).getByLabelText('Delete credit note'));

    expect(screen.getByText(/Cannot delete: unlink active allocations/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /delete credit note/i })).not.toBeInTheDocument();
  });
});

describe('SupplierCreditNotesView — create & edit persistence', () => {
  it('issues a credit note via POST and prepends it', async () => {
    installFetch();
    const user = userEvent.setup();
    render(<SupplierCreditNotesView />);
    await screen.findByText('CN-2026-0001');

    const created: SupplierCreditNote = {
      id: 99,
      company_id: 1,
      supplier_id: 10,
      credit_note_number: 'CN-NEW-99',
      issue_date: '2026-05-01',
      total_amount: 400,
      applied_amount: 0,
      status: 'draft',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({ data: created }, 201)));

    await user.click(screen.getByRole('button', { name: /issue credit note/i }));
    const dialog = screen.getByRole('dialog', { name: /issue credit note/i });
    await user.selectOptions(within(dialog).getByLabelText(/^Supplier/), '10');
    await user.type(within(dialog).getByLabelText(/Credit Note Number/), 'CN-NEW-99');
    await user.type(within(dialog).getByLabelText(/Issue Date/), '2026-05-01');
    await user.type(within(dialog).getByLabelText(/Total Amount/), '400');
    await user.click(within(dialog).getByRole('button', { name: /issue credit note/i }));

    expect(await screen.findByText('CN-NEW-99')).toBeInTheDocument();
    expect(screen.getByText('Credit note issued successfully')).toBeInTheDocument();
  });

  it('transitions a draft to Issued via PUT', async () => {
    installFetch();
    const user = userEvent.setup();
    render(<SupplierCreditNotesView />);
    const row = (await screen.findByText('CN-2026-0001')).closest('tr')!;

    const updated: SupplierCreditNote = { ...NOTES[0], status: 'issued' };
    const spy = vi.fn().mockResolvedValue(jsonRes({ data: updated }));
    vi.stubGlobal('fetch', spy);

    await user.click(within(row).getByLabelText('Edit credit note'));
    await user.selectOptions(screen.getByLabelText('Status'), 'issued');
    await user.click(screen.getByRole('button', { name: /save credit note/i }));

    expect(await screen.findByText('Credit note updated successfully')).toBeInTheDocument();
    const putCall = spy.mock.calls.find(([, opts]) => (opts as RequestInit)?.method === 'PUT');
    expect(putCall).toBeTruthy();
  });
});

describe('SupplierCreditNotesView — detail & quick links', () => {
  it('opens the detail drawer and loads allocations', async () => {
    installFetch({
      allocations: [
        {
          id: 501,
          payment_id: 1,
          credit_note_id: 2,
          supplier_id: 20,
          document_number: 'PAY-777',
          document_type: 'payment',
          allocated_amount: 120,
        },
      ],
    });
    const user = userEvent.setup();
    render(<SupplierCreditNotesView />);
    await user.click(await screen.findByText('CN-2026-0002'));

    const dialog = await screen.findByRole('dialog', { name: /credit note details/i });
    expect(await within(dialog).findByText('PAY-777')).toBeInTheDocument();
  });

  it('excludes the active workspace (credit notes) from the quick-launch panel', async () => {
    installFetch();
    render(<SupplierCreditNotesView />);
    await screen.findByText('CN-2026-0001');

    expect(screen.queryByRole('button', { name: /^credit notes$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /payments & disbursements/i })).toBeInTheDocument();
  });

  it('navigates to supplier invoices from the quick links', async () => {
    installFetch();
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SupplierCreditNotesView onNavigate={onNavigate} />);
    await screen.findByText('CN-2026-0001');

    await user.click(screen.getByRole('button', { name: /supplier invoices/i }));
    expect(onNavigate).toHaveBeenCalledWith('supplier-invoices');
  });
});
