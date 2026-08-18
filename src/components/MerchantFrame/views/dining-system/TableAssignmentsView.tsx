import React, { useState, useEffect, useMemo } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type { DiningTable } from '../../../../types/dining-system';
import { DiningSystemQuickLinks } from './DiningSystemQuickLinks';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter, ModalFormError } from '../../shared/AppModal';
import { Toast } from '../../shared/Toast';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// El backend acepta solo estos dos valores en el DTO de creación.
const ASSIGNMENT_STATUSES = ['active', 'inactive'];

const STATUS_BADGE_STYLES: Record<string, string> = {
  active: 'bg-green-500/10 text-green-700',
  inactive: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
};

interface ShiftRef {
  id: number;
  merchantId?: number;
  startTime?: string;
  endTime?: string;
  role?: string;
  status?: string;
}

interface TableAssignment {
  id: number;
  shiftId: number;
  tableId: number;
  collaboratorId: number;
  assignedAt?: string;
  releasedAt?: string | null;
  status: string;
  // El backend carga estas relaciones en eager, así que suelen venir hidratadas.
  shift?: ShiftRef | null;
  table?: Partial<DiningTable> | null;
  collaborator?: { id: number; name?: string; firstName?: string; lastName?: string } | null;
}

const formatDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
};

const formatTimeRange = (s?: ShiftRef | null): string => {
  if (!s?.startTime) return '—';
  const start = new Date(s.startTime);
  const end = s.endTime ? new Date(s.endTime) : null;
  if (isNaN(start.getTime())) return '—';
  const t = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return end && !isNaN(end.getTime()) ? `${t(start)} – ${t(end)}` : t(start);
};

// El nombre del colaborador sale de la relación eager; si la feature COLLABORATORS no está
// concedida el backend devuelve 403 y sólo tenemos el id.
const collaboratorLabel = (a: TableAssignment): string => {
  const c = a.collaborator;
  if (!c) return `Collaborator #${a.collaboratorId}`;
  const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return c.name || full || `Collaborator #${a.collaboratorId}`;
};

// ========================= FORM DRAWER =========================

interface AssignmentFormDrawerProps {
  tables: DiningTable[];
  shifts: ShiftRef[];
  // Asignaciones vivas: una mesa no puede estar en dos manos a la vez en el mismo turno.
  activeAssignments: TableAssignment[];
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (dto: {
    shiftId: number;
    tableId: number;
    collaboratorId: number;
    status: string;
  }) => void;
}

