import type { CompanyRegistryItem } from '../types/company-registry';

export const ALL_COUNTRIES = 'All Countries';

export function getBranchCount(company: CompanyRegistryItem): number {
  if (typeof company.merchantsCount === 'number') return company.merchantsCount;
  return company.merchants?.length ?? 0;
}

export function getCustomerCount(company: CompanyRegistryItem): number {
  if (typeof company.customersCount === 'number') return company.customersCount;
  return company.customers?.length ?? 0;
}

export function formatFootprint(company: CompanyRegistryItem): string {
  return [company.city, company.state, company.country]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(', ');
}

export function buildCountryOptions(
  companies: CompanyRegistryItem[],
): string[] {
  const countries = new Set<string>();
  companies.forEach((company) => {
    const country = company.country?.trim();
    if (country) countries.add(country);
  });
  return [
    ALL_COUNTRIES,
    ...Array.from(countries).sort((a, b) => a.localeCompare(b)),
  ];
}

export function companyMatchesSearch(
  company: CompanyRegistryItem,
  searchQuery: string,
): boolean {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const haystack = `${company.name ?? ''} ${company.rut ?? ''}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function companyMatchesCountry(
  company: CompanyRegistryItem,
  countryFilter: string,
): boolean {
  if (countryFilter === ALL_COUNTRIES) return true;
  return (company.country?.trim() ?? '') === countryFilter;
}

export function filterCompanies(
  companies: CompanyRegistryItem[],
  searchQuery: string,
  countryFilter: string,
): CompanyRegistryItem[] {
  return companies.filter(
    (company) =>
      companyMatchesSearch(company, searchQuery) &&
      companyMatchesCountry(company, countryFilter),
  );
}

export function isCompanyActive(company: CompanyRegistryItem): boolean {
  return (company.status ?? 'active') === 'active';
}

export function getCompanyStatusBadgeClass(status: string): string {
  return status === 'active'
    ? 'bg-green-500/10 text-green-600'
    : 'bg-[#5f5e5e]/20 text-[#5f5e5e]';
}

export function getCompanyStatusLabel(status: string): string {
  if (!status) return 'Active';
  return status.charAt(0).toUpperCase() + status.slice(1);
}
