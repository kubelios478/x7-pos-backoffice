import { describe, expect, it } from 'vitest';
import {
  ALL_ROLES,
  ALL_SCOPES,
  filterUsers,
  formatEnumLabel,
  getUserStatusBadgeClass,
  getUserStatusLabel,
} from './user-directory';
import { Scope, UserRole, type MerchantUser } from '../types/user';

const USERS: MerchantUser[] = [
  {
    id: 1,
    username: 'jdoe',
    email: 'john@acme.com',
    role: UserRole.MERCHANT_ADMIN,
    scope: Scope.MERCHANT_WEB,
    isActive: true,
    merchantId: 5,
  },
  {
    id: 2,
    username: 'asmith',
    email: 'anna@acme.com',
    role: UserRole.MERCHANT_USER,
    scope: Scope.MERCHANT_ANDROID,
    isActive: false,
    merchantId: 5,
  },
  {
    id: 3,
    username: null,
    email: 'ops@acme.com',
    role: UserRole.MERCHANT_USER,
    scope: Scope.MERCHANT_WEB,
    isActive: true,
    merchantId: 5,
  },
];

describe('formatEnumLabel', () => {
  it('humanizes snake_case enum values', () => {
    expect(formatEnumLabel('merchant_admin')).toBe('Merchant Admin');
    expect(formatEnumLabel('admin_portal')).toBe('Admin Portal');
  });
});

describe('filterUsers', () => {
  it('returns all users with no filters', () => {
    expect(filterUsers(USERS, '', ALL_ROLES, ALL_SCOPES)).toHaveLength(3);
  });

  it('matches username or email (fuzzy, token-based)', () => {
    expect(filterUsers(USERS, 'jdoe', ALL_ROLES, ALL_SCOPES)).toHaveLength(1);
    expect(filterUsers(USERS, 'anna@acme', ALL_ROLES, ALL_SCOPES)).toHaveLength(
      1,
    );
    // shared email domain token matches everyone
    expect(filterUsers(USERS, 'acme', ALL_ROLES, ALL_SCOPES)).toHaveLength(3);
  });

  it('combines search + role + scope with AND logic', () => {
    const result = filterUsers(
      USERS,
      'acme',
      UserRole.MERCHANT_USER,
      Scope.MERCHANT_WEB,
    );
    expect(result.map((u) => u.id)).toEqual([3]);
  });

  it('yields zero matches when criteria cannot be satisfied together', () => {
    expect(
      filterUsers(USERS, 'jdoe', UserRole.MERCHANT_USER, ALL_SCOPES),
    ).toHaveLength(0);
  });
});

describe('status helpers', () => {
  it('maps active state to badge classes and labels', () => {
    expect(getUserStatusBadgeClass(true)).toContain('green');
    expect(getUserStatusBadgeClass(false)).toContain('5f5e5e');
    expect(getUserStatusLabel(true)).toBe('Active');
    expect(getUserStatusLabel(false)).toBe('Inactive');
  });
});