const AssignmentFormDrawer: React.FC<AssignmentFormDrawerProps> = ({
  tables,
  shifts,
  activeAssignments,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const [shiftId, setShiftId] = useState('');
  const [tableId, setTableId] = useState('');
  const [collaboratorId, setCollaboratorId] = useState('');
  const [status, setStatus] = useState('active');

  useModalDismiss(onCancel);

  // El índice (tableId, shiftId) del backend no es único, así que el guard vive aquí:
  // asignar dos camareros a la misma mesa en el mismo turno es un error operativo.
  const duplicateError = useMemo(() => {
    if (!shiftId || !tableId) return '';
    const clash = activeAssignments.some(
      (a) =>
        String(a.shiftId) === shiftId &&
        String(a.tableId) === tableId &&
        a.status === 'active' &&
        !a.releasedAt,
    );
    if (!clash) return '';
    const t = tables.find((x) => String(x.id) === tableId);
    return `Table ${t?.number ?? tableId} is already assigned on this shift. Release the current assignment first.`;
  }, [shiftId, tableId, activeAssignments, tables]);

  const collaboratorNum = Number(collaboratorId);
  const canSubmit =
    shiftId.trim().length > 0 &&
    tableId.trim().length > 0 &&
    Number.isInteger(collaboratorNum) &&
    collaboratorNum > 0 &&
    !duplicateError;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    // assignedAt lo pone el servidor; enviarlo desde el cliente lo ignoraría.
    onSubmit({
      shiftId: Number(shiftId),
      tableId: Number(tableId),
      collaboratorId: collaboratorNum,
      status,
    });
  };

  const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase';
  const inputClass =
    'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full';

  return (
    <AppModal
      title="Assign Table"
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close assignment form"
    >
      <form
        onSubmit={handleSubmit}
        className="p-6 space-y-4 overflow-y-auto flex-1 text-left font-sans"
      >
        {formError && <ModalFormError message={formError} />}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="asg-shift" className={labelClass}>
            Shift <span className="text-[#ae001a]">*</span>
          </label>
          <select
            id="asg-shift"
            autoFocus
            value={shiftId}
            onChange={(e) => setShiftId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select a shift…</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                #{s.id} · {s.role ?? 'shift'} · {formatTimeRange(s)}
              </option>
            ))}
          </select>
          {shifts.length === 0 && (
            <p className="text-[11px] text-[#5f5e5e] italic">
              No shifts available — create a shift first.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="asg-table" className={labelClass}>
            Table <span className="text-[#ae001a]">*</span>
          </label>
          <select
            id="asg-table"
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select a table…</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.number} · {t.capacity} seats
                {t.floorZone?.name ? ` · ${t.floorZone.name}` : ''}
              </option>
            ))}
          </select>
          {duplicateError && (
            <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
              {duplicateError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="asg-collaborator" className={labelClass}>
            Collaborator ID <span className="text-[#ae001a]">*</span>
          </label>
          <input
            id="asg-collaborator"
            type="number"
            min={1}
            step={1}
            value={collaboratorId}
            onChange={(e) => setCollaboratorId(e.target.value)}
            className={`${inputClass} font-mono`}
            placeholder="e.g., 4"
          />
          {/* Honesto sobre la limitación: sin la feature de colaboradores no hay catálogo
              de nombres, así que el id se teclea a mano. */}
          <p className="text-[11px] text-[#5f5e5e]">
            The collaborator directory is not available on this plan, so the staff member is
            referenced by id.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="asg-status" className={labelClass}>
            Status
          </label>
          <select
            id="asg-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClass}
          >
            {ASSIGNMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'active' ? 'Active' : 'Inactive'}
              </option>
            ))}
          </select>
        </div>

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Assigning…' : 'Assign Table'}
          isSubmitting={submitting}
          submitDisabled={!canSubmit}
        />
      </form>
    </AppModal>
  );
};

// ========================= RELEASE CONFIRM =========================

const ConfirmReleaseDialog: React.FC<{
  assignment: TableAssignment;
  tableLabel: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ assignment, tableLabel, submitting, onCancel, onConfirm }) => {
  useModalDismiss(onCancel);
  return (
    <AppModal
      title="Release Assignment"
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="md"
      closeAriaLabel="Close release confirmation"
    >
      <div className="p-6 space-y-4 text-left font-sans">
        <p className="text-sm text-[#1d1c17]">
          Release <strong className="font-mono">{tableLabel}</strong> from{' '}
          <strong>{collaboratorLabel(assignment)}</strong>? The table becomes free for a new
          assignment on this shift.
        </p>
        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Releasing…' : 'Release Table'}
          isSubmitting={submitting}
          submitType="button"
          onSubmit={onConfirm}
          destructive
        />
      </div>
    </AppModal>
  );
};

// ========================= MAIN VIEW =========================

interface TableAssignmentsViewProps {
  onNavigate?: (view: string) => void;
  merchantId?: number;
}

