import React, { useEffect, useState } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  CashTransaction,
  CashTransactionType,
  CashTransactionPaginationMeta,
} from '../../../../types/cash-transaction';

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

interface CashTransactionsViewProps {
  onNavigate?: (view: string) => void;
}

export const CashTransactionsView: React.FC<CashTransactionsViewProps> = ({ onNavigate }) => {
  void onNavigate;
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [paginationMeta, setPaginationMeta] = useState<CashTransactionPaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  void setPage;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCashTransactions = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
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

  useEffect(() => {
    fetchCashTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const isTrueEmpty = !loading && !error && (paginationMeta?.total ?? transactions.length) === 0;

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
              {loading ? 'Loading...' : `${paginationMeta?.total ?? transactions.length} transactions`}
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
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Created At
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
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                      </tr>
                    ))
                  : transactions.map((txn) => (
                      <tr
                        key={txn.id}
                        data-testid={`cash-transaction-row-${txn.id}`}
                        className="hover:bg-[#f8f3eb] transition-colors"
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
                        <td className="px-6 py-4">{formatDateTime(txn.createdAt)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashTransactionsView;
