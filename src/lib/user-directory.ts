import { Scope, UserRole, type MerchantUser } from '../types/user';

export const ALL_ROLES = 'All Roles';
export const ALL_SCOPES = 'All Scopes';

export const USER_ROLE_OPTIONS: string[] = Object.values(UserRole);
export const SCOPE_OPTIONS: string[] = Object.values(Scope);

/** Turns an enum value like `merchant_admin` into `Merchant Admin`. */
export function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function userMatchesSearch(
  user: MerchantUser,
  searchQuery: string,
): boolean {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const haystack = `${user.username ?? ''} ${user.email ?? ''}`.toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

export function filterUsers(
  users: MerchantUser[],
  searchQuery: string,
  roleFilter: string,
  scopeFilter: string,
): MerchantUser[] {
  return users.filter(
    (user) =>
      userMatchesSearch(user, searchQuery) &&
      (roleFilter === ALL_ROLES || user.role === roleFilter) &&
      (scopeFilter === ALL_SCOPES || user.scope === scopeFilter),
  );
}

export function getUserStatusBadgeClass(isActive: boolean): string {
  return isActive
    ? 'bg-green-500/10 text-green-600'
    : 'bg-[#5f5e5e]/20 text-[#5f5e5e]';
}

export function getUserStatusLabel(isActive: boolean): string {
  return isActive ? 'Active' : 'Inactive';
}

export interface AccessMatrixEntry {
  key: string;
  label: string;
  description: string;
}

/** Reference sheet describing what each role can do (Roles & Access Matrix). */
export const ROLE_MATRIX: AccessMatrixEntry[] = [
  {
    key: UserRole.PORTAL_ADMIN,
    label: 'Portal Admin',
    description:
      'Platform super administrator. Full control over the SaaS backoffice, companies, and every tenant.',
  },
  {
    key: UserRole.PORTAL_USER,
    label: 'Portal User',
    description: 'Platform operator with read/monitor access to SaaS-level tooling.',
  },
  {
    key: UserRole.MERCHANT_ADMIN,
    label: 'Merchant Admin',
    description:
      'Manages a single merchant: users, roles, configurations, and branch operations.',
  },
  {
    key: UserRole.MERCHANT_USER,
    label: 'Merchant User',
    description: 'Day-to-day staff operator scoped to a merchant. No user administration.',
  },
  {
    key: UserRole.CUSTOMER_ADMIN,
    label: 'Customer Admin',
    description: 'Administrator for a B2B customer account and its members.',
  },
  {
    key: UserRole.CUSTOMER_USER,
    label: 'Customer User',
    description: 'End customer account with self-service access only.',
  },
];

/** Reference sheet describing what each scope grants (Roles & Access Matrix). */
export const SCOPE_MATRIX: AccessMatrixEntry[] = [
  {
    key: Scope.ADMIN_PORTAL,
    label: 'Admin Portal',
    description: 'Access to the SaaS admin portal (platform backoffice).',
  },
  {
    key: Scope.MERCHANT_WEB,
    label: 'Merchant Web',
    description: 'Access to the merchant web backoffice.',
  },
  {
    key: Scope.MERCHANT_ANDROID,
    label: 'Merchant Android',
    description: 'Access from the merchant Android POS application.',
  },
  {
    key: Scope.MERCHANT_IOS,
    label: 'Merchant iOS',
    description: 'Access from the merchant iOS POS application.',
  },
  {
    key: Scope.MERCHANT_CLOVER,
    label: 'Merchant Clover',
    description: 'Access from Clover POS terminals.',
  },
  {
    key: Scope.CLOVER_SDK,
    label: 'Clover SDK',
    description: 'Programmatic access through the Clover SDK integration.',
  },
  {
    key: Scope.PUBLIC_CHECKOUT,
    label: 'Public Checkout',
    description: 'Public/unauthenticated online checkout surface.',
  },
  {
    key: Scope.EXTERNAL_API,
    label: 'External API',
    description: 'Server-to-server access via the external API.',
  },
];
