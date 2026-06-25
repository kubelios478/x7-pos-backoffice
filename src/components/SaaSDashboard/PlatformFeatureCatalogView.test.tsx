import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { PlatformFeatureCatalogView } from './PlatformFeatureCatalogView';
import { saasService } from '../../services/saasService';
import type { PlatformFeature } from '../../types/subscription';

vi.mock('../../services/saasService', () => ({
  saasService: {
    getFeatures: vi.fn(),
    createFeature: vi.fn(),
  },
}));

const MOCK_FEATURES: PlatformFeature[] = [
  {
    id: 1,
    name: 'Advanced Analytics',
    description: 'Provides advanced data analytics capabilities.',
    Unit: 'user',
    status: 'active',
  },
  {
    id: 2,
    name: 'Cloud Storage',
    description: 'Persistent file storage for merchant documents.',
    Unit: 'gb',
    status: 'inactive',
  },
  {
    id: 3,
    name: 'API Access',
    description: 'Programmatic access via REST endpoints.',
    Unit: 'unit',
    status: 'active',
  },
];

const NEW_FEATURE: PlatformFeature = {
  id: 99,
  name: 'New Test Feature',
  description: 'A freshly created test feature.',
  Unit: 'unit',
  status: 'active',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PlatformFeatureCatalogView — loading state', () => {
  it('shows a loading indicator while fetching', () => {
    vi.mocked(saasService.getFeatures).mockReturnValue(new Promise(() => {}));
    render(<PlatformFeatureCatalogView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

describe('PlatformFeatureCatalogView — error state', () => {
  it('shows an error message when the API call fails', async () => {
    vi.mocked(saasService.getFeatures).mockRejectedValue(new Error('Network error'));
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });
});

describe('PlatformFeatureCatalogView — table rendering', () => {
  beforeEach(() => {
    vi.mocked(saasService.getFeatures).mockResolvedValue(MOCK_FEATURES);
  });

  it('renders the table title PLATFORM FEATURE CATALOG MASTER', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByText('PLATFORM FEATURE CATALOG MASTER')).toBeInTheDocument();
    });
  });

  it('renders feature names as primary bold text', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByText('Advanced Analytics')).toBeInTheDocument();
      expect(screen.getByText('Cloud Storage')).toBeInTheDocument();
      expect(screen.getByText('API Access')).toBeInTheDocument();
    });
  });

  it('renders monospace feature_{id} code labels below each name', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByText('feature_1')).toBeInTheDocument();
      expect(screen.getByText('feature_2')).toBeInTheDocument();
      expect(screen.getByText('feature_3')).toBeInTheDocument();
    });
  });

  it('renders feature descriptions as muted subtitle text', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByText('Provides advanced data analytics capabilities.')).toBeInTheDocument();
    });
  });

  it('renders Unit as a lowercase bracketed tag', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByText('[user]')).toBeInTheDocument();
      expect(screen.getByText('[gb]')).toBeInTheDocument();
      expect(screen.getByText('[unit]')).toBeInTheDocument();
    });
  });

  it('renders an emerald badge for active features', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      const activeBadges = screen.getAllByText('active', { selector: 'span' });
      expect(activeBadges.length).toBeGreaterThan(0);
      expect(activeBadges[0]).toHaveClass('bg-emerald-500');
    });
  });

  it('renders a charcoal badge for inactive features', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      const inactiveBadge = screen.getByText('inactive', { selector: 'span' });
      expect(inactiveBadge).toHaveClass('bg-[#444444]');
    });
  });
});

describe('PlatformFeatureCatalogView — empty state', () => {
  it('renders the empty-state message when no features are returned', async () => {
    vi.mocked(saasService.getFeatures).mockResolvedValue([]);
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(
        screen.getByText(
          "No feature definitions found. Click 'Create Feature' to establish your first system capability flag.",
        ),
      ).toBeInTheDocument();
    });
  });

  it('does not render the table title in the empty state', async () => {
    vi.mocked(saasService.getFeatures).mockResolvedValue([]);
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.queryByText('PLATFORM FEATURE CATALOG MASTER')).not.toBeInTheDocument();
    });
  });
});

