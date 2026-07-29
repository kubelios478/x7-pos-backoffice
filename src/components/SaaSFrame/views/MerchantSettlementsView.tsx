import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getSaasToken, clearSaasToken } from '../../../lib/saas-auth-storage';
import type {
  MerchantSettlement,
  SettlementStatus,
} from '../../../types/settlements';
import {
  SETTLEMENT_STATUSES,
  SETTLEMENT_STATUS_LABELS,
} from '../../../types/settlements';
import {
  formatCurrency,
  formatDate,
  isReadyToPay,
  num,
  SETTLEMENT_BADGE_STYLES,
} from '../../../lib/settlements';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// ===================== PAYOUT CONFIRM DIALOG =====================

interface PayoutConfirmDialogProps {
  settlement: MerchantSettlement;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const PayoutConfirmDialog: React.FC<PayoutConfirmDialogProps> = ({
  settlement,
  submitting,
  onCancel,
  onConfirm,
}) => {
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[10000] flex justify-center items-center p-4 font-sans">
      <div className="absolute inset-0" onClick={onCancel} />
      <div
        role="dialog"
        aria-label="Execute Payout"
        className="relative bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md p-6 text-left"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-green-50 border border-green-100 text-green-700">
            <span className="material-symbols-outlined text-2xl">payments</span>
          </div>
          <div className="space-y-1">
            <p className="font-bold text-[#1d1c17]">Send today&apos;s cash payout?</p>
            <p className="text-sm text-[#5f5e5e] leading-relaxed">
              You are about to transfer the net collected revenue to{' '}
              <span className="font-semibold text-[#1d1c17]">{settlement.merchant_name}</span> for the
              business day {formatDate(settlement.settlement_date)}.
            </p>
          </div>
        </div>

        <div className="mt-5 bg-[#f5efe6] border border-[#e8e2d8] rounded p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#5f5e5e]">Gross collected</span>
            <span className="font-semibold text-[#1d1c17]">{formatCurrency(settlement.gross_collected)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#5f5e5e]">Platform fee</span>
            <span className="font-semibold text-[#ae001a]">− {formatCurrency(settlement.platform_fee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#5f5e5e]">Refunds</span>
            <span className="font-semibold text-[#ae001a]">− {formatCurrency(settlement.refunds)}</span>
          </div>
          <div className="flex justify-between border-t border-[#e8e2d8] pt-2">
            <span className="font-bold text-[#1d1c17] uppercase text-[11px] tracking-widest">Net payout</span>
            <span className="text-lg font-black text-green-700" data-testid="payout-net-amount">
              {formatCurrency(settlement.net_payout)}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
          >
            {submitting ? 'Sending…' : 'Confirm Payout'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ===================== DETAIL DRAWER =====================

interface SettlementDetailDrawerProps {
  settlement: MerchantSettlement;
  onClose: () => void;
}

const SettlementDetailDrawer: React.FC<SettlementDetailDrawerProps> = ({ settlement, onClose }) => {
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex justify-end font-sans">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Settlement Details"
        className="relative w-full max-w-md bg-[#fcfbfa] h-full shadow-2xl z-10 flex flex-col border-l border-[#e8e2d8] animate-slide-in text-left"
      >
        <div className="bg-[#222222] px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-white text-xl">account_balance_wallet</span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-white">Settlement Details</span>
          </div>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-[#1c1b16] tracking-tight">{settlement.merchant_name}</h2>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${SETTLEMENT_BADGE_STYLES[settlement.status]}`}
              >
                {SETTLEMENT_STATUS_LABELS[settlement.status]}
              </span>
            </div>
            <p className="text-xs text-[#5f5e5e] mt-1 uppercase tracking-wider font-semibold">
              Business day {formatDate(settlement.settlement_date)} · {settlement.orders_count} orders
            </p>
          </div>

          <div className="border-t border-[#e8e2d8] pt-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#5f5e5e]">Gross collected</span>
              <span className="font-semibold text-[#1d1c17]">{formatCurrency(settlement.gross_collected)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#5f5e5e]">Platform fee</span>
              <span className="font-semibold text-[#ae001a]">− {formatCurrency(settlement.platform_fee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#5f5e5e]">Refunds</span>
              <span className="font-semibold text-[#ae001a]">− {formatCurrency(settlement.refunds)}</span>
            </div>
            <div className="flex justify-between border-t border-[#e8e2d8] pt-2">
              <span className="font-bold text-[#1d1c17] uppercase text-[11px] tracking-widest">Net payout</span>
              <span className="text-lg font-black text-green-700">{formatCurrency(settlement.net_payout)}</span>
            </div>
          </div>

          {settlement.status === 'PAID' && (
            <div className="border-t border-[#e8e2d8] pt-5 space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-green-700">Payout Record</h4>
              <p className="text-xs text-[#1c1b16]">
                Reference: <span className="font-mono font-semibold">{settlement.payout_reference || '—'}</span>
              </p>
              <p className="text-xs text-[#5f5e5e]">Paid at {formatDate(settlement.paid_at)}</p>
            </div>
          )}

          <div className="border-t border-[#e8e2d8] pt-5 space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#d51f2c]">
              Orders in this settlement ({settlement.orders?.length ?? 0})
            </h4>
            {settlement.orders && settlement.orders.length > 0 ? (
              <ul className="space-y-2">
                {settlement.orders.map((o) => (
                  <li key={o.id} className="flex justify-between items-center bg-[#f5efe6] border border-[#e8e2d8] p-3">
                    <div>
                      <p className="text-xs font-semibold text-[#1c1b16] font-mono">{o.order_number}</p>
                      <p className="text-[10px] text-[#5f5e5e]">{o.branch_name} · {o.channel}</p>
                    </div>
                    <span className="text-xs font-bold text-[#1c1b16]">{formatCurrency(o.gross_amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#5f5e5e] italic">Order breakdown not loaded for this settlement.</p>
            )}
          </div>
        </div>

        <div className="bg-[#f5efe6] border-t border-[#e8e2d8] px-6 py-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-[#222222] hover:bg-black text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ===================== MAIN VIEW =====================

interface MerchantSettlementsViewProps {
  onNavigate?: (view: string) => void;
}

export const MerchantSettlementsView: React.FC<MerchantSettlementsViewProps> = ({ onNavigate }) => {
  const [settlements, setSettlements] = useState<MerchantSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | SettlementStatus>('');
  const [readyOnly, setReadyOnly] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [payingSettlement, setPayingSettlement] = useState<MerchantSettlement | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [detailSettlement, setDetailSettlement] = useState<MerchantSettlement | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const authHeaders = (): Record<string, string> => {
    const token = getSaasToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const handleUnauthorized = () => {
    clearSaasToken();
    window.location.href = '/saas-admin';
  };

  const fetchSettlements = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/v1/platform/merchant-settlements`, { headers: authHeaders() });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar las liquidaciones');
      const json = await res.json();
      setSettlements(json.data ?? []);
    } catch (err) {
      console.error('Error fetching merchant settlements:', err);
      setError('Failed to load merchant settlements. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettlements();
  }, []);

  // Genera las liquidaciones del día a partir de las órdenes recaudadas.
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE}/v1/platform/merchant-settlements/generate`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to generate settlements');
      // El endpoint devuelve la lista actualizada de liquidaciones.
      setSettlements(json.data ?? []);
      setToast({ message: 'Daily settlements generated successfully', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to generate settlements', type: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  // Ejecuta el "pago de caja": transfiere el neto al merchant.
  const handlePayoutConfirm = async () => {
    if (!payingSettlement) return;
    setPaySubmitting(true);
    try {
      const res = await fetch(
        `${API_BASE}/v1/platform/merchant-settlements/${payingSettlement.id}/payout`,
        { method: 'POST', headers: authHeaders() },
      );
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to execute payout');
      setSettlements((prev) => prev.map((s) => (s.id === json.data.id ? json.data : s)));
      setPayingSettlement(null);
      setToast({ message: 'Payout executed successfully', type: 'success' });
    } catch (err: any) {
      setPayingSettlement(null);
      setToast({ message: err.message || 'Failed to execute payout', type: 'error' });
    } finally {
      setPaySubmitting(false);
    }
  };

  const handleRowClick = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/v1/platform/merchant-settlements/${id}`, {
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to load settlement details');
      setDetailSettlement(json.data);
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to load settlement details', type: 'error' });
    }
  };

  const filteredSettlements = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return settlements.filter((s) => {
      if (term && !s.merchant_name.toLowerCase().includes(term)) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (readyOnly && !isReadyToPay(s)) return false;
      return true;
    });
  }, [settlements, searchQuery, statusFilter, readyOnly]);

  const totals = useMemo(() => {
    const pending = settlements.filter(isReadyToPay);
    const pendingNet = pending.reduce((sum, s) => sum + num(s.net_payout), 0);
    return { readyCount: pending.length, pendingNet };
  }, [settlements]);

  const hasActiveFilter = Boolean(searchQuery || statusFilter || readyOnly);
  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setReadyOnly(false);
  };

  const isTrueEmpty = !loading && !error && settlements.length === 0;
  const isFilteredEmpty = !loading && !error && settlements.length > 0 && filteredSettlements.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchSettlements}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#d51f2c] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      {/* Summary + generate */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">Ready to pay</p>
          <p className="text-2xl font-black text-[#1d1c17] mt-1">{loading ? '—' : totals.readyCount}</p>
        </div>
        <div className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">Pending payout total</p>
          <p className="text-2xl font-black text-green-700 mt-1">
            {loading ? '—' : formatCurrency(totals.pendingNet)}
          </p>
        </div>
        <div className="bg-[#222222] p-5 rounded shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Business day</p>
            <p className="text-sm font-bold text-white mt-1">Run cash settlement</p>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="px-3 py-2 bg-[#d51f2c] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#ae001a] disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">{generating ? 'sync' : 'bolt'}</span>
            {generating ? 'Generating…' : 'Generate settlements'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by merchant..."
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#d51f2c] focus:ring-1 focus:ring-[#d51f2c] outline-none text-sm transition-all"
              aria-label="Search settlements"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | SettlementStatus)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#d51f2c] outline-none"
            aria-label="Filter by settlement status"
          >
            <option value="">All Statuses</option>
            {SETTLEMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SETTLEMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setReadyOnly((v) => !v)}
            aria-pressed={readyOnly}
            className={`flex items-center gap-2 px-4 py-2 rounded text-[11px] font-bold uppercase tracking-widest border transition-colors ${
              readyOnly
                ? 'bg-[#d51f2c] border-[#d51f2c] text-white'
                : 'bg-white border-[#e8e2d8] text-[#5f5e5e] hover:text-[#d51f2c] hover:border-[#d51f2c]'
            }`}
          >
            <span className="material-symbols-outlined text-base">payments</span>
            Ready to pay only
          </button>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* True empty state */}
      {isTrueEmpty && (
        <div
          data-testid="merchant-settlements-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">account_balance_wallet</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No settlements yet. Click &apos;Generate settlements&apos; to aggregate today&apos;s collected
            orders per merchant and prepare the daily cash payouts.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="mt-6 px-5 py-2.5 bg-[#d51f2c] hover:bg-[#ae001a] disabled:opacity-40 text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">bolt</span>
            {generating ? 'Generating…' : 'Generate settlements'}
          </button>
        </div>
      )}

      {/* Table */}
      {(loading || settlements.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              MERCHANT DAILY SETTLEMENTS
            </span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredSettlements.length} settlements`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Merchant &amp; Day
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Orders
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Gross
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Fee / Refunds
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Net Payout
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Payout
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, c) => (
                        <td key={c} className="px-6 py-4">
                          <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                        <p className="text-sm text-[#5f5e5e]">No settlements match your active filters</p>
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="text-[#d51f2c] text-sm font-semibold hover:underline"
                        >
                          Clear filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredSettlements.map((s) => {
                    const ready = isReadyToPay(s);
                    return (
                      <tr
                        key={s.id}
                        onClick={() => handleRowClick(s.id)}
                        className="group hover:bg-[#f8f3eb] transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17]">{s.merchant_name}</p>
                          <p className="text-xs text-[#5f5e5e]">{formatDate(s.settlement_date)}</p>
                        </td>
                        <td className="px-6 py-4 text-center text-sm text-[#1d1c17]">{s.orders_count}</td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-[#1d1c17] whitespace-nowrap">
                          {formatCurrency(s.gross_collected)}
                        </td>
                        <td className="px-6 py-4 text-right text-xs text-[#ae001a] whitespace-nowrap">
                          − {formatCurrency(num(s.platform_fee) + num(s.refunds))}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-black text-green-700 whitespace-nowrap">
                          {formatCurrency(s.net_payout)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${SETTLEMENT_BADGE_STYLES[s.status]}`}
                          >
                            {SETTLEMENT_STATUS_LABELS[s.status]}
                          </span>
                          {s.status === 'PAID' && s.payout_reference && (
                            <p className="text-[9px] text-[#5f5e5e] font-mono mt-1">{s.payout_reference}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPayingSettlement(s);
                            }}
                            disabled={!ready}
                            aria-label="Execute payout"
                            title={ready ? 'Execute payout' : 'Not payable'}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[16px]">payments</span>
                            {s.status === 'PAID' ? 'Paid' : 'Pay'}
                          </button>
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

      <div className="text-[11px] text-[#5f5e5e]">
        <button
          type="button"
          onClick={() => onNavigate?.('orders-registry')}
          className="font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-[#d51f2c] transition-colors duration-200 flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-base">receipt_long</span>
          View orders registry
        </button>
      </div>

      {payingSettlement && (
        <PayoutConfirmDialog
          settlement={payingSettlement}
          submitting={paySubmitting}
          onCancel={() => setPayingSettlement(null)}
          onConfirm={handlePayoutConfirm}
        />
      )}

      {detailSettlement && (
        <SettlementDetailDrawer settlement={detailSettlement} onClose={() => setDetailSettlement(null)} />
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
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 opacity-70 hover:opacity-100 transition-opacity"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default MerchantSettlementsView;
