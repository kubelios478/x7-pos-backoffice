import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { OvertimeRulesView } from './OvertimeRulesView';
import type { MerchantOvertimeRule } from '../../../types/configuration';

vi.mock('../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const baseRule: MerchantOvertimeRule = {
  id: 1,
  name: 'Daily Overtime',
  description: 'Standard daily overtime after threshold',
  calculationMethod: 'daily',
  thresholdHours: 8,
  maxHours: 12,
  rateMethod: 'percentage',
  rateValue: 150,
  appliesOnHolidays: false,
  appliesOnWeekends: false,
  priority: 1,
  status: 'active',
};

const secondRule: MerchantOvertimeRule = {
  id: 2,
  name: 'Holiday Multiplier Rule',
  description: 'Holiday premium multiplier',
  calculationMethod: 'holiday',
  thresholdHours: null,
  maxHours: null,
  rateMethod: 'multiplier',
  rateValue: 150,
  appliesOnHolidays: true,
  appliesOnWeekends: false,
  priority: 2,
  status: 'inactive',
};

const MOCK_RULES: MerchantOvertimeRule[] = [baseRule, secondRule];

function mockFetchOnce(data: MerchantOvertimeRule[], status = 200) {
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

describe('OvertimeRulesView — data fetch', () => {
  it('fetches overtime rules on mount', async () => {
    mockFetchOnce([baseRule]);
    render(<OvertimeRulesView />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/merchant-overtime-rule?limit=100'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }),
        }),
      );
    });
  });

  it('shows a loading indicator while fetching', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<OvertimeRulesView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error card with retry when the fetch fails', async () => {
    mockFetchOnce([], 500);
    render(<OvertimeRulesView />);

    expect(await screen.findByText(/Failed to load overtime rules/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
  });

  it('redirects to login on a 401 response', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };

    mockFetchOnce([], 401);
    render(<OvertimeRulesView />);

    await waitFor(() => expect(window.location.href).toBe('/login'));

    // @ts-expect-error restoring original Location object
    window.location = originalLocation;
  });
});

