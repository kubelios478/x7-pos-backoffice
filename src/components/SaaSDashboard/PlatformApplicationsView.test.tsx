import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformApplicationsView } from './PlatformApplicationsView';
import { saasService } from '../../services/saasService';
import type { Application } from '../../types/subscription';

vi.mock('../../services/saasService', () => ({
  saasService: {
    getApplications: vi.fn(),
    toggleApplicationInactive: vi.fn(),
  },
}));

const MOCK_APPS: Application[] = [
  {
    id: 1,
    name: 'POS Terminal',
    description: 'Core point-of-sale terminal application.',
    category: 'Core',
    status: 'active',
  },
  {
    id: 2,
    name: 'Kitchen Display',
    description: 'Real-time kitchen order display system.',
    category: 'Operations',
    status: 'active',
  },
  {
    id: 3,
    name: 'Reporting Suite',
    description: 'Advanced reporting and analytics module.',
    category: 'Analytics',
    status: 'inactive',
  },
];

function renderView() {
  return render(<PlatformApplicationsView />);
}

describe('PlatformApplicationsView — table rendering', () => {
  beforeEach(() => {
    vi.mocked(saasService.getApplications).mockResolvedValue(MOCK_APPS);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the PLATFORM APPLICATIONS heading', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('PLATFORM APPLICATIONS')).toBeInTheDocument();
    });
  });

  it('renders all application names', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('POS Terminal')).toBeInTheDocument();
      expect(screen.getByText('Kitchen Display')).toBeInTheDocument();
      expect(screen.getByText('Reporting Suite')).toBeInTheDocument();
    });
  });

  it('renders application descriptions', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Core point-of-sale terminal application.')).toBeInTheDocument();
    });
  });

  it('renders category values', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Core')).toBeInTheDocument();
      expect(screen.getByText('Operations')).toBeInTheDocument();
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

  it('inactive rows have opacity-75 class', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Reporting Suite')).toBeInTheDocument());

    const cell = screen.getByText('Reporting Suite');
    const row = cell.closest('tr');
    expect(row).toHaveClass('opacity-75');
  });

  it('active rows do NOT have opacity-75 class', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    const cell = screen.getByText('POS Terminal');
    const row = cell.closest('tr');
    expect(row).not.toHaveClass('opacity-75');
  });
});

describe('PlatformApplicationsView — empty state', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows empty state when service returns no applications', async () => {
    vi.mocked(saasService.getApplications).mockResolvedValue([]);
    renderView();
    await waitFor(() => {
      expect(screen.getByText('No Applications Configured')).toBeInTheDocument();
    });
  });

  it('hides the table when service returns no applications', async () => {
    vi.mocked(saasService.getApplications).mockResolvedValue([]);
    renderView();
    await waitFor(() => {
      expect(screen.queryByText('PLATFORM APPLICATIONS')).not.toBeInTheDocument();
    });
  });
});

describe('PlatformApplicationsView — filter strip', () => {
  beforeEach(() => {
    vi.mocked(saasService.getApplications).mockResolvedValue(MOCK_APPS);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the search input', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search applications...')).toBeInTheDocument();
    });
  });

  it('filters rows by application name on search', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search applications...'), 'Kitchen');

    expect(screen.getByText('Kitchen Display')).toBeInTheDocument();
    expect(screen.queryByText('POS Terminal')).not.toBeInTheDocument();
    expect(screen.queryByText('Reporting Suite')).not.toBeInTheDocument();
  });

  it('filters rows by application description on search', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search applications...'), 'analytics');

    expect(screen.getByText('Reporting Suite')).toBeInTheDocument();
    expect(screen.queryByText('POS Terminal')).not.toBeInTheDocument();
  });

  it('filters rows by status dropdown', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Reporting Suite')).toBeInTheDocument());

    await user.selectOptions(screen.getByTestId('filter-status'), 'inactive');

    expect(screen.getByText('Reporting Suite')).toBeInTheDocument();
    expect(screen.queryByText('POS Terminal')).not.toBeInTheDocument();
  });

  it('shows no-results row when filters yield no matches', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search applications...'), 'xyznotexist');

    expect(screen.getByText('No applications match your search filters')).toBeInTheDocument();
  });

  it('clears all filters when Clear filters is clicked', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search applications...'), 'xyznotexist');
    expect(screen.getByText('No applications match your search filters')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(screen.getByText('POS Terminal')).toBeInTheDocument();
    expect(screen.getByText('Kitchen Display')).toBeInTheDocument();
  });
});

