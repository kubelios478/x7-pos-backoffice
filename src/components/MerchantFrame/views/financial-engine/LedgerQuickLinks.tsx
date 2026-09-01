import React from 'react';
import { QuickLaunchPanel, type QuickLaunchAction } from '../../shared/QuickLaunchPanel';

interface LedgerQuickLinksProps {
  current?: string;
  onNavigate?: (view: string) => void;
}

interface LedgerQuickLinkAnchor {
  key: string;
  label: string;
  target: string;
  icon: string;
}

const LEDGER_QUICK_LINKS: LedgerQuickLinkAnchor[] = [
  { key: 'chart-of-accounts', label: 'CHART OF ACCOUNTS', target: 'ledger-accounts', icon: 'account_tree' },
  { key: 'journal-entries', label: 'JOURNAL ENTRIES', target: 'journal-entries', icon: 'menu_book' },
  { key: 'journal-line-items', label: 'JOURNAL LINE ITEMS', target: 'journal-entries-lines', icon: 'format_list_bulleted' },
  { key: 'tax-rules', label: 'TAX RULES CONFIGURATION', target: 'merchant-tax-rules', icon: 'percent' },
];

export const LedgerQuickLinks: React.FC<LedgerQuickLinksProps> = ({
  current = 'ledger-accounts',
  onNavigate,
}) => {
  const actions: QuickLaunchAction[] = LEDGER_QUICK_LINKS.map((anchor) => ({
    id: anchor.key,
    label: anchor.label,
    icon: anchor.icon,
    active: anchor.target === current,
    onClick: () => onNavigate?.(anchor.target),
  }));

  return (
    <nav aria-label="Related accounting shortcuts">
      <QuickLaunchPanel
        title="Accounting Workspace Shortcuts"
        description="Pivot across the Chart of Accounts, Journal Entries, and posting line items without leaving the financial engine context."
        actions={actions}
      />
    </nav>
  );
};

export default LedgerQuickLinks;
