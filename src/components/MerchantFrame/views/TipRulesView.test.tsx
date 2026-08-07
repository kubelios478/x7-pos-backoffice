import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { TipRulesView } from './TipRulesView';
import type { MerchantTipRule } from '../../../types/configuration';

vi.mock('../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const MOCK_RULES: MerchantTipRule[] = [
  {
    id: 1,
    name: 'Standard Percentage Split',
    tipCalculationMethod: 'percentage',
    tipDistributionMethod: 'pool',
    suggestedPercentages: [0.15, 0.18, 0.2],
    fixedAmountOptions: null,
    allowCustomTip: true,
    maximumTipPercentage: 30,
    autoDistribute: true,
    staffPercentage: null,
    kitchenPercentage: null,
    managerPercentage: null,
    status: 'active',
  },
  {
    id: 2,
    name: 'Flat Amount Options',
    tipCalculationMethod: 'fixed_amount',
    tipDistributionMethod: 'individual',
    suggestedPercentages: null,
    fixedAmountOptions: [5, 10, 15],
    allowCustomTip: false,
    maximumTipPercentage: 50,
    autoDistribute: false,
    staffPercentage: null,
    kitchenPercentage: null,
    managerPercentage: null,
    status: 'inactive',
  },
  {
    id: 3,
    name: 'Role Based Kitchen Split',
    tipCalculationMethod: 'custom',
    tipDistributionMethod: 'role_based',
    suggestedPercentages: ['0.1000', '0.2000'],
    fixedAmountOptions: null,
    allowCustomTip: true,
    maximumTipPercentage: 100,
    autoDistribute: false,
    staffPercentage: '0.70',
    kitchenPercentage: '0.20',
    managerPercentage: '0.10',
    status: 'active',
  },
];

