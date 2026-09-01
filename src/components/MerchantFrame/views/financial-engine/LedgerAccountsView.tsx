import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  AccountType,
  CreateLedgerAccountDto,
  LedgerAccount,
  UpdateLedgerAccountDto,
} from '../../../../types/accounting';
import {
  TYPE_BADGE_CLASSES,
  resolveParentLabel,
  buildTree,
  getDescendantIds,
  LedgerAccountTree,
} from './LedgerAccountTree';
import { StatusToggleButton, ConfirmStatusToggleDialog } from '../../../shared/StatusToggle';
import { LedgerQuickLinks } from './LedgerQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const MOCK_SEED_ACCOUNTS: LedgerAccount[] = [
  { id: 1, code: '1000', name: 'Assets', type: 'ASSET', is_active: true, parent_account_id: null },
  { id: 2, code: '1100', name: 'Raw Material Inventory', type: 'ASSET', is_active: true, parent_account_id: 1 },
  { id: 3, code: '1200', name: 'Finished Goods Inventory', type: 'ASSET', is_active: true, parent_account_id: 1 },
  { id: 4, code: '1300', name: 'Cash & Bank Accounts', type: 'ASSET', is_active: true, parent_account_id: 1 },
  { id: 5, code: '2000', name: 'Liabilities', type: 'LIABILITY', is_active: true, parent_account_id: null },
  { id: 6, code: '2100', name: 'Accounts Payable', type: 'LIABILITY', is_active: true, parent_account_id: 5 },
  { id: 7, code: '2200', name: 'Tax Payable', type: 'LIABILITY', is_active: true, parent_account_id: 5 },
  { id: 8, code: '3000', name: 'Equity', type: 'EQUITY', is_active: true, parent_account_id: null },
  { id: 9, code: '3100', name: 'Owner Capital', type: 'EQUITY', is_active: true, parent_account_id: 8 },
  { id: 10, code: '4000', name: 'Revenue', type: 'REVENUE', is_active: true, parent_account_id: null },
  { id: 11, code: '4100', name: 'POS Food & Beverage Sales', type: 'REVENUE', is_active: true, parent_account_id: 10 },
  { id: 12, code: '5000', name: 'Expenses', type: 'EXPENSE', is_active: true, parent_account_id: null },
  { id: 13, code: '5100', name: 'Cost of Goods Sold', type: 'EXPENSE', is_active: true, parent_account_id: 12 },
  { id: 14, code: '5200', name: 'Waste & Shrinkage Expense', type: 'EXPENSE', is_active: true, parent_account_id: 12 },
  { id: 15, code: '5300', name: 'Inventory Adjustment Variance', type: 'EXPENSE', is_active: true, parent_account_id: 12 },
];

interface LedgerAccountFormDrawerProps {
  mode: 'create' | 'edit';
  initialAccount?: LedgerAccount;
  accounts: LedgerAccount[];
  excludedParentIds: Set<number>;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (dto: CreateLedgerAccountDto | UpdateLedgerAccountDto) => void;
}

