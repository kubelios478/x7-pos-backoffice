import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  CashTransaction,
  CashTransactionType,
  CashTransactionPaginationMeta,
} from '../../../../types/cash-transaction';
import { CashManagementQuickLinks } from './CashManagementQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
const PAGE_SIZE = 10;

const BALANCE_INCREASING_TYPES: CashTransactionType[] = ['opening', 'sale', 'tip', 'adjustment_up'];
const BALANCE_DECREASING_TYPES: CashTransactionType[] = ['refund', 'withdrawal', 'adjustment_down'];

export function isBalanceIncreasingType(type: CashTransactionType): boolean {
  return BALANCE_INCREASING_TYPES.includes(type);
}

function isBalanceDecreasingType(type: CashTransactionType): boolean {
  return BALANCE_DECREASING_TYPES.includes(type);
}

export function formatTypeLabel(type: CashTransactionType): string {
  return type.replace(/_/g, ' ').toUpperCase();
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

interface CashTransactionDetailDrawerProps {
  transaction: CashTransaction;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

const CashTransactionDetailDrawer: React.FC<CashTransactionDetailDrawerProps> = ({
  transaction,
  loading,
  error,
  onClose,
}) => {
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
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">#CT-{transaction.id} Details</span>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Transaction</p>
            <p className="font-bold text-[#1d1c17]">#CT-{transaction.id}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Cash Drawer</p>
              <p>#CD-{transaction.cashDrawerId}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Type</p>
              <p>{formatTypeLabel(transaction.type)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Amount</p>
              <p className={amountColorClass(transaction.type)}>{formatCurrency(transaction.amount)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Collaborator</p>
              <p>#EMP-{transaction.collaboratorId}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Linked Order</p>
            <p>{transaction.orderId != null ? `Order #${transaction.orderId}` : '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Notes</p>
            <p>{transaction.notes || 'No additional notes provided for this transaction.'}</p>
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
          {error && (
            <p className="text-[#ae001a] text-xs" role="alert">
              {error}
            </p>
          )}
          {loading && (
            <p className="text-[#5f5e5e] text-xs" data-testid="detail-loading-indicator">
              Loading shift and loyalty details…
            </p>
          )}
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
  const [drawerFilter, setDrawerFilter] = useState<'' | number>('');
  const [drawerOptions, setDrawerOptions] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTransactions = React.useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return transactions;
    return transactions.filter((txn) => {
      const transactionId = `#ct-${txn.id}`;
      const drawerId = `#cd-${txn.cashDrawerId}`;
      const collaboratorId = `#emp-${txn.collaboratorId}`;
      const notes = txn.notes?.toLowerCase() ?? '';
      return (
        transactionId.includes(term) ||
        drawerId.includes(term) ||
        collaboratorId.includes(term) ||
        notes.includes(term)
      );
    });
  }, [transactions, searchQuery]);

  const fetchCashTransactions = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (typeFilter) params.set('type', typeFilter);
      if (drawerFilter !== '') params.set('cashDrawerId', String(drawerFilter));

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
  }, [page, typeFilter, drawerFilter]);

  useEffect(() => {
    const fetchDrawerOptions = async () => {
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/cash-drawers?limit=100`, { headers });
        const json = await res.json().catch(() => ({ data: [] }));
        setDrawerOptions((json.data ?? []).map((d: { id: number }) => d.id));
      } catch (err) {
        console.error('Error fetching cash drawers for filter:', err);
      }
    };
    fetchDrawerOptions();
  }, []);

  const hasActiveFilter = Boolean(searchQuery || typeFilter || drawerFilter !== '');

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('');
    setDrawerFilter('');
    setPage(1);
  };

  const handleTypeFilterChange = (value: '' | CashTransactionType) => {
    setTypeFilter(value);
    setPage(1);
  };

  const handleDrawerFilterChange = (value: '' | number) => {
    setDrawerFilter(value);
    setPage(1);
  };

  const isTrueEmpty =
    !loading && !error && !hasActiveFilter && (paginationMeta?.total ?? transactions.length) === 0;
  const isFilteredEmpty = !loading && !error && hasActiveFilter && filteredTransactions.length === 0;

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
        <div className="relative flex-1 min-w-[220px]">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by transaction, drawer, collaborator, or notes..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search cash transactions"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => handleTypeFilterChange(e.target.value as '' | CashTransactionType)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by transaction type"
        >
          <option value="">All Types</option>
          <option value="opening">Opening</option>
          <option value="sale">Sale</option>
          <option value="refund">Refund</option>
          <option value="tip">Tip</option>
          <option value="withdrawal">Withdrawal</option>
          <option value="adjustment_up">Adjustment Up</option>
          <option value="adjustment_down">Adjustment Down</option>
          <option value="close">Close</option>
          <option value="pause">Pause</option>
          <option value="unpause">Unpause</option>
        </select>
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
            No cash transactions found yet. Transactions appear automatically as sales, refunds, and drawer
            operations happen.
          </p>
        </div>
      )}

      {!isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">receipt_long</span>
              CASH TRANSACTIONS
            </span>
            <span className="text-white/50 text-xs">
              {loading
                ? 'Loading...'
                : searchQuery.trim()
                  ? `${filteredTransactions.length} of ${paginationMeta?.total ?? transactions.length} transactions`
                  : `${paginationMeta?.total ?? transactions.length} transactions`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Transaction ID &amp; Drawer
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Collaborator
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Linked Order
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Notes
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Created At
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
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-10" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-10" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-10" /></td>
                      </tr>
                    ))
                  : isFilteredEmpty
                    ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-10 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                            <p className="text-sm text-[#5f5e5e]">No cash transactions match your active filters</p>
                            <button
                              type="button"
                              onClick={clearFilters}
                              aria-label="Clear filters and show all transactions"
                              className="text-[#ae001a] text-sm font-semibold hover:underline"
                            >
                              Clear Filters
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                    : filteredTransactions.map((txn) => (
                      <tr
                        key={txn.id}
                        data-testid={`cash-transaction-row-${txn.id}`}
                        onClick={() => openDetail(txn)}
                        className="hover:bg-[#f8f3eb] transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17]">
                            #CT-{txn.id}{' '}
                            <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-700">
                              #CD-{txn.cashDrawerId}
                            </span>
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#ece8e0] text-[#5f5e5e] inline-flex items-center gap-1">
                            {isBalanceIncreasingType(txn.type) && (
                              <span className="material-symbols-outlined text-[14px]">paid</span>
                            )}
                            {formatTypeLabel(txn.type)}
                          </span>
                        </td>
                        <td className={`px-6 py-4 ${amountColorClass(txn.type)}`}>{formatCurrency(txn.amount)}</td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#5f5e5e]/10 text-[#5f5e5e]">
                            #EMP-{txn.collaboratorId}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {txn.orderId != null ? (
                            <span
                              title={`Linked to Order #${txn.orderId}`}
                              className="material-symbols-outlined text-[18px] text-[#5f5e5e] hover:text-primary transition-colors duration-200 cursor-default"
                            >
                              shopping_bag
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {txn.notes ? (
                            <span
                              title={txn.notes}
                              className="material-symbols-outlined text-[18px] text-[#5f5e5e] hover:text-primary transition-colors duration-200 cursor-default"
                            >
                              description
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-6 py-4">{formatDateTime(txn.createdAt)}</td>
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
                    ))}
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
        />
      )}

      <CashManagementQuickLinks activeModule="cash-transactions" onNavigate={onNavigate} />
    </div>
  );
};

export default CashTransactionsView;
