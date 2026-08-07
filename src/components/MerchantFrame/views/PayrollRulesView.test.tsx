import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { PayrollRulesView } from './PayrollRulesView';
import type { MerchantPayrollRule } from '../../../types/configuration';

vi.mock('../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const weeklyRule: MerchantPayrollRule = {
  id: 1,
  name: 'Weekly Hourly Staff',
  frequencyPayroll: 'weekly',
  payDayOfWeek: 1,
  payDayOfMonth: null,
  allowNegativePayroll: false,
  roundingPrecision: 2,
  currency: 'USD',
  autoApprovePayroll: true,
  requiresManagerApproval: false,
  status: 'active',
};

const biweeklyRule: MerchantPayrollRule = {
  id: 2,
  name: 'Biweekly Salaried',
  frequencyPayroll: 'biweekly',
  payDayOfWeek: 3,
  payDayOfMonth: null,
  allowNegativePayroll: false,
  roundingPrecision: 2,
  currency: 'CLP',
  autoApprovePayroll: false,
  requiresManagerApproval: true,
  status: 'active',
};

const monthlyRule: MerchantPayrollRule = {
  id: 3,
  name: 'Monthly Executive',
  frequencyPayroll: 'monthly',
  payDayOfWeek: null,
  payDayOfMonth: 31,
  allowNegativePayroll: true,
  roundingPrecision: 4,
  currency: 'CLP',
  autoApprovePayroll: false,
  requiresManagerApproval: false,
  status: 'inactive',
};

const customRule: MerchantPayrollRule = {
  id: 4,
  name: 'Custom Contractor Cycle',
  frequencyPayroll: 'custom',
  payDayOfWeek: null,
  payDayOfMonth: null,
  allowNegativePayroll: false,
  roundingPrecision: 0,
  currency: 'USD',
  autoApprovePayroll: true,
  requiresManagerApproval: true,
  status: 'active',
};

const MOCK_RULES: MerchantPayrollRule[] = [weeklyRule, biweeklyRule, monthlyRule, customRule];

function mockFetchOnce(data: MerchantPayrollRule[], status = 200) {
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

describe('PayrollRulesView — data fetch', () => {
  it('fetches payroll rules on mount', async () => {
    mockFetchOnce([weeklyRule]);
    render(<PayrollRulesView />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/merchant-payroll-rule?limit=100'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }),
        }),
      );
    });
  });

  it('shows a loading indicator while fetching', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<PayrollRulesView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error card with retry when the fetch fails', async () => {
    mockFetchOnce([], 500);
    render(<PayrollRulesView />);

    expect(await screen.findByText(/Failed to load payroll rules/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
  });

  it('redirects to login on a 401 response', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };

    mockFetchOnce([], 401);
    render(<PayrollRulesView />);

    await waitFor(() => expect(window.location.href).toBe('/login'));

    // @ts-expect-error restoring original Location object
    window.location = originalLocation;
  });
});