describe('PlatformFeatureCatalogView — filter strip', () => {
  beforeEach(() => {
    vi.mocked(saasService.getFeatures).mockResolvedValue(MOCK_FEATURES);
  });

  it('renders the search input', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Search features' })).toBeInTheDocument();
    });
  });

  it('renders the Measurement Unit dropdown with All Units option', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Filter by measurement unit' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'All Units' })).toBeInTheDocument();
    });
  });

  it('renders the Status dropdown', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Filter by status' })).toBeInTheDocument();
    });
  });

  it('unit dropdown is populated with distinct sorted Unit values from data', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      // MOCK_FEATURES has Unit values: 'user', 'gb', 'unit' — sorted: 'gb', 'unit', 'user'
      expect(screen.getByRole('option', { name: 'gb' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'unit' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'user' })).toBeInTheDocument();
    });
  });
});

describe('PlatformFeatureCatalogView — fuzzy search', () => {
  beforeEach(() => {
    vi.mocked(saasService.getFeatures).mockResolvedValue(MOCK_FEATURES);
  });

  it('filters rows by matching characters in feature name', async () => {
    render(<PlatformFeatureCatalogView />);
    const input = await screen.findByRole('textbox', { name: 'Search features' });
    await userEvent.type(input, 'ana');
    await waitFor(() => {
      expect(screen.getByText('Advanced Analytics')).toBeInTheDocument();
      expect(screen.queryByText('Cloud Storage')).not.toBeInTheDocument();
      expect(screen.queryByText('API Access')).not.toBeInTheDocument();
    });
  });

  it('filters rows by matching characters in feature description', async () => {
    render(<PlatformFeatureCatalogView />);
    const input = await screen.findByRole('textbox', { name: 'Search features' });
    await userEvent.type(input, 'file');
    await waitFor(() => {
      expect(screen.getByText('Cloud Storage')).toBeInTheDocument();
      expect(screen.queryByText('Advanced Analytics')).not.toBeInTheDocument();
    });
  });

  it('filters rows by matching feature_N id string', async () => {
    render(<PlatformFeatureCatalogView />);
    const input = await screen.findByRole('textbox', { name: 'Search features' });
    await userEvent.type(input, 'feature_2');
    await waitFor(() => {
      expect(screen.getByText('Cloud Storage')).toBeInTheDocument();
      expect(screen.queryByText('Advanced Analytics')).not.toBeInTheDocument();
      expect(screen.queryByText('API Access')).not.toBeInTheDocument();
    });
  });

  it('shows all rows when search input is empty', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByText('Advanced Analytics')).toBeInTheDocument();
      expect(screen.getByText('Cloud Storage')).toBeInTheDocument();
      expect(screen.getByText('API Access')).toBeInTheDocument();
    });
  });
});

describe('PlatformFeatureCatalogView — unit filter', () => {
  beforeEach(() => {
    vi.mocked(saasService.getFeatures).mockResolvedValue(MOCK_FEATURES);
  });

  it('shows only rows matching selected unit', async () => {
    render(<PlatformFeatureCatalogView />);
    const select = await screen.findByRole('combobox', { name: 'Filter by measurement unit' });
    await userEvent.selectOptions(select, 'gb');
    await waitFor(() => {
      expect(screen.getByText('Cloud Storage')).toBeInTheDocument();
      expect(screen.queryByText('Advanced Analytics')).not.toBeInTheDocument();
      expect(screen.queryByText('API Access')).not.toBeInTheDocument();
    });
  });
});

