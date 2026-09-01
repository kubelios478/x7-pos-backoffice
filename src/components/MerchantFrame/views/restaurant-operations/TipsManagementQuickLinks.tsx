import React from 'react';
import { QuickLaunchPanel, type QuickLaunchAction } from '../../shared/QuickLaunchPanel';

export type TipsManagementModuleKey =
  | 'tips-ledger'
  | 'tips-pools'
  | 'tips-pool-members'
  | 'tips-allocations'
  | 'tips-settlements'
  | 'tips-cash-movements'
  | '/tips/ledger'
  | '/tips/pools'
  | '/tips/pool-members'
  | '/tips/allocations'
  | '/tips/settlements'
  | '/tips/cash-movements'
  | string;

interface TipsManagementQuickLinksProps {
  activeModule?: TipsManagementModuleKey;
  onNavigate?: (viewOrRoute: string) => void;
}

export interface TipShortcutAnchor {
  key: string;
  route: string;
  label: string;
  icon: string;
}

export const TIP_SHORTCUT_ANCHORS: TipShortcutAnchor[] = [
  {
    key: 'tips-ledger',
    route: '/tips/ledger',
    label: 'TIPS LEDGER',
    icon: 'payments',
  },
  {
    key: 'tips-pools',
    route: '/tips/pools',
    label: 'TIP POOLS',
    icon: 'groups',
  },
  {
    key: 'tips-pool-members',
    route: '/tips/pool-members',
    label: 'POOL MEMBERS',
    icon: 'badge',
  },
  {
    key: 'tips-allocations',
    route: '/tips/allocations',
    label: 'TIP ALLOCATIONS',
    icon: 'pie_chart',
  },
  {
    key: 'tips-settlements',
    route: '/tips/settlements',
    label: 'TIP SETTLEMENTS',
    icon: 'account_balance_wallet',
  },
  {
    key: 'tips-cash-movements',
    route: '/tips/cash-movements',
    label: 'CASH TIP MOVEMENTS',
    icon: 'point_of_sale',
  },
];

export const TipsManagementQuickLinks: React.FC<TipsManagementQuickLinksProps> = ({
  activeModule = 'tips-ledger',
  onNavigate,
}) => {
  const actions: QuickLaunchAction[] = TIP_SHORTCUT_ANCHORS.map((anchor) => {
    const isActive =
      activeModule === anchor.key ||
      activeModule === anchor.route ||
      (activeModule === 'tips-ledger' && anchor.key === 'tips-ledger') ||
      ((activeModule === 'merchant-tips-rules' || activeModule === 'tips-rules') && anchor.key === 'tips-pools');

    return {
      id: anchor.key,
      label: anchor.label,
      icon: anchor.icon,
      active: isActive,
      onClick: () => {
        onNavigate?.(anchor.route);
      },
    };
  });

  return (
    <nav
      aria-label="Tips management contextual shortcuts"
      className="mt-8 border-t border-[#e8e2d8] pt-6"
    >
      <QuickLaunchPanel
        title="Tips & Gratuities Operations Shortcuts"
        description="Fluidly navigate across Tips Directory Ledger, Tip Pools, Member Layouts, Allocation Formulas, Settlement Engine, and Cash Movements."
        actions={actions}
      />
    </nav>
  );
};

export default TipsManagementQuickLinks;