describe('PayrollRulesView — empty state', () => {
  it('shows the real empty state when the API returns zero rules', async () => {
    mockFetchOnce([]);
    render(<PayrollRulesView />);

    expect(await screen.findByTestId('payroll-rules-empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(/No payroll execution rules configured for this company/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add payroll rule/i })).toBeInTheDocument();
  });

  it('shows the filtered-empty row and a working Clear filters link when a filter matches nothing', async () => {
    mockFetchOnce(MOCK_RULES);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    await userEvent.type(screen.getByLabelText(/search payroll rules/i), 'zzz-no-match');

    expect(screen.getByText(/No payroll rules match your active filters/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Clear filters'));
    expect(screen.getByText('Weekly Hourly Staff')).toBeInTheDocument();
  });
});

describe('PayrollRulesView — schedule formatting', () => {
  it('renders "Weekly (Day N)" for weekly rules', async () => {
    mockFetchOnce([weeklyRule]);
    render(<PayrollRulesView />);
    expect(await screen.findByText('Weekly (Day 1)')).toBeInTheDocument();
  });

  it('renders "Biweekly (Day N)" for biweekly rules', async () => {
    mockFetchOnce([biweeklyRule]);
    render(<PayrollRulesView />);
    expect(await screen.findByText('Biweekly (Day 3)')).toBeInTheDocument();
  });

  it('renders "Monthly (Day N)" for monthly rules', async () => {
    mockFetchOnce([monthlyRule]);
    render(<PayrollRulesView />);
    expect(await screen.findByText('Monthly (Day 31)')).toBeInTheDocument();
  });

  it('renders "Custom" with no day suffix for custom rules', async () => {
    mockFetchOnce([customRule]);
    render(<PayrollRulesView />);
    expect(await screen.findByText('Custom')).toBeInTheDocument();
  });
});

describe('PayrollRulesView — grid columns', () => {
  it('shows the name and currency badge', async () => {
    mockFetchOnce([weeklyRule]);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('shows rounding precision as "Decimals: N"', async () => {
    mockFetchOnce([monthlyRule]);
    render(<PayrollRulesView />);
    expect(await screen.findByText('Decimals: 4')).toBeInTheDocument();
  });

  it('shows the "Negative Balances Allowed" badge only when allowNegativePayroll is true', async () => {
    mockFetchOnce([weeklyRule, monthlyRule]);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    const weeklyRow = screen.getByTestId('payroll-rule-row-1');
    const monthlyRow = screen.getByTestId('payroll-rule-row-3');

    // weeklyRule.allowNegativePayroll is false — badge only on the monthly row
    expect(within(monthlyRow).getByText('Negative Balances Allowed')).toBeInTheDocument();
    expect(within(weeklyRow).queryByText('Negative Balances Allowed')).not.toBeInTheDocument();
  });

  it('shows Auto-Approve and Manager Required badges independently', async () => {
    mockFetchOnce([weeklyRule, biweeklyRule]);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    const weeklyRow = screen.getByTestId('payroll-rule-row-1');
    const biweeklyRow = screen.getByTestId('payroll-rule-row-2');

    expect(within(weeklyRow).getByText('Auto-Approve')).toBeInTheDocument();
    expect(within(biweeklyRow).getByText('Manager Required')).toBeInTheDocument();
  });

  it('shows Active/Inactive status badges', async () => {
    mockFetchOnce([weeklyRule, monthlyRule]);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    const weeklyRow = screen.getByTestId('payroll-rule-row-1');
    const monthlyRow = screen.getByTestId('payroll-rule-row-3');

    expect(within(weeklyRow).getByText('Active')).toBeInTheDocument();
    expect(within(monthlyRow).getByText('Inactive')).toBeInTheDocument();
  });
});

describe('PayrollRulesView — filters', () => {
  it('filters by search text against name', async () => {
    mockFetchOnce(MOCK_RULES);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    await userEvent.type(screen.getByLabelText(/search payroll rules/i), 'Executive');

    expect(screen.queryByText('Weekly Hourly Staff')).not.toBeInTheDocument();
    expect(screen.getByText('Monthly Executive')).toBeInTheDocument();
  });

  it('filters by search text against currency', async () => {
    mockFetchOnce(MOCK_RULES);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    await userEvent.type(screen.getByLabelText(/search payroll rules/i), 'CLP');

    expect(screen.queryByText('Weekly Hourly Staff')).not.toBeInTheDocument();
    expect(screen.getByText('Biweekly Salaried')).toBeInTheDocument();
    expect(screen.getByText('Monthly Executive')).toBeInTheDocument();
  });

  it('filters by payroll frequency', async () => {
    mockFetchOnce(MOCK_RULES);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    await userEvent.selectOptions(screen.getByLabelText(/filter by payroll frequency/i), 'monthly');

    expect(screen.queryByText('Weekly Hourly Staff')).not.toBeInTheDocument();
    expect(screen.getByText('Monthly Executive')).toBeInTheDocument();
  });

  it('filters by Auto-Approve checkbox', async () => {
    mockFetchOnce(MOCK_RULES);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    await userEvent.click(screen.getByLabelText('Auto-Approve'));

    expect(screen.getByText('Weekly Hourly Staff')).toBeInTheDocument();
    expect(screen.queryByText('Biweekly Salaried')).not.toBeInTheDocument();
  });

  it('filters by Manager Required checkbox', async () => {
    mockFetchOnce(MOCK_RULES);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    await userEvent.click(screen.getByLabelText('Manager Required'));

    expect(screen.queryByText('Weekly Hourly Staff')).not.toBeInTheDocument();
    expect(screen.getByText('Biweekly Salaried')).toBeInTheDocument();
  });

  it('filters by Negative Balances Allowed checkbox', async () => {
    mockFetchOnce(MOCK_RULES);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    await userEvent.click(screen.getByLabelText('Negative Balances Allowed'));

    expect(screen.queryByText('Weekly Hourly Staff')).not.toBeInTheDocument();
    expect(screen.getByText('Monthly Executive')).toBeInTheDocument();
  });

  it('combines multiple checkbox filters with AND', async () => {
    mockFetchOnce(MOCK_RULES);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    await userEvent.click(screen.getByLabelText('Auto-Approve'));
    await userEvent.click(screen.getByLabelText('Manager Required'));

    // customRule is the only rule with both autoApprovePayroll and requiresManagerApproval true
    expect(screen.getByText('Custom Contractor Cycle')).toBeInTheDocument();
    expect(screen.queryByText('Weekly Hourly Staff')).not.toBeInTheDocument();
    expect(screen.queryByText('Biweekly Salaried')).not.toBeInTheDocument();
  });

  it('filters by status', async () => {
    mockFetchOnce(MOCK_RULES);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'inactive');

    expect(screen.queryByText('Weekly Hourly Staff')).not.toBeInTheDocument();
    expect(screen.getByText('Monthly Executive')).toBeInTheDocument();
  });

  it('shows "Clear Filters" only while a filter is active and results are non-empty', async () => {
    mockFetchOnce(MOCK_RULES);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/filter by payroll frequency/i), 'monthly');
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.getByText('Weekly Hourly Staff')).toBeInTheDocument();
  });
});

describe('PayrollRulesView — quick links', () => {
  it('renders the RuleConfigQuickLinks bar with payroll marked active', async () => {
    mockFetchOnce([weeklyRule]);
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    expect(screen.getByText('PAYROLL RULES')).toBeInTheDocument();
  });
});

describe('PayrollRulesView — create payroll rule', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the create modal from the toolbar button', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    await user.click(screen.getByRole('button', { name: /add payroll rule/i }));

    expect(screen.getByRole('dialog', { name: /add payroll rule/i })).toBeInTheDocument();
  });

  it('opens the create modal from the FAB', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    await user.click(screen.getByLabelText('Quick create payroll rule'));

    expect(screen.getByRole('dialog', { name: /add payroll rule/i })).toBeInTheDocument();
  });

  it('opens the create modal from the empty-state CTA', async () => {
    mockFetchOnce([]);
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    await screen.findByTestId('payroll-rules-empty-state');

    await user.click(screen.getByRole('button', { name: /add payroll rule/i }));

    expect(screen.getByRole('dialog', { name: /add payroll rule/i })).toBeInTheDocument();
  });

  it('shows Pay Day of Week for weekly/biweekly and Pay Day of Month for monthly, hiding both for custom', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');
    await user.click(screen.getByRole('button', { name: /add payroll rule/i }));

    expect(screen.getByLabelText(/pay day of week/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/pay day of month/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Frequency'), 'monthly');
    expect(screen.queryByLabelText(/pay day of week/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/pay day of month/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Frequency'), 'custom');
    expect(screen.queryByLabelText(/pay day of week/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/pay day of month/i)).not.toBeInTheDocument();
  });

  it('blocks submit when Pay Day of Month is out of the 1-31 range', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');
    await user.click(screen.getByRole('button', { name: /add payroll rule/i }));

    await user.type(screen.getByLabelText('Rule Name'), 'Executive Monthly');
    await user.type(screen.getByLabelText('Currency'), 'USD');
    await user.type(screen.getByLabelText('Rounding Precision'), '2');
    await user.selectOptions(screen.getByLabelText('Frequency'), 'monthly');
    await user.type(screen.getByLabelText(/pay day of month/i), '45');

    expect(screen.getByRole('button', { name: /save payroll rule/i })).toBeDisabled();
    expect(screen.getByText(/must be an integer from 1 to 31/i)).toBeInTheDocument();
  });

  it('blocks submit when name exceeds 50 characters', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');
    await user.click(screen.getByRole('button', { name: /add payroll rule/i }));

    await user.type(screen.getByLabelText('Rule Name'), 'a'.repeat(51));
    await user.type(screen.getByLabelText('Currency'), 'USD');
    await user.type(screen.getByLabelText('Rounding Precision'), '2');
    await user.type(screen.getByLabelText(/pay day of week/i), '1');

    expect(screen.getByRole('button', { name: /save payroll rule/i })).toBeDisabled();
  });

  it('blocks submit when currency exceeds 10 characters', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');
    await user.click(screen.getByRole('button', { name: /add payroll rule/i }));

    await user.type(screen.getByLabelText('Rule Name'), 'Long Currency Test');
    await user.type(screen.getByLabelText('Currency'), 'ABCDEFGHIJK');
    await user.type(screen.getByLabelText('Rounding Precision'), '2');
    await user.type(screen.getByLabelText(/pay day of week/i), '1');

    expect(screen.getByRole('button', { name: /save payroll rule/i })).toBeDisabled();
  });

  it('submits a POST request with the contextual day field only, and prepends the new rule on success', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    const createdRule: MerchantPayrollRule = {
      id: 5,
      name: 'New Weekly Crew',
      frequencyPayroll: 'weekly',
      payDayOfWeek: 5,
      payDayOfMonth: null,
      allowNegativePayroll: false,
      roundingPrecision: 2,
      currency: 'USD',
      autoApprovePayroll: false,
      requiresManagerApproval: false,
      status: 'active',
    };

    const fetchSpy = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ data: createdRule }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await user.click(screen.getByRole('button', { name: /add payroll rule/i }));
    await user.type(screen.getByLabelText('Rule Name'), 'New Weekly Crew');
    await user.type(screen.getByLabelText('Currency'), 'USD');
    await user.type(screen.getByLabelText('Rounding Precision'), '2');
    await user.type(screen.getByLabelText(/pay day of week/i), '5');
    await user.click(screen.getByRole('button', { name: /save payroll rule/i }));

    expect(await screen.findByText('New Weekly Crew')).toBeInTheDocument();
    expect(screen.getByText('Payroll rule created successfully')).toBeInTheDocument();

    const [, requestInit] = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const body = JSON.parse(requestInit.body as string);
    expect(body.frequencyPayroll).toBe('weekly');
    expect(body.payDayOfWeek).toBe(5);
    expect(body.payDayOfMonth).toBeNull();
  });

  it('shows an error toast and closes the modal when create fails', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    await screen.findByText('Weekly Hourly Staff');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ message: 'Invalid payload' }),
      }),
    );

    await user.click(screen.getByRole('button', { name: /add payroll rule/i }));
    await user.type(screen.getByLabelText('Rule Name'), 'New Weekly Crew');
    await user.type(screen.getByLabelText('Currency'), 'USD');
    await user.type(screen.getByLabelText('Rounding Precision'), '2');
    await user.type(screen.getByLabelText(/pay day of week/i), '5');
    await user.click(screen.getByRole('button', { name: /save payroll rule/i }));

    expect(await screen.findByText('Invalid payload')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /add payroll rule/i })).not.toBeInTheDocument();
  });
});