describe('PlatformFeatureCatalogView — status filter', () => {
  beforeEach(() => {
    vi.mocked(saasService.getFeatures).mockResolvedValue(MOCK_FEATURES);
  });

  it('shows only active rows when active is selected', async () => {
    render(<PlatformFeatureCatalogView />);
    const select = await screen.findByRole('combobox', { name: 'Filter by status' });
    await userEvent.selectOptions(select, 'active');
    await waitFor(() => {
      expect(screen.getByText('Advanced Analytics')).toBeInTheDocument();
      expect(screen.getByText('API Access')).toBeInTheDocument();
      expect(screen.queryByText('Cloud Storage')).not.toBeInTheDocument();
    });
  });

  it('shows only inactive rows when inactive is selected', async () => {
    render(<PlatformFeatureCatalogView />);
    const select = await screen.findByRole('combobox', { name: 'Filter by status' });
    await userEvent.selectOptions(select, 'inactive');
    await waitFor(() => {
      expect(screen.getByText('Cloud Storage')).toBeInTheDocument();
      expect(screen.queryByText('Advanced Analytics')).not.toBeInTheDocument();
      expect(screen.queryByText('API Access')).not.toBeInTheDocument();
    });
  });
});

describe('PlatformFeatureCatalogView — no results (AC 5)', () => {
  beforeEach(() => {
    vi.mocked(saasService.getFeatures).mockResolvedValue(MOCK_FEATURES);
  });

  it('shows inline no-results message when filters produce zero results', async () => {
    render(<PlatformFeatureCatalogView />);
    const input = await screen.findByRole('textbox', { name: 'Search features' });
    await userEvent.type(input, 'zzzzzzzzz');
    await waitFor(() => {
      expect(
        screen.getByText('No platform features match your active filters'),
      ).toBeInTheDocument();
    });
  });

  it('does not show the empty-state message when filters produce zero results', async () => {
    render(<PlatformFeatureCatalogView />);
    const input = await screen.findByRole('textbox', { name: 'Search features' });
    await userEvent.type(input, 'zzzzzzzzz');
    await waitFor(() => {
      expect(screen.queryByText(/No feature definitions found/)).not.toBeInTheDocument();
    });
  });

  it('keeps the table header visible when filters produce zero results', async () => {
    render(<PlatformFeatureCatalogView />);
    const input = await screen.findByRole('textbox', { name: 'Search features' });
    await userEvent.type(input, 'zzzzzzzzz');
    await waitFor(() => {
      expect(screen.getByText('PLATFORM FEATURE CATALOG MASTER')).toBeInTheDocument();
    });
  });
});

