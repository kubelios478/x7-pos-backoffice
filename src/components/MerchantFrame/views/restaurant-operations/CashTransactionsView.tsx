import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import { getCurrentMerchantId } from '../../../../api/users';
import type {
  CashTransaction,
  CashTransactionType,
  CashTransactionPaginationMeta,
  CashTransactionStatus,
} from '../../../../types/cash-transaction';
import { CashManagementQuickLinks } from './CashManagementQuickLinks';
import { STATUS_BADGE_CLASSES as CASH_SHIFT_STATUS_BADGE_CLASSES } from './CashShiftsView';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
const PAGE_SIZE = 10;

const BALANCE_INCREASING_TYPES: CashTransactionType[] = ['SALE', 'PAY_IN', 'opening', 'sale', 'tip', 'adjustment_up'];
const BALANCE_DECREASING_TYPES: CashTransactionType[] = ['REFUND', 'PAY_OUT', 'DRAWER_DROP', 'refund', 'withdrawal', 'adjustment_down'];

export function isBalanceIncreasingType(type: CashTransactionType): boolean {
  return BALANCE_INCREASING_TYPES.includes(type);
}

export function isBalanceDecreasingType(type: CashTransactionType): boolean {
  return BALANCE_DECREASING_TYPES.includes(type);
}

export function formatTypeLabel(type: CashTransactionType): string {
  return type.replace(/_/g, ' ').toUpperCase();
}

export function formatLoyaltySource(source: string): string {
  return source.replace(/_/g, ' ');
}

export function amountColorClass(type: CashTransactionType): string {
  if (isBalanceIncreasingType(type)) return 'text-green-600 font-bold';
  if (isBalanceDecreasingType(type)) return 'text-[#ae001a] font-bold';
  return 'text-[#5f5e5e]';
}

// The backend stores `amount` as a Postgres `decimal` column with no server-side
// coercion, so it arrives over the wire as a numeric string (e.g. "125.50").
// Normalize at the fetch boundary so every `CashTransaction` in state has a real number.
export function normalizeTransaction(raw: CashTransaction): CashTransaction {
  return { ...raw, amount: Number(raw.amount) };
}

