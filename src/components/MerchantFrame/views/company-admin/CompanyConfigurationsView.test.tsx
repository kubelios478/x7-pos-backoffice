import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanyConfigurationsView } from './CompanyConfigurationsView';
import { getCompanyConfigurations } from '../../../../api/companies';

vi.mock('../../../api/companies', () => ({
  getCompanyConfigurations: vi.fn(),
}));

const MOCK_DATA = {
  summary: {
    totalConfigurations: 2,
    activeConfigurations: 1,
    configurationTypes: 2,
  },
  items: [
    {
      id: 1,
      configurationType: 'merchant_tax_rule',
      configurationLabel: 'Tax Rules',
      status: 'active',
      merchantId: 38,
      merchantName: 'Downtown Bistro',
      updatedAt: '2026-06-18',
    },
    {
      id: 2,
      configurationType: 'merchant_payroll_rule',
      configurationLabel: 'Payroll Rules',
      status: 'inactive',
      merchantId: 39,
      merchantName: 'Harbor Grill',
      updatedAt: '2026-06-17',
    },
  ],
};

describe('CompanyConfigurationsView', () => {
  beforeEach(() => {
    vi.mocked(getCompanyConfigurations).mockResolvedValue(MOCK_DATA);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders corporate configurations board and registry', async () => {
    render(
      <MemoryRouter>
        <CompanyConfigurationsView />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('CORPORATE SYSTEM CONFIGURATIONS'),
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Total Configuration Records')).toBeInTheDocument();
    expect(screen.getByText('Configuration Registry')).toBeInTheDocument();
    expect(screen.getByText('Tax Rules')).toBeInTheDocument();
    expect(screen.getByText('Harbor Grill')).toBeInTheDocument();
    expect(screen.getAllByText('Payroll Rules').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /back to company profile/i })).toBeInTheDocument();
  });

  it('shows empty state when no configurations exist', async () => {
    vi.mocked(getCompanyConfigurations).mockResolvedValue({
      summary: {
        totalConfigurations: 0,
        activeConfigurations: 0,
        configurationTypes: 0,
      },
      items: [],
    });

    render(
      <MemoryRouter>
        <CompanyConfigurationsView />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('No configuration records found for this company yet.'),
      ).toBeInTheDocument();
    });
  });
});
