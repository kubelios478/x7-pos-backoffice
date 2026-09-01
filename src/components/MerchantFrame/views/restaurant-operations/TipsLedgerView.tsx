import React, { useEffect, useState, useMemo } from 'react';
import type { Tip, TipMethod, TipStatus, TipRecordStatus } from '../../../../types/tips';
import {
  fetchTips,
  formatTipCurrency,
  formatTipDateTime,
  calculateTipsSummaryMetrics,
} from '../../../../api/tips';
import { getCurrentMerchantId } from '../../../../api/users';
import { TipsManagementQuickLinks } from './TipsManagementQuickLinks';
import { TipDetailDrawer } from './TipDetailDrawer';

export interface TipsLedgerViewProps {
  onNavigate?: (view: string) => void;
  companyId?: string;
  merchantId?: string;
}

export const TipsLedgerView: React.FC<TipsLedgerViewProps> = ({
  onNavigate,
  companyId = 'cmp-01',
  merchantId,
}) => {
  const resolvedMerchantId = useMemo(() => {
    if (merchantId) return merchantId;
    const resolved = getCurrentMerchantId();
    return resolved ? String(resolved) : 'mch-01';
  }, [merchantId]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<TipMethod | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<TipStatus | 'ALL' | 'NON_SETTLED'>('NON_SETTLED');
  const [selectedRecordStatus, setSelectedRecordStatus] = useState<TipRecordStatus>('ACTIVE');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Data & Hydration State
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Detail & Adjustment Drawer State
  const [activeDrawerTip, setActiveDrawerTip] = useState<Tip | null>(null);

  const loadTipsData = async () => {
    setLoading(true);
    setError(null);
    try {
      let statusFilter: TipStatus | 'ALL' | TipStatus[] | 'NON_SETTLED' = selectedStatus;
      if (selectedStatus === 'NON_SETTLED') {
        statusFilter = ['PENDING', 'ALLOCATED'];
      }

      // Executes query targeting primary @Index(['company_id', 'merchant_id', 'created_at'])
      // and secondary @Index(['order_id', 'status', 'record_status'])
      const data = await fetchTips({
        company_id: companyId,
        merchant_id: resolvedMerchantId,
        status: statusFilter,
        method: selectedMethod,
        record_status: selectedRecordStatus,
        search: searchQuery,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });

      setTips(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to hydrate tips directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTipsData();
  }, [companyId, resolvedMerchantId, searchQuery, selectedMethod, selectedStatus, selectedRecordStatus, dateFrom, dateTo]);

  const metrics = useMemo(() => calculateTipsSummaryMetrics(tips), [tips]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedMethod('ALL');
    setSelectedStatus('NON_SETTLED');
    setSelectedRecordStatus('ACTIVE');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilter =
    searchQuery !== '' ||
    selectedMethod !== 'ALL' ||
    selectedStatus !== 'NON_SETTLED' ||
    selectedRecordStatus !== 'ACTIVE' ||
    dateFrom !== '' ||
    dateTo !== '';

  const getMethodBadge = (method: TipMethod) => {
    switch (method) {
      case 'CARD':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 text-blue-700">💳 CARD</span>;
      case 'CASH':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-500/10 text-green-700">💵 CASH</span>;
      case 'ONLINE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-500/10 text-purple-700">🌐 ONLINE</span>;
      case 'QR_PAYMENT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-700">📱 QR PAYMENT</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-500/10 text-gray-700">{method}</span>;
    }
  };

  const getStatusBadge = (status: TipStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-700 border border-amber-500/20"
            title="Gratuity collected, awaiting pool allocation or direct shift payout"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            PENDING
          </span>
        );
      case 'ALLOCATED':
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 text-blue-700 border border-blue-500/20"
            title="Assigned to a tip pool or collaborator allocation record"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            ALLOCATED
          </span>
        );
      case 'SETTLED':
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-green-500/10 text-green-700 border border-green-500/20"
            title="Fully paid out in a tip settlement execution"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            SETTLED
          </span>
        );
    }
  };

  const getRecordStatusBadge = (recordStatus: TipRecordStatus) => {
    if (recordStatus === 'ACTIVE') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-500/10 text-green-700">ACTIVE</span>;
    }
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#5f5e5e]/20 text-[#5f5e5e] line-through">DELETED</span>;
  };

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center rounded">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={() => loadTipsData()}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      {/* Financial Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#e8e2d8] rounded p-4 flex flex-col justify-between shadow-sm">
          <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-widest">Total Gratuities</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-[#1d1c17]">{formatTipCurrency(metrics.totalAmount)}</span>
            <span className="text-xs text-[#5f5e5e]">{metrics.activeCount} active tips</span>
          </div>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded p-4 flex flex-col justify-between shadow-sm">
          <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-widest">Pending Allocations</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-amber-600">{formatTipCurrency(metrics.pendingAmount)}</span>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-700">
              {metrics.pendingCount} pending
            </span>
          </div>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded p-4 flex flex-col justify-between shadow-sm">
          <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-widest">Allocated Pool</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-blue-600">{formatTipCurrency(metrics.allocatedAmount)}</span>
            <span className="text-xs text-[#5f5e5e]">Assigned</span>
          </div>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded p-4 flex flex-col justify-between shadow-sm">
          <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-widest">Settled Payouts</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-green-600">{formatTipCurrency(metrics.settledAmount)}</span>
            <span className="text-xs text-[#5f5e5e]">Paid Out</span>
          </div>
        </div>
      </div>

      {/* Multi-Filter Matrix Toolbar */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
              search
            </span>
            <input
              type="text"
              data-testid="tip-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Tip ID (#TIP-1001), Order ID (#ORD-5012), or Payment ID..."
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all text-[#1d1c17]"
              aria-label="Search tips directory"
            />
          </div>

          {/* Tip Method Selector */}
          <select
            data-testid="filter-method-select"
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value as TipMethod | 'ALL')}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none"
            aria-label="Filter by tip method"
          >
            <option value="ALL">All Methods</option>
            <option value="CARD">Card Payment</option>
            <option value="CASH">Cash Gratuity</option>
            <option value="ONLINE">Online Payment</option>
            <option value="QR_PAYMENT">QR Payment</option>
          </select>

          {/* Tip Status Selector */}
          <select
            data-testid="filter-status-select"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as TipStatus | 'ALL' | 'NON_SETTLED')}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none"
            aria-label="Filter by allocation status"
          >
            <option value="NON_SETTLED">Non-Settled (Pending + Allocated)</option>
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending Only</option>
            <option value="ALLOCATED">Allocated Only</option>
            <option value="SETTLED">Settled Only</option>
          </select>

          {/* Record Status Toggle */}
          <button
            type="button"
            data-testid="record-status-toggle"
            onClick={() =>
              setSelectedRecordStatus((prev) => (prev === 'ACTIVE' ? 'DELETED' : 'ACTIVE'))
            }
            className={`px-3 py-2 rounded border text-[11px] font-bold uppercase tracking-widest transition-colors ${
              selectedRecordStatus === 'ACTIVE'
                ? 'border-green-600 bg-green-50 text-green-700 hover:bg-green-100'
                : 'border-red-600 bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            {selectedRecordStatus === 'ACTIVE' ? 'ACTIVE RECORDS' : 'DELETED RECORDS'}
          </button>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
            >
              Clear Filters
            </button>
          )}

          <button
            type="button"
            onClick={() => loadTipsData()}
            className="px-4 py-2 bg-[#222222] hover:bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5"
            title="Refresh directory"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            Refresh
          </button>
        </div>

        {/* Date Shift Filter Sub-row */}
        <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-[#e8e2d8] text-xs text-[#5f5e5e]">
          <span className="font-bold text-[11px] uppercase tracking-widest flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">calendar_today</span>
            Date Shift Filter:
          </span>
          <div className="flex items-center gap-2">
            <span>From:</span>
            <input
              type="date"
              data-testid="date-from-input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-[#fef9f1] border border-[#e8e2d8] rounded px-2.5 py-1 text-[#1d1c17] text-xs outline-none focus:border-[#ae001a]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span>To:</span>
            <input
              type="date"
              data-testid="date-to-input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-[#fef9f1] border border-[#e8e2d8] rounded px-2.5 py-1 text-[#1d1c17] text-xs outline-none focus:border-[#ae001a]"
            />
          </div>
        </div>
      </div>

      {/* Directory Grid Table */}
      <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
        <div className="p-4 bg-[#222222] flex justify-between items-center">
          <span className="text-[11px] font-bold text-white uppercase tracking-widest">
            TIPS LEDGER &amp; GRATUITIES DIRECTORY
          </span>
          <span className="text-white/50 text-xs">
            {loading ? 'Loading...' : `${tips.length} records`}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-[#5f5e5e] space-y-3">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#ae001a] border-t-transparent"></div>
            <p className="text-sm font-medium">Hydrating Tips Directory...</p>
          </div>
        ) : tips.length === 0 ? (
          <div className="p-16 flex flex-col items-center text-center">
            <span className="material-symbols-outlined text-[#5f5e5e] text-5xl">request_quote</span>
            <p className="text-[#5f5e5e] mt-4 text-sm font-semibold">No tips match the active filter matrix.</p>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-3 text-[#ae001a] text-xs font-bold hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Tip Reference ID
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Associated Order ID
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Payment Reference
                  </th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Tip Amount
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Payment Method
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Allocation Status
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Record Status
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {tips.map((tip) => {
                  const isDeleted = tip.record_status === 'DELETED';
                  return (
                    <tr
                      key={tip.id}
                      data-testid={`tip-row-${tip.id}`}
                      className="hover:bg-[#f8f3eb] transition-colors"
                    >
                      {/* Tip Reference ID */}
                      <td className="px-6 py-4">
                        <p className={`font-bold text-[#1d1c17] ${isDeleted ? 'line-through text-[#5f5e5e]' : ''}`}>
                          #TIP-{tip.id}
                        </p>
                        <p className="text-[11px] text-[#5f5e5e] mt-1">{formatTipDateTime(tip.created_at)}</p>
                      </td>

                      {/* Associated Order ID */}
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => onNavigate?.(`/pos/orders/#ORD-${tip.order_id}`)}
                          className="font-bold text-[#1d1c17] hover:text-[#ae001a] transition-colors inline-flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-sm text-[#5f5e5e]">receipt_long</span>
                          #ORD-{tip.order_id}
                        </button>
                      </td>

                      {/* Payment Reference */}
                      <td className="px-6 py-4 text-[#1d1c17] font-semibold">
                        {tip.payment_id ? `#PAY-${tip.payment_id}` : <span className="text-[#5f5e5e]">N/A</span>}
                      </td>

                      {/* Tip Amount */}
                      <td className="px-6 py-4 text-right font-bold text-[#1d1c17]">
                        <span className={isDeleted ? 'line-through text-[#5f5e5e]' : 'text-green-700'}>
                          {formatTipCurrency(tip.amount)}
                        </span>
                      </td>

                      {/* Payment Method Pill */}
                      <td className="px-6 py-4 text-center">
                        {getMethodBadge(tip.method)}
                      </td>

                      {/* Allocation Lifecycle Status */}
                      <td className="px-6 py-4 text-center">
                        {getStatusBadge(tip.status)}
                      </td>

                      {/* Logical Status Badge */}
                      <td className="px-6 py-4 text-center">
                        {getRecordStatusBadge(tip.record_status)}
                      </td>

                      {/* Actions Column */}
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          data-testid={`inspect-tip-btn-${tip.id}`}
                          onClick={() => setActiveDrawerTip(tip)}
                          className="p-1.5 hover:bg-[#ece8e0] rounded text-[#5f5e5e] hover:text-[#1d1c17] transition-colors"
                          title="Inspect and edit tip record"
                        >
                          <span className="material-symbols-outlined text-lg">visibility</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tip Detail & Adjustment Drawer */}
      <TipDetailDrawer
        tip={activeDrawerTip}
        onClose={() => setActiveDrawerTip(null)}
        onSaved={() => loadTipsData()}
        onNavigate={onNavigate}
      />

      {/* Tips & Gratuities Operations Navigation Shortcuts Panel */}
      <TipsManagementQuickLinks activeModule="tips-ledger" onNavigate={onNavigate} />
    </div>
  );
};

export default TipsLedgerView;