export const TableAssignmentsView: React.FC<TableAssignmentsViewProps> = ({
  onNavigate,
  merchantId,
}) => {
  const activeMerchantId = merchantId ?? 1;

  const [assignments, setAssignments] = useState<TableAssignment[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [shifts, setShifts] = useState<ShiftRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [releasing, setReleasing] = useState<TableAssignment | null>(null);
  const [releaseSubmitting, setReleaseSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const authHeaders = (): Record<string, string> => {
    const token = getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const handleUnauthorized = () => {
    clearAuthSession();
    window.location.href = '/login';
  };

  const fetchAssignments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/table-assignments?limit=100`, {
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar las asignaciones');
      const json = await res.json();
      setAssignments((json.data ?? []) as TableAssignment[]);
    } catch (err) {
      console.error('Error fetching table assignments:', err);
      setError('Failed to load table assignments. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const fetchContext = async () => {
    try {
      const [tblRes, shiftRes] = await Promise.all([
        fetch(`${API_BASE}/tables?limit=100`, { headers: authHeaders() }),
        fetch(`${API_BASE}/shifts?limit=100`, { headers: authHeaders() }),
      ]);
      if (tblRes.ok) {
        const json = await tblRes.json();
        setTables(((json.data ?? []) as DiningTable[]).filter((t) => t.status !== 'deleted'));
      }
      if (shiftRes.ok) {
        const json = await shiftRes.json();
        setShifts(((json.data ?? []) as ShiftRef[]).filter((s) => s.status !== 'deleted'));
      }
    } catch (err) {
      console.error('Error fetching tables/shifts for assignments:', err);
    }
  };

  useEffect(() => {
    fetchAssignments();
    fetchContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMerchantId]);

  const tableById = useMemo(() => {
    const m = new Map<number, DiningTable>();
    tables.forEach((t) => m.set(t.id, t));
    return m;
  }, [tables]);

  const shiftById = useMemo(() => {
    const m = new Map<number, ShiftRef>();
    shifts.forEach((s) => m.set(s.id, s));
    return m;
  }, [shifts]);

  const tableLabelOf = (a: TableAssignment): string =>
    tableById.get(a.tableId)?.number ?? a.table?.number ?? `Table #${a.tableId}`;

  const filteredAssignments = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return assignments.filter((a) => {
      if (term) {
        const haystack = [tableLabelOf(a), collaboratorLabel(a), String(a.shiftId)]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (statusFilter && a.status !== statusFilter) return false;
      if (shiftFilter && String(a.shiftId) !== shiftFilter) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, tables, searchQuery, statusFilter, shiftFilter]);

  const hasActiveFilter = Boolean(searchQuery || statusFilter || shiftFilter);
  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setShiftFilter('');
  };

  const handleCreateSubmit = async (dto: {
    shiftId: number;
    tableId: number;
    collaboratorId: number;
    status: string;
  }) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      const res = await fetch(`${API_BASE}/table-assignments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(dto),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to assign the table');
      await fetchAssignments();
      setFormOpen(false);
      setToast({ message: 'Table assigned successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to assign the table');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Liberar no borra: marca releasedAt y desactiva, para conservar la traza del turno.
  const handleReleaseConfirm = async () => {
    if (!releasing) return;
    setReleaseSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/table-assignments/${releasing.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          releasedAt: new Date().toISOString(),
          status: 'inactive',
        }),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to release the assignment');
      }
      setReleasing(null);
      await fetchAssignments();
      setToast({ message: 'Assignment released successfully', type: 'success' });
    } catch (err) {
      setReleasing(null);
      setToast({
        message: err instanceof Error ? err.message : 'Failed to release the assignment',
        type: 'error',
      });
    } finally {
      setReleaseSubmitting(false);
    }
  };

  const isTrueEmpty = !loading && !error && assignments.length === 0;
  const isFilteredEmpty =
    !loading && !error && assignments.length > 0 && filteredAssignments.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchAssignments}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase">
          Table Assignments
        </h2>
        <p className="text-[#5f5e5e] text-body-sm mt-1">
          Who is serving which table on each shift, and when the table was released.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <span
            className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]"
            aria-hidden="true"
          >
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by table, collaborator or shift..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search assignments"
          />
        </div>
        <select
          value={shiftFilter}
          onChange={(e) => setShiftFilter(e.target.value)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none min-w-[150px]"
          aria-label="Filter by shift"
        >
          <option value="">All Shifts</option>
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>
              #{s.id} · {s.role ?? 'shift'}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          {ASSIGNMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'active' ? 'Active' : 'Inactive'}
            </option>
          ))}
        </select>
        {!isTrueEmpty && (
          <button
            type="button"
            onClick={() => {
              setFormError('');
              setFormOpen(true);
            }}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              assignment_ind
            </span>
            Assign Table
          </button>
        )}
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
          data-testid="table-assignments-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
            assignment_ind
          </span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No table assignments yet. Click &apos;Assign Table&apos; to put a collaborator in charge
            of a table for a shift.
          </p>
          <button
            type="button"
            onClick={() => {
              setFormError('');
              setFormOpen(true);
            }}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              assignment_ind
            </span>
            Assign Table
          </button>
        </div>
      )}

      {(loading || assignments.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              TABLE ASSIGNMENTS
            </span>
            <span className="text-white/50 text-xs">
              {loading
                ? 'Loading...'
                : `${filteredAssignments.length} ${filteredAssignments.length === 1 ? 'assignment' : 'assignments'}`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Table
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Collaborator
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Shift
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Assigned / Released
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
                        <span
                          className="material-symbols-outlined text-[#5f5e5e] text-4xl"
                          aria-hidden="true"
                        >
                          search_off
                        </span>
                        <p className="text-sm text-[#5f5e5e]">
                          No assignments match your active filters
                        </p>
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="text-[#ae001a] text-sm font-semibold hover:underline"
                        >
                          Clear filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAssignments.map((a) => {
                    const tbl = tableById.get(a.tableId);
                    const shift = shiftById.get(a.shiftId) ?? a.shift;
                    const released = Boolean(a.releasedAt);
                    return (
                      <tr key={a.id} className="group hover:bg-[#f8f3eb] transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17] font-mono">{tableLabelOf(a)}</p>
                          {tbl?.floorZone?.name && (
                            <p className="text-xs text-[#5f5e5e]">{tbl.floorZone.name}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 text-sm text-[#1d1c17]">
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                              badge
                            </span>
                            {collaboratorLabel(a)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-[#1d1c17]">
                            #{a.shiftId}
                            {shift?.role ? ` · ${shift.role}` : ''}
                          </p>
                          <p className="text-xs text-[#5f5e5e] font-mono">
                            {formatTimeRange(shift)}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs text-[#5f5e5e]">{formatDateTime(a.assignedAt)}</p>
                          <p className="text-xs text-[#5f5e5e]">
                            {released ? formatDateTime(a.releasedAt) : '— still serving'}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                              STATUS_BADGE_STYLES[a.status] ?? 'bg-[#ece8e0] text-[#1d1c17]'
                            }`}
                          >
                            {a.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => setReleasing(a)}
                            disabled={released || a.status !== 'active'}
                            aria-label={`Release ${tableLabelOf(a)}`}
                            title={
                              released ? 'Already released' : 'Release this table from the shift'
                            }
                            className="px-3 py-1.5 border border-[#e8e2d8] text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-[#1d1c17] inline-flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                              logout
                            </span>
                            Release
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

      <DiningSystemQuickLinks active="table-assignments" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={() => {
          setFormError('');
          setFormOpen(true);
        }}
        aria-label="Quick assign table"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
      >
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
          add
        </span>
      </button>

      {formOpen && (
        <AssignmentFormDrawer
          tables={tables}
          shifts={shifts}
          activeAssignments={assignments}
          submitting={formSubmitting}
          formError={formError}
          onCancel={() => setFormOpen(false)}
          onSubmit={handleCreateSubmit}
        />
      )}

      {releasing && (
        <ConfirmReleaseDialog
          assignment={releasing}
          tableLabel={tableLabelOf(releasing)}
          submitting={releaseSubmitting}
          onCancel={() => setReleasing(null)}
          onConfirm={handleReleaseConfirm}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default TableAssignmentsView;
