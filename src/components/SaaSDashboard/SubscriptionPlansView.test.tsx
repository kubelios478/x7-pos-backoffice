import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionPlansView } from './SubscriptionPlansView';
import { saasService } from '../../services/saasService';
import type { SubscriptionPlan } from '../../types/subscription';

vi.mock('../../services/saasService', () => ({
  saasService: {
    getSubscriptionPlans: vi.fn(),
    createSubscriptionPlan: vi.fn(),
    updateSubscriptionPlan: vi.fn(),
    deleteSubscriptionPlan: vi.fn(),
  },
}));

const MOCK_PLANS: SubscriptionPlan[] = [
  {
    id: 1,
    name: 'Starter',
    description: 'Entry-level plan for quick service restaurants.',
    price: 49.99,
    billingCycle: 'monthly',
    status: 'active',
  },
  {
    id: 2,
    name: 'Professional',
    description: 'Multi-location support with advanced reporting.',
    price: 129.99,
    billingCycle: 'monthly',
    status: 'active',
  },
  {
    id: 3,
    name: 'Enterprise',
    description: 'Unlimited locations with white-label options.',
    price: 1199.99,
    billingCycle: 'yearly',
    status: 'active',
  },
  {
    id: 4,
    name: 'Legacy Basic',
    description: 'Deprecated legacy tier. Grandfathered accounts only.',
    price: 19.99,
    billingCycle: 'monthly',
    status: 'inactive',
  },
  {
    id: 5,
    name: 'Archived Gold',
    description: 'Legacy gold tier, permanently discontinued.',
    price: 299.99,
    billingCycle: 'monthly',
    status: 'deleted',
  },
];

function renderView() {
  return render(<SubscriptionPlansView />);
}

describe('SubscriptionPlansView — table rendering', () => {
  beforeEach(() => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue(MOCK_PLANS);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the SUBSCRIPTION MASTER PLANS heading', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('SUBSCRIPTION MASTER PLANS')).toBeInTheDocument();
    });
  });

  it('renders all plan names', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Starter')).toBeInTheDocument();
      expect(screen.getByText('Professional')).toBeInTheDocument();
      expect(screen.getByText('Enterprise')).toBeInTheDocument();
      expect(screen.getByText('Legacy Basic')).toBeInTheDocument();
    });
  });

  it('renders each plan id inside a <code> element', async () => {
    renderView();
    await waitFor(() => {
      const codeEl = screen.getByText('1');
      expect(codeEl.tagName).toBe('CODE');
    });
  });

  it('renders plan descriptions', async () => {
    renderView();
    await waitFor(() => {
      expect(
        screen.getByText('Entry-level plan for quick service restaurants.'),
      ).toBeInTheDocument();
    });
  });

  it('renders price formatted with currency symbol and commas', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('$49.99')).toBeInTheDocument();
      expect(screen.getByText('$1,199.99')).toBeInTheDocument();
    });
  });

  it('renders billing cycle labels prefixed with /', async () => {
    renderView();
    await waitFor(() => {
      const monthlyLabels = screen.getAllByText('/ monthly');
      expect(monthlyLabels.length).toBeGreaterThan(0);
      expect(screen.getByText('/ yearly')).toBeInTheDocument();
    });
  });

  it('renders active status badges', async () => {
    renderView();
    await waitFor(() => {
      const activeBadges = screen.getAllByText('active');
      expect(activeBadges.length).toBeGreaterThan(0);
    });
  });

  it('renders inactive status badge', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('inactive')).toBeInTheDocument();
    });
  });

  it('inactive plan rows have opacity-75 class', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Legacy Basic')).toBeInTheDocument());

    const legacyCell = screen.getByText('Legacy Basic');
    const row = legacyCell.closest('tr');
    expect(row).toHaveClass('opacity-75');
  });

  it('renders deleted status badge', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('deleted')).toBeInTheDocument();
    });
  });

  it('deleted plan rows have opacity-75 class', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Archived Gold')).toBeInTheDocument());

    const deletedCell = screen.getByText('Archived Gold');
    const row = deletedCell.closest('tr');
    expect(row).toHaveClass('opacity-75');
  });
});

