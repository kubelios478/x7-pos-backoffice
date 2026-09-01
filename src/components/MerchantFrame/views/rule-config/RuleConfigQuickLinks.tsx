import React from 'react';
import { QuickLaunchPanel, type QuickLaunchAction } from '../../shared/QuickLaunchPanel';

interface RuleConfigQuickLinksProps {
  activeRule: 'tax' | 'payroll' | 'overtime' | 'tips';
  onNavigate?: (view: string) => void;
}

const RULE_CONFIG_ANCHORS: Array<{
  key: 'tax' | 'payroll' | 'overtime' | 'tips';
  label: string;
  featureId: string;
  icon: string;
}> = [
  { key: 'tax', label: 'TAX RULES', featureId: 'merchant-tax-rules', icon: 'percent' },
  { key: 'payroll', label: 'PAYROLL RULES', featureId: 'merchant-payroll-rules', icon: 'payments' },
  { key: 'overtime', label: 'OVERTIME RULES', featureId: 'merchant-overtime-rules', icon: 'more_time' },
  { key: 'tips', label: 'TIPS MANAGEMENT', featureId: 'merchant-tips-rules', icon: 'volunteer_activism' },
];

export const RuleConfigQuickLinks: React.FC<RuleConfigQuickLinksProps> = ({ activeRule, onNavigate }) => {
  const actions: QuickLaunchAction[] = RULE_CONFIG_ANCHORS.map((anchor) => ({
    id: anchor.key,
    label: anchor.label,
    icon: anchor.icon,
    active: anchor.key === activeRule,
    onClick: () => onNavigate?.(anchor.featureId),
  }));

  return (
    <nav aria-label="Related configuration shortcuts">
      <QuickLaunchPanel
        title="Rule Configuration Shortcuts"
        description="Pivot across Tax, Payroll, Overtime, and Tips rule modules without leaving merchant configuration context."
        actions={actions}
      />
    </nav>
  );
};

export default RuleConfigQuickLinks;
