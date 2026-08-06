import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type { CashShift, CashShiftStatus, CreateCashShiftDto } from '../../../../types/cash-shift';
import type { CloseCashShiftDto } from '../../../../types/cash-shift';
import type { CashDrawer } from '../../../../types/cash-drawer';
import { CashManagementQuickLinks } from './CashManagementQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const STATUS_BADGE_CLASSES: Record<CashShiftStatus, string> = {
  OPEN: 'bg-green-500/10 text-green-600',
  CLOSED: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  DISCREPANCY: 'bg-orange-500/10 text-orange-700',
  AUDITED: 'bg-purple-500/10 text-purple-700',
};

// The backend stores balances as Postgres `decimal` columns with no server-side
// coercion, so they arrive over the wire as numeric strings (e.g. "120.00").
// Normalize at the fetch boundary so every `CashShift` in state has real numbers.
export function normalizeShift(raw: CashShift): CashShift {
  return {
    ...raw,
    openingBalance: Number(raw.openingBalance),
    systemAmount: raw.systemAmount == null ? null : Number(raw.systemAmount),
    declaredAmount: raw.declaredAmount == null ? null : Number(raw.declaredAmount),
    difference: raw.difference == null ? null : Number(raw.difference),
  };
}

export function formatCurrency(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDateTime(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function varianceColorClass(difference: number | null): string {
  if (difference == null) return 'text-[#5f5e5e]';
  if (difference === 0) return 'text-[#1d1c17]';
  return difference > 0 ? 'text-green-600 font-bold' : 'text-[#ae001a] font-bold';
}

export function formatVariance(difference: number): string {
  return difference === 0
    ? formatCurrency(0)
    : `${difference > 0 ? '+' : '-'}${formatCurrency(Math.abs(difference))}`;
}

interface CashShiftDetailModalProps {
  shift: CashShift;
  onClose: () => void;
}

const CashShiftDetailModal: React.FC<CashShiftDetailModalProps> = ({ shift, onClose }) => {
  const isOpenShift = shift.status === 'OPEN';
  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Cash Shift Details"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">#CS-{shift.id} Details</span>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Cash Drawer</p>
            <p className="font-bold text-[#1d1c17]">#CD-{shift.cashDrawerId}</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Opening</p>
              <p>{formatCurrency(shift.openingBalance)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">System</p>
              <p>
                {isOpenShift
                  ? 'Available after close'
                  : shift.systemAmount == null
                    ? '--'
                    : formatCurrency(shift.systemAmount)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Declared</p>
              <p>
                {isOpenShift
                  ? 'Available after close'
                  : shift.declaredAmount == null
                    ? '--'
                    : formatCurrency(shift.declaredAmount)}
              </p>
            </div>
          </div>
          {!isOpenShift && shift.difference != null && (
            <div>
              <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Difference</p>
              <p className={varianceColorClass(shift.difference)}>{formatVariance(shift.difference)}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Opened By</p>
            <p>
              {shift.openedByCollaborator.name} ({shift.openedByCollaborator.role}) — {formatDateTime(shift.openedAt)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Closed By</p>
            <p>
              {shift.closedByCollaborator
                ? `${shift.closedByCollaborator.name} (${shift.closedByCollaborator.role}) — ${
                    shift.closedAt ? formatDateTime(shift.closedAt) : ''
                  }`
                : 'Active Shift'}
            </p>
          </div>
          <div>
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[shift.status]}`}
            >
              {shift.status}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface OpenCashShiftFormModalProps {
  drawers: CashDrawer[];
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (dto: CreateCashShiftDto) => void;
}

const OpenCashShiftFormModal: React.FC<OpenCashShiftFormModalProps> = ({
  drawers,
  submitting,
  error,
  onCancel,
  onSubmit,
}) => {
  const [cashDrawerId, setCashDrawerId] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');

  const openingBalanceNum = parseFloat(openingBalance);
  const openingBalanceValid = openingBalance.trim() !== '' && !isNaN(openingBalanceNum) && openingBalanceNum >= 0;
  const drawerValid = cashDrawerId !== '';

  const isValid = drawerValid && openingBalanceValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({ cashDrawerId: Number(cashDrawerId), openingBalance: openingBalanceNum });
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-start overflow-y-auto p-2 md:pt-4 md:pb-12 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Open Cash Shift"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-left max-h-[90vh] flex flex-col"
      >
        <div className="bg-[#222222] p-4 text-white flex justify-between items-center shrink-0">
          <span className="font-bold text-[11px] uppercase tracking-widest">Open Cash Shift</span>
          <button type="button" onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <p className="text-sm text-[#5f5e5e]">
              The opening collaborator is assigned automatically from your session.
            </p>
            {drawers.length === 0 ? (
              <p className="text-sm text-[#ae001a]">
                No available cash drawers — all drawers are either closed or already have an active shift.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cash-shift-drawer" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                  Cash Drawer
                </label>
                <select
                  id="cash-shift-drawer"
                  value={cashDrawerId}
                  onChange={(e) => setCashDrawerId(e.target.value)}
                  className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
                >
                  <option value="">Select a cash drawer…</option>
                  {drawers.map((drawer) => (
                    <option key={drawer.id} value={drawer.id}>
                      #CD-{drawer.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cash-shift-opening-balance" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Opening Balance ($)
              </label>
              <input
                id="cash-shift-opening-balance"
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
              Open Shift
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

interface CloseCashShiftDialogProps {
  shift: CashShift;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (dto: CloseCashShiftDto) => void;
}

const CloseCashShiftDialog: React.FC<CloseCashShiftDialogProps> = ({
  shift,
  submitting,
  error,
  onCancel,
  onConfirm,
}) => {
  const [declaredAmount, setDeclaredAmount] = useState('');

  const declaredAmountNum = parseFloat(declaredAmount);
  const isValid = declaredAmount.trim() !== '' && !isNaN(declaredAmountNum) && declaredAmountNum >= 0;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-center p-4">
      <div
        role="dialog"
        aria-label="Close Cash Shift"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left"
      >
        <p className="font-bold text-[#1d1c17]">Close cash shift #CS-{shift.id}?</p>
        <p className="text-sm text-[#5f5e5e] mt-2">
          Count the physical cash in the drawer and enter it below. The system balance is not shown here — it is
          compared automatically after you submit.
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="close-shift-declared" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Declared Amount ($)
            </label>
            <input
              id="close-shift-declared"
              type="number"
              step="0.01"
              value={declaredAmount}
              onChange={(e) => setDeclaredAmount(e.target.value)}
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
            onClick={() => onConfirm({ declaredAmount: declaredAmountNum })}
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

interface CashShiftResultModalProps {
  shift: CashShift;
  onClose: () => void;
}

const CashShiftResultModal: React.FC<CashShiftResultModalProps> = ({ shift, onClose }) => {
  const difference = shift.difference ?? 0;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-center p-4">
      <div
        role="dialog"
        aria-label="Shift Closed"
        className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-sm p-6 text-left"
      >
        <p className="font-bold text-[#1d1c17]">Cash shift #CS-{shift.id} closed</p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">System Amount</p>
            <p>{shift.systemAmount == null ? '--' : formatCurrency(shift.systemAmount)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Declared Amount</p>
            <p>{shift.declaredAmount == null ? '--' : formatCurrency(shift.declaredAmount)}</p>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-[11px] font-bold text-[#5f5e5e] uppercase">Variance</p>
          <p className={varianceColorClass(difference)}>{formatVariance(difference)}</p>
        </div>
        <div className="mt-4">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[shift.status]}`}>
            {shift.status}
          </span>
        </div>
        <div className="flex justify-end mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#222222] hover:bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface CashShiftsViewProps {
  onNavigate?: (view: string) => void;
}

export const CashShiftsView: React.FC<CashShiftsViewProps> = ({ onNavigate }) => {
  const [shifts, setShifts] = useState<CashShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | CashShiftStatus>('');
  const [drawerFilter, setDrawerFilter] = useState<'' | number>('');

  const fetchCashShifts = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/cash-shifts`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Error al cargar los turnos de caja');
      }

      const json = await res.json();
      setShifts((json.data ?? []).map(normalizeShift));
    } catch (err) {
      console.error('Error fetching cash shifts:', err);
      setError('Failed to load cash shift sessions. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawerOptions = React.useMemo(
    () => Array.from(new Set(shifts.map((s) => s.cashDrawerId))).sort((a, b) => a - b),
    [shifts],
  );

  const filteredShifts = React.useMemo(() => {
    return shifts.filter((shift) => {
      if (statusFilter && shift.status !== statusFilter) return false;
      if (drawerFilter !== '' && shift.cashDrawerId !== drawerFilter) return false;
      const term = searchQuery.trim().toLowerCase();
      if (!term) return true;
      const sessionId = `#cs-${shift.id}`;
      const drawerId = `#cd-${shift.cashDrawerId}`;
      const openedByName = shift.openedByCollaborator.name.toLowerCase();
      const closedByName = shift.closedByCollaborator?.name.toLowerCase() ?? '';
      return (
        sessionId.includes(term) ||
        drawerId.includes(term) ||
        openedByName.includes(term) ||
        closedByName.includes(term)
      );
    });
  }, [shifts, searchQuery, statusFilter, drawerFilter]);

  const hasActiveFilter = Boolean(searchQuery || statusFilter || drawerFilter !== '');
  const isFilteredEmpty = !loading && !error && hasActiveFilter && filteredShifts.length === 0;
  const isTrueEmpty = !loading && !error && shifts.length === 0 && !hasActiveFilter;

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const [detailShift, setDetailShift] = useState<CashShift | null>(null);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setDrawerFilter('');
  };

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [availableDrawers, setAvailableDrawers] = useState<CashDrawer[]>([]);

  const openCreateModal = async () => {
    setCreateError(null);
    setFormModalOpen(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/cash-drawers?limit=100`, { headers });
      const json = await res.json().catch(() => ({ data: [] }));
      const openShiftDrawerIds = new Set(
        shifts.filter((s) => s.status === 'OPEN').map((s) => s.cashDrawerId),
      );
      const drawers: CashDrawer[] = (json.data ?? []).filter(
        (d: CashDrawer) => d.status === 'Open' && !openShiftDrawerIds.has(d.id),
      );
      setAvailableDrawers(drawers);
    } catch (err) {
      console.error('Error fetching cash drawers:', err);
      setAvailableDrawers([]);
    }
  };

  const closeCreateModal = () => {
    setCreateError(null);
    setFormModalOpen(false);
  };

  const handleCreateSubmit = async (dto: CreateCashShiftDto) => {
    setFormSubmitting(true);
    setCreateError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/cash-shifts`, {
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
        throw new Error(json.message || 'Failed to open cash shift');
      }

      await fetchCashShifts();
      setFormModalOpen(false);
      setToast({ message: 'Cash shift opened successfully', type: 'success' });
    } catch (err: any) {
      setCreateError(err.message || 'Failed to open cash shift');
    } finally {
      setFormSubmitting(false);
    }
  };

  const [closingShift, setClosingShift] = useState<CashShift | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [resultShift, setResultShift] = useState<CashShift | null>(null);

  const openCloseDialog = (shift: CashShift) => {
    setCloseError(null);
    setClosingShift(shift);
  };

  const cancelCloseDialog = () => {
    setCloseError(null);
    setClosingShift(null);
  };

  const handleCloseSubmit = async (dto: CloseCashShiftDto) => {
    if (!closingShift) return;
    setCloseSubmitting(true);
    setCloseError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/cash-shifts/${closingShift.id}/close`, {
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
        throw new Error(json.message || 'Failed to close cash shift');
      }

      await fetchCashShifts();
      setClosingShift(null);
      setResultShift(normalizeShift(json.data));
    } catch (err: any) {
      setCloseError(err.message || 'Failed to close cash shift');
    } finally {
      setCloseSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={() => fetchCashShifts()}
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
            placeholder="Search by staff name, drawer, or session ID..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search cash shift sessions"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | CashShiftStatus)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="DISCREPANCY">Discrepancy</option>
          <option value="AUDITED">Audited</option>
        </select>
        <select
          value={drawerFilter}
          onChange={(e) => setDrawerFilter(e.target.value === '' ? '' : Number(e.target.value))}
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
        {!isTrueEmpty && (
          <button
            type="button"
            onClick={openCreateModal}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Open Cash Shift
          </button>
        )}
      </div>

      {isTrueEmpty && (
        <div
          data-testid="cash-shifts-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">point_of_sale</span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No cashier shift sessions found. Click &apos;Open Cash Shift&apos; to start a new cashier session.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Open Cash Shift
          </button>
        </div>
      )}

      {(loading || shifts.length > 0 || isFilteredEmpty) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">CASH SHIFT SESSIONS</span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredShifts.length} sessions`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Session ID &amp; Drawer
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Opening Balance
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    System Total
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Declared Amount
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Variance
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
                      <td colSpan={9} className="px-6 py-10 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                          <p className="text-sm text-[#5f5e5e]">No cash shift sessions match your active filters</p>
                          <button type="button" onClick={clearFilters} className="text-[#ae001a] text-sm font-semibold hover:underline">
                            Clear filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                  : filteredShifts.map((shift) => (
                      <tr key={shift.id} data-testid={`cash-shift-row-${shift.id}`} className="hover:bg-[#f8f3eb] transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17]">
                            #CS-{shift.id}{' '}
                            <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-700">
                              #CD-{shift.cashDrawerId}
                            </span>
                          </p>
                        </td>
                        <td className="px-6 py-4">{formatCurrency(shift.openingBalance)}</td>
                        <td className="px-6 py-4">
                          {shift.status === 'OPEN'
                            ? '--'
                            : shift.systemAmount == null
                              ? '--'
                              : formatCurrency(shift.systemAmount)}
                        </td>
                        <td className="px-6 py-4">
                          {shift.declaredAmount == null ? '--' : formatCurrency(shift.declaredAmount)}
                        </td>
                        <td className={`px-6 py-4 ${varianceColorClass(shift.difference)}`}>
                          {shift.difference == null ? '--' : formatVariance(shift.difference)}
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-[#1d1c17]">{shift.openedByCollaborator.name}</p>
                          <p className="text-[11px] text-[#5f5e5e] mt-1">{formatDateTime(shift.openedAt)}</p>
                        </td>
                        <td className="px-6 py-4">
                          {shift.closedByCollaborator ? (
                            <p className="font-semibold text-[#1d1c17]">{shift.closedByCollaborator.name}</p>
                          ) : (
                            <span className="bg-blue-500/10 text-blue-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                              Active Shift
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_BADGE_CLASSES[shift.status]}`}
                          >
                            {shift.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setDetailShift(shift)}
                              aria-label={`View cash shift ${shift.id} details`}
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors"
                            >
                              <span className="material-symbols-outlined text-[20px]">visibility</span>
                            </button>
                            {shift.status === 'OPEN' && (
                              <button
                                type="button"
                                onClick={() => openCloseDialog(shift)}
                                aria-label={`Close cash shift ${shift.id}`}
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

      <CashManagementQuickLinks activeModule="cash-shifts" onNavigate={onNavigate} />

      {detailShift && <CashShiftDetailModal shift={detailShift} onClose={() => setDetailShift(null)} />}

      {formModalOpen && (
        <OpenCashShiftFormModal
          drawers={availableDrawers}
          submitting={formSubmitting}
          error={createError}
          onCancel={closeCreateModal}
          onSubmit={handleCreateSubmit}
        />
      )}

      {closingShift && (
        <CloseCashShiftDialog
          shift={closingShift}
          submitting={closeSubmitting}
          error={closeError}
          onCancel={cancelCloseDialog}
          onConfirm={handleCloseSubmit}
        />
      )}

      {resultShift && <CashShiftResultModal shift={resultShift} onClose={() => setResultShift(null)} />}

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

export default CashShiftsView;
