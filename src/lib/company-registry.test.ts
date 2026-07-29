import { describe, expect, it } from 'vitest';
import {
  ALL_COUNTRIES,
  buildCountryOptions,
  filterCompanies,
  formatFootprint,
  getBranchCount,
  getCompanyStatusBadgeClass,
  getCustomerCount,
  isCompanyActive,
} from './company-registry';
import type { CompanyRegistryItem } from '../types/company-registry';

const COMPANIES: CompanyRegistryItem[] = [
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
    merchants: [{}, {}],
    customers: [{}],
  },
];

describe('filterCompanies', () => {
  it('returns everything with no filters', () => {
    expect(filterCompanies(COMPANIES, '', ALL_COUNTRIES)).toHaveLength(2);
  });

  it('matches by name or RUT', () => {
    expect(filterCompanies(COMPANIES, 'acme', ALL_COUNTRIES)).toHaveLength(1);
    expect(filterCompanies(COMPANIES, '22.222', ALL_COUNTRIES)).toHaveLength(1);
  });

  it('combines search + country with AND logic', () => {
    expect(filterCompanies(COMPANIES, 'globex', 'Chile')).toHaveLength(1);
    expect(filterCompanies(COMPANIES, 'globex', 'USA')).toHaveLength(0);
  });
});

describe('buildCountryOptions', () => {
  it('lists distinct countries with the all-countries sentinel first', () => {
    expect(buildCountryOptions(COMPANIES)).toEqual([
      ALL_COUNTRIES,
      'Chile',
      'USA',
    ]);
  });
});

describe('metrics + footprint helpers', () => {
  it('prefers count fields, falls back to relation arrays', () => {
    expect(getBranchCount(COMPANIES[0])).toBe(3);
    expect(getCustomerCount(COMPANIES[0])).toBe(10);
    expect(getBranchCount(COMPANIES[1])).toBe(2);
    expect(getCustomerCount(COMPANIES[1])).toBe(1);
  });

  it('concatenates city, state and country', () => {
    expect(formatFootprint(COMPANIES[0])).toBe('Miami, Florida, USA');
  });
});

describe('status helpers', () => {
  it('detects active state and badge classes', () => {
    expect(isCompanyActive(COMPANIES[0])).toBe(true);
    expect(isCompanyActive(COMPANIES[1])).toBe(false);
    expect(getCompanyStatusBadgeClass('active')).toContain('green');
    expect(getCompanyStatusBadgeClass('inactive')).toContain('5f5e5e');
  });
});