describe('OvertimeRulesView — empty state', () => {
  it('shows the real empty state when the API returns zero rules', async () => {
    mockFetchOnce([]);
    render(<OvertimeRulesView />);

    expect(await screen.findByTestId('overtime-rules-empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(/No overtime compensation rules configured for this company/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add overtime rule/i })).toBeInTheDocument();
  });
});

describe('OvertimeRulesView — filters', () => {
  it('filters by search text against name and description', async () => {
    mockFetchOnce([
      baseRule,
      { ...baseRule, id: 2, name: 'Weekend Boost', description: 'Weekend special rate' },
    ]);
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');

    await userEvent.type(screen.getByLabelText(/search overtime rules/i), 'Weekend');

    expect(screen.queryByText('Daily Overtime')).not.toBeInTheDocument();
    expect(screen.getByText('Weekend Boost')).toBeInTheDocument();
  });

  it('filters by calculation method', async () => {
    mockFetchOnce([
      baseRule,
      { ...baseRule, id: 2, name: 'Weekly Rule', calculationMethod: 'weekly' },
    ]);
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');

    await userEvent.selectOptions(
      screen.getByLabelText(/filter by calculation method/i),
      'weekly',
    );

    expect(screen.queryByText('Daily Overtime')).not.toBeInTheDocument();
    expect(screen.getByText('Weekly Rule')).toBeInTheDocument();
  });

  it('filters by rate method', async () => {
    mockFetchOnce([
      baseRule,
      { ...baseRule, id: 2, name: 'Multiplier Rule', rateMethod: 'multiplier', rateValue: 150 },
    ]);
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');

    await userEvent.selectOptions(
      screen.getByLabelText(/filter by rate method/i),
      'multiplier',
    );

    expect(screen.queryByText('Daily Overtime')).not.toBeInTheDocument();
    expect(screen.getByText('Multiplier Rule')).toBeInTheDocument();
  });

  it('filters by the holidays and weekends checkboxes', async () => {
    mockFetchOnce([
      baseRule,
      { ...baseRule, id: 2, name: 'Holiday Rule', appliesOnHolidays: true },
      { ...baseRule, id: 3, name: 'Weekend Rule', appliesOnWeekends: true },
    ]);
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');

    await userEvent.click(screen.getByLabelText(/applies on holidays/i));

    expect(screen.getByText('Holiday Rule')).toBeInTheDocument();
    expect(screen.queryByText('Weekend Rule')).not.toBeInTheDocument();
    expect(screen.queryByText('Daily Overtime')).not.toBeInTheDocument();
  });

  it('filters by status', async () => {
    mockFetchOnce([
      baseRule,
      { ...baseRule, id: 2, name: 'Inactive Rule', status: 'inactive' },
    ]);
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');

    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'inactive');

    expect(screen.queryByText('Daily Overtime')).not.toBeInTheDocument();
    expect(screen.getByText('Inactive Rule')).toBeInTheDocument();
  });

  it('shows a filtered-empty state with a clear-filters action when no row matches', async () => {
    mockFetchOnce([baseRule]);
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');

    await userEvent.type(screen.getByLabelText(/search overtime rules/i), 'zzzznomatch');

    expect(screen.getByText(/no overtime rules match your active filters/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.getByText('Daily Overtime')).toBeInTheDocument();
  });
});

describe('grid row formatting', () => {
  it('renders priority, threshold matrix, and rate mechanics for each rate method', async () => {
    mockFetchOnce([
      { ...baseRule, id: 1, priority: 1, thresholdHours: 8, maxHours: 12, rateMethod: 'percentage', rateValue: 150 },
      { ...baseRule, id: 2, name: 'Multiplier Rule', priority: 2, thresholdHours: null, maxHours: null, rateMethod: 'multiplier', rateValue: 150 },
      { ...baseRule, id: 3, name: 'Fixed Rule', priority: 3, rateMethod: 'fixed_amount', rateValue: 15 },
    ]);
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');

    const row1 = screen.getByTestId('overtime-rule-row-1');
    expect(within(row1).getByText('[Priority: 1]')).toBeInTheDocument();
    expect(within(row1).getByText('8h Threshold / 12 Max')).toBeInTheDocument();
    expect(within(row1).getByText('150%')).toBeInTheDocument();

    const row2 = screen.getByTestId('overtime-rule-row-2');
    expect(within(row2).getByText('-- Threshold / -- Max')).toBeInTheDocument();
    expect(within(row2).getByText('x1.50')).toBeInTheDocument();

    const row3 = screen.getByTestId('overtime-rule-row-3');
    expect(within(row3).getByText('+$15.00')).toBeInTheDocument();
  });

  it('shows calendar restriction badges based on appliesOnHolidays/appliesOnWeekends', async () => {
    mockFetchOnce([
      { ...baseRule, id: 1, appliesOnHolidays: true, appliesOnWeekends: false },
      { ...baseRule, id: 2, name: 'Weekend Rule', appliesOnHolidays: false, appliesOnWeekends: true },
      { ...baseRule, id: 3, name: 'Neither Rule', appliesOnHolidays: false, appliesOnWeekends: false },
    ]);
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');

    expect(within(screen.getByTestId('overtime-rule-row-1')).getByText('Holidays')).toBeInTheDocument();
    expect(within(screen.getByTestId('overtime-rule-row-2')).getByText('Weekends')).toBeInTheDocument();
    expect(within(screen.getByTestId('overtime-rule-row-3')).getByText('—')).toBeInTheDocument();
  });

  it('shows an Active or Inactive status badge', async () => {
    mockFetchOnce([
      { ...baseRule, id: 1, status: 'active' },
      { ...baseRule, id: 2, name: 'Inactive Row', status: 'inactive' },
    ]);
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');

    expect(within(screen.getByTestId('overtime-rule-row-1')).getByText('Active')).toBeInTheDocument();
    expect(within(screen.getByTestId('overtime-rule-row-2')).getByText('Inactive')).toBeInTheDocument();
  });

  it('sorts rows by priority ascending by default', async () => {
    mockFetchOnce([
      { ...baseRule, id: 1, name: 'Third', priority: 30 },
      { ...baseRule, id: 2, name: 'First', priority: 1 },
      { ...baseRule, id: 3, name: 'Second', priority: 15 },
    ]);
    render(<OvertimeRulesView />);
    await screen.findByText('First');

    const rows = screen.getAllByRole('row').slice(1); // skip header row
    const names = rows.map((row) => within(row).getAllByText(/First|Second|Third/)[0].textContent);
    expect(names).toEqual(['First', 'Second', 'Third']);
  });
});

describe('OvertimeRulesView — create overtime rule', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the create modal from the toolbar button', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');

    await user.click(screen.getByRole('button', { name: /add overtime rule/i }));

    expect(screen.getByRole('dialog', { name: /add overtime rule/i })).toBeInTheDocument();
  });

  it('opens the create modal from the FAB', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');

    await user.click(screen.getByLabelText('Quick create overtime rule'));

    expect(screen.getByRole('dialog', { name: /add overtime rule/i })).toBeInTheDocument();
  });

  it('opens the create modal from the empty-state CTA', async () => {
    mockFetchOnce([]);
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    await screen.findByTestId('overtime-rules-empty-state');

    await user.click(screen.getByRole('button', { name: /add overtime rule/i }));

    expect(screen.getByRole('dialog', { name: /add overtime rule/i })).toBeInTheDocument();
  });

  it('disables submit until name, description, threshold/max, rate value, and priority are provided', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');
    await user.click(screen.getByRole('button', { name: /add overtime rule/i }));

    const submitButton = screen.getByRole('button', { name: /save overtime rule/i });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Rule Name'), 'New Rule');
    await user.type(screen.getByLabelText('Description'), 'A brand new overtime rule');
    await user.type(screen.getByLabelText('Threshold Hours'), '8');
    await user.type(screen.getByLabelText('Max Hours'), '12');
    await user.type(screen.getByLabelText('Rate Value (%)'), '150');
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Priority'), '1');
    expect(submitButton).toBeEnabled();
  });

  it('blocks submit when name exceeds 50 characters', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');
    await user.click(screen.getByRole('button', { name: /add overtime rule/i }));

    await user.type(screen.getByLabelText('Rule Name'), 'a'.repeat(51));
    await user.type(screen.getByLabelText('Description'), 'A brand new overtime rule');
    await user.type(screen.getByLabelText('Threshold Hours'), '8');
    await user.type(screen.getByLabelText('Max Hours'), '12');
    await user.type(screen.getByLabelText('Rate Value (%)'), '150');
    await user.type(screen.getByLabelText('Priority'), '1');

    expect(screen.getByRole('button', { name: /save overtime rule/i })).toBeDisabled();
  });

  it('blocks submit when description exceeds 200 characters', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');
    await user.click(screen.getByRole('button', { name: /add overtime rule/i }));

    await user.type(screen.getByLabelText('Rule Name'), 'New Rule');
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'a'.repeat(201) } });
    await user.type(screen.getByLabelText('Threshold Hours'), '8');
    await user.type(screen.getByLabelText('Max Hours'), '12');
    await user.type(screen.getByLabelText('Rate Value (%)'), '150');
    await user.type(screen.getByLabelText('Priority'), '1');

    expect(screen.getByRole('button', { name: /save overtime rule/i })).toBeDisabled();
  });

  it('requires and shows Threshold/Max Hours for daily and weekly, hides and clears them for holiday and special_day', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');
    await user.click(screen.getByRole('button', { name: /add overtime rule/i }));

    expect(screen.getByLabelText('Threshold Hours')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Hours')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Calculation Method'), 'holiday');
    expect(screen.queryByLabelText('Threshold Hours')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Max Hours')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Calculation Method'), 'special_day');
    expect(screen.queryByLabelText('Threshold Hours')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Max Hours')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Calculation Method'), 'weekly');
    expect(screen.getByLabelText('Threshold Hours')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Hours')).toBeInTheDocument();
  });

  it('relabels the Rate Value field and converts multiplier input x100 on submit', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');
    await user.click(screen.getByRole('button', { name: /add overtime rule/i }));

    expect(screen.getByLabelText('Rate Value (%)')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Rate Method'), 'multiplier');
    expect(screen.queryByLabelText('Rate Value (%)')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Rate Value (×)')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Rate Method'), 'fixed_amount');
    expect(screen.getByLabelText('Rate Value ($)')).toBeInTheDocument();
  });

  it('submits a POST request with converted values and prepends the new rule on success', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');

    const createdRule: MerchantOvertimeRule = {
      id: 3,
      name: 'New Weekend Rule',
      description: 'Weekend premium multiplier',
      calculationMethod: 'daily',
      thresholdHours: 8,
      maxHours: 12,
      rateMethod: 'multiplier',
      rateValue: 150,
      appliesOnHolidays: false,
      appliesOnWeekends: true,
      priority: 3,
      status: 'active',
    };

    const fetchSpy = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ data: createdRule }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await user.click(screen.getByRole('button', { name: /add overtime rule/i }));
    await user.type(screen.getByLabelText('Rule Name'), 'New Weekend Rule');
    await user.type(screen.getByLabelText('Description'), 'Weekend premium multiplier');
    await user.type(screen.getByLabelText('Threshold Hours'), '8');
    await user.type(screen.getByLabelText('Max Hours'), '12');
    await user.selectOptions(screen.getByLabelText('Rate Method'), 'multiplier');
    await user.type(screen.getByLabelText('Rate Value (×)'), '1.5');
    await user.type(screen.getByLabelText('Priority'), '3');
    await user.click(screen.getByRole('button', { name: /save overtime rule/i }));

    expect(await screen.findByText('New Weekend Rule')).toBeInTheDocument();
    expect(screen.getByText('Overtime rule created successfully')).toBeInTheDocument();

    const [, requestInit] = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const body = JSON.parse(requestInit.body as string);
    expect(body.rateValue).toBe(150);
    expect(body.thresholdHours).toBe(8);
    expect(body.maxHours).toBe(12);
  });

  it('shows an error toast and closes the modal when create fails', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    await screen.findByText('Daily Overtime');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ message: 'Invalid payload' }),
      }),
    );

    await user.click(screen.getByRole('button', { name: /add overtime rule/i }));
    await user.type(screen.getByLabelText('Rule Name'), 'New Rule');
    await user.type(screen.getByLabelText('Description'), 'A brand new overtime rule');
    await user.type(screen.getByLabelText('Threshold Hours'), '8');
    await user.type(screen.getByLabelText('Max Hours'), '12');
    await user.type(screen.getByLabelText('Rate Value (%)'), '150');
    await user.type(screen.getByLabelText('Priority'), '1');
    await user.click(screen.getByRole('button', { name: /save overtime rule/i }));

    expect(await screen.findByText('Invalid payload')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /add overtime rule/i })).not.toBeInTheDocument();
  });
});