describe('PlatformApplicationsView — toggle status action', () => {
  beforeEach(() => {
    vi.mocked(saasService.getApplications).mockResolvedValue(MOCK_APPS);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a Deactivate button only for active apps', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    const deactivateButtons = screen.getAllByRole('button', { name: /^Deactivate /i });
    expect(deactivateButtons).toHaveLength(2); // only active apps
  });

  it('does NOT render a Deactivate button for inactive apps', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Reporting Suite')).toBeInTheDocument());

    expect(
      screen.queryByRole('button', { name: 'Deactivate Reporting Suite' }),
    ).not.toBeInTheDocument();
  });

  it('clicking Deactivate opens confirmation modal with app name', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Deactivate POS Terminal' }));

    expect(screen.getByText('DEACTIVATE APPLICATION')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Deactivating "POS Terminal" will affect all downstream subscription bundles (plan-applications) and operational storefront access points (subscription-applications). This application will no longer be distributed to new subscribers.',
      ),
    ).toBeInTheDocument();
  });

  it('clicking Cancel closes the confirmation modal', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Deactivate POS Terminal' }));
    expect(screen.getByText('DEACTIVATE APPLICATION')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText('DEACTIVATE APPLICATION')).not.toBeInTheDocument();
  });

  it('confirming calls toggleApplicationInactive with the correct app', async () => {
    const deactivated = { ...MOCK_APPS[0], status: 'inactive' as const };
    vi.mocked(saasService.toggleApplicationInactive).mockResolvedValue(deactivated);

    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Deactivate POS Terminal' }));
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));

    await waitFor(() => {
      expect(saasService.toggleApplicationInactive).toHaveBeenCalledWith(MOCK_APPS[0]);
    });
  });

  it('successful toggle updates row in-place to inactive and shows success toast', async () => {
    const deactivated = { ...MOCK_APPS[0], status: 'inactive' as const };
    vi.mocked(saasService.toggleApplicationInactive).mockResolvedValue(deactivated);

    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Deactivate POS Terminal' }));
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));

    await waitFor(() => {
      expect(screen.queryByText('DEACTIVATE APPLICATION')).not.toBeInTheDocument();
      expect(screen.getByText('Application deactivated successfully')).toBeInTheDocument();
    });

    const cell = screen.getByText('POS Terminal');
    const row = cell.closest('tr');
    expect(row).toHaveClass('opacity-75');
  });

  it('SESSION_EXPIRED closes modal and shows session-expired toast', async () => {
    vi.mocked(saasService.toggleApplicationInactive).mockRejectedValue(
      new Error('SESSION_EXPIRED'),
    );

    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Deactivate POS Terminal' }));
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));

    await waitFor(() => {
      expect(screen.queryByText('DEACTIVATE APPLICATION')).not.toBeInTheDocument();
      expect(
        screen.getByText('Session expired. Please refresh the page to sign in again.'),
      ).toBeInTheDocument();
    });
  });

  it('API error closes modal and shows error toast', async () => {
    vi.mocked(saasService.toggleApplicationInactive).mockRejectedValue(
      new Error('Application has active subscriptions'),
    );

    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Deactivate POS Terminal' }));
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));

    await waitFor(() => {
      expect(screen.queryByText('DEACTIVATE APPLICATION')).not.toBeInTheDocument();
      expect(screen.getByText('Application has active subscriptions')).toBeInTheDocument();
    });
  });
});
