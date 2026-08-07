import React from 'react';
import { QuickLaunchPanel } from '../shared/QuickLaunchPanel';

export type AccountsPayableAnchorKey =
  | 'invoices'
  | 'items'
  | 'credit-notes'
  | 'payments'
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
  { key: 'allocations', label: 'PAYMENT ALLOCATIONS', featureId: 'supplier-payments-allocation' },
];

// Reutiliza el panel común de quick-launch (mismo componente que Suppliers, Products y el SaaS).
// Muestra accesos directos a los OTROS workspaces de Accounts Payable (excluye el activo, que es
// donde ya estás — el contexto activo se ve en el breadcrumb superior).
export const AccountsPayableQuickLinks: React.FC<AccountsPayableQuickLinksProps> = ({
  active,
  onNavigate,
}) => (
  <QuickLaunchPanel
    title="Accounts Payable"
    description="Jump across the accounts payable workspaces — invoices, line items, credit notes, payments, and allocations."
    actions={AP_ANCHORS.filter((anchor) => anchor.key !== active).map((anchor) => ({
      id: anchor.featureId,
      label: anchor.label,
      onClick: () => onNavigate?.(anchor.featureId),
    }))}
  />
);

export default AccountsPayableQuickLinks;
