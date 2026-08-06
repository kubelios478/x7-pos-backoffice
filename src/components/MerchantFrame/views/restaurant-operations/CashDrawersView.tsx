import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  CashDrawer,
  CashDrawerStatus,
  CreateCashDrawerDto,
  CloseCashDrawerDto,
} from '../../../../types/cash-drawer';
import { CashManagementQuickLinks } from './CashManagementQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const STATUS_BADGE_CLASSES: Record<CashDrawerStatus, string> = {
  Open: 'bg-green-500/10 text-green-600',
  Close: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  Pause: 'bg-amber-500/10 text-amber-600',
  Discrepancy: 'bg-orange-500/10 text-orange-700',
};

// The backend stores balances as Postgres `decimal` columns with no server-side
// coercion, so they arrive over the wire as numeric strings (e.g. "12345.00").
// Normalize at the fetch boundary so every `CashDrawer` in state has real numbers.
export function normalizeDrawer(raw: CashDrawer): CashDrawer {
  return {
    ...raw,
    openingBalance: Number(raw.openingBalance),
    currentBalance: Number(raw.currentBalance),
    closingBalance: raw.closingBalance == null ? null : Number(raw.closingBalance),
  };
}

export function formatCurrency(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDateTime(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

interface OpenCashDrawerFormModalProps {
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (dto: CreateCashDrawerDto) => void;
}

const OpenCashDrawerFormModal: React.FC<OpenCashDrawerFormModalProps> = ({
  submitting,
  error,
  onCancel,
  onSubmit,
}) => {
  const [openingBalance, setOpeningBalance] = useState('');

  const openingBalanceNum = parseFloat(openingBalance);
  const openingBalanceValid = openingBalance.trim() !== '' && !isNaN(openingBalanceNum) && openingBalanceNum >= 0;

  const isValid = openingBalanceValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({ openingBalance: openingBalanceNum });
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Open Cash Drawer"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Open Cash Drawer</span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <p className="text-sm text-[#5f5e5e]">
              Your active shift and collaborator profile are assigned automatically.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cash-drawer-opening-balance" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Opening Balance ($)
              </label>
              <input
                id="cash-drawer-opening-balance"
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
              />
            </div>
          </div>
          {error && (
            <div className="px-6 pb-2 shrink-0">
              <p role="alert" className="text-sm text-[#ae001a] font-medium">
                {error}
              </p>
            </div>
          )}
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
              Open Drawer
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

interface CashDrawerDetailModalProps {
  drawer: CashDrawer;
  onClose: () => void;
}

const CashDrawerDetailModal: React.FC<CashDrawerDetailModalProps> = ({ drawer, onClose }) => {
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Cash Drawer Details"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">#CD-{drawer.id} Details</span>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Merchant</p>
            <p className="font-bold text-[#1d1c17]">{drawer.merchant.name}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Shift</p>
              <p>{drawer.shift.name}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Shift Window</p>
              <p>
                {formatDateTime(drawer.shift.startTime)} – {formatDateTime(drawer.shift.endTime)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Opening</p>
              <p>{formatCurrency(drawer.openingBalance)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Current</p>
              <p>{formatCurrency(drawer.currentBalance)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Closing</p>
              <p>{drawer.closingBalance == null ? '--' : formatCurrency(drawer.closingBalance)}</p>
            </div>
          </div>
          {drawer.closingBalance != null && (
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Variance</p>
              {(() => {
                const variance = drawer.closingBalance - drawer.currentBalance;
                const isBalanced = variance === 0;
                return (
                  <p className={isBalanced ? 'text-[#1d1c17]' : 'font-bold text-orange-700'}>
                    {isBalanced
                      ? formatCurrency(0)
                      : `${variance > 0 ? '+' : '-'}${formatCurrency(Math.abs(variance))}`}
                  </p>
                );
              })()}
            </div>
          )}
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Opened By</p>
            <p>
              {drawer.openedByCollaborator.name} ({drawer.openedByCollaborator.role}) —{' '}
              {formatDateTime(drawer.createdAt)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Closed By</p>
            <p>
              {drawer.closedByCollaborator
                ? `${drawer.closedByCollaborator.name} (${drawer.closedByCollaborator.role}) — ${formatDateTime(drawer.updatedAt)}`
                : 'In Service'}
            </p>
          </div>
          <div>
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[drawer.status]}`}
            >
              {drawer.status}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface CloseCashDrawerDialogProps {
  drawer: CashDrawer;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (dto: CloseCashDrawerDto) => void;
}

const CloseCashDrawerDialog: React.FC<CloseCashDrawerDialogProps> = ({
  drawer,
  submitting,
  error,
  onCancel,
  onConfirm,
}) => {
  const [closingBalance, setClosingBalance] = useState(String(drawer.currentBalance));

  const closingBalanceNum = parseFloat(closingBalance);
  const closingBalanceValid = closingBalance.trim() !== '' && !isNaN(closingBalanceNum) && closingBalanceNum >= 0;

  const isValid = closingBalanceValid;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-center p-4">
      <div className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left">
        <p className="font-bold text-[#1d1c17]">Close cash drawer #CD-{drawer.id}?</p>
        <p className="text-sm text-[#5f5e5e] mt-2">
          Enter the final closing balance. The closing operator is recorded automatically from your session.
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="close-drawer-balance" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Closing Balance ($)
            </label>
            <input
              id="close-drawer-balance"
              type="number"
              step="0.01"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
              className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-[#ae001a] font-medium mt-4">
            {error}
          </p>
        )}
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
            disabled={!isValid || submitting}
            onClick={() => onConfirm({ closingBalance: closingBalanceNum })}
            className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] disabled:opacity-40 text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
          >
            Confirm Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface CashDrawersViewProps {
  onNavigate?: (view: string) => void;
}

export const CashDrawersView: React.FC<CashDrawersViewProps> = ({ onNavigate }) => {
  const [drawers, setDrawers] = useState<CashDrawer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | CashDrawerStatus>('');
  const [shiftIdFilter, setShiftIdFilter] = useState('');
  const [debouncedShiftIdFilter, setDebouncedShiftIdFilter] = useState('');
  const latestRequestIdRef = useRef(0);
  // Handle of the pending debounce setTimeout, so clearFilters can cancel it
  // outright instead of hoping it settles into a harmless no-op later.
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set by clearFilters immediately before it changes statusFilter/
  // debouncedShiftIdFilter, but only when it knows the effect below will
  // actually rerun as a result. Lets clearFilters fire its own guaranteed
  // fetch without also getting a second, redundant one from the effect
  // noticing the same state change.
  const skipNextFilterEffectFetchRef = useRef(false);

  // Debounce the shift ID filter before it participates in the server fetch, so
  // typing multiple digits doesn't fire a request per keystroke.
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedShiftIdFilter(shiftIdFilter);
    }, 300);
    debounceTimeoutRef.current = handler;
    return () => clearTimeout(handler);
  }, [shiftIdFilter]);

  const fetchCashDrawers = async (overrides?: { status?: '' | CashDrawerStatus; shiftId?: string }) => {
    const effectiveStatus = overrides?.status ?? statusFilter;
    const effectiveShiftId = overrides?.shiftId ?? debouncedShiftIdFilter;
    const requestId = ++latestRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const params = new URLSearchParams({ limit: '100', sortBy: 'createdAt', sortOrder: 'DESC' });
      if (effectiveStatus) params.set('status', effectiveStatus);
      if (effectiveShiftId.trim()) params.set('shiftId', effectiveShiftId.trim());
      const res = await fetch(`${API_BASE}/cash-drawers?${params.toString()}`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Error al cargar las sesiones de caja');
      }

      const json = await res.json();
      // A slower, superseded request must not clobber a fresher one's result.
      if (requestId !== latestRequestIdRef.current) return;
      setDrawers((json.data ?? []).map(normalizeDrawer));
    } catch (err) {
      if (requestId !== latestRequestIdRef.current) return;
      console.error('Error fetching cash drawers:', err);
      setError('Failed to load cash drawer sessions. Please check if the backend is running.');
    } finally {
      if (requestId === latestRequestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (skipNextFilterEffectFetchRef.current) {
      // clearFilters already fired the fetch this rerun would have fired,
      // with the same (cleared) values — skip so we don't double-fetch.
      skipNextFilterEffectFetchRef.current = false;
      return;
    }
    fetchCashDrawers();
  }, [statusFilter, debouncedShiftIdFilter]);

  const filteredDrawers = React.useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return drawers;
    return drawers.filter((drawer) => {
      const sessionId = `#cd-${drawer.id}`;
      const openedByName = drawer.openedByCollaborator.name.toLowerCase();
      const closedByName = drawer.closedByCollaborator?.name.toLowerCase() ?? '';
      const shiftName = drawer.shift.name.toLowerCase();
      return (
        sessionId.includes(term) ||
        openedByName.includes(term) ||
        closedByName.includes(term) ||
        shiftName.includes(term)
      );
    });
  }, [drawers, searchQuery]);

  const hasActiveFilter = Boolean(searchQuery || statusFilter || shiftIdFilter);
  const isFilteredEmpty = !loading && !error && hasActiveFilter && filteredDrawers.length === 0;

  const clearFilters = () => {
    // Cancel any pending debounce timeout outright. If the user typed into
    // the Shift ID filter within the last 300ms, that timer is still queued
    // to commit whatever was typed into debouncedShiftIdFilter. Left alone
    // it would fire *after* this function runs — at best a harmless no-op,
    // but if the user types again immediately after clicking Clear Filters
    // it could otherwise clobber the fresh input with a stale value. Clearing
    // it here removes that risk entirely.
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    // Only force the loading state when a server-side filter (status/shiftId)
    // is actually being cleared — that's the only case that needs a refetch,
    // and would otherwise flash the true-empty state for a frame. Clearing a
    // client-side-only search filter doesn't refetch anything, so forcing
    // loading here would leave it stuck true forever.
    const hadServerFilter = Boolean(statusFilter || shiftIdFilter);
    if (hadServerFilter) {
      setLoading(true);
    }
    setSearchQuery('');

    if (hadServerFilter) {
      // Whether the fetch effect above actually reruns depends on whether
      // resetting statusFilter/debouncedShiftIdFilter to '' changes their
      // *current* value — not on shiftIdFilter (also reset here, but not an
      // effect dependency). If the user just typed a shiftId and the 300ms
      // debounce hasn't committed yet, debouncedShiftIdFilter can already be
      // '' even though shiftIdFilter (and hasActiveFilter) is not — in that
      // exact case neither dependency actually changes, so the effect would
      // never rerun and a loading=true set above would be stuck forever.
      // Don't depend on React's dependency-diffing to decide whether a fetch
      // happens: fetch explicitly, with the cleared values, every time. Only
      // pre-arm the "skip the effect's own fetch" guard when we know the
      // effect will actually fire, so we never end up firing two.
      const effectWillRerun = statusFilter !== '' || debouncedShiftIdFilter !== '';
      if (effectWillRerun) {
        skipNextFilterEffectFetchRef.current = true;
      }
      setStatusFilter('');
      setShiftIdFilter('');
      setDebouncedShiftIdFilter('');
      fetchCashDrawers({ status: '', shiftId: '' });
    } else {
      setStatusFilter('');
      setShiftIdFilter('');
      setDebouncedShiftIdFilter('');
    }
  };

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const openCreateModal = () => {
    setCreateError(null);
    setFormModalOpen(true);
  };

  const closeCreateModal = () => {
    setCreateError(null);
    setFormModalOpen(false);
  };

  const handleCreateSubmit = async (dto: CreateCashDrawerDto) => {
    setFormSubmitting(true);
    setCreateError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/cash-drawers`, {
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
        throw new Error(json.message || 'Failed to open cash drawer');
      }

      // Refetch instead of splicing the raw response into state: the list may
      // currently reflect active server-side filters (status/shiftId), and only
      // a refetch is guaranteed to stay consistent with them.
      await fetchCashDrawers();
      setFormModalOpen(false);
      setToast({ message: 'Cash drawer opened successfully', type: 'success' });
    } catch (err: any) {
      setCreateError(err.message || 'Failed to open cash drawer');
    } finally {
      setFormSubmitting(false);
    }
  };

  const [detailDrawer, setDetailDrawer] = useState<CashDrawer | null>(null);
  const [closingDrawer, setClosingDrawer] = useState<CashDrawer | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const openCloseDialog = (drawer: CashDrawer) => {
    setCloseError(null);
    setClosingDrawer(drawer);
  };

  const cancelCloseDialog = () => {
    setCloseError(null);
    setClosingDrawer(null);
  };

  const handleCloseSubmit = async (dto: CloseCashDrawerDto) => {
    if (!closingDrawer) return;
    setCloseSubmitting(true);
    setCloseError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/cash-drawers/${closingDrawer.id}`, {
        method: 'PUT',
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
        throw new Error(json.message || 'Failed to close cash drawer');
      }

      // Same reasoning as create: refetch so the list stays correct under
      // whatever status/shiftId filters are currently active.
      await fetchCashDrawers();
      setClosingDrawer(null);
      setToast({ message: 'Cash drawer closed successfully', type: 'success' });
    } catch (err: any) {
      setCloseError(err.message || 'Failed to close cash drawer');
    } finally {
      setCloseSubmitting(false);
    }
  };

  const isTrueEmpty = !loading && !error && drawers.length === 0 && !hasActiveFilter;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={() => fetchCashDrawers()}
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
            placeholder="Search by staff name, shift, or session ID..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search cash drawer sessions"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | CashDrawerStatus)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="Open">Open</option>
          <option value="Close">Close</option>
          <option value="Pause">Pause</option>
          <option value="Discrepancy">Discrepancy</option>
        </select>
        <input
          type="number"
          value={shiftIdFilter}
          onChange={(e) => setShiftIdFilter(e.target.value)}
          placeholder="Shift ID"
          className="w-28 px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by shift ID"
        />
        {hasActiveFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
          >
            Clear Filters
          </button>
        )}
        {!isTrueEmpty && (
          <button
            type="button"
            onClick={openCreateModal}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Open Cash Drawer
          </button>
        )}
      </div>

      {isTrueEmpty && (
        <div
          data-testid="cash-drawers-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">point_of_sale</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No cash drawer sessions found. Click &apos;Open Cash Drawer&apos; to initialize a new
            drawer session.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Open Cash Drawer
          </button>
        </div>
      )}

      {(loading || drawers.length > 0 || isFilteredEmpty) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              CASH DRAWER SESSIONS
            </span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredDrawers.length} sessions`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Session ID &amp; Shift
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Opening Balance
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Current Balance
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Closing Balance
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Opened By
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Closed By
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
                {loading
                  ? [1, 2, 3].map((i) => (
                      <tr key={i}>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-40" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                        <td className="px-6 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                      </tr>
                    ))
                  : isFilteredEmpty
                  ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                          <p className="text-sm text-[#5f5e5e]">No cash drawer sessions match your active filters</p>
                          <button type="button" onClick={clearFilters} className="text-[#ae001a] text-sm font-semibold hover:underline">
                            Clear filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                  : filteredDrawers.map((drawer) => (
                      <tr key={drawer.id} data-testid={`cash-drawer-row-${drawer.id}`} className="hover:bg-[#f8f3eb] transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17]">
                            #CD-{drawer.id}{' '}
                            <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-700">
                              {drawer.shift.name}
                            </span>
                          </p>
                        </td>
                        <td className="px-6 py-4">{formatCurrency(drawer.openingBalance)}</td>
                        <td className="px-6 py-4">{formatCurrency(drawer.currentBalance)}</td>
                        <td className="px-6 py-4">
                          {drawer.closingBalance == null ? '--' : formatCurrency(drawer.closingBalance)}
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-[#1d1c17]">{drawer.openedByCollaborator.name}</p>
                          <p className="text-[11px] text-[#5f5e5e] mt-1">{formatDateTime(drawer.createdAt)}</p>
                        </td>
                        <td className="px-6 py-4">
                          {drawer.closedByCollaborator ? (
                            <p className="font-semibold text-[#1d1c17]">{drawer.closedByCollaborator.name}</p>
                          ) : (
                            <span className="bg-blue-500/10 text-blue-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              In Service
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[drawer.status]}`}
                          >
                            {drawer.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setDetailDrawer(drawer)}
                              aria-label={`View cash drawer ${drawer.id} details`}
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                            >
                              <span className="material-symbols-outlined text-[20px]">visibility</span>
                            </button>
                            {drawer.status === 'Open' && (
                              <button
                                type="button"
                                onClick={() => openCloseDialog(drawer)}
                                aria-label={`Close cash drawer ${drawer.id}`}
                                className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                              >
                                <span className="material-symbols-outlined text-[20px]">lock</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CashManagementQuickLinks activeModule="cash-drawers" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={openCreateModal}
        aria-label="Quick create cash drawer"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {formModalOpen && (
        <OpenCashDrawerFormModal
          submitting={formSubmitting}
          error={createError}
          onCancel={closeCreateModal}
          onSubmit={handleCreateSubmit}
        />
      )}

      {detailDrawer && <CashDrawerDetailModal drawer={detailDrawer} onClose={() => setDetailDrawer(null)} />}

      {closingDrawer && (
        <CloseCashDrawerDialog
          drawer={closingDrawer}
          submitting={closeSubmitting}
          error={closeError}
          onCancel={cancelCloseDialog}
          onConfirm={handleCloseSubmit}
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

export default CashDrawersView;
