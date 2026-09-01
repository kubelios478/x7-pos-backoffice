import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MerchantDirectoryView } from './MerchantDirectoryView';
import {
  createCompanyMerchant,
  deactivateCompanyMerchant,
  getCompanyMerchants,
  getMerchantAdminSummary,
  updateCompanyMerchant,
} from '../../../../api/merchants';
import type { CompanyMerchant } from '../../../../types/merchant';

vi.mock('../../../api/merchants', () => ({
  getCompanyMerchants: vi.fn(),
  createCompanyMerchant: vi.fn(),
  updateCompanyMerchant: vi.fn(),
  deactivateCompanyMerchant: vi.fn(),
  getMerchantAdminSummary: vi.fn(),
}));

const MOCK_SUMMARY = {
  id: 38,
  name: 'Downtown Bistro',
  totalActiveTeamMembers: 8,
  operationalFloorAssets: 12,
  activeStockHubs: 2,
};

function renderDirectory() {
  return render(
    <MemoryRouter>
      <MerchantDirectoryView />
    </MemoryRouter>,
  );
}

const MOCK_MERCHANTS: CompanyMerchant[] = [
  {
    id: 38,
    name: 'Downtown Bistro',
    rut: '12-3456789',
    email: 'contact@bistro.com',
    phone: '+1 (555) 000-0001',
    address: '456 Oak Ave',
    city: 'Miami',
    state: 'California',
    country: 'USA',
    status: 'active',
    companyId: 32,
  },
  {
    id: 39,
    name: 'Harbor Grill',
    rut: '98-7654321',
    email: 'harbor@example.com',
    phone: '+1 (555) 000-0002',
    address: '789 Pine St',
    city: 'Seattle',
    state: 'Washington',
    country: 'USA',
    status: 'suspended',
    companyId: 32,
  },
];