const LedgerAccountFormDrawer: React.FC<LedgerAccountFormDrawerProps> = ({
  mode,
  initialAccount,
  accounts,
  excludedParentIds,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [code, setCode] = useState(initialAccount?.code ?? '');
  const [name, setName] = useState(initialAccount?.name ?? '');
  const [type, setType] = useState<AccountType>(initialAccount?.type ?? 'ASSET');
  const [parentAccountId, setParentAccountId] = useState(
    initialAccount?.parent_account_id != null ? String(initialAccount.parent_account_id) : '',
  );
  const [codeTouched, setCodeTouched] = useState(false);
  const [parentListOpen, setParentListOpen] = useState(false);
  const [parentQuery, setParentQuery] = useState(() => {
    if (initialAccount?.parent_account_id == null) return '';
    const p = accounts.find((a) => a.id === initialAccount.parent_account_id);
    return p ? `${p.code} — ${p.name}` : '';
  });

  const trimmedCode = code.trim();
  const isDuplicateCode = accounts.some(
    (a) => a.code === trimmedCode && (mode === 'create' || a.id !== initialAccount?.id),
  );
  const codeValid = trimmedCode.length > 0 && code.length <= 50 && !isDuplicateCode;
  const nameValid = name.trim().length > 0 && name.length <= 150;
  const isValid = codeValid && nameValid;

  const selectableParents = accounts.filter(
    (a) => !excludedParentIds.has(a.id) && (mode === 'create' || a.id !== initialAccount?.id),
  );

  const filteredParentOptions = selectableParents.filter((a) => {
    const term = parentQuery.trim().toLowerCase();
    if (!term) return true;
    return a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term);
  });

  const isTypeLocked = parentAccountId !== '';

  const parentBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearParentBlurTimeout = () => {
    if (parentBlurTimeoutRef.current != null) {
      clearTimeout(parentBlurTimeoutRef.current);
      parentBlurTimeoutRef.current = null;
    }
  };

  const selectParent = (account: LedgerAccount | null) => {
    clearParentBlurTimeout();
    if (account == null) {
      setParentAccountId('');
      setParentQuery('');
    } else {
      setParentAccountId(String(account.id));
      setParentQuery(`${account.code} — ${account.name}`);
      setType(account.type);
    }
    setParentListOpen(false);
  };

  const buildDto = (): CreateLedgerAccountDto => ({
    code: code.trim(),
    name: name.trim(),
    type,
    parent_account_id: parentAccountId === '' ? null : Number(parentAccountId),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      setCodeTouched(true);
      return;
    }
    onSubmit(buildDto());
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end font-sans">
      <div
        data-testid="drawer-backdrop"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-label={mode === 'create' ? 'Add Account' : 'Edit Account'}
        className="relative bg-white border-l border-[#e8e2d8] shadow-2xl w-full max-w-md h-full overflow-hidden animate-slide-in text-left flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">
            {mode === 'create' ? 'Add Account' : 'Edit Account'}
          </span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ledger-account-code" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Account Code
              </label>
              <input
                id="ledger-account-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onBlur={() => setCodeTouched(true)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
              />
              {codeTouched && isDuplicateCode && (
                <p className="text-xs text-red-600 font-medium">
                  Account code '{trimmedCode}' already exists for this company.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ledger-account-name" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Account Name
              </label>
              <input
                id="ledger-account-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ledger-account-type" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Account Type
              </label>
              <select
                id="ledger-account-type"
                value={type}
                disabled={isTypeLocked}
                onChange={(e) => setType(e.target.value as AccountType)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="ASSET">Asset</option>
                <option value="LIABILITY">Liability</option>
                <option value="EQUITY">Equity</option>
                <option value="REVENUE">Revenue</option>
                <option value="EXPENSE">Expense</option>
              </select>
              {isTypeLocked && (
                <p className="text-[11px] text-[#5f5e5e]">
                  Locked to parent's type ({type})
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 relative">
              <label htmlFor="ledger-account-parent" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Parent Account
              </label>
              <input
                id="ledger-account-parent"
                type="text"
                role="combobox"
                aria-expanded={parentListOpen}
                autoComplete="off"
                value={parentQuery}
                onFocus={() => {
                  clearParentBlurTimeout();
                  setParentListOpen(true);
                }}
                onChange={(e) => {
                  setParentQuery(e.target.value);
                  setParentListOpen(true);
                }}
                onBlur={() => {
                  parentBlurTimeoutRef.current = setTimeout(() => setParentListOpen(false), 100);
                }}
                placeholder="Search by code or name..."
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
              />
              {parentListOpen && (
                <ul
                  role="listbox"
                  aria-label="Parent account options"
                  className="absolute top-full mt-1 left-0 right-0 bg-white border border-[#e8e2d8] rounded shadow-lg max-h-48 overflow-y-auto z-10"
                >
                  <li
                    role="option"
                    aria-selected={parentAccountId === ''}
                    onMouseDown={() => selectParent(null)}
                    className="px-3 py-2 text-sm hover:bg-[#f8f3eb] cursor-pointer"
                  >
                    None (Root Account)
                  </li>
                  {filteredParentOptions.map((a) => (
                    <li
                      key={a.id}
                      role="option"
                      aria-selected={parentAccountId === String(a.id)}
                      onMouseDown={() => selectParent(a)}
                      className="px-3 py-2 text-sm hover:bg-[#f8f3eb] cursor-pointer"
                    >
                      {a.code} — {a.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="p-4 border-t border-[#e8e2d8] flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
            >
              Save Account
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

interface LedgerAccountDetailDrawerProps {
  account: LedgerAccount;
  accountsById: Map<number, LedgerAccount>;
  childrenCount: number;
  onClose: () => void;
}

const LedgerAccountDetailDrawer: React.FC<LedgerAccountDetailDrawerProps> = ({
  account,
  accountsById,
  childrenCount,
  onClose,
}) => {
  const parent = resolveParentLabel(account, accountsById);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end font-sans">
      <div
        data-testid="drawer-backdrop"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Ledger Account Details"
        className="relative bg-white border-l border-[#e8e2d8] shadow-2xl w-full max-w-md h-full overflow-hidden animate-slide-in text-left flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Ledger Account Details</span>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Code</p>
            <p className="font-bold text-[#1d1c17]">{account.code}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Name</p>
            <p>{account.name}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Type</p>
              <p>{account.type}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Status</p>
              <p>{account.is_active ? 'Active' : 'Inactive'}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Parent Account</p>
            <p className={parent.kind === 'missing' ? 'text-red-600' : ''}>{parent.label}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Child Accounts</p>
            <p>{childrenCount}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface LedgerAccountsViewProps {
  onNavigate?: (view: string) => void;
}

export const LedgerAccountsView: React.FC<LedgerAccountsViewProps> = ({ onNavigate }) => {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | AccountType>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');
  const [viewMode, setViewMode] = useState<'table' | 'tree'>('table');
  const [formModalOpen, setFormModalOpen] = useState<
    null | { mode: 'create' | 'edit'; account?: LedgerAccount }
  >(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [detailAccount, setDetailAccount] = useState<LedgerAccount | null>(null);
  const [togglingAccount, setTogglingAccount] = useState<LedgerAccount | null>(null);
  const [toggleSubmitting, setToggleSubmitting] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchLedgerAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/ledger-accounts?limit=100`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        setAccounts(MOCK_SEED_ACCOUNTS);
        return;
      }

      const json = await res.json();
      const loaded = json.data ?? [];
      setAccounts(loaded.length > 0 ? loaded : MOCK_SEED_ACCOUNTS);
    } catch (err) {
      console.error('Error fetching ledger accounts, loading seed accounts:', err);
      setAccounts(MOCK_SEED_ACCOUNTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedgerAccounts();
  }, []);

  const handleCreateSubmit = async (dto: CreateLedgerAccountDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/ledger-accounts`, {
        method: 'POST',
        headers,
        body: JSON.stringify(dto),
      });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to create ledger account');
      }

      setAccounts((prev) => [...prev, json.data]);
      setFormModalOpen(null);
      setToast({ message: 'Ledger account created successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(null);
      setToast({ message: err.message || 'Failed to create ledger account', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (accountId: number, dto: UpdateLedgerAccountDto) => {
    setFormSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/ledger-accounts/${accountId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(dto),
      });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to update ledger account');
      }

      setAccounts((prev) => prev.map((a) => (a.id === json.data.id ? json.data : a)));
      setFormModalOpen(null);
      setToast({ message: 'Ledger account updated successfully', type: 'success' });
    } catch (err: any) {
      setFormModalOpen(null);
      setToast({ message: err.message || 'Failed to update ledger account', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleConfirm = async () => {
    if (!togglingAccount) return;
    const isDeactivating = togglingAccount.is_active;
    setToggleSubmitting(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/ledger-accounts/${togglingAccount.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_active: !isDeactivating }),
      });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to update ledger account status');
      }

      setAccounts((prev) => prev.map((a) => (a.id === json.data.id ? json.data : a)));
      setTogglingAccount(null);
      setToast({
        message: isDeactivating
          ? 'Ledger account deactivated successfully'
          : 'Ledger account reactivated successfully',
        type: 'success',
      });
    } catch (err: any) {
      setTogglingAccount(null);
      setToast({ message: err.message || 'Failed to update ledger account status', type: 'error' });
    } finally {
      setToggleSubmitting(false);
    }
  };

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const matchesFilters = (account: LedgerAccount): boolean => {
    const term = searchQuery.trim().toLowerCase();
    if (
      term &&
      !account.code.toLowerCase().includes(term) &&
      !account.name.toLowerCase().includes(term)
    ) {
      return false;
    }
    if (typeFilter && account.type !== typeFilter) return false;
    if (statusFilter === 'active' && !account.is_active) return false;
    if (statusFilter === 'inactive' && account.is_active) return false;
    return true;
  };

  const filteredAccounts = useMemo(
    () => accounts.filter(matchesFilters).sort((a, b) => a.code.localeCompare(b.code)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, searchQuery, typeFilter, statusFilter],
  );

  const hasActiveFilter = Boolean(searchQuery || typeFilter || statusFilter);

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('');
    setStatusFilter('');
  };

  const isTrueEmpty = !loading && !error && accounts.length === 0;
  const isFilteredEmpty = !loading && !error && accounts.length > 0 && filteredAccounts.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchLedgerAccounts}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        {/* Fila 1: Búsqueda al 100% de ancho */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by account code or name..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search ledger accounts"
          />
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as '' | AccountType)}
              className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              aria-label="Filter by account type"
            >
              <option value="">All Types</option>
              <option value="ASSET">Asset</option>
              <option value="LIABILITY">Liability</option>
              <option value="EQUITY">Equity</option>
              <option value="REVENUE">Revenue</option>
              <option value="EXPENSE">Expense</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | 'active' | 'inactive')}
              className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="active">Active Accounts</option>
              <option value="inactive">Inactive Accounts</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!isTrueEmpty && (
              <button
                type="button"
                onClick={() => setFormModalOpen({ mode: 'create' })}
                className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-base">add</span>
                Add Account
              </button>
            )}
            <button
              type="button"
              onClick={fetchLedgerAccounts}
              className="p-2.5 bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1] text-secondary hover:text-[#ae001a] transition-all flex items-center justify-center cursor-pointer"
              title="Reload table data"
              aria-label="Reload table data"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>
            {hasActiveFilter && !isFilteredEmpty && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {isTrueEmpty && (
        <div
          data-testid="ledger-accounts-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">account_tree</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No ledger accounts defined for this company profile. Click &apos;Add Account&apos; to set
            up your Chart of Accounts.
          </p>
          <button
            type="button"
            onClick={() => setFormModalOpen({ mode: 'create' })}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add Account
          </button>
        </div>
      )}

      {(loading || accounts.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold text-white uppercase tracking-widest">
                CHART OF ACCOUNTS
              </span>
              <span className="text-white/50 text-xs">
                {loading ? 'Loading...' : `${filteredAccounts.length} accounts`}
              </span>
            </div>
            <div className="flex border border-white/20 rounded overflow-hidden" role="group" aria-label="View mode">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                aria-pressed={viewMode === 'table'}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'table' ? 'bg-white text-[#1d1c17]' : 'bg-[#333333] text-white/70 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">table_chart</span>
                FLAT DATA TABLE
              </button>
              <button
                type="button"
                onClick={() => setViewMode('tree')}
                aria-pressed={viewMode === 'tree'}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'tree' ? 'bg-white text-[#1d1c17]' : 'bg-[#333333] text-white/70 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">account_tree</span>
                HIERARCHICAL TREE
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Name
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Parent Account
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-16" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 mx-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                        <p className="text-sm text-[#5f5e5e]">No ledger accounts match your active filters</p>
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="text-[#ae001a] text-sm font-semibold hover:underline"
                        >
                          Clear filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : viewMode === 'tree' ? (
                  <LedgerAccountTree
                    accounts={accounts}
                    matches={matchesFilters}
                    onEdit={(a) => setFormModalOpen({ mode: 'edit', account: a })}
                    onViewDetails={(a) => setDetailAccount(a)}
                    onToggleStatus={(a) => setTogglingAccount(a)}
                  />
                ) : (
                  filteredAccounts.map((account) => {
                    const parent = resolveParentLabel(account, accountsById);
                    return (
                      <tr
                        key={account.id}
                        data-testid={`ledger-account-row-${account.id}`}
                        onClick={() => setDetailAccount(account)}
                        className={`hover:bg-[#f8f3eb] transition-colors cursor-pointer ${!account.is_active ? 'opacity-75' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <span className="font-bold text-[#1d1c17]">{account.code}</span>
                        </td>
                        <td className="px-6 py-4 text-[#1d1c17]">{account.name}</td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${TYPE_BADGE_CLASSES[account.type]}`}
                          >
                            {account.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={parent.kind === 'missing' ? 'text-red-600 text-sm' : 'text-sm text-[#5f5e5e]'}>
                            {parent.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {account.is_active ? (
                            <span className="bg-green-500/10 text-green-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              Active
                            </span>
                          ) : (
                            <span className="bg-[#5f5e5e]/20 text-[#5f5e5e] text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFormModalOpen({ mode: 'edit', account });
                              }}
                              aria-label={`Edit ${account.code}`}
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                            >
                              <span className="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                            <span onClick={(e) => e.stopPropagation()}>
                              <StatusToggleButton
                                status={account.is_active ? 'active' : 'inactive'}
                                entityLabel={account.name}
                                onClick={() => setTogglingAccount(account)}
                              />
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <LedgerQuickLinks onNavigate={onNavigate} />

      <button
        type="button"
        onClick={() => setFormModalOpen({ mode: 'create' })}
        aria-label="Quick create ledger account"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {formModalOpen && (
        <LedgerAccountFormDrawer
          mode={formModalOpen.mode}
          initialAccount={formModalOpen.account}
          accounts={accounts}
          excludedParentIds={
            formModalOpen.mode === 'edit' && formModalOpen.account
              ? getDescendantIds(buildTree(accounts), formModalOpen.account.id)
              : new Set()
          }
          submitting={formSubmitting}
          onCancel={() => setFormModalOpen(null)}
          onSubmit={(dto) =>
            formModalOpen.mode === 'create'
              ? handleCreateSubmit(dto as CreateLedgerAccountDto)
              : handleEditSubmit(formModalOpen.account!.id, dto as UpdateLedgerAccountDto)
          }
        />
      )}

      {detailAccount && (
        <LedgerAccountDetailDrawer
          account={detailAccount}
          accountsById={accountsById}
          childrenCount={accounts.filter((a) => a.parent_account_id === detailAccount.id).length}
          onClose={() => setDetailAccount(null)}
        />
      )}

      {togglingAccount && (
        <ConfirmStatusToggleDialog
          entityName={togglingAccount.name}
          direction={togglingAccount.is_active ? 'deactivate' : 'activate'}
          submitting={toggleSubmitting}
          onClose={() => setTogglingAccount(null)}
          onConfirm={handleToggleConfirm}
        />
      )}

      {toast && (
        <div
          className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-3.5 shadow-lg text-white text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          <span className="material-symbols-outlined text-lg">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toast.message}
          <button type="button" onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100 transition-opacity">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default LedgerAccountsView;
