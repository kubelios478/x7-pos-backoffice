import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  CashDrawerHistory,
  CashDrawerHistoryStatus,
} from '../../../../types/cash-drawer-history';
import { CashManagementQuickLinks } from './CashManagementQuickLinks';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// ─── Pure Helpers (exported for unit tests) ────────────────────────────────

export function formatHistoryCurrency(n: number): string {
  return `$${Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatHistoryDateTime(value: string | Date): string {
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatHistoryDate(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function computeNetVariance(opening: number, closing: number): number {
  return closing - opening;
}

export function getVarianceColorClass(variance: number): string {
  if (variance > 0) return 'text-green-600 font-black tabular-nums';
  if (variance < 0) return 'text-amber-600 font-black tabular-nums';
  return 'text-[#5f5e5e] font-black tabular-nums';
}

export function normalizeHistoryRecord(raw: CashDrawerHistory): CashDrawerHistory {
  return {
    ...raw,
    openingBalance: Number(raw.openingBalance),
    closingBalance: Number(raw.closingBalance),
  };
}

/** Returns { from, to } ISO date strings defaulting to the last 30 calendar days. */
export function getDefaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { from: fmt(from), to: fmt(to) };
}

// ─── Drawer Option shape for the selector banner ───────────────────────────

interface DrawerOption {
  id: number;
}

// ─── Drawer Selector Banner ────────────────────────────────────────────────

interface DrawerSelectorProps {
  drawers: DrawerOption[];
  selectedDrawerId: number | null;
  loading: boolean;
  onSelect: (id: number) => void;
}

const DrawerSelector: React.FC<DrawerSelectorProps> = ({
  drawers,
  selectedDrawerId,
  loading,
  onSelect,
}) => (
  <div className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm">
    <div className="flex items-center gap-3 mb-3">
      <span className="material-symbols-outlined text-[#ae001a] text-[20px]">point_of_sale</span>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
          Drawer Context
        </p>
        <p className="text-sm font-bold text-[#1d1c17]">
          Select a Cash Drawer to inspect its historical snapshots
        </p>
      </div>
    </div>

    {loading ? (
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-20 bg-[#ece8e0] rounded animate-pulse" />
        ))}
      </div>
    ) : drawers.length === 0 ? (
      <p className="text-sm text-[#5f5e5e] italic">
        No cash drawers found for this merchant.
      </p>
    ) : (
      <div className="flex flex-wrap gap-2">
        {drawers.map((drawer) => {
          const isSelected = drawer.id === selectedDrawerId;
          return (
            <button
              key={drawer.id}
              type="button"
              onClick={() => onSelect(drawer.id)}
              aria-pressed={isSelected}
              className={`px-3 py-1.5 rounded border text-[11px] font-bold uppercase tracking-wide transition-all ${
                isSelected
                  ? 'bg-[#222222] text-white border-[#222222]'
                  : 'bg-[#fef9f1] text-[#1d1c17] border-[#e8e2d8] hover:border-[#ae001a] hover:text-[#ae001a]'
              }`}
            >
              #CD-{drawer.id}
            </button>
          );
        })}
      </div>
    )}
  </div>
);

// ─── Status Badge ──────────────────────────────────────────────────────────

const HISTORY_STATUS_BADGE: Record<CashDrawerHistoryStatus, string> = {
  active: 'bg-green-500/10 text-green-600 border border-green-500/20',
  deleted: 'bg-[#5f5e5e]/20 text-[#5f5e5e] border border-[#5f5e5e]/20',
};

// ─── Collaborator Avatar ───────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

interface CollaboratorAvatarProps {
  name: string;
  role?: string;
}

const CollaboratorAvatar: React.FC<CollaboratorAvatarProps> = ({ name, role }) => (
  <div className="flex items-center gap-3">
    <div className="w-9 h-9 rounded-full bg-[#222222] flex items-center justify-center shrink-0">
      <span className="text-white text-[12px] font-black">{getInitials(name)}</span>
    </div>
    <div className="min-w-0">
      <p className="font-bold text-[#1d1c17] text-sm leading-none">{name}</p>
      {role && (
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] mt-0.5 inline-block">
          {role}
        </span>
      )}
    </div>
  </div>
);

// ─── Read-Only Field ───────────────────────────────────────────────────────

interface ReadOnlyFieldProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

const ReadOnlyField: React.FC<ReadOnlyFieldProps> = ({ label, value, mono }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">{label}</span>
    <span
      className={`text-sm text-[#1d1c17] font-semibold select-text ${
        mono ? 'font-mono' : ''
      }`}
      aria-readonly="true"
    >
      {value}
    </span>
  </div>
);

// ─── Audit Inspection Drawer ───────────────────────────────────────────────

interface AuditInspectionDrawerProps {
  snapshot: CashDrawerHistory;
  onClose: () => void;
}

const AuditInspectionDrawer: React.FC<AuditInspectionDrawerProps> = ({ snapshot, onClose }) => {
  const variance = computeNetVariance(snapshot.openingBalance, snapshot.closingBalance);

  // Keyboard: close on Escape
  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex justify-end font-sans">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Audit Inspection — Snapshot #CDH-${snapshot.id}`}
        className="relative w-full max-w-lg bg-[#fcfbfa] h-full shadow-2xl z-10 flex flex-col border-l border-[#e8e2d8] animate-slide-in text-left"
      >
        {/* ── Panel Header ──────────────────────────────────────────────────── */}
        <div className="bg-[#222222] px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-white text-xl">verified_user</span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">
                Audit Inspection
              </p>
              <p className="text-[13px] font-black uppercase tracking-wide text-white leading-none">
                History Snapshot
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspection drawer"
            className="text-white/60 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* ── Scrollable Body ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Snapshot Identity Header ─────────────────────────────────────── */}
          <div className="px-6 py-5 border-b border-[#e8e2d8] bg-white">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-1">
                  History Snapshot ID
                </p>
                <p className="text-2xl font-black text-[#1d1c17] font-mono leading-none">
                  #CDH-{snapshot.id}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 font-mono">
                    <span className="material-symbols-outlined text-[12px]">point_of_sale</span>
                    #CD-{snapshot.cashDrawerId}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                      HISTORY_STATUS_BADGE[snapshot.status] ??
                      'bg-[#5f5e5e]/20 text-[#5f5e5e]'
                    }`}
                  >
                    {snapshot.status}
                  </span>
                </div>
              </div>
              {/* Immutability guard badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#ece8e0] border border-[#e8e2d8] rounded text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] shrink-0">
                <span className="material-symbols-outlined text-[13px]">lock</span>
                Read-Only
              </div>
            </div>

            {/* Timestamps strip */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <ReadOnlyField
                label="Created At"
                value={formatHistoryDateTime(snapshot.createdAt)}
                mono
              />
              <ReadOnlyField
                label="Last Updated At"
                value={formatHistoryDateTime(snapshot.updatedAt)}
                mono
              />
            </div>
          </div>

          {/* ── Balance & Custody Summary ─────────────────────────────────────── */}
          <div className="px-6 pt-5 pb-4 space-y-5">

            {/* Opening Balance Snapshot */}
            <div className="bg-white border border-[#e8e2d8] rounded overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#ece8e0] border-b border-[#e8e2d8]">
                <span className="material-symbols-outlined text-[16px] text-[#5f5e5e]">lock_open</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Opening Balance Snapshot
                </span>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Balance
                  </span>
                  <span className="text-xl font-black text-[#1d1c17] font-mono tabular-nums">
                    {formatHistoryCurrency(snapshot.openingBalance)}
                  </span>
                </div>
                <div className="border-t border-[#e8e2d8] pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-2">
                    Opened By
                  </p>
                  <CollaboratorAvatar
                    name={snapshot.openedByCollaborator?.name ?? `#OP-${snapshot.openedBy}`}
                    role={snapshot.openedByCollaborator?.role}
                  />
                </div>
                <ReadOnlyField
                  label="Opening Timestamp (created_at)"
                  value={formatHistoryDateTime(snapshot.createdAt)}
                  mono
                />
              </div>
            </div>

            {/* Closing Balance Snapshot */}
            <div className="bg-white border border-[#e8e2d8] rounded overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#ece8e0] border-b border-[#e8e2d8]">
                <span className="material-symbols-outlined text-[16px] text-[#5f5e5e]">lock</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Closing Balance Snapshot
                </span>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Balance
                  </span>
                  <span className="text-xl font-black text-[#1d1c17] font-mono tabular-nums">
                    {formatHistoryCurrency(snapshot.closingBalance)}
                  </span>
                </div>
                <div className="border-t border-[#e8e2d8] pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-2">
                    Closed By
                  </p>
                  {snapshot.closedByCollaborator ? (
                    <CollaboratorAvatar
                      name={snapshot.closedByCollaborator.name}
                      role={snapshot.closedByCollaborator.role}
                    />
                  ) : (
                    <p className="text-sm text-[#5f5e5e] italic">Session not yet closed</p>
                  )}
                </div>
                <ReadOnlyField
                  label="Closing Timestamp (updated_at)"
                  value={formatHistoryDateTime(snapshot.updatedAt)}
                  mono
                />
              </div>
            </div>

            {/* Session Net Difference */}
            <div className="bg-white border border-[#e8e2d8] rounded overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#222222] border-b border-[#333333]">
                <span className="material-symbols-outlined text-[16px] text-white/60">
                  {variance > 0 ? 'trending_up' : variance < 0 ? 'trending_down' : 'remove'}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">
                  Session Net Difference
                </span>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                      closing − opening
                    </p>
                    <p className="text-[11px] text-[#5f5e5e] mt-0.5 font-mono">
                      {formatHistoryCurrency(snapshot.closingBalance)} −{' '}
                      {formatHistoryCurrency(snapshot.openingBalance)}
                    </p>
                  </div>
                  <div
                    className={`text-2xl font-black font-mono tabular-nums ${
                      variance > 0
                        ? 'text-green-600'
                        : variance < 0
                        ? 'text-amber-600'
                        : 'text-[#5f5e5e]'
                    }`}
                  >
                    {variance >= 0 ? '+' : ''}{formatHistoryCurrency(variance)}
                  </div>
                </div>
                {/* Variance pill */}
                <div className="mt-3 pt-3 border-t border-[#e8e2d8]">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded ${
                      variance > 0
                        ? 'bg-green-500/10 text-green-700 border border-green-500/20'
                        : variance < 0
                        ? 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                        : 'bg-[#5f5e5e]/10 text-[#5f5e5e] border border-[#5f5e5e]/20'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[12px]">
                      {variance > 0 ? 'trending_up' : variance < 0 ? 'trending_down' : 'horizontal_rule'}
                    </span>
                    {variance > 0 ? 'Cash Surplus' : variance < 0 ? 'Cash Deficit' : 'Balanced Session'}
                  </span>
                </div>
              </div>
            </div>

            {/* Raw Entity IDs — reference-only */}
            <div className="bg-[#fef9f1] border border-[#e8e2d8] rounded p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                Entity References
              </p>
              <div className="grid grid-cols-2 gap-3">
                <ReadOnlyField label="Snapshot ID" value={`#CDH-${snapshot.id}`} mono />
                <ReadOnlyField label="Cash Drawer ID" value={`#CD-${snapshot.cashDrawerId}`} mono />
                <ReadOnlyField label="Opened By (ID)" value={`#OP-${snapshot.openedBy}`} mono />
                <ReadOnlyField
                  label="Closed By (ID)"
                  value={snapshot.closedBy !== null ? `#OP-${snapshot.closedBy}` : '—'}
                  mono
                />
              </div>
            </div>

          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div className="bg-[#f5efe6] border-t border-[#e8e2d8] px-6 py-4 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">
            <span className="material-symbols-outlined text-[14px]">verified_user</span>
            Immutable Audit Record
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#222222] hover:bg-black text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
          >
            Close Inspection
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Main View ─────────────────────────────────────────────────────────────

interface CashDrawerHistoryViewProps {
  onNavigate?: (view: string) => void;
}

export const CashDrawerHistoryView: React.FC<CashDrawerHistoryViewProps> = ({ onNavigate }) => {
  // ── Drawer selection ──────────────────────────────────────────────────
  const [drawers, setDrawers] = useState<DrawerOption[]>([]);
  const [drawersLoading, setDrawersLoading] = useState(true);
  const [selectedDrawerId, setSelectedDrawerId] = useState<number | null>(null);

  // ── Audit Inspection Drawer ───────────────────────────────────────────
  const [inspectedSnapshot, setInspectedSnapshot] = useState<CashDrawerHistory | null>(null);

  // ── Records (all fetched; date filtering is client-side) ──────────────
  const [records, setRecords] = useState<CashDrawerHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Filters ───────────────────────────────────────────────────────────
  const defaultRange = getDefaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  // Backend status enum values are lowercase: 'active' | 'deleted'
  const [statusFilter, setStatusFilter] = useState<'' | CashDrawerHistoryStatus>('active');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Load available drawers ─────────────────────────────────────────────
  useEffect(() => {
    const fetchDrawers = async () => {
      setDrawersLoading(true);
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}/cash-drawers?limit=100`, { headers });

        if (res.status === 401) {
          clearAuthSession();
          window.location.href = '/login';
          return;
        }

        if (res.ok) {
          const json = await res.json();
          const list: DrawerOption[] = (json.data ?? []).map((d: { id: number }) => ({ id: d.id }));
          setDrawers(list);
          if (list.length > 0) setSelectedDrawerId(list[0].id);
        }
      } catch (err) {
        console.error('Error fetching cash drawers:', err);
      } finally {
        setDrawersLoading(false);
      }
    };
    fetchDrawers();
  }, []);

  // ── Load history records ───────────────────────────────────────────────
  // The backend supports: cashDrawerId, status, page, limit, sortBy, sortOrder.
  // Date filtering is done client-side against createdAt since the API only
  // supports a single `createdDate` param (not a range).
  const fetchRecords = useCallback(async () => {
    if (selectedDrawerId === null) return;
    setLoading(true);
    setError(null);

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const params = new URLSearchParams({
        cashDrawerId: String(selectedDrawerId),
        limit: '100',
        sortBy: 'createdAt',
        sortOrder: 'DESC',
        ...(statusFilter ? { status: statusFilter } : {}),
      });

      const res = await fetch(
        `${API_BASE}/cash-drawer-history?${params.toString()}`,
        { headers },
      );

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      setRecords((json.data ?? []).map(normalizeHistoryRecord));
    } catch (err) {
      console.error('Error fetching cash drawer history:', err);
      setError('Failed to load cash drawer history records.');
    } finally {
      setLoading(false);
    }
  }, [selectedDrawerId, statusFilter]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // ── Client-side filtering: search + date range ────────────────────────
  const filteredRecords = React.useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    // Add 1 day to `to` so the entire day is included
    const toTs = dateTo
      ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1
      : null;

    let result = records;

    // Date range filter
    if (fromTs !== null || toTs !== null) {
      result = result.filter((r) => {
        const ts = new Date(r.createdAt).getTime();
        if (fromTs !== null && ts < fromTs) return false;
        if (toTs !== null && ts > toTs) return false;
        return true;
      });
    }

    // Text search
    const term = searchQuery.trim().toLowerCase();
    if (!term) return result;

    return result.filter((r) => {
      const cdhRef = `#cdh-${r.id}`;
      const cdRef = `#cd-${r.cashDrawerId}`;
      const openedName = r.openedByCollaborator?.name?.toLowerCase() ?? '';
      const closedName = r.closedByCollaborator?.name?.toLowerCase() ?? '';
      return (
        cdhRef.includes(term) ||
        cdRef.includes(term) ||
        String(r.id).includes(term) ||
        openedName.includes(term) ||
        closedName.includes(term)
      );
    });
  }, [records, searchQuery, dateFrom, dateTo]);

  const isFilteredEmpty = !loading && filteredRecords.length === 0 && records.length > 0;
  const isTrueEmpty = !loading && !error && records.length === 0;
  const hasSearchFilter = Boolean(searchQuery);

  const hasNonDefaultFilter =
    searchQuery !== '' ||
    statusFilter !== 'active' ||
    dateFrom !== defaultRange.from ||
    dateTo !== defaultRange.to;

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('active');
    const range = getDefaultDateRange();
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-[#222222] rounded flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white text-[18px]">history</span>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                Cash Management
              </p>
              <h1 className="text-[#1d1c17] font-black text-xl uppercase tracking-tight leading-none">
                Drawer History
              </h1>
            </div>
          </div>
          <p className="text-sm text-[#5f5e5e] mt-2 ml-12">
            Closed cash drawer session snapshots. Inspect opening and closing balances,
            session operators, and net cash flow variance across historical drawer sessions.
          </p>
        </div>

        {/* Audit badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#ece8e0] border border-[#e8e2d8] rounded text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] self-start shrink-0">
          <span className="material-symbols-outlined text-[14px]">verified_user</span>
          Audit Directory
        </div>
      </div>

      {/* ── Drawer Selector ───────────────────────────────────────────────── */}
      <DrawerSelector
        drawers={drawers}
        selectedDrawerId={selectedDrawerId}
        loading={drawersLoading}
        onSelect={(id) => {
          setSelectedDrawerId(id);
          setRecords([]);
          setError(null);
        }}
      />

      {/* ── No Drawer Selected ────────────────────────────────────────────── */}
      {selectedDrawerId === null && !drawersLoading && (
        <div
          data-testid="cdh-no-drawer-selected"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm gap-4"
        >
          <div className="w-16 h-16 rounded-full bg-[#fef9f1] border border-[#e8e2d8] flex items-center justify-center">
            <span className="material-symbols-outlined text-[#d51f2c] text-3xl">point_of_sale</span>
          </div>
          <div>
            <p className="text-[#1d1c17] font-bold text-base mb-1">No Drawer Selected</p>
            <p className="text-[#5f5e5e] max-w-md text-sm leading-relaxed">
              Select a cash drawer above to load its historical session snapshots.
            </p>
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      {selectedDrawerId !== null && (
        <>
          {/* Filter Bar */}
          <div className="bg-white border border-[#e8e2d8] p-4 rounded shadow-sm flex flex-wrap items-center gap-3">

            {/* Search */}
            <div className="relative flex-1 min-w-[220px]">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]">
                search
              </span>
              <input
                id="cdh-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by collaborator, #CD-id, or #CDH-id…"
                className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
                aria-label="Search cash drawer history snapshots"
              />
            </div>

            {/* Status selector */}
            <select
              id="cdh-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | CashDrawerHistoryStatus)}
              className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
              aria-label="Filter by snapshot status"
            >
              <option value="active">Active Only</option>
              <option value="deleted">Deleted Only</option>
              <option value="">All Statuses</option>
            </select>

            {/* Date From */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="cdh-date-from"
                className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap"
              >
                From
              </label>
              <input
                id="cdh-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
                aria-label="Filter from date"
              />
            </div>

            {/* Date To */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="cdh-date-to"
                className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap"
              >
                To
              </label>
              <input
                id="cdh-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
                aria-label="Filter to date"
              />
            </div>

            {/* Clear Filters */}
            {hasNonDefaultFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Error state */}
          {error && (
            <div className="border border-red-300 bg-red-50 p-8 text-center rounded">
              <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
                error
              </span>
              <p className="mt-3 text-red-700 font-medium">{error}</p>
              <button
                type="button"
                onClick={() => fetchRecords()}
                className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
              >
                Retry Connection
              </button>
            </div>
          )}

          {/* True empty state */}
          {isTrueEmpty && !error && (
            <div
              data-testid="cdh-empty-state"
              className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm gap-4"
            >
              <div className="w-16 h-16 rounded-full bg-[#fef9f1] border border-[#e8e2d8] flex items-center justify-center">
                <span className="material-symbols-outlined text-[#5f5e5e] text-3xl">history_toggle_off</span>
              </div>
              <div>
                <p className="text-[#1d1c17] font-bold text-base mb-1">No Snapshots Found</p>
                <p className="text-[#5f5e5e] max-w-md text-sm leading-relaxed">
                  No historical drawer session snapshots found for the selected date range or cash
                  drawer.
                </p>
              </div>
            </div>
          )}

          {/* Data Grid */}
          {(loading || records.length > 0 || isFilteredEmpty) && !error && (
            <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">

              {/* Grid header bar */}
              <div className="p-4 bg-[#222222] flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-white/60 text-[16px]">history</span>
                  <span className="text-[11px] font-bold text-white uppercase tracking-widest">
                    Cash Drawer History Snapshots
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white/50 text-xs tabular-nums">
                    {loading
                      ? 'Loading…'
                      : `${filteredRecords.length} snapshot${filteredRecords.length !== 1 ? 's' : ''}`}
                  </span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/10 text-white/70">
                    #CD-{selectedDrawerId}
                  </span>
                </div>
              </div>

              {/* Date range info strip */}
              <div className="px-4 py-2 bg-[#ece8e0] border-b border-[#e8e2d8] flex items-center gap-2 text-[11px] text-[#5f5e5e]">
                <span className="material-symbols-outlined text-[14px]">date_range</span>
                <span className="font-bold uppercase tracking-widest">Date Range:</span>
                <span>{formatHistoryDate(dateFrom)} — {formatHistoryDate(dateTo)}</span>
                <span className="text-[#5f5e5e]/60 ml-2">· Client-side filter on createdAt</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                    <tr>
                      <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap">
                        Snapshot Ref
                      </th>
                      <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap">
                        Cash Drawer
                      </th>
                      <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap">
                        Opening Balance
                      </th>
                      <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap">
                        Closing Balance
                      </th>
                      <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap">
                        Net Variance
                      </th>
                      <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap">
                        Opened By
                      </th>
                      <th className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap">
                        Closed By
                      </th>
                      <th className="px-5 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap">
                        Status
                      </th>
                      <th className="px-5 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] whitespace-nowrap">
                        Inspect
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e2d8]">
                    {loading
                      ? [1, 2, 3].map((i) => (
                          <tr key={i}>
                            <td className="px-5 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" /></td>
                            <td className="px-5 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-16" /></td>
                            <td className="px-5 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 ml-auto" /></td>
                            <td className="px-5 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20 ml-auto" /></td>
                            <td className="px-5 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-16 ml-auto" /></td>
                            <td className="px-5 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-28" /></td>
                            <td className="px-5 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-28" /></td>
                            <td className="px-5 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-14 mx-auto" /></td>
                            <td className="px-5 py-4"><div className="h-4 bg-[#ece8e0] rounded animate-pulse w-24 mx-auto" /></td>
                          </tr>
                        ))
                      : isFilteredEmpty
                      ? (
                        <tr>
                          <td colSpan={9} className="px-6 py-12 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">search_off</span>
                              <p className="text-sm text-[#5f5e5e]">
                                No snapshots match your active filters
                              </p>
                              {hasSearchFilter && (
                                <button
                                  type="button"
                                  onClick={() => setSearchQuery('')}
                                  className="text-[#ae001a] text-sm font-semibold hover:underline"
                                >
                                  Clear search
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                      : filteredRecords.map((record) => {
                          const variance = computeNetVariance(
                            record.openingBalance,
                            record.closingBalance,
                          );
                          const isDeleted = record.status === 'deleted';

                          return (
                            <tr
                              key={record.id}
                              data-testid={`cdh-row-${record.id}`}
                              onClick={() => setInspectedSnapshot(record)}
                              className={`transition-colors cursor-pointer ${
                                isDeleted
                                  ? 'bg-[#fafafa] opacity-70 hover:opacity-90'
                                  : 'hover:bg-[#f8f3eb]'
                              }`}
                            >
                              {/* Snapshot Ref */}
                              <td className="px-5 py-4">
                                <p
                                  className={`font-black text-[#1d1c17] text-sm font-mono ${
                                    isDeleted ? 'line-through text-[#5f5e5e]' : ''
                                  }`}
                                >
                                  #CDH-{record.id}
                                </p>
                                <p className="text-[11px] text-[#5f5e5e] mt-0.5">
                                  {formatHistoryDateTime(record.createdAt)}
                                </p>
                              </td>

                              {/* Cash Drawer */}
                              <td className="px-5 py-4">
                                <span className="inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 font-mono">
                                  #CD-{record.cashDrawerId}
                                </span>
                              </td>

                              {/* Opening Balance */}
                              <td className="px-5 py-4 text-right">
                                <span className="font-mono font-semibold text-[#1d1c17]">
                                  {formatHistoryCurrency(record.openingBalance)}
                                </span>
                              </td>

                              {/* Closing Balance */}
                              <td className="px-5 py-4 text-right">
                                <span className="font-mono font-semibold text-[#1d1c17]">
                                  {formatHistoryCurrency(record.closingBalance)}
                                </span>
                              </td>

                              {/* Net Variance */}
                              <td className="px-5 py-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <span
                                    className={`material-symbols-outlined text-[14px] ${
                                      variance > 0
                                        ? 'text-green-600'
                                        : variance < 0
                                        ? 'text-amber-600'
                                        : 'text-[#5f5e5e]'
                                    }`}
                                  >
                                    {variance > 0
                                      ? 'trending_up'
                                      : variance < 0
                                      ? 'trending_down'
                                      : 'remove'}
                                  </span>
                                  <span className={getVarianceColorClass(variance)}>
                                    {variance >= 0 ? '+' : ''}
                                    {formatHistoryCurrency(variance)}
                                  </span>
                                </div>
                              </td>

                              {/* Opened By */}
                              <td className="px-5 py-4">
                                <p className="font-semibold text-[#1d1c17] text-sm">
                                  {record.openedByCollaborator?.name ?? `#OP-${record.openedBy}`}
                                </p>
                                {record.openedByCollaborator?.role && (
                                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-[#222222]/8 rounded text-[#5f5e5e] mt-0.5 inline-block">
                                    {record.openedByCollaborator.role}
                                  </span>
                                )}
                              </td>

                              {/* Closed By */}
                              <td className="px-5 py-4">
                                {record.closedByCollaborator ? (
                                  <>
                                    <p className="font-semibold text-[#1d1c17] text-sm">
                                      {record.closedByCollaborator.name}
                                    </p>
                                    {record.closedByCollaborator.role && (
                                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-[#222222]/8 rounded text-[#5f5e5e] mt-0.5 inline-block">
                                        {record.closedByCollaborator.role}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-[#5f5e5e] text-sm">—</span>
                                )}
                              </td>

                              {/* Status Badge */}
                              <td className="px-5 py-4 text-center">
                                <span
                                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                                    HISTORY_STATUS_BADGE[record.status] ??
                                    'bg-[#5f5e5e]/20 text-[#5f5e5e]'
                                  } ${isDeleted ? 'line-through' : ''}`}
                                >
                                  {record.status}
                                </span>
                              </td>

                              {/* Actions — stopPropagation so row click doesn't double-fire */}
                              <td
                                className="px-5 py-4 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  data-testid={`cdh-inspect-${record.id}`}
                                  onClick={() => setInspectedSnapshot(record)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#e8e2d8] text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:border-[#ae001a] hover:text-[#ae001a] transition-colors rounded"
                                  aria-label={`View audit snapshot for #CDH-${record.id}`}
                                >
                                  <span className="material-symbols-outlined text-[13px]">manage_search</span>
                                  View Audit Snapshot
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Index info note */}
          {!loading && !error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-white border border-[#e8e2d8] rounded text-[11px] text-[#5f5e5e]">
              <span className="material-symbols-outlined text-[16px] text-[#ae001a]">bolt</span>
              <span>
                <strong className="text-[#1d1c17]">Indexed Query:</strong> Records fetched using
                composite index on{' '}
                <code className="bg-[#ece8e0] px-1 rounded font-mono">
                  [cash_drawer_id, status, created_at]
                </code>
                . Date range applied client-side.
              </span>
            </div>
          )}
        </>
      )}

      {/* Quick Links */}
      <CashManagementQuickLinks activeModule="cash-drawer-history" onNavigate={onNavigate} />

      {/* ── Audit Inspection Drawer (Portal) ─────────────────────────────── */}
      {inspectedSnapshot && (
        <AuditInspectionDrawer
          snapshot={inspectedSnapshot}
          onClose={() => setInspectedSnapshot(null)}
        />
      )}
    </div>
  );
};

export default CashDrawerHistoryView;
