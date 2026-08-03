import type { DashboardNavigationTarget } from './merchant-directory-navigation';

/**
 * Quick Launch destinations for the User Management workspace. Reuses the
 * shared `navigateToDashboardFeature` helper from merchant-directory-navigation.
 */
export const USER_QUICK_LAUNCH_TARGETS: Record<
  'securityAuditLogs' | 'humanResources',
  DashboardNavigationTarget
> = {
  securityAuditLogs: {
    activeTab: 'security-audit-logs',
    activeCategory: 'core',
  },
  humanResources: {
    activeTab: 'collaborators',
    activeCategory: 'financehr',
  },
};