describe('MerchantDirectoryView', () => {
  beforeEach(() => {
    vi.mocked(getCompanyMerchants).mockResolvedValue({
      merchants: MOCK_MERCHANTS,
      meta: { companyId: 32 },
    });
    vi.mocked(getMerchantAdminSummary).mockResolvedValue(MOCK_SUMMARY);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders merchant directory columns and actions', async () => {
    renderDirectory();

    await waitFor(() => {
      expect(screen.getByText('MERCHANT DIRECTORY')).toBeInTheDocument();
    });

    expect(screen.getByText('Downtown Bistro')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getAllByTitle('Edit merchant').length).toBeGreaterThan(0);
  });

  it('opens add merchant modal from primary action button', async () => {
    const user = userEvent.setup();
    renderDirectory();

    await waitFor(() => {
      expect(screen.getByText('ADD MERCHANT')).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole('button', { name: /add merchant/i })[0]);

    expect(screen.getByText('Add Merchant Branch')).toBeInTheDocument();
    expect(screen.getByLabelText(/Store Name/i)).toBeInTheDocument();
  });

  it('creates a merchant and shows success banner', async () => {
    const user = userEvent.setup();
    vi.mocked(createCompanyMerchant).mockResolvedValue(MOCK_MERCHANTS[0]);

    renderDirectory();

    await waitFor(() => {
      expect(screen.getByText('ADD MERCHANT')).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole('button', { name: /add merchant/i })[0]);
    await user.type(screen.getByLabelText(/Store Name/i), 'New Branch');
    await user.type(screen.getByLabelText(/Tax Identification/i), '11-2233445');
    await user.type(screen.getByLabelText(/^Address$/i), '100 Market Street');
    await user.type(screen.getByLabelText(/^City$/i), 'Austin');
    await user.type(screen.getByLabelText(/State\/Prov/i), 'Texas');
    await user.type(screen.getByLabelText(/^Country$/i), 'USA');
    await user.click(screen.getByRole('button', { name: /create merchant/i }));

    await waitFor(() => {
      expect(createCompanyMerchant).toHaveBeenCalled();
      expect(
        screen.getByText('Merchant branch created successfully.'),
      ).toBeInTheDocument();
    });
  });

  it('opens edit modal with current merchant values', async () => {
    const user = userEvent.setup();
    renderDirectory();

    await waitFor(() => {
      expect(screen.getByText('Downtown Bistro')).toBeInTheDocument();
    });

    await user.click(screen.getAllByTitle('Edit merchant')[0]);

    expect(screen.getByText('Edit Merchant Branch')).toBeInTheDocument();
    expect(screen.getByLabelText(/Store Name/i)).toHaveValue('Downtown Bistro');
    expect(screen.getByLabelText(/Tax Identification/i)).toHaveValue('12-3456789');
    expect(screen.getByLabelText(/^Address$/i)).toHaveValue('456 Oak Ave');
  });

  it('shows global empty state when company has no merchants', async () => {
    vi.mocked(getCompanyMerchants).mockResolvedValue({
      merchants: [],
      meta: { companyId: 32 },
    });

    renderDirectory();

    await waitFor(() => {
      expect(
        screen.getByText(
          "No merchants found for this company. Click 'Add Merchant' to establish your first store branch.",
        ),
      ).toBeInTheDocument();
    });
  });

  it('filters rows by search and region', async () => {
    const user = userEvent.setup();
    renderDirectory();

    await waitFor(() => {
      expect(screen.getByText('Harbor Grill')).toBeInTheDocument();
    });

    await user.type(
      screen.getByPlaceholderText('Search branches by name...'),
      'harbor',
    );
    await user.selectOptions(screen.getByRole('combobox'), 'USA — Washington');

    expect(screen.getByText('Harbor Grill')).toBeInTheDocument();
    expect(screen.queryByText('Downtown Bistro')).not.toBeInTheDocument();
  });

  it('shows deactivate confirmation dialog', async () => {
    const user = userEvent.setup();
    renderDirectory();

    await waitFor(() => {
      expect(screen.getByText('Downtown Bistro')).toBeInTheDocument();
    });

    await user.click(screen.getAllByTitle('Deactivate merchant')[0]);

    expect(screen.getAllByText('Deactivate Branch')[0]).toBeInTheDocument();
    expect(
      screen.getByText(/linked operations such as orders, shifts, and active products/i),
    ).toBeInTheDocument();
  });

  it('deactivates merchant after confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(deactivateCompanyMerchant).mockResolvedValue({
      ...MOCK_MERCHANTS[0],
      status: 'inactive',
    });

    renderDirectory();

    await waitFor(() => {
      expect(screen.getByText('Downtown Bistro')).toBeInTheDocument();
    });

    await user.click(screen.getAllByTitle('Deactivate merchant')[0]);
    await user.click(screen.getByRole('button', { name: /deactivate branch/i }));

    await waitFor(() => {
      expect(deactivateCompanyMerchant).toHaveBeenCalledWith(38);
    });
  });

  it('updates merchant from edit modal', async () => {
    const user = userEvent.setup();
    vi.mocked(updateCompanyMerchant).mockResolvedValue(MOCK_MERCHANTS[0]);

    renderDirectory();

    await waitFor(() => {
      expect(screen.getByText('Downtown Bistro')).toBeInTheDocument();
    });

    await user.click(screen.getAllByTitle('Edit merchant')[0]);
    const nameInput = screen.getByLabelText(/Store Name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Bistro');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateCompanyMerchant).toHaveBeenCalledWith(
        38,
        expect.objectContaining({ name: 'Updated Bistro' }),
      );
    });
  });

  it('renders quick launch footer with four corporate shortcuts', async () => {
    renderDirectory();

    await waitFor(() => {
      expect(screen.getByText('Quick Launch')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /company global settings/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /multi-store dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /assign staff & roles/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /emergency support/i })).toBeInTheDocument();
  });

  it('opens branch summary modal when clicking a merchant row', async () => {
    const user = userEvent.setup();
    renderDirectory();

    await waitFor(() => {
      expect(screen.getByText('Downtown Bistro')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Downtown Bistro'));

    await waitFor(() => {
      expect(getMerchantAdminSummary).toHaveBeenCalledWith(38);
      expect(screen.getByText('Branch Administrative Summary')).toBeInTheDocument();
      expect(screen.getByText('Total Active Team')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('Operational Floor Assets')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('Active Stock Hubs')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('does not open summary modal when clicking edit action', async () => {
    const user = userEvent.setup();
    renderDirectory();

    await waitFor(() => {
      expect(screen.getByText('Downtown Bistro')).toBeInTheDocument();
    });

    await user.click(screen.getAllByTitle('Edit merchant')[0]);

    expect(screen.getByText('Edit Merchant Branch')).toBeInTheDocument();
    expect(screen.queryByText('Branch Administrative Summary')).not.toBeInTheDocument();
    expect(getMerchantAdminSummary).not.toHaveBeenCalled();
  });
});