function mockFetchOnce(data: MerchantTipRule[], status = 200) {
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

describe('TipRulesView — loading state', () => {
  it('shows a loading indicator while fetching', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<TipRulesView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

describe('TipRulesView — empty state', () => {
  it('shows the empty-state placeholder when the company has zero tip rules', async () => {
    mockFetchOnce([]);
    render(<TipRulesView />);
    expect(await screen.findByTestId('tip-rules-empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(/No tip processing rules configured for this company/i),
    ).toBeInTheDocument();
  });
});

describe('TipRulesView — grid rendering', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('renders suggestedPercentages as discrete percentage pills for a percentage rule', async () => {
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;
    expect(within(row).getByText('15%')).toBeInTheDocument();
    expect(within(row).getByText('18%')).toBeInTheDocument();
    expect(within(row).getByText('20%')).toBeInTheDocument();
  });

  it('renders fixedAmountOptions as discrete dollar pills for a fixed_amount rule', async () => {
    render(<TipRulesView />);
    const row = (await screen.findByText('Flat Amount Options')).closest('tr')!;
    expect(within(row).getByText('$5')).toBeInTheDocument();
    expect(within(row).getByText('$10')).toBeInTheDocument();
    expect(within(row).getByText('$15')).toBeInTheDocument();
  });

  it('coerces string-decimal suggestedPercentages (Postgres serialization) correctly', async () => {
    render(<TipRulesView />);
    const row = (await screen.findByText('Role Based Kitchen Split')).closest('tr')!;
    expect(within(row).getByText('10%')).toBeInTheDocument();
    expect(within(row).getByText('20%')).toBeInTheDocument();
  });

  it('renders the calculation and distribution pills', async () => {
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;
    expect(within(row).getByText(/Method: Percentage/)).toBeInTheDocument();
    expect(within(row).getByText(/Split: Pool/)).toBeInTheDocument();
  });

  it('shows Kitchen and Managers badges only when their percentage is greater than zero', async () => {
    render(<TipRulesView />);
    const roleBasedRow = (await screen.findByText('Role Based Kitchen Split')).closest('tr')!;
    expect(within(roleBasedRow).getByText('Kitchen')).toBeInTheDocument();
    expect(within(roleBasedRow).getByText('Managers')).toBeInTheDocument();

    const poolRow = (await screen.findByText('Standard Percentage Split')).closest('tr')!;
    expect(within(poolRow).queryByText('Kitchen')).not.toBeInTheDocument();
    expect(within(poolRow).queryByText('Managers')).not.toBeInTheDocument();
  });

  it('shows an Auto-Distribute badge only for rules with autoDistribute true', async () => {
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;
    expect(within(row).getByText('Auto-Distribute')).toBeInTheDocument();

    const otherRow = (await screen.findByText('Flat Amount Options')).closest('tr')!;
    expect(within(otherRow).queryByText('Auto-Distribute')).not.toBeInTheDocument();
  });

  it('renders the maximum tip percentage and a Custom Tip Allowed badge when applicable', async () => {
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;
    expect(within(row).getByText('Max: 30%')).toBeInTheDocument();
    expect(within(row).getByText('Custom Tip Allowed')).toBeInTheDocument();

    const noCustomRow = (await screen.findByText('Flat Amount Options')).closest('tr')!;
    expect(within(noCustomRow).getByText('Max: 50%')).toBeInTheDocument();
    expect(within(noCustomRow).queryByText('Custom Tip Allowed')).not.toBeInTheDocument();
  });

  it('shows Active/Inactive status pills', async () => {
    render(<TipRulesView />);
    const activeRow = (await screen.findByText('Standard Percentage Split')).closest('tr')!;
    const inactiveRow = (await screen.findByText('Flat Amount Options')).closest('tr')!;
    expect(within(activeRow).getByText('Active')).toBeInTheDocument();
    expect(within(inactiveRow).getByText('Inactive')).toBeInTheDocument();
  });
});

describe('TipRulesView — filters', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('filters by fuzzy search on name', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    await user.type(screen.getByLabelText('Search tip rules'), 'flat');

    expect(screen.queryByText('Standard Percentage Split')).not.toBeInTheDocument();
    expect(screen.getByText('Flat Amount Options')).toBeInTheDocument();
  });

  it('filters by calculation method', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    await user.selectOptions(screen.getByLabelText('Filter by calculation method'), 'fixed_amount');

    expect(screen.getByText('Flat Amount Options')).toBeInTheDocument();
    expect(screen.queryByText('Standard Percentage Split')).not.toBeInTheDocument();
  });

  it('filters by distribution method', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    await user.selectOptions(screen.getByLabelText('Filter by distribution method'), 'role_based');

    expect(screen.getByText('Role Based Kitchen Split')).toBeInTheDocument();
    expect(screen.queryByText('Standard Percentage Split')).not.toBeInTheDocument();
  });

  it('filters by Kitchen Staff Included', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    await user.click(screen.getByLabelText('Kitchen Staff Included'));

    expect(screen.getByText('Role Based Kitchen Split')).toBeInTheDocument();
    expect(screen.queryByText('Standard Percentage Split')).not.toBeInTheDocument();
    expect(screen.queryByText('Flat Amount Options')).not.toBeInTheDocument();
  });

  it('filters by Managers Included', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    await user.click(screen.getByLabelText('Managers Included'));

    expect(screen.getByText('Role Based Kitchen Split')).toBeInTheDocument();
    expect(screen.queryByText('Standard Percentage Split')).not.toBeInTheDocument();
  });

  it('filters by status', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'inactive');

    expect(screen.getByText('Flat Amount Options')).toBeInTheDocument();
    expect(screen.queryByText('Standard Percentage Split')).not.toBeInTheDocument();
  });

  it('shows the filtered-empty state and clears filters', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    await user.type(screen.getByLabelText('Search tip rules'), 'zzz-no-match');

    expect(
      await screen.findByText(/No tip rules match your active filters/i),
    ).toBeInTheDocument();

    await user.click(screen.getByText('Clear filters'));

    expect(await screen.findByText('Standard Percentage Split')).toBeInTheDocument();
  });
});

describe('TipRulesView — quick links navigation', () => {
  it('marks TIPS MANAGEMENT as the active anchor', async () => {
    mockFetchOnce(MOCK_RULES);
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    const nav = screen.getByRole('navigation', { name: /related configuration shortcuts/i });
    const activeAnchor = within(nav).getByText('TIPS MANAGEMENT');
    expect(activeAnchor.closest('[aria-current="page"]')).toBeInTheDocument();
  });

  it('calls onNavigate with the tax feature id when TAX RULES is clicked', async () => {
    mockFetchOnce(MOCK_RULES);
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<TipRulesView onNavigate={onNavigate} />);
    await screen.findByText('Standard Percentage Split');

    const nav = screen.getByRole('navigation', { name: /related configuration shortcuts/i });
    await user.click(within(nav).getByText('TAX RULES'));

    expect(onNavigate).toHaveBeenCalledWith('merchant-tax-rules');
  });
});

