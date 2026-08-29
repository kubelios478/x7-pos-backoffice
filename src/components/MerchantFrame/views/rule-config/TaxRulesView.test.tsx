import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { TaxRulesView } from './TaxRulesView';
import type { MerchantTaxRule } from '../../../../types/configuration';

vi.mock('../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const MOCK_RULES: MerchantTaxRule[] = [
  {
    id: 1,
    name: 'State Sales Tax',
    description: 'Standard percentage-based sales tax',
    taxType: 'percentage',
    rate: 0.19,
    appliesToTips: true,
    appliesToOvertime: false,
    externalTaxCode: 'SALES-19',
    status: 'active',
  },
  {
    id: 2,
    name: 'Flat Environmental Fee',
    description: 'Fixed amount fee per receipt',
    taxType: 'fixed',
    rate: '2.5000',
    appliesToTips: false,
    appliesToOvertime: false,
    externalTaxCode: null,
    status: 'inactive',
  },
  {
    id: 3,
    name: 'Overtime Compound Levy',
    description: 'Compound tax applied over base tax on overtime wages',
    taxType: 'compound',
    rate: 0.05,
    appliesToTips: false,
    appliesToOvertime: true,
    externalTaxCode: 'OT-LEVY',
    status: 'active',
  },
];

function mockFetchOnce(data: MerchantTaxRule[], status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: async () => ({
        data,
        pagination: { total: data.length, page: 1, limit: 100, totalPages: 1 },
      }),
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('TaxRulesView — loading state', () => {
  it('shows a loading indicator while fetching', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<TaxRulesView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

describe('TaxRulesView — empty state', () => {
  it('shows the empty-state placeholder when the company has zero tax rules', async () => {
    mockFetchOnce([]);
    render(<TaxRulesView />);
    expect(await screen.findByTestId('tax-rules-empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(/No tax processing rules configured for this company/i),
    ).toBeInTheDocument();
  });
});

describe('TaxRulesView — grid rendering', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('renders percentage rate as a rounded percentage', async () => {
    render(<TaxRulesView />);
    expect(await screen.findByText('State Sales Tax')).toBeInTheDocument();
    expect(screen.getByText('19%')).toBeInTheDocument();
  });

  it('renders fixed rate as a dollar amount', async () => {
    render(<TaxRulesView />);
    await screen.findByText('Flat Environmental Fee');
    expect(screen.getByText('$2.50')).toBeInTheDocument();
  });

  it('renders compound rate as a percentage', async () => {
    render(<TaxRulesView />);
    await screen.findByText('Overtime Compound Levy');
    expect(screen.getByText('5%')).toBeInTheDocument();
  });

  it('shows a Tips badge only for rules that apply to tips', async () => {
    render(<TaxRulesView />);
    const row = (await screen.findByText('State Sales Tax')).closest('tr')!;
    expect(within(row).getByText('Tips')).toBeInTheDocument();
    expect(within(row).queryByText('Overtime')).not.toBeInTheDocument();
  });

  it('shows an Overtime badge only for rules that apply to overtime', async () => {
    render(<TaxRulesView />);
    const row = (await screen.findByText('Overtime Compound Levy')).closest('tr')!;
    expect(within(row).getByText('Overtime')).toBeInTheDocument();
    expect(within(row).queryByText('Tips')).not.toBeInTheDocument();
  });

  it('shows a muted banner when externalTaxCode is null', async () => {
    render(<TaxRulesView />);
    await screen.findByText('Flat Environmental Fee');
    expect(screen.getByText('No Ledger Code Bound')).toBeInTheDocument();
  });

  it('renders the ledger code when present', async () => {
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');
    expect(screen.getByText('SALES-19')).toBeInTheDocument();
  });

  it('shows Active/Inactive status pills', async () => {
    render(<TaxRulesView />);
    const activeRow = (await screen.findByText('State Sales Tax')).closest('tr')!;
    const inactiveRow = (await screen.findByText('Flat Environmental Fee')).closest('tr')!;
    expect(within(activeRow).getByText('Active')).toBeInTheDocument();
    expect(within(inactiveRow).getByText('Inactive')).toBeInTheDocument();
  });
});

describe('TaxRulesView — filters', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('filters by fuzzy search across name, description, and ledger code', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    await user.type(screen.getByLabelText('Search tax rules'), 'levy');

    expect(screen.queryByText('State Sales Tax')).not.toBeInTheDocument();
    expect(screen.getByText('Overtime Compound Levy')).toBeInTheDocument();
  });

  it('filters by tax type', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    await user.selectOptions(screen.getByLabelText('Filter by tax type'), 'fixed');

    expect(screen.getByText('Flat Environmental Fee')).toBeInTheDocument();
    expect(screen.queryByText('State Sales Tax')).not.toBeInTheDocument();
  });

  it('filters by Applies to Tips', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    await user.click(screen.getByLabelText('Applies to Tips'));

    expect(screen.getByText('State Sales Tax')).toBeInTheDocument();
    expect(screen.queryByText('Flat Environmental Fee')).not.toBeInTheDocument();
    expect(screen.queryByText('Overtime Compound Levy')).not.toBeInTheDocument();
  });

  it('filters by Applies to Overtime', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    await user.click(screen.getByLabelText('Applies to Overtime'));

    expect(screen.getByText('Overtime Compound Levy')).toBeInTheDocument();
    expect(screen.queryByText('State Sales Tax')).not.toBeInTheDocument();
  });

  it('filters by status', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'inactive');

    expect(screen.getByText('Flat Environmental Fee')).toBeInTheDocument();
    expect(screen.queryByText('State Sales Tax')).not.toBeInTheDocument();
  });

  it('shows the filtered-empty state and clears filters', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    await user.type(screen.getByLabelText('Search tax rules'), 'zzz-no-match');

    expect(
      await screen.findByText(/No tax rules match your active filters/i),
    ).toBeInTheDocument();

    await user.click(screen.getByText('Clear filters'));

    expect(await screen.findByText('State Sales Tax')).toBeInTheDocument();
  });
});

