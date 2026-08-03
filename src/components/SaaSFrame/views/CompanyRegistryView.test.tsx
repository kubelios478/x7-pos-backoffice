import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyRegistryView } from './CompanyRegistryView';
import { saasService } from '../../../services/saasService';
import type { CompanyRegistryItem } from '../../../types/company-registry';

vi.mock('../../../services/saasService', () => ({
  saasService: {
    listCompanies: vi.fn(),
    createCompany: vi.fn(),
    updateCompany: vi.fn(),
    setCompanyStatus: vi.fn(),
  },
}));

const MOCK_COMPANIES: CompanyRegistryItem[] = [
  {
    id: 1,
    name: 'Acme Corp',
    rut: '11.111.111-1',
    email: 'a@acme.com',
    phone: '111',
    city: 'Miami',
    state: 'Florida',
    country: 'USA',
    status: 'active',
    merchantsCount: 3,
    customersCount: 10,
  },
  {
    id: 2,
    name: 'Globex',
    rut: '22.222.222-2',
    email: 'g@globex.com',
    phone: '222',
    city: 'Santiago',
    state: 'RM',
    country: 'Chile',
    status: 'inactive',
    merchantsCount: 1,
    customersCount: 0,
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CompanyRegistryView', () => {
  it('renders the global registry with ecosystem metrics', async () => {
    vi.mocked(saasService.listCompanies).mockResolvedValue(MOCK_COMPANIES);
    render(<CompanyRegistryView />);

    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('GLOBAL COMPANY REGISTRY')).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();
    // Branch/customer counts rendered
    expect(screen.getAllByText('Branches').length).toBeGreaterThan(0);
  });

  it('shows the empty-state banner when the platform has no companies', async () => {
    vi.mocked(saasService.listCompanies).mockResolvedValue([]);
    render(<CompanyRegistryView />);

    expect(await screen.findByTestId('empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(/the platform has no active companies/i),
    ).toBeInTheDocument();
  });

  it('shows the no-match message when filters exclude everyone', async () => {
    vi.mocked(saasService.listCompanies).mockResolvedValue(MOCK_COMPANIES);
    render(<CompanyRegistryView />);
    await screen.findByText('Acme Corp');

    await userEvent.type(
      screen.getByPlaceholderText(/search by company name or rut/i),
      'zzzzz-nobody',
    );
    expect(
      await screen.findByText(
        'No corporate entities match your global search criteria',
      ),
    ).toBeInTheDocument();
  });
});