describe('SubscriptionPlansView — filter strip', () => {
  beforeEach(() => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue(MOCK_PLANS);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the search input', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search plans...')).toBeInTheDocument();
    });
  });

  it('filters rows by plan name on search input', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search plans...'), 'Pro');

    expect(screen.getByText('Professional')).toBeInTheDocument();
    expect(screen.queryByText('Starter')).not.toBeInTheDocument();
    expect(screen.queryByText('Enterprise')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy Basic')).not.toBeInTheDocument();
  });

  it('filters rows by plan description on search input', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search plans...'), 'quick service');

    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.queryByText('Professional')).not.toBeInTheDocument();
  });

  it('filters rows by billing cycle dropdown', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Enterprise')).toBeInTheDocument());

    await user.selectOptions(
      screen.getByTestId('filter-billing-cycle'),
      'yearly',
    );

    expect(screen.getByText('Enterprise')).toBeInTheDocument();
    expect(screen.queryByText('Starter')).not.toBeInTheDocument();
    expect(screen.queryByText('Professional')).not.toBeInTheDocument();
  });

  it('filters rows by status dropdown', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Legacy Basic')).toBeInTheDocument());

    await user.selectOptions(
      screen.getByTestId('filter-status'),
      'inactive',
    );

    expect(screen.getByText('Legacy Basic')).toBeInTheDocument();
    expect(screen.queryByText('Starter')).not.toBeInTheDocument();
  });

  it('shows warning row when filters yield no results', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search plans...'), 'xyznotexist');

    expect(
      screen.getByText('No subscription profiles match your search filters'),
    ).toBeInTheDocument();
  });

  it('clears all filters when Clear filters is clicked', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search plans...'), 'xyznotexist');
    expect(
      screen.getByText('No subscription profiles match your search filters'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Professional')).toBeInTheDocument();
  });

  it('billing cycle dropdown includes unique values from data', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    const select = screen.getByTestId('filter-billing-cycle') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);

    expect(options).toContain('All Cycles');
    expect(options).toContain('monthly');
    expect(options).toContain('yearly');
  });

  it('status filter includes deleted option', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    const select = screen.getByTestId('filter-status') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('deleted');
  });
});

describe('SubscriptionPlansView — empty data state', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows empty state panel when service returns no plans', async () => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue([]);
    renderView();
    await waitFor(() => {
      expect(
        screen.getByText(
          "No subscription plans have been provisioned yet. Click 'Add Plan' to initialize your platform's monetization model.",
        ),
      ).toBeInTheDocument();
    });
  });

  it('hides the table when service returns no plans', async () => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue([]);
    renderView();
    await waitFor(() => {
      expect(screen.queryByText('SUBSCRIPTION MASTER PLANS')).not.toBeInTheDocument();
    });
  });
});

describe('SubscriptionPlansView — edit plan', () => {
  beforeEach(() => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue(MOCK_PLANS);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders an edit button for each plan row', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    const editButtons = screen.getAllByRole('button', { name: /^Edit /i });
    expect(editButtons).toHaveLength(MOCK_PLANS.length);
  });

  it('edit button has correct aria-label', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Edit Starter' })).toBeInTheDocument();
  });

  it('clicking edit opens modal pre-filled with plan name', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit Starter' }));

    expect(screen.getByText('EDIT SUBSCRIPTION PLAN')).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText('e.g. Professional') as HTMLInputElement;
    expect(nameInput.value).toBe('Starter');
  });

  it('clicking edit pre-fills price and billingCycle', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit Starter' }));

    const priceInput = screen.getByPlaceholderText('0.00') as HTMLInputElement;
    expect(priceInput.value).toBe('49.99');

    const billingSelect = screen.getByDisplayValue('Monthly') as HTMLSelectElement;
    expect(billingSelect.value).toBe('monthly');
  });

  it('submitting edit calls updateSubscriptionPlan with correct payload', async () => {
    const updatedPlan = { ...MOCK_PLANS[0], name: 'Starter Edited' };
    vi.mocked(saasService.updateSubscriptionPlan).mockResolvedValue(updatedPlan);

    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit Starter' }));

    const nameInput = screen.getByPlaceholderText('e.g. Professional');
    await user.clear(nameInput);
    await user.type(nameInput, 'Starter Edited');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(saasService.updateSubscriptionPlan).toHaveBeenCalledWith(1, {
        name: 'Starter Edited',
        description: 'Entry-level plan for quick service restaurants.',
        price: 49.99,
        billingCycle: 'monthly',
        status: 'active',
      });
    });
  });

  it('successful update patches the row in the table without re-fetch', async () => {
    const updatedPlan = { ...MOCK_PLANS[0], name: 'Starter Renamed' };
    vi.mocked(saasService.updateSubscriptionPlan).mockResolvedValue(updatedPlan);

    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit Starter' }));
    const nameInput = screen.getByPlaceholderText('e.g. Professional');
    await user.clear(nameInput);
    await user.type(nameInput, 'Starter Renamed');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('Starter Renamed')).toBeInTheDocument();
      expect(screen.queryByText('Starter')).not.toBeInTheDocument();
    });
  });

  it('successful update shows success toast', async () => {
    const updatedPlan = { ...MOCK_PLANS[0] };
    vi.mocked(saasService.updateSubscriptionPlan).mockResolvedValue(updatedPlan);

    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit Starter' }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('Subscription plan updated successfully')).toBeInTheDocument();
    });
  });

  it('SESSION_EXPIRED closes modal and shows error toast', async () => {
    vi.mocked(saasService.updateSubscriptionPlan).mockRejectedValue(new Error('SESSION_EXPIRED'));

    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit Starter' }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.queryByText('EDIT SUBSCRIPTION PLAN')).not.toBeInTheDocument();
      expect(
        screen.getByText('Session expired. Please refresh the page to sign in again.'),
      ).toBeInTheDocument();
    });
  });

  it('server error shows inline form error and keeps modal open', async () => {
    vi.mocked(saasService.updateSubscriptionPlan).mockRejectedValue(
      new Error('A plan with this name already exists'),
    );

    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit Starter' }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('EDIT SUBSCRIPTION PLAN')).toBeInTheDocument();
      expect(screen.getByText('A plan with this name already exists')).toBeInTheDocument();
    });
  });
});