describe('TipRulesView — error handling', () => {
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

    render(<TipRulesView />);

    await waitFor(() => expect(window.location.href).toBe('/login'));

    // @ts-expect-error restoring original Location object
    window.location = originalLocation;
  });

  it('shows a retry button on a generic fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 500, ok: false, json: async () => ({}) }),
    );

    render(<TipRulesView />);

    expect(await screen.findByText('Retry Connection')).toBeInTheDocument();
  });
});

describe('TipRulesView — create tip rule', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the create modal from the toolbar button', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    expect(screen.getByRole('dialog', { name: /add tip rule/i })).toBeInTheDocument();
  });

  it('opens the create modal from the FAB', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    await user.click(screen.getByLabelText('Quick create tip rule'));

    expect(screen.getByRole('dialog', { name: /add tip rule/i })).toBeInTheDocument();
  });

  it('opens the create modal from the empty-state CTA', async () => {
    mockFetchOnce([]);
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByTestId('tip-rules-empty-state');

    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    expect(screen.getByRole('dialog', { name: /add tip rule/i })).toBeInTheDocument();
  });

  it('disables submit until name, max tip %, and a suggested-percentage chip are provided', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    const submitButton = screen.getByRole('button', { name: /save tip rule/i });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Rule Name'), 'New Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Suggested Percentages'), '100');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    expect(submitButton).toBeEnabled();
  });

  it('blocks submit when name exceeds 50 characters', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    await user.type(screen.getByLabelText('Rule Name'), 'a'.repeat(51));
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '15');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    expect(screen.getByRole('button', { name: /save tip rule/i })).toBeDisabled();
  });

  it('toggles between the suggested-percentages and fixed-amount tag-inputs based on Calculation Method', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    expect(screen.getByLabelText('Suggested Percentages')).toBeInTheDocument();
    expect(screen.queryByLabelText('Fixed Amount Options')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Calculation Method'), 'fixed_amount');

    expect(screen.queryByLabelText('Suggested Percentages')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Fixed Amount Options')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Calculation Method'), 'custom');

    expect(screen.queryByLabelText('Suggested Percentages')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fixed Amount Options')).not.toBeInTheDocument();
  });

  it('adds and removes suggested-percentage chips', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    await user.type(screen.getByLabelText('Suggested Percentages'), '15');
    await user.click(screen.getByLabelText('Add suggested percentage'));
    await user.type(screen.getByLabelText('Suggested Percentages'), '20');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    const dialog = screen.getByRole('dialog', { name: /add tip rule/i });
    expect(within(dialog).getByText('15%')).toBeInTheDocument();
    expect(within(dialog).getByText('20%')).toBeInTheDocument();
    expect(screen.getByText(/suggested percentages must sum to 100/i)).toBeInTheDocument();

    await user.click(within(dialog).getByLabelText('Remove 15%'));

    expect(within(dialog).queryByText('15%')).not.toBeInTheDocument();
    expect(within(dialog).getByText('20%')).toBeInTheDocument();
  });

  it('disables submit until suggested percentages sum to exactly 100, using a multi-chip split', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    await user.type(screen.getByLabelText('Rule Name'), 'Two Worker Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '20');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    const submitButton = screen.getByRole('button', { name: /save tip rule/i });
    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/suggested percentages must sum to 100/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Suggested Percentages'), '80');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    expect(submitButton).toBeEnabled();
    expect(screen.queryByText(/suggested percentages must sum to 100/i)).not.toBeInTheDocument();

    const dialog = screen.getByRole('dialog', { name: /add tip rule/i });
    await user.click(within(dialog).getByLabelText('Remove 80%'));

    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/suggested percentages must sum to 100/i)).toBeInTheDocument();
  });

  it('disables submit when suggested percentages add up to more than 100', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    await user.type(screen.getByLabelText('Rule Name'), 'Overallocated Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '60');
    await user.click(screen.getByLabelText('Add suggested percentage'));
    await user.type(screen.getByLabelText('Suggested Percentages'), '50');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    expect(screen.getByRole('button', { name: /save tip rule/i })).toBeDisabled();
    expect(screen.getByText(/suggested percentages must sum to 100/i)).toBeInTheDocument();
  });

  it('ignores suggested percentages above 100', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    await user.type(screen.getByLabelText('Suggested Percentages'), '150');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    const dialog = screen.getByRole('dialog', { name: /add tip rule/i });
    expect(within(dialog).queryByText('150%')).not.toBeInTheDocument();
  });

  it('disables submit when Maximum Tip Percentage is out of the 0-100 range', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    await user.type(screen.getByLabelText('Rule Name'), 'New Split');
    await user.type(screen.getByLabelText('Suggested Percentages'), '100');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    const submitButton = screen.getByRole('button', { name: /save tip rule/i });

    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '150');
    expect(submitButton).toBeDisabled();

    await user.clear(screen.getByLabelText('Maximum Tip Percentage'));
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '0');
    expect(submitButton).toBeDisabled();

    await user.clear(screen.getByLabelText('Maximum Tip Percentage'));
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '100');
    expect(submitButton).toBeEnabled();
  });

  it('shows Distribution Percentages only for Role-Based distribution and requires the split to sum to 100', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');
    await user.click(screen.getByRole('button', { name: /add tip rule/i }));

    expect(screen.queryByLabelText('Staff %')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Distribution Method'), 'role_based');
    expect(screen.getByLabelText('Staff %')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Rule Name'), 'Role Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '100');
    await user.click(screen.getByLabelText('Add suggested percentage'));

    const submitButton = screen.getByRole('button', { name: /save tip rule/i });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Staff %'), '70');
    await user.type(screen.getByLabelText('Kitchen %'), '20');
    await user.type(screen.getByLabelText('Manager %'), '5');
    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/must be filled and sum to 100/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Manager %'));
    await user.type(screen.getByLabelText('Manager %'), '10');
    expect(submitButton).toBeEnabled();
  });

  it('submits a POST request with converted values and prepends the new rule on success', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    const createdRule: MerchantTipRule = {
      id: 4,
      name: 'New Split',
      tipCalculationMethod: 'percentage',
      tipDistributionMethod: 'individual',
      suggestedPercentages: [1],
      fixedAmountOptions: [],
      allowCustomTip: false,
      maximumTipPercentage: 30,
      autoDistribute: false,
      staffPercentage: null,
      kitchenPercentage: null,
      managerPercentage: null,
      status: 'active',
    };

    const fetchSpy = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ data: createdRule }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await user.click(screen.getByRole('button', { name: /add tip rule/i }));
    await user.type(screen.getByLabelText('Rule Name'), 'New Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '100');
    await user.click(screen.getByLabelText('Add suggested percentage'));
    await user.click(screen.getByRole('button', { name: /save tip rule/i }));

    expect(await screen.findByText('New Split')).toBeInTheDocument();
    expect(screen.getByText('Tip rule created successfully')).toBeInTheDocument();

    const [, requestInit] = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const body = JSON.parse(requestInit.body as string);
    expect(body.suggestedPercentages).toEqual([1]);
    expect(body.fixedAmountOptions).toEqual([]);
    expect(body.maximumTipPercentage).toBe(30);
  });

  it('shows an error toast and closes the modal when create fails', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    await screen.findByText('Standard Percentage Split');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ message: 'Invalid payload' }),
      }),
    );

    await user.click(screen.getByRole('button', { name: /add tip rule/i }));
    await user.type(screen.getByLabelText('Rule Name'), 'New Split');
    await user.type(screen.getByLabelText('Maximum Tip Percentage'), '30');
    await user.type(screen.getByLabelText('Suggested Percentages'), '100');
    await user.click(screen.getByLabelText('Add suggested percentage'));
    await user.click(screen.getByRole('button', { name: /save tip rule/i }));

    expect(await screen.findByText('Invalid payload')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /add tip rule/i })).not.toBeInTheDocument();
  });
});