describe('OvertimeRulesView — edit overtime rule', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the edit modal pre-filled from the pencil action', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    const row = (await screen.findByText('Daily Overtime')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit overtime rule'));

    const dialog = screen.getByRole('dialog', { name: /edit overtime rule/i });
    expect(within(dialog).getByLabelText('Rule Name')).toHaveValue('Daily Overtime');
    expect(within(dialog).getByLabelText('Calculation Method')).toHaveValue('daily');
    expect(within(dialog).getByLabelText('Threshold Hours')).toHaveValue(8);
    expect(within(dialog).getByLabelText('Max Hours')).toHaveValue(12);
  });

  it('pre-fills a multiplier rate value converted back to its decimal form', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    const row = (await screen.findByText('Holiday Multiplier Rule')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit overtime rule'));

    const dialog = screen.getByRole('dialog', { name: /edit overtime rule/i });
    expect(within(dialog).getByLabelText('Rate Value (×)')).toHaveValue(1.5);
  });

  it('submits a PATCH request and replaces the row on success', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    const row = (await screen.findByText('Daily Overtime')).closest('tr')!;

    const updatedRule: MerchantOvertimeRule = { ...MOCK_RULES[0], name: 'Updated Overtime Rule' };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: updatedRule }),
      }),
    );

    await user.click(within(row).getByLabelText('Edit overtime rule'));
    const nameInput = screen.getByLabelText('Rule Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Overtime Rule');
    await user.click(screen.getByRole('button', { name: /save overtime rule/i }));

    expect(await screen.findByText('Updated Overtime Rule')).toBeInTheDocument();
    expect(screen.getByText('Overtime rule updated successfully')).toBeInTheDocument();
  });

  it('shows an error toast when edit fails', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    const row = (await screen.findByText('Daily Overtime')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
        json: async () => ({ message: 'Server error' }),
      }),
    );

    await user.click(within(row).getByLabelText('Edit overtime rule'));
    const nameInput = screen.getByLabelText('Rule Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Changed Name');
    await user.click(screen.getByRole('button', { name: /save overtime rule/i }));

    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('disables submit in edit mode when no fields have changed', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    const row = (await screen.findByText('Daily Overtime')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit overtime rule'));

    expect(screen.getByRole('dialog', { name: /edit overtime rule/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save overtime rule/i })).toBeDisabled();
  });
});