describe('PayrollRulesView — edit payroll rule', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the edit modal pre-filled from the pencil action', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    const row = (await screen.findByText('Weekly Hourly Staff')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit payroll rule'));

    const dialog = screen.getByRole('dialog', { name: /edit payroll rule/i });
    expect(within(dialog).getByLabelText('Rule Name')).toHaveValue('Weekly Hourly Staff');
    expect(within(dialog).getByLabelText('Frequency')).toHaveValue('weekly');
    expect(within(dialog).getByLabelText(/pay day of week/i)).toHaveValue(1);
  });

  it('submits a PATCH request and replaces the row on success', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    const row = (await screen.findByText('Weekly Hourly Staff')).closest('tr')!;

    const updatedRule: MerchantPayrollRule = { ...weeklyRule, name: 'Updated Weekly Crew' };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: updatedRule }),
      }),
    );

    await user.click(within(row).getByLabelText('Edit payroll rule'));
    const nameInput = screen.getByLabelText('Rule Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Weekly Crew');
    await user.click(screen.getByRole('button', { name: /save payroll rule/i }));

    expect(await screen.findByText('Updated Weekly Crew')).toBeInTheDocument();
    expect(screen.getByText('Payroll rule updated successfully')).toBeInTheDocument();
  });

  it('shows an error toast when edit fails', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    const row = (await screen.findByText('Weekly Hourly Staff')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
        json: async () => ({ message: 'Server error' }),
      }),
    );

    await user.click(within(row).getByLabelText('Edit payroll rule'));
    const nameInput = screen.getByLabelText('Rule Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Changed Name');
    await user.click(screen.getByRole('button', { name: /save payroll rule/i }));

    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('disables submit in edit mode when no fields have changed', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    const row = (await screen.findByText('Weekly Hourly Staff')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit payroll rule'));

    expect(screen.getByRole('dialog', { name: /edit payroll rule/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save payroll rule/i })).toBeDisabled();
  });
});

