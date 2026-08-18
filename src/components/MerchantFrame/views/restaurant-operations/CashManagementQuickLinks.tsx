import React from 'react';
import { QuickLaunchPanel, type QuickLaunchAction } from '../../shared/QuickLaunchPanel';

export type CashManagementModule =
  | 'cash-drawers'
  | 'cash-shifts'
  | 'cash-transactions'
  | 'cash-drawer-history'
  | 'cash-movements';

interface CashManagementQuickLinksProps {
  activeModule: CashManagementModule;
  onNavigate?: (view: string) => void;
}

const CASH_MANAGEMENT_ANCHORS: Array<{ key: CashManagementModule; label: string }> = [
  { key: 'cash-drawers', label: 'CASH DRAWERS' },
  { key: 'cash-shifts', label: 'CASH SHIFTS' },
  { key: 'cash-transactions', label: 'CASH TRANSACTIONS' },
  { key: 'cash-drawer-history', label: 'DRAWER HISTORY' },
  { key: 'cash-movements', label: 'DRAWER MOVEMENTS' },
];

export const CashManagementQuickLinks: React.FC<CashManagementQuickLinksProps> = ({
  activeModule,
  onNavigate,
}) => {
  const actions: QuickLaunchAction[] = CASH_MANAGEMENT_ANCHORS.map((anchor) => ({
    id: anchor.key,
    label: anchor.label,
    active: anchor.key === activeModule,
    onClick: () => onNavigate?.(anchor.key),
  }));

  return (
    <nav aria-label="Related cash management shortcuts">
      <QuickLaunchPanel
        title="Cash Management Shortcuts"
        description="Pivot across Cash Drawers, Shifts, Transactions, History, and Movements without leaving the cash management workspace context."
        actions={actions}
      />
    </nav>
  );
};

export default CashManagementQuickLinks;
