import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanApplicationsView } from './PlanApplicationsView';
import { saasService } from '../../services/saasService';
import type { PlanApplication, SubscriptionPlan, Application } from '../../types/subscription';

vi.mock('../../services/saasService', () => ({
  saasService: {
    getPlanApplications: vi.fn(),
    getApplications: vi.fn(),
    createPlanApplication: vi.fn(),
    updatePlanApplication: vi.fn(),
  },
}));

const MOCK_PLAN: SubscriptionPlan = {
  id: 3,
  name: 'Gold Plan',
  description: 'Full-featured tier.',
  price: 99.99,
  billingCycle: 'monthly',
  status: 'active',
};

const MOCK_PLAN_APPS: PlanApplication[] = [
  {
    id: 1,
    subscriptionPlan: { id: 3, name: 'Gold Plan' },
    application: { id: 5, name: 'POS Core', category: 'Point of Sale' },
    limits: 'Basic usage limit: 100 users per month',
    status: 'active',
  },
  {
    id: 2,
    subscriptionPlan: { id: 3, name: 'Gold Plan' },
    application: { id: 7, name: 'Kitchen Display', category: 'Kitchen Display' },
    limits: 'Up to 3 KDS screens',
    status: 'inactive',
  },
];

const MOCK_ALL_APPS: Application[] = [
  { id: 5, name: 'POS Core', description: '', category: 'Point of Sale', status: 'active' },
  { id: 7, name: 'Kitchen Display', description: '', category: 'Kitchen Display', status: 'active' },
  { id: 9, name: 'Analytics Pro', description: '', category: 'Analytics', status: 'active' },
];
// ids 5 and 7 are already in MOCK_PLAN_APPS; only id 9 should appear in the dropdown

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PlanApplicationsView — loading state', () => {
  it('shows skeleton rows while data is loading', () => {
    vi.mocked(saasService.getPlanApplications).mockReturnValue(new Promise(() => {}));
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe('PlanApplicationsView — title card', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
  });

  it('shows the dark title card with plan name', async () => {
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(
        screen.getByText(/APPLICATIONS BOUND TO PLAN: Gold Plan/i),
      ).toBeInTheDocument();
    });
  });
});

describe('PlanApplicationsView — table rendering', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
  });

  it('renders one row per plan application', async () => {
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(screen.getByText('POS Core')).toBeInTheDocument();
      expect(screen.getByText('Kitchen Display')).toBeInTheDocument();
    });
  });

  it('shows application ID as a code snippet', async () => {
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  it('renders the software category tag for each row', async () => {
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(screen.getByText('Point of Sale')).toBeInTheDocument();
      expect(screen.getByText('Kitchen Display')).toBeInTheDocument();
    });
  });

  it('renders the usage restrictions text', async () => {
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(
        screen.getByText('Basic usage limit: 100 users per month'),
      ).toBeInTheDocument();
    });
  });

  it('renders active status badge with emerald styling', async () => {
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => {
      const tbody = document.querySelector('tbody')!;
      const badge = within(tbody).getAllByText(/^active$/i)[0];
      expect(badge.className).toContain('text-green-600');
    });
  });

  it('renders inactive status badge with grey styling', async () => {
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => {
      const tbody = document.querySelector('tbody')!;
      const badge = within(tbody).getByText(/^inactive$/i);
      expect(badge.className).toContain('text-[#5f5e5e]');
    });
  });
});

describe('PlanApplicationsView — empty state (AC 4)', () => {
  it('shows empty state block when plan has no applications', async () => {
    vi.mocked(saasService.getPlanApplications).mockResolvedValue([]);
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(
        screen.getByText(
          /This subscription plan currently has no applications linked/i,
        ),
      ).toBeInTheDocument();
    });
  });
});