describe('TipRulesView — edit tip rule', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the edit modal pre-filled from the pencil action', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit tip rule'));

    const dialog = screen.getByRole('dialog', { name: /edit tip rule/i });
    expect(within(dialog).getByLabelText('Rule Name')).toHaveValue('Standard Percentage Split');
    expect(within(dialog).getByLabelText('Calculation Method')).toHaveValue('percentage');
    expect(within(dialog).getByText('15%')).toBeInTheDocument();
    expect(within(dialog).getByText('18%')).toBeInTheDocument();
    expect(within(dialog).getByText('20%')).toBeInTheDocument();
  });

  it('submits a PATCH request and replaces the row on success', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    const updatedRule: MerchantTipRule = { ...MOCK_RULES[0], name: 'Updated Split' };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: updatedRule }),
      }),
    );

    await user.click(within(row).getByLabelText('Edit tip rule'));
    const nameInput = screen.getByLabelText('Rule Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Split');
    await user.type(screen.getByLabelText('Suggested Percentages'), '47');
    await user.click(screen.getByLabelText('Add suggested percentage'));
    await user.click(screen.getByRole('button', { name: /save tip rule/i }));

    expect(await screen.findByText('Updated Split')).toBeInTheDocument();
    expect(screen.getByText('Tip rule updated successfully')).toBeInTheDocument();
  });

  it('shows an error toast when edit fails', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
        json: async () => ({ message: 'Server error' }),
      }),
    );

    await user.click(within(row).getByLabelText('Edit tip rule'));
    const nameInput = screen.getByLabelText('Rule Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Changed Name');
    await user.type(screen.getByLabelText('Suggested Percentages'), '47');
    await user.click(screen.getByLabelText('Add suggested percentage'));
    await user.click(screen.getByRole('button', { name: /save tip rule/i }));

    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('disables submit in edit mode when no fields have changed', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit tip rule'));

    expect(screen.getByRole('dialog', { name: /edit tip rule/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save tip rule/i })).toBeDisabled();
  });
});

