import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionPlansView } from './SubscriptionPlansView';
import { saasService } from '../../services/saasService';
import type { SubscriptionPlan } from '../../types/subscription';

vi.mock('../../services/saasService', () => ({
  saasService: {
    getSubscriptionPlans: vi.fn(),
  },
}));

const MOCK_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan_starter_001',
    name: 'Starter',
    description: 'Entry-level plan for quick service restaurants.',
    price: 49.99,
    billingCycle: 'monthly',
    status: 'active',
  },
  {
    id: 'plan_pro_002',
    name: 'Professional',
    description: 'Multi-location support with advanced reporting.',
    price: 129.99,
    billingCycle: 'monthly',
    status: 'active',
  },
  {
    id: 'plan_ent_003',
    name: 'Enterprise',
    description: 'Unlimited locations with white-label options.',
    price: 1199.99,
    billingCycle: 'annual',
    status: 'active',
  },
  {
    id: 'plan_legacy_000',
    name: 'Legacy Basic',
    description: 'Deprecated legacy tier. Grandfathered accounts only.',
    price: 19.99,
    billingCycle: 'monthly',
    status: 'inactive',
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
      const codeEl = screen.getByText('plan_starter_001');
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
      expect(screen.getByText('/ annual')).toBeInTheDocument();
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
      'annual',
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
    expect(options).toContain('annual');
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