export function formatCurrency(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDateTime(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const CASH_TRANSACTION_STATUS_BADGE_CLASSES: Record<CashTransactionStatus, string> = {
  ACTIVE: 'bg-green-500/10 text-green-600 border border-green-500/20',
  active: 'bg-green-500/10 text-green-600 border border-green-500/20',
  VOIDED: 'bg-red-500/10 text-[#ae001a] line-through border border-red-500/20',
  deleted: 'bg-[#5f5e5e]/20 text-[#5f5e5e] line-through',
  AUDITED: 'bg-slate-500/10 text-slate-700 font-semibold border border-slate-500/20',
  RECONCILED: 'bg-slate-500/10 text-slate-700 font-semibold border border-slate-500/20',
};

interface CashTransactionDetailDrawerProps {
  transaction: CashTransaction;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onNavigate?: (view: string) => void;
}

const CashTransactionDetailDrawer: React.FC<CashTransactionDetailDrawerProps> = ({
  transaction,
  loading,
  error,
  onClose,
  onNavigate,
}) => {
  const collaboratorName = transaction.collaborator
    ? (transaction.collaborator.firstName || transaction.collaborator.lastName)
      ? `${transaction.collaborator.firstName ?? ''} ${transaction.collaborator.lastName ?? ''}`.trim()
      : transaction.collaborator.name
    : '';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end font-sans">
      <div
        data-testid="cash-transaction-drawer-backdrop"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Cash Transaction Details"
        className="relative bg-white border-l border-[#e8e2d8] shadow-2xl w-full max-w-lg h-full overflow-hidden animate-slide-in text-left flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex flex-col gap-2 shrink-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[11px] uppercase tracking-widest">#TXN-{transaction.id} Details</span>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  CASH_TRANSACTION_STATUS_BADGE_CLASSES[transaction.status] ?? 'bg-white/10 text-white'
                }`}
              >
                {transaction.status}
              </span>
            </div>
            <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="flex justify-between items-center text-white/70 text-[11px]">
            <span className="font-mono">{transaction.createdAt}</span>
            <span className="font-mono">
              #EMP-{transaction.collaboratorId}{collaboratorName ? ` — ${collaboratorName}` : ''}
            </span>
          </div>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Transaction Reference</p>
            <p className="font-bold text-[#1d1c17]">#TXN-{transaction.id}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Cash Drawer</p>
              <p>#CD-{transaction.cashDrawerId}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Type &amp; Direction</p>
              <p className="flex items-center gap-1 font-bold">
                {isBalanceIncreasingType(transaction.type) ? (
                  <span className="text-green-600">+ Inflow ({formatTypeLabel(transaction.type)})</span>
                ) : isBalanceDecreasingType(transaction.type) ? (
                  <span className="text-[#ae001a]">- Outflow ({formatTypeLabel(transaction.type)})</span>
                ) : (
                  formatTypeLabel(transaction.type)
                )}
              </p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Cashier Shift</p>
            {loading ? (
              <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32 mt-1" data-testid="shift-section-loading" />
            ) : error ? (
              <p className="text-[#ae001a] text-xs mt-1" role="alert">Could not load shift details.</p>
            ) : transaction.cashShift ? (
              <p>
                #SHIFT-{transaction.cashShift.id}{' '}
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${CASH_SHIFT_STATUS_BADGE_CLASSES[transaction.cashShift.status]}`}>
                  {transaction.cashShift.status}
                </span>
              </p>
            ) : (
              <p>#SHIFT-{transaction.shiftId ?? 'N/A'}</p>
            )}
          </div>

          {/* Performing Collaborator — only shown once the detail fetch resolves with the full collaborator object */}
          {transaction.collaborator && (
            <div className="border border-[#e8e2d8] rounded p-3 bg-[#fef9f1]">
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase mb-2">Performing Collaborator</p>
              {loading ? (
                <div className="space-y-1">
                  <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" />
                  <div className="h-3 bg-[#ece8e0] rounded animate-pulse w-24" />
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full bg-[#222222] flex items-center justify-center text-white font-bold text-sm shrink-0"
                    title={collaboratorName || transaction.collaborator.name}
                    aria-label={`Collaborator: ${collaboratorName || transaction.collaborator.name}`}
                  >
                    {(transaction.collaborator.firstName?.[0] ?? transaction.collaborator.name?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-mono text-[#1d1c17] leading-tight">#EMP-{transaction.collaborator.id}</p>
                    {transaction.collaborator.role && (
                      <span className="mt-0.5 inline-block px-1.5 py-0.5 bg-[#222222]/10 rounded text-[10px] uppercase tracking-wide font-bold text-[#5f5e5e]">
                        {transaction.collaborator.role}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Amount</p>
            <p className={amountColorClass(transaction.type)}>{formatCurrency(transaction.amount)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Linked Order</p>
            {transaction.orderId != null ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigate?.('orders');
                }}
                className="mt-1 px-2.5 py-1 bg-[#ae001a]/10 hover:bg-[#ae001a]/20 text-[#ae001a] font-bold rounded-full text-xs transition-colors inline-flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">receipt</span>
                #ORD-{transaction.orderId}
              </button>
            ) : (
              <p className="text-[#5f5e5e]">N/A</p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Notes</p>
            <p>{transaction.notes || 'No additional notes provided for this transaction.'}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Loyalty Points Ledger</p>
            {loading ? (
              <div className="h-16 bg-[#ece8e0] rounded animate-pulse mt-2" data-testid="loyalty-section-loading" />
            ) : error ? (
              <p className="text-[#ae001a] text-xs mt-1">Could not load loyalty point activity.</p>
            ) : transaction.loyaltyPointTransactions && transaction.loyaltyPointTransactions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full mt-2 border-collapse" data-testid="loyalty-points-table">
                  <thead>
                    <tr className="border-b border-[#e8e2d8] text-left">
                      <th className="py-1 text-[11px] uppercase text-[#5f5e5e]">Date</th>
                      <th className="py-1 text-[11px] uppercase text-[#5f5e5e]">Source</th>
                      <th className="py-1 text-[11px] uppercase text-[#5f5e5e]">Description</th>
                      <th className="py-1 text-[11px] uppercase text-[#5f5e5e] text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transaction.loyaltyPointTransactions.map((lpt) => (
                      <tr key={lpt.id} className="border-b border-[#e8e2d8]/60">
                        <td className="py-1.5">{formatDateTime(lpt.createdAt)}</td>
                        <td className="py-1.5">{formatLoyaltySource(lpt.source)}</td>
                        <td className="py-1.5">{lpt.description || '—'}</td>
                        <td
                          className={`py-1.5 text-right font-bold ${
                            lpt.points > 0 ? 'text-green-600' : lpt.points < 0 ? 'text-[#ae001a]' : 'text-[#5f5e5e]'
                          }`}
                        >
                          {lpt.points > 0 ? `+${lpt.points}` : lpt.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-[#5f5e5e] mt-1">No loyalty point activity linked to this transaction.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Created (Audit Trail)</p>
              <p className="font-mono text-xs">{transaction.createdAt}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Updated (Audit Trail)</p>
              <p className="font-mono text-xs">{transaction.updatedAt}</p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface CashTransactionsViewProps {
  onNavigate?: (view: string) => void;
}

export const CashTransactionsView: React.FC<CashTransactionsViewProps> = ({ onNavigate }) => {
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [paginationMeta, setPaginationMeta] = useState<CashTransactionPaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailTransaction, setDetailTransaction] = useState<CashTransaction | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequestIdRef = React.useRef<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<'' | CashTransactionType>('');
  const [statusFilter, setStatusFilter] = useState<'' | CashTransactionStatus>('');
  const [drawerFilter, setDrawerFilter] = useState<'' | number>('');
  const [shiftFilter, setShiftFilter] = useState<'' | number>('');
  const [startDate, setStartDate] = useState<string>(() => getTodayDateString());
  const [endDate, setEndDate] = useState<string>(() => getTodayDateString());
  const [drawerOptions, setDrawerOptions] = useState<number[]>([]);
  const [shiftOptions, setShiftOptions] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTransactions = React.useMemo(() => {
    let result = transactions;

    // Filter by Date Range on created_at using local time boundaries
    if (startDate || endDate) {
      const fromTs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
      const toTs = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;
      result = result.filter((txn) => {
        if (!txn.createdAt) return true;
        const ts = new Date(txn.createdAt).getTime();
        if (fromTs !== null && !isNaN(fromTs) && ts < fromTs) return false;
        if (toTs !== null && !isNaN(toTs) && ts > toTs) return false;
        return true;
      });
    }

    // Filter by Type
    if (typeFilter) {
      result = result.filter((txn) => {
        const tUpper = txn.type.toUpperCase();
        const fUpper = typeFilter.toUpperCase();
        if (fUpper === 'SALE') return tUpper === 'SALE';
        if (fUpper === 'REFUND') return tUpper === 'REFUND';
        if (fUpper === 'PAY_IN') return tUpper === 'PAY_IN' || tUpper === 'OPENING' || tUpper === 'TIP' || tUpper === 'ADJUSTMENT_UP';
        if (fUpper === 'PAY_OUT') return tUpper === 'PAY_OUT' || tUpper === 'WITHDRAWAL' || tUpper === 'ADJUSTMENT_DOWN';
        if (fUpper === 'DRAWER_DROP') return tUpper === 'DRAWER_DROP' || tUpper === 'WITHDRAWAL';
        return tUpper === fUpper;
      });
    }

    // Filter by Status
    if (statusFilter) {
      result = result.filter((txn) => txn.status?.toUpperCase() === statusFilter.toUpperCase());
    }

    // Filter by Shift ID
    if (shiftFilter !== '') {
      result = result.filter((txn) => (txn.shiftId ?? txn.cashShift?.id) === shiftFilter);
    }

    const term = searchQuery.trim().toLowerCase();
    if (!term) return result;

    return result.filter((txn) => {
      const transactionRef = `#txn-${txn.id}`;
      const ctRef = `#ct-${txn.id}`;
      const txnIdStr = String(txn.id);
      const drawerId = `#cd-${txn.cashDrawerId}`;
      const collaboratorId = `#emp-${txn.collaboratorId}`;

      const firstName = txn.collaborator?.firstName?.toLowerCase() ?? '';
      const lastName = txn.collaborator?.lastName?.toLowerCase() ?? '';
      const fullName = (txn.collaborator?.name ?? `${firstName} ${lastName}`).toLowerCase();

      const orderIdStr = txn.orderId != null ? String(txn.orderId) : '';
      const orderRef = txn.orderId != null ? `#ord-${txn.orderId}` : '';
      const orderNum = (txn.orderNumber ?? txn.order?.orderNumber ?? '').toLowerCase();

      const notes = txn.notes?.toLowerCase() ?? '';

      return (
        transactionRef.includes(term) ||
        ctRef.includes(term) ||
        txnIdStr.includes(term) ||
        drawerId.includes(term) ||
        collaboratorId.includes(term) ||
        fullName.includes(term) ||
        firstName.includes(term) ||
        lastName.includes(term) ||
        orderIdStr.includes(term) ||
        orderRef.includes(term) ||
        orderNum.includes(term) ||
        notes.includes(term)
      );
    });
  }, [transactions, searchQuery, startDate, endDate, typeFilter, statusFilter, shiftFilter]);

  const fetchCashTransactions = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const merchantId = getCurrentMerchantId() ?? sessionStorage.getItem('x7:branch-context') ?? '1';

      const params = new URLSearchParams({
        merchantId: String(merchantId),
        page: String(page),
        limit: String(PAGE_SIZE),
      });

      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (drawerFilter !== '') params.set('cashDrawerId', String(drawerFilter));
      if (shiftFilter !== '') params.set('shiftId', String(shiftFilter));

      const res = await fetch(`${API_BASE}/cash-transactions?${params.toString()}`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Failed to load cash transactions');
      }

      const json = await res.json();
      setTransactions((json.data ?? []).map(normalizeTransaction));
      setPaginationMeta(json.paginationMeta ?? null);
    } catch (err) {
      console.error('Error fetching cash transactions:', err);
      setError('Failed to load cash transactions. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (txn: CashTransaction) => {
    setDetailTransaction(txn);
    setDetailError(null);
    setDetailLoading(true);
    detailRequestIdRef.current = txn.id;
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/cash-transactions/${txn.id}`, { headers });
      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error('Failed to load cash transaction detail');
      const json = await res.json();
      if (detailRequestIdRef.current === txn.id) {
        setDetailTransaction(normalizeTransaction(json.data));
      }
    } catch (err) {
      console.error('Error fetching cash transaction detail:', err);
      if (detailRequestIdRef.current === txn.id) {
        setDetailError('Could not load shift and loyalty point details for this transaction.');
      }
    } finally {
      if (detailRequestIdRef.current === txn.id) {
        setDetailLoading(false);
      }
    }
  };

  const closeDetail = () => {
    detailRequestIdRef.current = null;
    setDetailTransaction(null);
    setDetailError(null);
    setDetailLoading(false);
  };

  useEffect(() => {
    fetchCashTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, typeFilter, statusFilter, drawerFilter, shiftFilter, startDate, endDate]);

  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const [drawerRes, shiftRes] = await Promise.all([
          fetch(`${API_BASE}/cash-drawers?limit=100`, { headers }).catch(() => null),
          fetch(`${API_BASE}/cash-shifts?limit=100`, { headers }).catch(() => null),
        ]);

        if (drawerRes && drawerRes.ok) {
          const drawerJson = await drawerRes.json().catch(() => ({ data: [] }));
          setDrawerOptions((drawerJson.data ?? []).map((d: { id: number }) => d.id));
        }
        if (shiftRes && shiftRes.ok) {
          const shiftJson = await shiftRes.json().catch(() => ({ data: [] }));
          setShiftOptions((shiftJson.data ?? []).map((s: { id: number }) => s.id));
        }
      } catch (err) {
        console.error('Error fetching drawers/shifts for filter:', err);
      }
    };
    fetchFilterOptions();
  }, []);

  const todayStr = getTodayDateString();
  const isDateModified = startDate !== todayStr || endDate !== todayStr;
  const hasActiveFilter = Boolean(
    searchQuery || typeFilter || statusFilter || drawerFilter !== '' || shiftFilter !== '' || isDateModified,
  );

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('');
    setStatusFilter('');
    setDrawerFilter('');
    setShiftFilter('');
    setStartDate(todayStr);
    setEndDate(todayStr);
    setPage(1);
  };

  const handleTypeFilterChange = (value: '' | CashTransactionType) => {
    setTypeFilter(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value: '' | CashTransactionStatus) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleDrawerFilterChange = (value: '' | number) => {
    setDrawerFilter(value);
    setPage(1);
  };

  const handleShiftFilterChange = (value: '' | number) => {
    setShiftFilter(value);
    setPage(1);
  };

  const isTrueEmpty =
    !loading && !error && !hasActiveFilter && (paginationMeta?.total ?? transactions.length) === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={() => fetchCashTransactions()}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center gap-3">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[240px]">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by #TXN-id, order, collaborator, or notes..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search cash transactions"
          />
        </div>

        {/* Date Range Controls */}
        <div className="flex items-center gap-2 border border-[#e8e2d8] bg-[#fef9f1] px-3 py-1.5 rounded text-xs text-[#5f5e5e]">
          <span className="material-symbols-outlined text-[16px]">calendar_today</span>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              aria-label="Filter start date"
              className="bg-transparent outline-none text-xs font-medium text-[#1d1c17]"
            />
            <span>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              aria-label="Filter end date"
              className="bg-transparent outline-none text-xs font-medium text-[#1d1c17]"
            />
          </div>
        </div>

        {/* Type Selector */}
        <select
          value={typeFilter}
          onChange={(e) => handleTypeFilterChange(e.target.value as '' | CashTransactionType)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by transaction type"
        >
          <option value="">All Types</option>
          <option value="SALE">Sale</option>
          <option value="REFUND">Refund</option>
          <option value="PAY_IN">Pay In / Opening</option>
          <option value="PAY_OUT">Pay Out / Withdrawal</option>
          <option value="DRAWER_DROP">Drawer Drop</option>
          <option value="tip">Tip</option>
          <option value="adjustment_up">Adjustment Up</option>
          <option value="adjustment_down">Adjustment Down</option>
        </select>

        {/* Status Selector */}
        <select
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value as '' | CashTransactionStatus)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by transaction status"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="VOIDED">VOIDED</option>
          <option value="AUDITED">AUDITED</option>
          <option value="RECONCILED">RECONCILED</option>
        </select>

        {/* Drawer Filter */}
        <select
          value={drawerFilter}
          onChange={(e) => handleDrawerFilterChange(e.target.value === '' ? '' : Number(e.target.value))}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by cash drawer"
        >
          <option value="">All Drawers</option>
          {drawerOptions.map((id) => (
            <option key={id} value={id}>
              #CD-{id}
            </option>
          ))}
        </select>

        {/* Shift Filter */}
        <select
          value={shiftFilter}
          onChange={(e) => handleShiftFilterChange(e.target.value === '' ? '' : Number(e.target.value))}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by shift"
        >
          <option value="">All Shifts</option>
          {shiftOptions.map((id) => (
            <option key={id} value={id}>
              #SHIFT-{id}
            </option>
          ))}
        </select>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>

      {isTrueEmpty && (
        <div
          data-testid="cash-transactions-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">receipt_long</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No cash transactions recorded for the selected period or drawer.
          </p>
        </div>
      )}

      {!isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">receipt_long</span>
              CASH TRANSACTIONS LEDGER
            </span>
            <span className="text-white/50 text-xs">
              {loading
                ? 'Loading...'
                : searchQuery.trim() || hasActiveFilter
                  ? `${filteredTransactions.length} of ${paginationMeta?.total ?? transactions.length} transactions`
                  : `${paginationMeta?.total ?? transactions.length} transactions`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Transaction Ref
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Type &amp; Direction
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Collaborator &amp; Session
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Linked Order
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Notes
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {loading
                  ? [1, 2, 3].map((i) => (
                      <tr key={i}>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-24" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-16" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-16" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-10" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-10" /></td>
                      </tr>
                    ))
                  : filteredTransactions.length === 0
                    ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-10 text-center">
                          <div className="flex flex-col items-center gap-3" data-testid="cash-transactions-empty-state">
                            <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                            <p className="text-sm text-[#5f5e5e] font-medium">
                              No cash transactions recorded for the selected period or drawer.
                            </p>
                            {hasActiveFilter && (
                              <button
                                type="button"
                                onClick={clearFilters}
                                className="text-[#ae001a] text-sm font-semibold hover:underline"
                              >
                                Show all transactions
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                    : filteredTransactions.map((txn) => {
                        const collaboratorName = txn.collaborator
                          ? (txn.collaborator.firstName || txn.collaborator.lastName)
                            ? `${txn.collaborator.firstName ?? ''} ${txn.collaborator.lastName ?? ''}`.trim()
                            : txn.collaborator.name
                          : `Collaborator #${txn.collaboratorId}`;

                        const isInflow = isBalanceIncreasingType(txn.type);
                        const isOutflow = isBalanceDecreasingType(txn.type);

                        return (
                          <tr
                            key={txn.id}
                            data-testid={`cash-transaction-row-${txn.id}`}
                            onClick={() => openDetail(txn)}
                            className="hover:bg-[#f8f3eb] transition-colors cursor-pointer"
                          >
                            {/* Ref ID & Timestamp */}
                            <td className="px-6 py-4">
                              <p className="font-bold text-[#1d1c17] leading-tight">
                                #TXN-{txn.id}
                              </p>
                              <span className="text-[11px] text-[#5f5e5e] font-mono block mt-0.5">
                                {formatDateTime(txn.createdAt)}
                              </span>
                            </td>

                            {/* Type & Direction */}
                            <td className="px-6 py-4">
                              <span
                                className={`text-[10px] font-bold uppercase px-2 py-1 rounded inline-flex items-center gap-1 ${
                                  isInflow
                                    ? 'bg-green-500/10 text-green-700 border border-green-500/20'
                                    : isOutflow
                                      ? 'bg-red-500/10 text-[#ae001a] border border-red-500/20'
                                      : 'bg-[#ece8e0] text-[#5f5e5e]'
                                }`}
                              >
                                {isInflow && <span className="font-bold">+</span>}
                                {isOutflow && <span className="font-bold">-</span>}
                                {formatTypeLabel(txn.type)}
                              </span>
                            </td>

                            {/* Amount */}
                            <td className={`px-6 py-4 font-bold text-base ${amountColorClass(txn.type)}`}>
                              {formatCurrency(txn.amount)}
                            </td>

                            {/* Collaborator & Drawer/Shift */}
                            <td className="px-6 py-4">
                              <p className="text-xs font-bold text-[#1d1c17]">{collaboratorName}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700">
                                  #CD-{txn.cashDrawerId}
                                </span>
                                {(txn.shiftId != null || txn.cashShift?.id != null) && (
                                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-800">
                                    #SHIFT-{txn.shiftId ?? txn.cashShift?.id}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Linked Order */}
                            <td className="px-6 py-4 text-center">
                              {txn.orderId != null ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onNavigate?.('orders');
                                  }}
                                  title={`View details for Order #${txn.orderId}`}
                                  className="px-2.5 py-1 bg-[#ae001a]/10 hover:bg-[#ae001a]/20 text-[#ae001a] font-bold rounded-full text-xs transition-colors inline-flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-[14px]">receipt</span>
                                  #ORD-{txn.orderId}
                                </button>
                              ) : (
                                <span className="text-xs text-[#5f5e5e]">N/A</span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="px-6 py-4 text-center">
                              <span
                                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                                  CASH_TRANSACTION_STATUS_BADGE_CLASSES[txn.status] ?? 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {txn.status}
                              </span>
                            </td>

                            {/* Notes */}
                            <td className="px-6 py-4 text-center">
                              {txn.notes ? (
                                <span
                                  title={txn.notes}
                                  className="material-symbols-outlined text-[18px] text-[#5f5e5e] hover:text-primary transition-colors duration-200"
                                >
                                  description
                                </span>
                              ) : (
                                <span className="text-xs text-[#5f5e5e]">—</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="px-6 py-4 text-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDetail(txn);
                                }}
                                aria-label={`View cash transaction ${txn.id} details`}
                                className="p-1 text-[#1d1c17] hover:text-primary transition-colors duration-200"
                              >
                                <span className="material-symbols-outlined text-[20px]">visibility</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
              </tbody>
            </table>
          </div>
          {paginationMeta && (
            <div className="p-4 border-t border-[#e8e2d8] flex justify-between items-center">
              <span className="text-xs text-[#5f5e5e]">
                Page {paginationMeta.page} of {paginationMeta.totalPages || 1} — {paginationMeta.total} total
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!paginationMeta.hasPrev}
                  aria-label="Previous page"
                  className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:text-primary transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-[#5f5e5e]"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!paginationMeta.hasNext}
                  aria-label="Next page"
                  className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:text-primary transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-[#5f5e5e]"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {detailTransaction && (
        <CashTransactionDetailDrawer
          transaction={detailTransaction}
          loading={detailLoading}
          error={detailError}
          onClose={closeDetail}
          onNavigate={onNavigate}
        />
      )}

      <CashManagementQuickLinks activeModule="cash-transactions" onNavigate={onNavigate} />
    </div>
  );
};

export default CashTransactionsView;