describe('TipRulesView — detail inspection', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('opens the detail modal with audit fields when a row is clicked', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

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

    expect(await screen.findByRole('dialog', { name: /tip rule details/i })).toBeInTheDocument();
    expect(screen.getByText(/jane\.doe/)).toBeInTheDocument();
    expect(screen.getByText(/ops@company\.com/)).toBeInTheDocument();
  });

  it('does not open the detail modal when the edit icon is clicked', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    await user.click(within(row).getByLabelText('Edit tip rule'));

    expect(screen.queryByRole('dialog', { name: /tip rule details/i })).not.toBeInTheDocument();
  });
});

describe('TipRulesView — status toggle', () => {
  beforeEach(() => {
    mockFetchOnce(MOCK_RULES);
  });

  it('deactivates an active rule after confirmation', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: { ...MOCK_RULES[0], status: 'inactive' } }),
      }),
    );

    await user.click(within(row).getByLabelText('Deactivate tip rule'));
    expect(screen.getByText(/deactivate this tip rule/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await screen.findByText('Tip rule deactivated successfully');
    const updatedRow = (await screen.findByText('Standard Percentage Split')).closest('tr')!;
    expect(within(updatedRow).getByText('Inactive')).toBeInTheDocument();
  });

  it('reactivates an inactive rule after confirmation', async () => {
    const user = userEvent.setup();
    render(<TipRulesView />);
    const row = (await screen.findByText('Flat Amount Options')).closest('tr')!;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ data: { ...MOCK_RULES[1], status: 'active' } }),
      }),
    );

    await user.click(within(row).getByLabelText('Reactivate tip rule'));
    expect(screen.getByText(/reactivate this tip rule/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await screen.findByText('Tip rule reactivated successfully');
  });

  it('does not send a request when the confirm dialog is cancelled', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ data: MOCK_RULES }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    render(<TipRulesView />);
    const row = (await screen.findByText('Standard Percentage Split')).closest('tr')!;

    const callsBefore = fetchSpy.mock.calls.length;
    await user.click(within(row).getByLabelText('Deactivate tip rule'));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
    expect(screen.queryByText(/deactivate this tip rule/i)).not.toBeInTheDocument();
  });
});