describe('SubscriptionPlansView — delete plan', () => {
  beforeEach(() => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue(MOCK_PLANS);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a Delete button for each active plan', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());
    const deleteButtons = screen.getAllByRole('button', { name: /^Delete /i });
    expect(deleteButtons).toHaveLength(4); // 3 active + 1 inactive
  });

  it('does NOT render a Delete button for deleted plans', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Archived Gold')).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: 'Delete Archived Gold' }),
    ).not.toBeInTheDocument();
  });

  it('clicking Delete Starter opens DeletePlanDialog with correct copy', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Starter' }));

    expect(screen.getByText('DELETE PLAN')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Deleting "Starter" will permanently prevent it from being used in any new subscriptions. The record is retained for historical analytics.',
      ),
    ).toBeInTheDocument();
  });

  it('clicking Cancel closes the dialog', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Starter' }));
    expect(screen.getByText('DELETE PLAN')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText('DELETE PLAN')).not.toBeInTheDocument();
  });

  it('edit button is disabled for deleted plans', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Archived Gold')).toBeInTheDocument());

    const editButton = screen.getByRole('button', { name: 'Edit Archived Gold' });
    expect(editButton).toBeDisabled();
  });
});

describe('SubscriptionPlansView — delete plan confirm', () => {
  beforeEach(() => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue(MOCK_PLANS);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('confirming delete calls deleteSubscriptionPlan with the plan id', async () => {
    const deletedPlan = { ...MOCK_PLANS[0], status: 'deleted' as const };
    vi.mocked(saasService.deleteSubscriptionPlan).mockResolvedValue(deletedPlan);
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Starter' }));
    await user.click(screen.getByRole('button', { name: /^delete plan$/i }));

    await waitFor(() => {
      expect(saasService.deleteSubscriptionPlan).toHaveBeenCalledWith(1);
    });
  });

  it('successful delete updates row in-place and shows success toast', async () => {
    const deletedPlan = { ...MOCK_PLANS[0], status: 'deleted' as const };
    vi.mocked(saasService.deleteSubscriptionPlan).mockResolvedValue(deletedPlan);
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Starter' }));
    await user.click(screen.getByRole('button', { name: /^delete plan$/i }));

    await waitFor(() => {
      expect(screen.queryByText('DELETE PLAN')).not.toBeInTheDocument();
      expect(screen.getByText('Plan deleted successfully')).toBeInTheDocument();
    });
  });

  it('SESSION_EXPIRED closes dialog and shows session-expired toast', async () => {
    vi.mocked(saasService.deleteSubscriptionPlan).mockRejectedValue(
      new Error('SESSION_EXPIRED'),
    );
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Starter' }));
    await user.click(screen.getByRole('button', { name: /^delete plan$/i }));

    await waitFor(() => {
      expect(screen.queryByText('DELETE PLAN')).not.toBeInTheDocument();
      expect(
        screen.getByText('Session expired. Please refresh the page to sign in again.'),
      ).toBeInTheDocument();
    });
  });

  it('other API error closes dialog and shows error toast', async () => {
    vi.mocked(saasService.deleteSubscriptionPlan).mockRejectedValue(
      new Error('Plan has active subscriptions'),
    );
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Starter' }));
    await user.click(screen.getByRole('button', { name: /^delete plan$/i }));

    await waitFor(() => {
      expect(screen.queryByText('DELETE PLAN')).not.toBeInTheDocument();
      expect(screen.getByText('Plan has active subscriptions')).toBeInTheDocument();
    });
  });
});
