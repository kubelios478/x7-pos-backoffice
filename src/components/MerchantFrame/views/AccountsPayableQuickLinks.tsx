import React from 'react';

export type AccountsPayableAnchorKey =
  | 'invoices'
  | 'items'
  | 'credit-notes'
  | 'payments';

interface AccountsPayableQuickLinksProps {
  active: AccountsPayableAnchorKey;
  onNavigate?: (view: string) => void;
}

// Cada anchor mapea a un featureId de Features.txt que MerchantFrame resuelve vía onNavigate.
// La "ruta" descrita en las historias es conceptual: la navegación SPA es por estado (activeTab).
const AP_ANCHORS: Array<{
  key: AccountsPayableAnchorKey;
  label: string;
  icon: string;
  featureId: string;
}> = [
  { key: 'invoices', label: 'SUPPLIER INVOICES', icon: 'receipt', featureId: 'supplier-invoices' },
  { key: 'items', label: 'INVOICE LINE ITEMS', icon: 'list_alt', featureId: 'supplier-invoice-items' },
  { key: 'credit-notes', label: 'CREDIT NOTES', icon: 'assignment_return', featureId: 'supplier-credit-notes' },
  { key: 'payments', label: 'PAYMENTS & DISBURSEMENTS', icon: 'payments', featureId: 'supplier-payments' },
];

export const AccountsPayableQuickLinks: React.FC<AccountsPayableQuickLinksProps> = ({
  active,
  onNavigate,
}) => {
  return (
    <nav
      aria-label="Accounts payable shortcuts"
      className="bg-white border border-[#e8e2d8] rounded shadow-sm px-6 py-4 flex flex-wrap items-center gap-6 font-sans"
    >
      {AP_ANCHORS.map((anchor) => {
        const isActive = anchor.key === active;
        if (isActive) {
          return (
            <span
              key={anchor.key}
              aria-current="page"
              className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#ae001a] underline underline-offset-4"
            >
              <span className="material-symbols-outlined text-base">{anchor.icon}</span>
              {anchor.label}
            </span>
          );
        }
        return (
          <button
            key={anchor.key}
            type="button"
            onClick={() => onNavigate?.(anchor.featureId)}
            className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200"
          >
            <span className="material-symbols-outlined text-base">{anchor.icon}</span>
            {anchor.label}
          </button>
        );
      })}
    </nav>
  );
};

export default AccountsPayableQuickLinks;
