export type CompanyRegistryStatus = 'active' | 'inactive' | 'suspended';

export interface CompanyRegistryItem {
  id: number;
  name: string;
  rut?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  status: CompanyRegistryStatus | string;
  // Computed counts returned by the backend list endpoint.
  merchantsCount?: number;
  customersCount?: number;
  // Fallback relations if a caller returns full arrays instead of counts.
  merchants?: unknown[];
  customers?: unknown[];
}

export type CompanyRegistryPayload = {
  name: string;
  rut: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
};