describe('TaxRulesView — error handling', () => {
  it('redirects to login on a 401 response', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }),
    );

    render(<TaxRulesView />);

    await waitFor(() => expect(window.location.href).toBe('/login'));

    // @ts-expect-error restoring original Location object
    window.location = originalLocation;
  });

  it('shows a retry button on a generic fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 500, ok: false, json: async () => ({}) }),
    );

    render(<TaxRulesView />);

    expect(await screen.findByText('Retry Connection')).toBeInTheDocument();
  });
});

describe('TaxRulesView — create tax rule', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the create modal from the toolbar button', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    await user.click(screen.getByRole('button', { name: /add tax rule/i }));

    expect(screen.getByRole('dialog', { name: /add tax rule/i })).toBeInTheDocument();
  });

  it('opens the create modal from the FAB', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    await user.click(screen.getByLabelText('Quick create tax rule'));

    expect(screen.getByRole('dialog', { name: /add tax rule/i })).toBeInTheDocument();
  });

  it('opens the create modal from the empty-state CTA', async () => {
    mockFetchOnce([]);
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByTestId('tax-rules-empty-state');

    await user.click(screen.getByRole('button', { name: /add tax rule/i }));

    expect(screen.getByRole('dialog', { name: /add tax rule/i })).toBeInTheDocument();
  });

  it('disables submit until name, description, and rate are valid', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');
    await user.click(screen.getByRole('button', { name: /add tax rule/i }));

    const submitButton = screen.getByRole('button', { name: /save tax rule/i });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Rule Name'), 'New Levy');
    await user.type(screen.getByLabelText('Description'), 'A brand new levy');
    await user.type(screen.getByLabelText('Rate'), '0.1');

    expect(submitButton).toBeEnabled();
  });

  it('blocks submit when name exceeds 50 characters', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');
    await user.click(screen.getByRole('button', { name: /add tax rule/i }));

    await user.type(screen.getByLabelText('Rule Name'), 'a'.repeat(51));
    await user.type(screen.getByLabelText('Description'), 'valid description');
    await user.type(screen.getByLabelText('Rate'), '0.1');

    expect(screen.getByRole('button', { name: /save tax rule/i })).toBeDisabled();
  });

  it('blocks submit when description exceeds 200 characters', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');
    await user.click(screen.getByRole('button', { name: /add tax rule/i }));

    await user.type(screen.getByLabelText('Rule Name'), 'Valid name');
    await user.type(screen.getByLabelText('Description'), 'a'.repeat(201));
    await user.type(screen.getByLabelText('Rate'), '0.1');

    expect(screen.getByRole('button', { name: /save tax rule/i })).toBeDisabled();
  });

  it('shows a compound-tax indicator when compound tax type is selected', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');
    await user.click(screen.getByRole('button', { name: /add tax rule/i }));

    await user.selectOptions(screen.getByLabelText('Tax Type'), 'compound');

    const dialog = screen.getByRole('dialog', { name: /add tax rule/i });
    expect(within(dialog).getByText(/compound tax/i)).toBeInTheDocument();
  });

  it('submits a POST request and prepends the new rule on success', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    const createdRule: MerchantTaxRule = {
      id: 4,
      name: 'New Levy',
      description: 'A brand new levy',
      taxType: 'fixed',
      rate: 1.5,
      appliesToTips: false,
      appliesToOvertime: false,
      externalTaxCode: null,
      status: 'active',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 201,
        ok: true,
        json: async () => ({ data: createdRule }),
      }),
    );

    await user.click(screen.getByRole('button', { name: /add tax rule/i }));
    await user.type(screen.getByLabelText('Rule Name'), 'New Levy');
    await user.type(screen.getByLabelText('Description'), 'A brand new levy');
    await user.selectOptions(screen.getByLabelText('Tax Type'), 'fixed');
    await user.type(screen.getByLabelText('Rate'), '1.5');
    await user.click(screen.getByRole('button', { name: /save tax rule/i }));

    expect(await screen.findByText('New Levy')).toBeInTheDocument();
    expect(screen.getByText('Tax rule created successfully')).toBeInTheDocument();
  });

  it('shows an error toast and closes the modal when create fails', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ message: 'Invalid payload' }),
      }),
    );

    await user.click(screen.getByRole('button', { name: /add tax rule/i }));
    await user.type(screen.getByLabelText('Rule Name'), 'New Levy');
    await user.type(screen.getByLabelText('Description'), 'A brand new levy');
    await user.type(screen.getByLabelText('Rate'), '1.5');
    await user.click(screen.getByRole('button', { name: /save tax rule/i }));

    expect(await screen.findByText('Invalid payload')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /add tax rule/i })).not.toBeInTheDocument();
  });
});

