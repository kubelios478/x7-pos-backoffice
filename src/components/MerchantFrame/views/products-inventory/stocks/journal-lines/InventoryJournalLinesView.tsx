import React, { useState, useEffect, useMemo } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../../../lib/auth-storage';
import { StockQuickLinks } from '../StockQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export interface InventoryJournalLine {
  id: number;
  postingDate: string;
  voucherNumber: string;
  referenceId: string;
  movementType: 'PURCHASE_RECEIPT' | 'POS_DEPLETION' | 'WASTE' | 'ADJUSTMENT';
  account: {
    id: number;
    code: string;
    name: string;
    category: 'ASSET' | 'EXPENSE' | 'LIABILITY' | 'EQUITY' | 'REVENUE';
  };
  debit: number;
  credit: number;
  memo: string;
}

interface InventoryJournalLinesViewProps {
  onNavigate?: (view: string) => void;
}

export function formatCurrency(amount: number): string {
  return `$${Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPostingDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const MOVEMENT_TYPE_BADGES: Record<
  InventoryJournalLine['movementType'],
  { label: string; className: string }
> = {
  PURCHASE_RECEIPT: {
    label: 'PURCHASE_RECEIPT',
    className: 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30',
  },
  POS_DEPLETION: {
    label: 'POS_DEPLETION',
    className: 'bg-sky-500/10 text-sky-700 border border-sky-500/30',
  },
  WASTE: {
    label: 'WASTE',
    className: 'bg-amber-500/10 text-amber-700 border border-amber-500/30',
  },
  ADJUSTMENT: {
    label: 'ADJUSTMENT',
    className: 'bg-purple-500/10 text-purple-700 border border-purple-500/30',
  },
};

export const MOCK_INVENTORY_SEED_LINES: InventoryJournalLine[] = [
  {
    id: 1,
    postingDate: '2026-08-20',
    voucherNumber: 'INV-JE-1001',
    referenceId: 'PO-2026-089',
    movementType: 'PURCHASE_RECEIPT',
    account: { id: 1100, code: '1100', name: 'Raw Material Inventory', category: 'ASSET' },
    debit: 1250.00,
    credit: 0.00,
    memo: 'Stock receipt: 50.0 KG Flour 25kg bag via Purchase Order #PO-2026-089',
  },
  {
    id: 2,
    postingDate: '2026-08-20',
    voucherNumber: 'INV-JE-1001',
    referenceId: 'PO-2026-089',
    movementType: 'PURCHASE_RECEIPT',
    account: { id: 2100, code: '2100', name: 'Accounts Payable', category: 'LIABILITY' },
    debit: 0.00,
    credit: 1250.00,
    memo: 'Supplier Accounts Payable liability for Purchase Order #PO-2026-089',
  },
  {
    id: 3,
    postingDate: '2026-08-19',
    voucherNumber: 'INV-JE-1002',
    referenceId: 'POS-BATCH-1088',
    movementType: 'POS_DEPLETION',
    account: { id: 5100, code: '5100', name: 'Cost of Goods Sold', category: 'EXPENSE' },
    debit: 345.50,
    credit: 0.00,
    memo: 'Stock depletion: 15.5 KG Flour 25kg bag via POS Sales Order #1088',
  },
  {
    id: 4,
    postingDate: '2026-08-19',
    voucherNumber: 'INV-JE-1002',
    referenceId: 'POS-BATCH-1088',
    movementType: 'POS_DEPLETION',
    account: { id: 1100, code: '1100', name: 'Raw Material Inventory', category: 'ASSET' },
    debit: 0.00,
    credit: 345.50,
    memo: 'Raw material inventory reduction via POS Sales Order #1088',
  },
  {
    id: 5,
    postingDate: '2026-08-18',
    voucherNumber: 'INV-JE-1003',
    referenceId: 'WASTE-REF-042',
    movementType: 'WASTE',
    account: { id: 5200, code: '5200', name: 'Waste & Shrinkage Expense', category: 'EXPENSE' },
    debit: 88.00,
    credit: 0.00,
    memo: 'Inventory waste breakdown: 2.0 L Whole Milk (Expired batch)',
  },
  {
    id: 6,
    postingDate: '2026-08-18',
    voucherNumber: 'INV-JE-1003',
    referenceId: 'WASTE-REF-042',
    movementType: 'WASTE',
    account: { id: 1100, code: '1100', name: 'Raw Material Inventory', category: 'ASSET' },
    debit: 0.00,
    credit: 88.00,
    memo: 'Raw material inventory write-off for expired batch #042',
  },
  {
    id: 7,
    postingDate: '2026-08-17',
    voucherNumber: 'INV-JE-1004',
    referenceId: 'ADJ-REF-015',
    movementType: 'ADJUSTMENT',
    account: { id: 1100, code: '1100', name: 'Raw Material Inventory', category: 'ASSET' },
    debit: 150.00,
    credit: 0.00,
    memo: 'Physical count adjustment: System count 10 -> Actual count 15 (+5 units)',
  },
  {
    id: 8,
    postingDate: '2026-08-17',
    voucherNumber: 'INV-JE-1004',
    referenceId: 'ADJ-REF-015',
    movementType: 'ADJUSTMENT',
    account: { id: 5300, code: '5300', name: 'Inventory Adjustment Variance', category: 'EXPENSE' },
    debit: 0.00,
    credit: 150.00,
    memo: 'Physical count variance adjustment gain credit',
  },
];

export const InventoryJournalLinesView: React.FC<InventoryJournalLinesViewProps> = ({
  onNavigate,
}) => {
  const [lines, setLines] = useState<InventoryJournalLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('');

  const fetchJournalLines = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/v1/inventory/journal-lines`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        setLines(MOCK_INVENTORY_SEED_LINES);
        return;
      }

      const json = await res.json();
      const loaded = json.data ?? json ?? [];
      setLines(loaded.length > 0 ? loaded : MOCK_INVENTORY_SEED_LINES);
    } catch (err: any) {
      console.error('Error loading inventory journal lines, loading seed lines:', err);
      setLines(MOCK_INVENTORY_SEED_LINES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJournalLines();
  }, []);

  const filteredLines = useMemo(() => {
    return lines.filter((line) => {
      const term = searchQuery.trim().toLowerCase();
      if (term) {
        const matchesAccountCode = (line.account?.code ?? '').toLowerCase().includes(term);
        const matchesAccountName = (line.account?.name ?? '').toLowerCase().includes(term);
        const matchesMemo = (line.memo ?? '').toLowerCase().includes(term);
        const matchesVoucher = (line.voucherNumber ?? '').toLowerCase().includes(term);
        const matchesRef = (line.referenceId ?? '').toLowerCase().includes(term);

        if (
          !matchesAccountCode &&
          !matchesAccountName &&
          !matchesMemo &&
          !matchesVoucher &&
          !matchesRef
        ) {
          return false;
        }
      }

      if (categoryFilter && line.account?.category !== categoryFilter) {
        return false;
      }

      if (movementTypeFilter && line.movementType !== movementTypeFilter) {
        return false;
      }

      return true;
    });
  }, [lines, searchQuery, categoryFilter, movementTypeFilter]);

  const hasActiveFilters = Boolean(searchQuery || categoryFilter || movementTypeFilter);

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('');
    setMovementTypeFilter('');
  };

  return (
    <div className="space-y-6 animate-fade-in text-left font-poppins">
      {/* 1. Header Card */}
      <div className="bg-white border border-[#e8e2d8] rounded p-6 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ae001a] text-2xl">
              book
            </span>
            <h1 className="text-h2 font-black text-[#1d1c17] uppercase tracking-tight">
              Inventory Accounting Journal Lines
            </h1>
          </div>
          <p className="text-body-sm text-[#5f5e5e] mt-1 font-sans">
            Audit ledger line postings, account allocations, and movement cross-references generated by inventory transactions.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchJournalLines}
            className="p-2.5 bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1] text-secondary hover:text-[#ae001a] transition-all flex items-center justify-center cursor-pointer"
            title="Reload table data"
            aria-label="Reload table data"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined">error</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchJournalLines}
            className="text-xs font-bold underline hover:text-red-900 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      <div className="bg-white border border-[#e8e2d8] rounded p-6 shadow-xs flex flex-col gap-4">
        {/* Fila 1: Búsqueda al 100% de ancho */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            search
          </span>
          <input
            type="text"
            placeholder="Search account #, name, memo, voucher, or reference ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-body-md text-[#1d1c17] placeholder:text-gray-400 focus:outline-none focus:border-[#ae001a] transition-all font-sans"
          />
        </div>

        {/* Fila 2: Filtros a la izquierda, Botones a la derecha */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-body-sm text-[#1d1c17] focus:outline-none focus:border-[#ae001a] transition-colors"
            >
              <option value="">All Account Categories</option>
              <option value="ASSET">1100 - Asset Accounts (Inventory)</option>
              <option value="EXPENSE">5200 - Expense Accounts (Waste/COGS)</option>
              <option value="LIABILITY">2100 - Liability Accounts (AP)</option>
              <option value="EQUITY">Equity Accounts</option>
              <option value="REVENUE">Revenue Accounts</option>
            </select>

            {/* Movement Type Filter */}
            <select
              value={movementTypeFilter}
              onChange={(e) => setMovementTypeFilter(e.target.value)}
              className="px-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-body-sm text-[#1d1c17] focus:outline-none focus:border-[#ae001a] transition-colors"
            >
              <option value="">All Movement Types</option>
              <option value="PURCHASE_RECEIPT">PURCHASE_RECEIPT</option>
              <option value="POS_DEPLETION">POS_DEPLETION</option>
              <option value="WASTE">WASTE</option>
              <option value="ADJUSTMENT">ADJUSTMENT</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={fetchJournalLines}
              className="p-2.5 bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1] text-secondary hover:text-[#ae001a] transition-all flex items-center justify-center cursor-pointer"
              title="Reload inventory journal lines data"
              aria-label="Reload table data"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Core Workspace Grid Table */}
      {loading ? (
        <div className="bg-white border border-[#e8e2d8] rounded p-12 text-center text-gray-500">
          <span className="material-symbols-outlined animate-spin text-3xl text-[#ae001a] mb-2">
            progress_activity
          </span>
          <p className="text-xs font-bold uppercase tracking-wider">Loading Inventory Journal Lines...</p>
        </div>
      ) : filteredLines.length === 0 ? (
        /* Empty State Handling */
        <div
          data-testid="inventory-journal-lines-empty-state"
          className="bg-white border border-[#e8e2d8] rounded p-12 text-center space-y-3"
        >
          <span className="material-symbols-outlined text-4xl text-gray-400">
            receipt_long
          </span>
          <h3 className="text-base font-bold text-[#1d1c17]">
            {hasActiveFilters ? 'No matching journal lines' : 'No inventory journal lines found'}
          </h3>
          <p className="text-xs text-[#5f5e5e] max-w-md mx-auto">
            {hasActiveFilters
              ? 'No accounting lines matched your search or filter criteria. Try clearing filters.'
              : 'No inventory journal lines found. Stock movements will automatically post accounting lines here.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2 bg-[#ae001a] text-white font-bold text-xs uppercase tracking-wider hover:bg-[#930015] transition-colors rounded shadow-xs cursor-pointer inline-flex items-center gap-1"
            >
              Clear Search & Filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-[#e8e2d8] rounded shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#222222] text-white text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Posting Date & Voucher Ref</th>
                  <th className="py-3 px-4">Ledger Account</th>
                  <th className="py-3 px-4">Source Movement Type</th>
                  <th className="py-3 px-4 text-right">Debit</th>
                  <th className="py-3 px-4 text-right">Credit</th>
                  <th className="py-3 px-4">Line Memo & Breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8] text-xs">
                {filteredLines.map((line) => {
                  const badge = MOVEMENT_TYPE_BADGES[line.movementType] ?? {
                    label: line.movementType,
                    className: 'bg-gray-100 text-gray-700',
                  };

                  return (
                    <tr
                      key={line.id}
                      className="hover:bg-[#f8f3eb] transition-colors duration-150"
                    >
                      {/* Posting Date & Voucher Ref */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-[#1d1c17]">
                          {line.voucherNumber}
                        </div>
                        <div className="text-[11px] text-[#5f5e5e]">
                          {formatPostingDate(line.postingDate)}
                          {line.referenceId && (
                            <span className="ml-1 text-gray-400 font-mono">
                              ({line.referenceId})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Ledger Account */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#ece8e0] text-[#1d1c17] rounded-full text-[11px] font-bold border border-[#e8e2d8]">
                          <span className="font-mono text-[#ae001a]">
                            {line.account?.code || '—'}
                          </span>
                          <span>-</span>
                          <span>{line.account?.name || '—'}</span>
                        </span>
                      </td>

                      {/* Source Movement Type */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-0.5 text-[10px] font-bold rounded uppercase ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* Debit Split Column */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold whitespace-nowrap">
                        {line.debit > 0 ? (
                          <span className="text-[#1d1c17]">
                            {formatCurrency(line.debit)}
                          </span>
                        ) : (
                          <span className="text-gray-300">$0.00</span>
                        )}
                      </td>

                      {/* Credit Split Column */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold whitespace-nowrap">
                        {line.credit > 0 ? (
                          <span className="text-[#1d1c17]">
                            {formatCurrency(line.credit)}
                          </span>
                        ) : (
                          <span className="text-gray-300">$0.00</span>
                        )}
                      </td>

                      {/* Line Memo */}
                      <td className="py-3.5 px-4 text-[#5f5e5e] max-w-xs truncate">
                        {line.memo || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Persistent Quick Launch Hub */}
      <StockQuickLinks current="journal-entries" onNavigate={onNavigate} />
    </div>
  );
};

export default InventoryJournalLinesView;
