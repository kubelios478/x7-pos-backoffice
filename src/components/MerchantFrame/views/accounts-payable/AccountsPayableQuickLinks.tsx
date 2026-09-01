import React from 'react';
import { QuickLaunchPanel, type QuickLaunchAction } from '../../shared/QuickLaunchPanel';

export type AccountsPayableAnchorKey =
  | 'invoices'
  | 'items'
  | 'credit-notes'
  | 'payments'
  | 'payment-items'
  | 'allocations';

interface AccountsPayableQuickLinksProps {
  active: AccountsPayableAnchorKey;
  onNavigate?: (view: string) => void;
}

// Cada anchor mapea a un featureId de Features.txt que MerchantFrame resuelve vía onNavigate.
const AP_ANCHORS: Array<{
  key: AccountsPayableAnchorKey;
  label: string;
  featureId: string;
}> = [
  { key: 'invoices', label: 'SUPPLIER INVOICES', featureId: 'supplier-invoices' },
  { key: 'items', label: 'INVOICE LINE ITEMS', featureId: 'supplier-invoice-items' },
  { key: 'credit-notes', label: 'CREDIT NOTES', featureId: 'supplier-credit-notes' },
  { key: 'payments', label: 'PAYMENTS & DISBURSEMENTS', featureId: 'supplier-payments' },
  { key: 'payment-items', label: 'PAYMENT ITEMS', featureId: 'supplier-payment-items' },
  { key: 'allocations', label: 'PAYMENT ALLOCATIONS', featureId: 'supplier-payments-allocation' },
];

// Reutiliza el panel común de quick-launch (mismo componente que Suppliers, Products y el SaaS).
// Muestra los 6 workspaces de Accounts Payable; el activo se renderiza con tratamiento
// destacado (aria-current="page", no navegable) en vez de ocultarse, para que el usuario
// siempre vea dónde está dentro del módulo.
export const AccountsPayableQuickLinks: React.FC<AccountsPayableQuickLinksProps> = ({
  active,
  onNavigate,
}) => {
  const actions: QuickLaunchAction[] = AP_ANCHORS.map((anchor) => ({
    id: anchor.featureId,
    label: anchor.label,
    active: anchor.key === active,
    onClick: () => onNavigate?.(anchor.featureId),
  }));

  return (
    <nav aria-label="Accounts payable workspace shortcuts">
      <QuickLaunchPanel
        title="Accounts Payable"
        description="Jump across the accounts payable workspaces — invoices, line items, credit notes, payments, payment items, and allocations."
        actions={actions}
      />
    </nav>
  );
};

export default AccountsPayableQuickLinks;