describe('PlatformFeatureCatalogView — clear filters', () => {
  beforeEach(() => {
    vi.mocked(saasService.getFeatures).mockResolvedValue(MOCK_FEATURES);
  });

  it('Clear Filters button is hidden when no filter is active', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => screen.getByText('Advanced Analytics'));
    expect(screen.queryByRole('button', { name: 'Clear Filters' })).not.toBeInTheDocument();
  });

  it('Clear Filters button appears when search text is entered', async () => {
    render(<PlatformFeatureCatalogView />);
    const input = await screen.findByRole('textbox', { name: 'Search features' });
    await userEvent.type(input, 'ana');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Clear Filters' })).toBeInTheDocument();
    });
  });

  it('clicking Clear Filters resets all filters and shows all rows', async () => {
    render(<PlatformFeatureCatalogView />);
    const input = await screen.findByRole('textbox', { name: 'Search features' });
    await userEvent.type(input, 'ana');
    await waitFor(() => screen.getByRole('button', { name: 'Clear Filters' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
    await waitFor(() => {
      expect(screen.getByText('Advanced Analytics')).toBeInTheDocument();
      expect(screen.getByText('Cloud Storage')).toBeInTheDocument();
      expect(screen.getByText('API Access')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Clear Filters' })).not.toBeInTheDocument();
    });
  });
});

describe('PlatformFeatureCatalogView — Quick Launch', () => {
  beforeEach(() => {
    vi.mocked(saasService.getFeatures).mockResolvedValue(MOCK_FEATURES);
  });

  it('renders the Quick Launch section with dark background', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByText('Quick Launch')).toBeInTheDocument();
    });
  });

  it('renders PLATFORM APPLICATIONS button', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'PLATFORM APPLICATIONS' })).toBeInTheDocument();
    });
  });

  it('renders SUBSCRIPTION PLANS button', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'SUBSCRIPTION PLANS' })).toBeInTheDocument();
    });
  });

  it('renders METERED USAGE LEDGER button', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'METERED USAGE LEDGER' })).toBeInTheDocument();
    });
  });

  it('renders EMERGENCY SUPPORT button', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'EMERGENCY SUPPORT' })).toBeInTheDocument();
    });
  });

  it("calls onNavigate with 'subscription-applications' when PLATFORM APPLICATIONS is clicked", async () => {
    const onNavigate = vi.fn();
    render(<PlatformFeatureCatalogView onNavigate={onNavigate} />);
    await userEvent.click(await screen.findByRole('button', { name: 'PLATFORM APPLICATIONS' }));
    expect(onNavigate).toHaveBeenCalledWith('subscription-applications');
  });

  it("calls onNavigate with 'subscription' when SUBSCRIPTION PLANS is clicked", async () => {
    const onNavigate = vi.fn();
    render(<PlatformFeatureCatalogView onNavigate={onNavigate} />);
    await userEvent.click(await screen.findByRole('button', { name: 'SUBSCRIPTION PLANS' }));
    expect(onNavigate).toHaveBeenCalledWith('subscription');
  });

  it("calls onNavigate with 'subscription-live-installs' when METERED USAGE LEDGER is clicked", async () => {
    const onNavigate = vi.fn();
    render(<PlatformFeatureCatalogView onNavigate={onNavigate} />);
    await userEvent.click(await screen.findByRole('button', { name: 'METERED USAGE LEDGER' }));
    expect(onNavigate).toHaveBeenCalledWith('subscription-live-installs');
  });
});

describe('PlatformFeatureCatalogView — Create Feature entry points', () => {
  beforeEach(() => {
    vi.mocked(saasService.getFeatures).mockResolvedValue(MOCK_FEATURES);
  });

  it('renders the "+ CREATE FEATURE" button in the filter strip', async () => {
    render(<PlatformFeatureCatalogView />);
    expect(
      await screen.findByRole('button', { name: 'Create Feature' }),
    ).toBeInTheDocument();
  });

  it('clicking "+ CREATE FEATURE" opens the modal', async () => {
    render(<PlatformFeatureCatalogView />);
    await userEvent.click(await screen.findByRole('button', { name: 'Create Feature' }));
    expect(screen.getByText('CREATE FEATURE')).toBeInTheDocument();
  });

  it('renders the FAB button', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => screen.getByText('Advanced Analytics'));
    expect(screen.getByRole('button', { name: 'Open create-feature form' })).toBeInTheDocument();
  });

  it('clicking the FAB opens the modal', async () => {
    render(<PlatformFeatureCatalogView />);
    await waitFor(() => screen.getByText('Advanced Analytics'));
    await userEvent.click(screen.getByRole('button', { name: 'Open create-feature form' }));
    expect(screen.getByText('CREATE FEATURE')).toBeInTheDocument();
  });
});

