import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanyProfileView } from './CompanyProfileView';
import { getCompanyProfile, updateCompanyProfile } from '../../../../api/companies';
import type { CompanyProfile } from '../../../../types/company';

vi.mock('../../../api/companies', () => ({
  getCompanyProfile: vi.fn(),
  updateCompanyProfile: vi.fn(),
}));

const MOCK_PROFILE: CompanyProfile = {
  id: 32,
  name: 'Acme Holdings',
  rut: '76.123.456-7',
  email: 'hq@acme.com',
  phone: '+1 (555) 000-1000',
  address: '100 Corporate Plaza, Floor 12',
  city: 'Santiago',
  state: 'RM',
  country: 'Chile',
  metrics: {
    activeMerchantBranches: 5,
    globalCorporateCustomers: 48,
    authorizedMasterSuppliers: 9,
  },
};

function renderProfile() {
  return render(
    <MemoryRouter>
      <CompanyProfileView />
    </MemoryRouter>,
  );
}

describe('CompanyProfileView', () => {
  beforeEach(() => {
    vi.mocked(getCompanyProfile).mockResolvedValue(MOCK_PROFILE);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders corporate information board with metrics', async () => {
    renderProfile();

    await waitFor(() => {
      expect(screen.getByText('COMPANY MASTER PROFILE')).toBeInTheDocument();
    });

    expect(screen.getByText('Acme Holdings')).toBeInTheDocument();
    expect(screen.getByText(/Company ID: 32/)).toBeInTheDocument();
    expect(screen.getByText(/RUT: 76\.123\.456-7/)).toBeInTheDocument();
    expect(screen.getByText('hq@acme.com')).toBeInTheDocument();
    expect(screen.getByText('Total Active Merchant Branches')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('does not render add, delete, or search controls', async () => {
    renderProfile();

    await waitFor(() => {
      expect(screen.getByText('COMPANY MASTER PROFILE')).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add company/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle(/delete/i)).not.toBeInTheDocument();
  });

  it('renders quick launch with four shortcuts', async () => {
    renderProfile();

    await waitFor(() => {
      expect(screen.getByText('Quick Launch')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /system global configs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /master suppliers hub/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /global customer index/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /emergency support/i })).toBeInTheDocument();
  });

  it('opens edit modal with current profile values', async () => {
    const user = userEvent.setup();
    renderProfile();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /edit profile/i }));

    expect(screen.getByText('Edit Company Profile')).toBeInTheDocument();
    expect(screen.getByLabelText(/Corporate Name/i)).toHaveValue('Acme Holdings');
    expect(screen.getByLabelText(/Tax Registration/i)).toHaveValue('76.123.456-7');
    expect(screen.getByLabelText(/Business Email/i)).toHaveValue('hq@acme.com');
  });

  it('saves profile updates and shows success banner', async () => {
    const user = userEvent.setup();
    vi.mocked(updateCompanyProfile).mockResolvedValue({
      ...MOCK_PROFILE,
      name: 'Acme Global',
    });

    renderProfile();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /edit profile/i }));
    const nameInput = screen.getByLabelText(/Corporate Name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Acme Global');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateCompanyProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Acme Global' }),
      );
      expect(
        screen.getByText('Company profile updated successfully.'),
      ).toBeInTheDocument();
    });
  });
});