describe('TaxRulesView — edit tax rule', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the edit modal pre-filled from the pencil action', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    const row = (await screen.findByText('State Sales Tax')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit tax rule'));

    expect(screen.getByRole('dialog', { name: /edit tax rule/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Rule Name')).toHaveValue('State Sales Tax');
    expect(screen.getByLabelText('Rate')).toHaveValue(0.19);
  });

  it('submits a PATCH request and replaces the row on success', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    const row = (await screen.findByText('State Sales Tax')).closest('tr')!;

    const updatedRule: MerchantTaxRule = {
      ...MOCK_RULES[0],
      name: 'Updated State Sales Tax',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: updatedRule }),
      }),
    );

    await user.click(within(row).getByLabelText('Edit tax rule'));
    const nameInput = screen.getByLabelText('Rule Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated State Sales Tax');
    await user.click(screen.getByRole('button', { name: /save tax rule/i }));

    expect(await screen.findByText('Updated State Sales Tax')).toBeInTheDocument();
    expect(screen.getByText('Tax rule updated successfully')).toBeInTheDocument();
  });

  it('shows an error toast when edit fails', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    const row = (await screen.findByText('State Sales Tax')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
        json: async () => ({ message: 'Server error' }),
      }),
    );

    await user.click(within(row).getByLabelText('Edit tax rule'));
    const nameInput = screen.getByLabelText('Rule Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Changed Name');
    await user.click(screen.getByRole('button', { name: /save tax rule/i }));

    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('disables submit in edit mode when no fields have changed', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    const row = (await screen.findByText('State Sales Tax')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit tax rule'));

    expect(screen.getByRole('dialog', { name: /edit tax rule/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save tax rule/i })).toBeDisabled();
  });
});

describe('TaxRulesView — detail inspection', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the detail modal with audit fields when a row is clicked', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    const row = (await screen.findByText('State Sales Tax')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          data: {
            ...MOCK_RULES[0],
            createdAt: '2026-01-05T10:00:00.000Z',
            updatedAt: '2026-02-10T12:00:00.000Z',
            createdBy: { id: 1, username: 'jane.doe', email: 'jane@company.com' },
            updatedBy: { id: 2, username: null, email: 'ops@company.com' },
          },
        }),
      }),
    );

    await user.click(row);

    expect(await screen.findByRole('dialog', { name: /tax rule details/i })).toBeInTheDocument();
    expect(screen.getByText(/jane\.doe/)).toBeInTheDocument();
    expect(screen.getByText(/ops@company\.com/)).toBeInTheDocument();
  });

  it('does not open the detail modal when an action icon is clicked', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    const row = (await screen.findByText('State Sales Tax')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit tax rule'));

    expect(screen.queryByRole('dialog', { name: /tax rule details/i })).not.toBeInTheDocument();
  });
});