describe('PlatformFeatureCatalogView — Create Feature modal validation', () => {
  beforeEach(() => {
    vi.mocked(saasService.getFeatures).mockResolvedValue(MOCK_FEATURES);
  });

  async function openModal() {
    render(<PlatformFeatureCatalogView />);
    await userEvent.click(await screen.findByRole('button', { name: 'Create Feature' }));
  }

  it('modal renders Name, Description, and Unit fields', async () => {
    await openModal();
    expect(screen.getByPlaceholderText('Feature name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Feature description')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. unit, user, gb')).toBeInTheDocument();
  });

  it('submit button is disabled when fields are empty', async () => {
    await openModal();
    expect(screen.getByRole('button', { name: /create feature/i })).toBeDisabled();
  });

  it('submit button is enabled when all fields are filled', async () => {
    await openModal();
    await userEvent.type(screen.getByPlaceholderText('Feature name'), 'My Feature');
    await userEvent.type(screen.getByPlaceholderText('Feature description'), 'Some description');
    await userEvent.type(screen.getByPlaceholderText('e.g. unit, user, gb'), 'unit');
    expect(screen.getByRole('button', { name: /create feature/i })).toBeEnabled();
  });

  it('name counter turns red and submit is disabled when name exceeds 100 chars', async () => {
    await openModal();
    await userEvent.type(screen.getByPlaceholderText('Feature name'), 'A'.repeat(101));
    await userEvent.type(screen.getByPlaceholderText('Feature description'), 'desc');
    await userEvent.type(screen.getByPlaceholderText('e.g. unit, user, gb'), 'unit');
    expect(screen.getByRole('button', { name: /create feature/i })).toBeDisabled();
  });

  it('unit counter turns red and submit is disabled when unit exceeds 50 chars', async () => {
    await openModal();
    await userEvent.type(screen.getByPlaceholderText('Feature name'), 'Valid Name');
    await userEvent.type(screen.getByPlaceholderText('Feature description'), 'desc');
    await userEvent.type(screen.getByPlaceholderText('e.g. unit, user, gb'), 'U'.repeat(51));
    expect(screen.getByRole('button', { name: /create feature/i })).toBeDisabled();
  });

  it('clicking Cancel closes the modal', async () => {
    await openModal();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText('CREATE FEATURE')).not.toBeInTheDocument();
  });
});

describe('PlatformFeatureCatalogView — Create Feature submit', () => {
  beforeEach(() => {
    vi.mocked(saasService.getFeatures).mockResolvedValue(MOCK_FEATURES);
  });

  async function fillAndSubmit() {
    render(<PlatformFeatureCatalogView />);
    await userEvent.click(await screen.findByRole('button', { name: 'Create Feature' }));
    await userEvent.type(screen.getByPlaceholderText('Feature name'), NEW_FEATURE.name);
    await userEvent.type(screen.getByPlaceholderText('Feature description'), NEW_FEATURE.description);
    await userEvent.type(screen.getByPlaceholderText('e.g. unit, user, gb'), NEW_FEATURE.Unit);
    await userEvent.click(screen.getByRole('button', { name: /create feature/i }));
  }

  it('on success: modal closes, new feature prepended, success toast shown', async () => {
    vi.mocked(saasService.createFeature).mockResolvedValue(NEW_FEATURE);
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.queryByText('CREATE FEATURE')).not.toBeInTheDocument();
      expect(screen.getByText('New Test Feature')).toBeInTheDocument();
      expect(screen.getByText('Feature created successfully')).toBeInTheDocument();
    });
  });

  it('createFeature is called with correct payload including status active', async () => {
    vi.mocked(saasService.createFeature).mockResolvedValue(NEW_FEATURE);
    await fillAndSubmit();
    await waitFor(() => {
      expect(saasService.createFeature).toHaveBeenCalledWith({
        name: NEW_FEATURE.name,
        description: NEW_FEATURE.description,
        Unit: NEW_FEATURE.Unit,
        status: 'active',
      });
    });
  });

  it('SESSION_EXPIRED: modal closes, session-expired toast shown', async () => {
    vi.mocked(saasService.createFeature).mockRejectedValue(new Error('SESSION_EXPIRED'));
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.queryByText('CREATE FEATURE')).not.toBeInTheDocument();
      expect(
        screen.getByText('Session expired. Please refresh the page to sign in again.'),
      ).toBeInTheDocument();
    });
  });

  it('API error: modal closes, error message toast shown', async () => {
    vi.mocked(saasService.createFeature).mockRejectedValue(
      new Error('Feature name already exists'),
    );
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.queryByText('CREATE FEATURE')).not.toBeInTheDocument();
      expect(screen.getByText('Feature name already exists')).toBeInTheDocument();
    });
  });
});