describe('PlanApplicationsView — error handling', () => {
  it('shows error toast when API call fails', async () => {
    vi.mocked(saasService.getPlanApplications).mockRejectedValue(
      new Error('Network failure'),
    );
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  it('shows session-expired toast on SESSION_EXPIRED error', async () => {
    vi.mocked(saasService.getPlanApplications).mockRejectedValue(
      new Error('SESSION_EXPIRED'),
    );
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => {
      expect(
        screen.getByText(/Session expired/i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });
});

describe('PlanApplicationsView — filter controls (AC 1)', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
  });

  it('renders a search input above the data grid', async () => {
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('renders a Relationship Status dropdown above the data grid', async () => {
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: /relationship status/i })).toBeInTheDocument();
  });
});

describe('PlanApplicationsView — text search filtering (AC 2)', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
  });

  it('filters rows by application name in real time', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/search/i), 'POS');

    expect(screen.getByText('POS Core')).toBeInTheDocument();
    expect(screen.queryByText('Kitchen Display')).not.toBeInTheDocument();
  });

  it('filters rows by limits text in real time', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/search/i), 'KDS');

    expect(screen.getByText('Kitchen Display')).toBeInTheDocument();
    expect(screen.queryByText('POS Core')).not.toBeInTheDocument();
  });

  it('is case-insensitive when filtering', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/search/i), 'pos core');

    expect(screen.getByText('POS Core')).toBeInTheDocument();
  });
});

describe('PlanApplicationsView — status dropdown filtering (AC 3)', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
  });

  it('shows only active rows when "active" is selected', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.selectOptions(
      screen.getByRole('combobox', { name: /relationship status/i }),
      'active',
    );

    expect(screen.getByText('POS Core')).toBeInTheDocument();
    expect(screen.queryByText('Kitchen Display')).not.toBeInTheDocument();
  });

  it('shows only inactive rows when "inactive" is selected', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.selectOptions(
      screen.getByRole('combobox', { name: /relationship status/i }),
      'inactive',
    );

    expect(screen.getByText('Kitchen Display')).toBeInTheDocument();
    expect(screen.queryByText('POS Core')).not.toBeInTheDocument();
  });

  it('shows all rows when status filter is reset to all', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.selectOptions(
      screen.getByRole('combobox', { name: /relationship status/i }),
      'active',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: /relationship status/i }),
      '',
    );

    expect(screen.getByText('POS Core')).toBeInTheDocument();
    expect(screen.getByText('Kitchen Display')).toBeInTheDocument();
  });
});

describe('PlanApplicationsView — empty filter state (AC 4)', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
  });

  it('shows "no match" message when filters return zero results', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/search/i), 'xyznonexistent');

    expect(
      screen.getByText(/No application associations match your active filters/i),
    ).toBeInTheDocument();
  });

  it('does not show "no match" message when data is loaded and no filters applied', async () => {
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());
    expect(
      screen.queryByText(/No application associations match your active filters/i),
    ).not.toBeInTheDocument();
  });
});

describe('PlanApplicationsView — associate application trigger buttons (AC 1)', () => {
  it('renders "ASSOCIATE APPLICATION" button in the filter row when data is loaded', async () => {
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());
    expect(
      screen.getByRole('button', { name: /associate application/i }),
    ).toBeInTheDocument();
  });

  it('renders "ASSOCIATE APPLICATION" button in the empty state', async () => {
    vi.mocked(saasService.getPlanApplications).mockResolvedValue([]);
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());
    expect(
      screen.getByRole('button', { name: /associate application/i }),
    ).toBeInTheDocument();
  });

  it('renders the FAB with aria-label "Open associate-application form"', async () => {
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());
    expect(
      screen.getByRole('button', { name: /open associate-application form/i }),
    ).toBeInTheDocument();
  });

  it('clicking "ASSOCIATE APPLICATION" opens the modal', async () => {
    const user = userEvent.setup();
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
    vi.mocked(saasService.getApplications).mockResolvedValue(MOCK_ALL_APPS);
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /associate application/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument(),
    );
  });

  it('clicking the FAB opens the modal', async () => {
    const user = userEvent.setup();
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
    vi.mocked(saasService.getApplications).mockResolvedValue(MOCK_ALL_APPS);
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(
      screen.getByRole('button', { name: /open associate-application form/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument(),
    );
  });
});

