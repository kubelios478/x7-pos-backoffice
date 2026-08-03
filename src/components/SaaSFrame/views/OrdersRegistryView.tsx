import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getSaasToken, clearSaasToken } from '../../../lib/saas-auth-storage';
import type { MerchantOrder, OrderChannel, OrderStatus } from '../../../types/settlements';
import {
  ORDER_CHANNELS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
} from '../../../types/settlements';
import { formatCurrency, formatDate, num, ORDER_STATUS_BADGE_STYLES } from '../../../lib/settlements';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

interface OrdersRegistryViewProps {
  onNavigate?: (view: string) => void;
}

export const OrdersRegistryView: React.FC<OrdersRegistryViewProps> = ({ onNavigate }) => {
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [merchantFilter, setMerchantFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState<'' | OrderChannel>('');
  const [statusFilter, setStatusFilter] = useState<'' | OrderStatus>('');
  const [detailOrder, setDetailOrder] = useState<MerchantOrder | null>(null);

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

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/v1/platform/orders`, { headers: authHeaders() });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar las órdenes');
      const json = await res.json();
      setOrders(json.data ?? []);
    } catch (err) {
      console.error('Error fetching merchant orders:', err);
      setError('Failed to load merchant orders. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const merchantOptions = useMemo(() => {
    const map = new Map<number, string>();
    orders.forEach((o) => map.set(o.company_id, o.merchant_name));
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      if (term) {
        const haystack = [o.order_number, o.merchant_name, o.branch_name].join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (merchantFilter && String(o.company_id) !== merchantFilter) return false;
      if (channelFilter && o.channel !== channelFilter) return false;
      if (statusFilter && o.status !== statusFilter) return false;
      return true;
    });
  }, [orders, searchQuery, merchantFilter, channelFilter, statusFilter]);

  const totals = useMemo(() => {
    const collected = filteredOrders
      .filter((o) => o.status === 'COMPLETED')
      .reduce((sum, o) => sum + num(o.gross_amount), 0);
    return { count: filteredOrders.length, collected };
  }, [filteredOrders]);

  const hasActiveFilter = Boolean(searchQuery || merchantFilter || channelFilter || statusFilter);
  const clearFilters = () => {
    setSearchQuery('');
    setMerchantFilter('');
    setChannelFilter('');
    setStatusFilter('');
  };

  const isTrueEmpty = !loading && !error && orders.length === 0;
  const isFilteredEmpty = !loading && !error && orders.length > 0 && filteredOrders.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchOrders}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#d51f2c] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">Orders in view</p>
          <p className="text-2xl font-black text-[#1d1c17] mt-1">{loading ? '—' : totals.count}</p>
        </div>
        <div className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">Gross collected</p>
          <p className="text-2xl font-black text-green-700 mt-1">
            {loading ? '—' : formatCurrency(totals.collected)}
          </p>
        </div>
        <div className="bg-[#222222] p-5 rounded shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Daily payouts</p>
            <p className="text-sm font-bold text-white mt-1">Merchant settlements</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate?.('merchant-settlements')}
            className="px-3 py-2 bg-[#d51f2c] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#ae001a] transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">payments</span>
            Open
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
              placeholder="Search by order #, merchant, or restaurant..."
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#d51f2c] focus:ring-1 focus:ring-[#d51f2c] outline-none text-sm transition-all"
              aria-label="Search orders"
            />
          </div>
          <select
            value={merchantFilter}
            onChange={(e) => setMerchantFilter(e.target.value)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#d51f2c] outline-none min-w-[160px]"
            aria-label="Filter by merchant"
          >
            <option value="">All Merchants</option>
            {merchantOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as '' | OrderChannel)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#d51f2c] outline-none"
            aria-label="Filter by channel"
          >
            <option value="">All Channels</option>
            {ORDER_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | OrderStatus)}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#d51f2c] outline-none"
            aria-label="Filter by order status"
          >
            <option value="">All Statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
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
          data-testid="orders-registry-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">receipt_long</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No merchant orders recorded yet. Orders collected across restaurants will appear here and
            feed the daily settlement payouts.
          </p>
        </div>
      )}

      {/* Table */}
      {(loading || orders.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              MERCHANT ORDERS REGISTRY
            </span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredOrders.length} orders`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Order &amp; Restaurant
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Date
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Channel
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Method
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Gross
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, c) => (
                        <td key={c} className="px-6 py-4">
                          <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                        <p className="text-sm text-[#5f5e5e]">No orders match your active filters</p>
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
                  filteredOrders.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => setDetailOrder(o)}
                      className="group hover:bg-[#f8f3eb] transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <p className="font-bold text-[#1d1c17] font-mono">{o.order_number}</p>
                        <p className="text-xs text-[#5f5e5e]">
                          {o.merchant_name} · {o.branch_name}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-xs text-[#5f5e5e]">{formatDate(o.order_date)}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#ece8e0] text-[#1d1c17]">
                          {o.channel}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-xs text-[#5f5e5e]">{o.payment_method}</td>
                      <td className="px-6 py-4 text-right text-sm font-semibold text-[#1d1c17] whitespace-nowrap">
                        {formatCurrency(o.gross_amount)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${ORDER_STATUS_BADGE_STYLES[o.status]}`}
                        >
                          {ORDER_STATUS_LABELS[o.status]}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detailOrder && createPortal(
        <div className="fixed inset-0 z-[1000] flex justify-end font-sans">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetailOrder(null)} />
          <div
            role="dialog"
            aria-label="Order Details"
            className="relative w-full max-w-md bg-[#fcfbfa] h-full shadow-2xl z-10 flex flex-col border-l border-[#e8e2d8] animate-slide-in text-left"
          >
            <div className="bg-[#222222] px-6 py-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-white text-xl">receipt_long</span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-white">Order Details</span>
              </div>
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <h2 className="text-xl font-black text-[#1c1b16] tracking-tight font-mono">
                  {detailOrder.order_number}
                </h2>
                <p className="text-xs text-[#5f5e5e] mt-1 uppercase tracking-wider font-semibold">
                  {detailOrder.merchant_name} · {detailOrder.branch_name}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['Date', formatDate(detailOrder.order_date)],
                  ['Channel', detailOrder.channel],
                  ['Payment', detailOrder.payment_method],
                  ['Status', ORDER_STATUS_LABELS[detailOrder.status]],
                ].map(([label, value]) => (
                  <div key={label} className="bg-[#f5efe6] p-3 border border-[#e8e2d8]">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-[#5f5e5e] mb-1">
                      {label}
                    </span>
                    <span className="text-xs font-semibold text-[#1c1b16]">{value}</span>
                  </div>
                ))}
              </div>
              <div className="bg-[#222222] text-white px-4 py-3 rounded flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Gross Amount</span>
                <span className="text-lg font-black">{formatCurrency(detailOrder.gross_amount)}</span>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default OrdersRegistryView;