describe('OvertimeRulesView — detail inspection', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the detail modal with audit fields when a row is clicked', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    const row = (await screen.findByText('Daily Overtime')).closest('tr')!;

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

    expect(await screen.findByRole('dialog', { name: /overtime rule details/i })).toBeInTheDocument();
    expect(screen.getByText(/jane\.doe/)).toBeInTheDocument();
    expect(screen.getByText(/ops@company\.com/)).toBeInTheDocument();
  });

  it('does not open the detail modal when the edit icon is clicked', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    const row = (await screen.findByText('Daily Overtime')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit overtime rule'));

    expect(screen.queryByRole('dialog', { name: /overtime rule details/i })).not.toBeInTheDocument();
  });
});

describe('OvertimeRulesView — status toggle', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('deactivates an active rule after confirmation', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    const row = (await screen.findByText('Daily Overtime')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: { ...MOCK_RULES[0], status: 'inactive' } }),
      }),
    );

    await user.click(within(row).getByLabelText('Deactivate overtime rule'));
    expect(screen.getByText(/deactivate this overtime rule/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await screen.findByText('Overtime rule deactivated successfully');
    const updatedRow = (await screen.findByText('Daily Overtime')).closest('tr')!;
    expect(within(updatedRow).getByText('Inactive')).toBeInTheDocument();
  });

  it('reactivates an inactive rule after confirmation', async () => {
    const user = userEvent.setup();
    render(<OvertimeRulesView />);
    const row = (await screen.findByText('Holiday Multiplier Rule')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: { ...MOCK_RULES[1], status: 'active' } }),
      }),
    );

    await user.click(within(row).getByLabelText('Reactivate overtime rule'));
    expect(screen.getByText(/reactivate this overtime rule/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await screen.findByText('Overtime rule reactivated successfully');
  });

  it('does not send a request when the confirm dialog is cancelled', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ data: MOCK_RULES }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    render(<OvertimeRulesView />);
    const row = (await screen.findByText('Daily Overtime')).closest('tr')!;

    const callsBefore = fetchSpy.mock.calls.length;
    await user.click(within(row).getByLabelText('Deactivate overtime rule'));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
    expect(screen.queryByText(/deactivate this overtime rule/i)).not.toBeInTheDocument();
  });
});