describe('PlanApplicationsView — associate application modal fields (AC 2)', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
    vi.mocked(saasService.getApplications).mockResolvedValue(MOCK_ALL_APPS);
  });

  it('modal shows the plan name in a read-only input', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /associate application/i }));

    await waitFor(() => {
      const input = screen.getByDisplayValue('Gold Plan');
      expect(input).toHaveAttribute('readonly');
    });
  });

  it('dropdown lists only platform apps not currently associated with this plan', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /associate application/i }));

    await waitFor(() =>
      expect(screen.getByText('Analytics Pro (Analytics)')).toBeInTheDocument(),
    );
    expect(screen.queryByText('POS Core (Point of Sale)')).not.toBeInTheDocument();
    expect(screen.queryByText('Kitchen Display (Kitchen Display)')).not.toBeInTheDocument();
  });

  it('submit button is disabled when no application is selected', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /associate application/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^associate$/i })).toBeDisabled(),
    );
  });

  it('char counter turns red and submit is blocked when limits exceed 50 characters', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /associate application/i }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Up to 5 terminals/i)).toBeInTheDocument(),
    );

    await user.type(
      screen.getByPlaceholderText(/Up to 5 terminals/i),
      'a'.repeat(51),
    );

    const counter = screen.getByText('51/50');
    expect(counter.className).toContain('text-[#ae001a]');
    expect(screen.getByRole('button', { name: /^associate$/i })).toBeDisabled();
  });
});

describe('PlanApplicationsView — associate application happy path (AC 4)', () => {
  it('on confirm: closes modal, prepends new row to grid, shows success toast', async () => {
    const user = userEvent.setup();
    const newPA: PlanApplication = {
      id: 99,
      subscriptionPlan: { id: 3, name: 'Gold Plan' },
      application: { id: 9, name: 'Analytics Pro', category: 'Analytics' },
      limits: 'Max 5 reports',
      status: 'active',
    };
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
    vi.mocked(saasService.getApplications).mockResolvedValue(MOCK_ALL_APPS);
    vi.mocked(saasService.createPlanApplication).mockResolvedValue(newPA);
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /associate application/i }));
    await waitFor(() =>
      expect(screen.getByText('Analytics Pro (Analytics)')).toBeInTheDocument(),
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: /^application$/i }),
      String(9),
    );
    await user.type(
      screen.getByPlaceholderText(/Up to 5 terminals/i),
      'Max 5 reports',
    );
    await user.click(screen.getByRole('button', { name: /^associate$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
      expect(screen.getByText('Application associated successfully')).toBeInTheDocument();
      expect(screen.getByText('Analytics Pro')).toBeInTheDocument();
    });
  });
});

describe('PlanApplicationsView — associate application error path', () => {
  it('on API error: closes modal and shows error toast', async () => {
    const user = userEvent.setup();
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
    vi.mocked(saasService.getApplications).mockResolvedValue(MOCK_ALL_APPS);
    vi.mocked(saasService.createPlanApplication).mockRejectedValue(
      new Error('Server unavailable'),
    );
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /associate application/i }));
    await waitFor(() =>
      expect(screen.getByText('Analytics Pro (Analytics)')).toBeInTheDocument(),
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: /^application$/i }),
      String(9),
    );
    await user.type(
      screen.getByPlaceholderText(/Up to 5 terminals/i),
      'Max 5 reports',
    );
    await user.click(screen.getByRole('button', { name: /^associate$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
      expect(screen.getByText('Server unavailable')).toBeInTheDocument();
    });
  });
});

describe('PlanApplicationsView — associate application edge case', () => {
  it('shows "All applications already associated" when no apps are available and submit is blocked', async () => {
    const user = userEvent.setup();
    const appsAllAssociated: Application[] = [
      { id: 5, name: 'POS Core', description: '', category: 'Point of Sale', status: 'active' },
      { id: 7, name: 'Kitchen Display', description: '', category: 'Kitchen Display', status: 'active' },
    ];
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
    vi.mocked(saasService.getApplications).mockResolvedValue(appsAllAssociated);
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /associate application/i }));

    await waitFor(() =>
      expect(screen.getByText('All applications already associated')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /^associate$/i })).toBeDisabled();
  });
});