describe('TaxRulesView — status toggle', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('deactivates an active rule after confirmation', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    const row = (await screen.findByText('State Sales Tax')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: { ...MOCK_RULES[0], status: 'inactive' } }),
      }),
    );

    await user.click(within(row).getByLabelText('Deactivate tax rule'));
    expect(screen.getByText(/deactivate this tax rule/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await screen.findByText('Tax rule deactivated successfully');
    const updatedRow = (await screen.findByText('State Sales Tax')).closest('tr')!;
    expect(within(updatedRow).getByText('Inactive')).toBeInTheDocument();
  });

  it('reactivates an inactive rule after confirmation', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    const row = (await screen.findByText('Flat Environmental Fee')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: { ...MOCK_RULES[1], status: 'active' } }),
      }),
    );

    await user.click(within(row).getByLabelText('Reactivate tax rule'));
    expect(screen.getByText(/reactivate this tax rule/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await screen.findByText('Tax rule reactivated successfully');
  });

  it('does not send a request when the confirm dialog is cancelled', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ data: MOCK_RULES }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    render(<TaxRulesView />);
    const row = (await screen.findByText('State Sales Tax')).closest('tr')!;

    const callsBefore = fetchSpy.mock.calls.length;
    await user.click(within(row).getByLabelText('Deactivate tax rule'));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
    expect(screen.queryByText(/deactivate this tax rule/i)).not.toBeInTheDocument();
  });
});

describe('TaxRulesView — cross-configuration quick links', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('renders all four shortcut anchors', async () => {
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    const nav = screen.getByRole('navigation', { name: /related configuration shortcuts/i });
    expect(within(nav).getByText('TAX RULES')).toBeInTheDocument();
    expect(within(nav).getByText('PAYROLL RULES')).toBeInTheDocument();
    expect(within(nav).getByText('OVERTIME RULES')).toBeInTheDocument();
    expect(within(nav).getByText('TIPS MANAGEMENT')).toBeInTheDocument();
  });

  it('renders the Quick Launch panel title and description', async () => {
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    const nav = screen.getByRole('navigation', { name: /related configuration shortcuts/i });
    expect(within(nav).getByText('Rule Configuration Shortcuts')).toBeInTheDocument();
    expect(
      within(nav).getByText(
        'Pivot across Tax, Payroll, Overtime, and Tips rule modules without leaving merchant configuration context.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the shortcut bar even while loading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<TaxRulesView />);
    const nav = screen.getByRole('navigation', { name: /related configuration shortcuts/i });
    expect(within(nav).getByText('PAYROLL RULES')).toBeInTheDocument();
  });

  it('renders the shortcut bar in the true-empty state', async () => {
    cleanup();
    vi.unstubAllGlobals();
    mockFetchOnce([]);
    render(<TaxRulesView />);
    await screen.findByTestId('tax-rules-empty-state');
    const nav = screen.getByRole('navigation', { name: /related configuration shortcuts/i });
    expect(within(nav).getByText('TIPS MANAGEMENT')).toBeInTheDocument();
  });

  it('marks TAX RULES as the active anchor and does not render it as a button', async () => {
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    const nav = screen.getByRole('navigation', { name: /related configuration shortcuts/i });
    const activeAnchor = within(nav).getByText('TAX RULES');
    expect(activeAnchor.closest('[aria-current="page"]')).toBeInTheDocument();
    expect(activeAnchor.closest('button')).not.toBeInTheDocument();
  });

  it('calls onNavigate with the payroll feature id when PAYROLL RULES is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<TaxRulesView onNavigate={onNavigate} />);
    await screen.findByText('State Sales Tax');

    await user.click(screen.getByRole('button', { name: /payroll rules/i }));
    expect(onNavigate).toHaveBeenCalledWith('merchant-payroll-rules');
  });

  it('calls onNavigate with the overtime feature id when OVERTIME RULES is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<TaxRulesView onNavigate={onNavigate} />);
    await screen.findByText('State Sales Tax');

    await user.click(screen.getByRole('button', { name: /overtime rules/i }));
    expect(onNavigate).toHaveBeenCalledWith('merchant-overtime-rules');
  });

  it('calls onNavigate with the tips feature id when TIPS MANAGEMENT is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<TaxRulesView onNavigate={onNavigate} />);
    await screen.findByText('State Sales Tax');

    await user.click(screen.getByRole('button', { name: /tips management/i }));
    expect(onNavigate).toHaveBeenCalledWith('merchant-tips-rules');
  });

  it('does not throw when a shortcut is clicked and onNavigate is not provided', async () => {
    const user = userEvent.setup();
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    await user.click(screen.getByRole('button', { name: /overtime rules/i }));
    expect(screen.getByText('State Sales Tax')).toBeInTheDocument();
  });
});