describe('PayrollRulesView — detail inspection', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the detail modal with audit fields when a row is clicked', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    const row = (await screen.findByText('Weekly Hourly Staff')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          data: {
            ...weeklyRule,
            createdAt: '2026-01-05T10:00:00.000Z',
            updatedAt: '2026-02-10T12:00:00.000Z',
            createdBy: { id: 1, username: 'jane.doe', email: 'jane@company.com' },
            updatedBy: { id: 2, username: null, email: 'ops@company.com' },
          },
        }),
      }),
    );

    await user.click(row);

    expect(await screen.findByRole('dialog', { name: /payroll rule details/i })).toBeInTheDocument();
    expect(screen.getByText(/jane\.doe/)).toBeInTheDocument();
    expect(screen.getByText(/ops@company\.com/)).toBeInTheDocument();
  });

  it('does not open the detail modal when the edit icon is clicked', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    const row = (await screen.findByText('Weekly Hourly Staff')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit payroll rule'));

    expect(screen.queryByRole('dialog', { name: /payroll rule details/i })).not.toBeInTheDocument();
  });
});

describe('PayrollRulesView — status toggle', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('deactivates an active rule after confirmation', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    const row = (await screen.findByText('Weekly Hourly Staff')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: { ...weeklyRule, status: 'inactive' } }),
      }),
    );

    await user.click(within(row).getByLabelText('Deactivate payroll rule'));
    expect(screen.getByText(/deactivate this payroll rule/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await screen.findByText('Payroll rule deactivated successfully');
    const updatedRow = (await screen.findByText('Weekly Hourly Staff')).closest('tr')!;
    expect(within(updatedRow).getByText('Inactive')).toBeInTheDocument();
  });

  it('reactivates an inactive rule after confirmation', async () => {
    const user = userEvent.setup();
    render(<PayrollRulesView />);
    const row = (await screen.findByText('Monthly Executive')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: { ...monthlyRule, status: 'active' } }),
      }),
    );

    await user.click(within(row).getByLabelText('Reactivate payroll rule'));
    expect(screen.getByText(/reactivate this payroll rule/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await screen.findByText('Payroll rule reactivated successfully');
  });

  it('does not send a request when the confirm dialog is cancelled', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ data: MOCK_RULES }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    render(<PayrollRulesView />);
    const row = (await screen.findByText('Weekly Hourly Staff')).closest('tr')!;

    const callsBefore = fetchSpy.mock.calls.length;
    await user.click(within(row).getByLabelText('Deactivate payroll rule'));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
    expect(screen.queryByText(/deactivate this payroll rule/i)).not.toBeInTheDocument();
  });
});