describe('PlanApplicationsView — edit trigger (AC 1)', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
  });

  it('each data row has a pencil button with correct aria-label', async () => {
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /edit pos core/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit kitchen display/i })).toBeInTheDocument();
  });

  it('clicking the pencil button opens the edit modal', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit pos core/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument(),
    );
  });
});

describe('PlanApplicationsView — edit modal fields (AC 2)', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
  });

  it('shows subscription plan name in a read-only input', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit pos core/i }));

    await waitFor(() => expect(screen.getByDisplayValue('Gold Plan')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Gold Plan')).toHaveAttribute('readonly');
  });

  it('shows application name in a read-only input', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit pos core/i }));

    await waitFor(() => expect(screen.getByDisplayValue('POS Core')).toBeInTheDocument());
    expect(screen.getByDisplayValue('POS Core')).toHaveAttribute('readonly');
  });

  it('pre-fills the limits textarea with the current value', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit pos core/i }));

    await waitFor(() =>
      expect(
        screen.getByDisplayValue('Basic usage limit: 100 users per month'),
      ).toBeInTheDocument(),
    );
  });

  it('pre-selects the Association Status dropdown with the current status', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit pos core/i }));

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /association status/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('combobox', { name: /association status/i })).toHaveValue('active');
  });
});

describe('PlanApplicationsView — edit happy path (AC 3)', () => {
  it('on save: closes modal, updates row in grid, shows success toast', async () => {
    const user = userEvent.setup();
    const updatedPA: PlanApplication = {
      id: 1,
      subscriptionPlan: { id: 3, name: 'Gold Plan' },
      application: { id: 5, name: 'POS Core', category: 'Point of Sale' },
      limits: 'Updated limit',
      status: 'inactive',
    };
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
    vi.mocked(saasService.updatePlanApplication).mockResolvedValue(updatedPA);
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit pos core/i }));
    await waitFor(() =>
      expect(
        screen.getByDisplayValue('Basic usage limit: 100 users per month'),
      ).toBeInTheDocument(),
    );

    await user.clear(screen.getByDisplayValue('Basic usage limit: 100 users per month'));
    await user.type(
      screen.getByPlaceholderText(/Up to 5 terminals/i),
      'Updated limit',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: /association status/i }),
      'inactive',
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
      expect(screen.getByText('Plan-application updated successfully')).toBeInTheDocument();
      expect(screen.getByText('Updated limit')).toBeInTheDocument();
    });
  });
});

describe('PlanApplicationsView — edit error path', () => {
  it('on API error: closes modal and shows error toast', async () => {
    const user = userEvent.setup();
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
    vi.mocked(saasService.updatePlanApplication).mockRejectedValue(
      new Error('Update failed'),
    );
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit pos core/i }));
    await waitFor(() =>
      expect(
        screen.getByDisplayValue('Basic usage limit: 100 users per month'),
      ).toBeInTheDocument(),
    );

    await user.clear(screen.getByDisplayValue('Basic usage limit: 100 users per month'));
    await user.type(
      screen.getByPlaceholderText(/Up to 5 terminals/i),
      'Different limit',
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
      expect(screen.getByText('Update failed')).toBeInTheDocument();
    });
  });
});

describe('PlanApplicationsView — edit submit disabled', () => {
  beforeEach(() => {
    vi.mocked(saasService.getPlanApplications).mockResolvedValue(MOCK_PLAN_APPS);
  });

  it('SAVE CHANGES is disabled when limits field is cleared', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit pos core/i }));
    await waitFor(() =>
      expect(
        screen.getByDisplayValue('Basic usage limit: 100 users per month'),
      ).toBeInTheDocument(),
    );

    await user.clear(screen.getByDisplayValue('Basic usage limit: 100 users per month'));

    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('SAVE CHANGES is disabled when no changes have been made', async () => {
    const user = userEvent.setup();
    render(<PlanApplicationsView plan={MOCK_PLAN} />);
    await waitFor(() => expect(screen.getByText('POS Core')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit pos core/i }));
    await waitFor(() =>
      expect(
        screen.getByDisplayValue('Basic usage limit: 100 users per month'),
      ).toBeInTheDocument(),
    );

    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });
});
