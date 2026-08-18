import React, { useState, useEffect, useMemo } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  DiningTable,
  FloorPlan,
  FloorZone,
  FloorZoneStatus,
  CreateFloorZoneDto,
  UpdateFloorZoneDto,
} from '../../../../types/dining-system';
import {
  DEFAULT_ZONE_COLOR,
  FLOOR_ZONE_STATUSES,
  FLOOR_ZONE_STATUS_LABELS,
  FLOOR_ZONE_STATUS_BADGE_STYLES,
  duplicateZoneNameError,
  floorZoneMutationGuard,
  normalizeFloorPlanStatus,
  normalizeFloorZoneStatus,
  zoneSwatchColor,
} from '../../../../types/dining-system';
import { DiningSystemQuickLinks } from './DiningSystemQuickLinks';
import { FloorPlanEditor } from './FloorPlanEditor';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter, ModalFormError } from '../../shared/AppModal';
import { Toast } from '../../shared/Toast';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

const pluralize = (n: number, singular: string, plural: string): string =>
  `${n} ${n === 1 ? singular : plural}`;

// El censo de mesas cuelga de la feature TABLES y las zonas de TABLE_ZONES: una suscripción
// puede conceder una y no la otra. Sin censo NO se puede demostrar que una zona esté vacía,
// y el backend no reasigna las mesas al borrar la zona: fallar en abierto las dejaría
// huérfanas. Por eso el guard se bloquea en vez de asumir cero.
const COUNTS_UNAVAILABLE_MESSAGE =
  'Table counts are unavailable right now, so the assignment guard cannot be verified. Retry the connection before deleting or archiving a zone.';

// ========================= FORM DRAWER (CREATE / EDIT) =========================

interface FloorZoneFormDrawerProps {
  mode: 'create' | 'edit';
  initial?: FloorZone;
  // Planos donde se puede colocar la zona (solo los que siguen operativos).
  plans: FloorPlan[];
  // Resto de zonas del comercio: alimentan el guard de nombre único por plano.
  siblings: FloorZone[];
  zoneTableCount: number;
  tableCountsUnknown: boolean;
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (dto: UpdateFloorZoneDto) => void;
}

const FloorZoneFormDrawer: React.FC<FloorZoneFormDrawerProps> = ({
  mode,
  initial,
  plans,
  siblings,
  zoneTableCount,
  tableCountsUnknown,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color?.trim() || DEFAULT_ZONE_COLOR);
  const [planId, setPlanId] = useState<string>(
    initial?.floorPlan?.id ? String(initial.floorPlan.id) : '',
  );
  const [status, setStatus] = useState<FloorZoneStatus>(
    initial ? normalizeFloorZoneStatus(initial.status) : 'active',
  );

  useModalDismiss(onCancel);

  const selectedPlan = plans.find((p) => String(p.id) === planId);

  // Nombre único POR PLANO: dos salas distintas pueden tener su propio "VIP Lounge".
  const duplicateError = useMemo(() => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed || !planId) return '';
    const clash = siblings.some(
      (z) =>
        z.id !== initial?.id &&
        String(z.floorPlan?.id ?? '') === planId &&
        (z.name ?? '').trim().toLowerCase() === trimmed,
    );
    if (!clash) return '';
    const planName = selectedPlan?.name ?? `Floor plan #${planId}`;
    return duplicateZoneNameError(name.trim(), planName);
  }, [name, planId, siblings, initial?.id, selectedPlan]);

  // Archivar equivale a retirar la zona del POS: mismo guard que el borrado.
  const archiveError =
    mode === 'edit' && status === 'archived'
      ? tableCountsUnknown
        ? COUNTS_UNAVAILABLE_MESSAGE
        : floorZoneMutationGuard(zoneTableCount)
      : '';

  // Aviso blando: dos zonas del mismo plano con el mismo color son indistinguibles en el POS.
  const colorClash = useMemo(() => {
    if (!planId || !color) return '';
    const clash = siblings.some(
      (z) =>
        z.id !== initial?.id &&
        String(z.floorPlan?.id ?? '') === planId &&
        (z.color ?? '').trim().toLowerCase() === color.trim().toLowerCase(),
    );
    return clash
      ? 'Another zone on this floor plan already uses this colour — pick a different one to keep the POS map readable.'
      : '';
  }, [color, planId, siblings, initial?.id]);

  const canSubmit =
    name.trim().length > 0 &&
    name.length <= 255 &&
    planId.trim().length > 0 &&
    !duplicateError &&
    !archiveError;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    onSubmit({
      name: name.trim(),
      color: color.trim() || DEFAULT_ZONE_COLOR,
      floorPlan: Number(planId),
      status,
    });
  };

  const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase';
  const inputClass =
    'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full';

  return (
    <AppModal
      title={mode === 'create' ? 'Create Floor Zone' : 'Edit Floor Zone'}
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close floor zone form"
    >
      <form
        onSubmit={handleSubmit}
        className="p-6 space-y-4 overflow-y-auto flex-1 text-left font-sans"
      >
        {formError && <ModalFormError message={formError} />}

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="zone-name" className={labelClass}>
            Zone Name <span className="text-[#ae001a]">*</span>
          </label>
          <input
            id="zone-name"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={255}
            aria-invalid={Boolean(duplicateError)}
            className={inputClass}
            placeholder="e.g., Main Dining, VIP Lounge, Terrace"
          />
          <span className="text-[11px] text-[#5f5e5e]">{name.length}/255</span>
          {duplicateError && (
            <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
              {duplicateError}
            </p>
          )}
        </div>

        {/* Parent floor plan */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="zone-plan" className={labelClass}>
            Parent Floor Plan <span className="text-[#ae001a]">*</span>
          </label>
          <select
            id="zone-plan"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select a floor plan…</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {/* La zona puede colgar de un plano archivado que ya no está en el selector:
                lo añadimos para no perder el vínculo al editar. */}
            {initial?.floorPlan?.id != null &&
              !plans.some((p) => p.id === initial.floorPlan?.id) && (
                <option value={initial.floorPlan.id}>
                  {initial.floorPlan.name ?? `Floor plan #${initial.floorPlan.id}`}
                </option>
              )}
          </select>
          {plans.length === 0 && (
            <p className="text-[11px] text-[#5f5e5e] italic">
              No floor plans available — create a floor plan first.
            </p>
          )}
        </div>

        {/* Colour */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="zone-color" className={labelClass}>
            Zone Colour
          </label>
          <div className="flex items-center gap-3">
            <input
              id="zone-color"
              type="color"
              value={zoneSwatchColor(color)}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Pick zone colour"
              className="h-10 w-14 border border-[#e8e2d8] rounded cursor-pointer bg-white"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              maxLength={50}
              aria-label="Zone colour value"
              className={`${inputClass} font-mono`}
              placeholder="#3B82F6"
            />
          </div>
          {colorClash && (
            <p className="text-[11px] text-amber-700">{colorClash}</p>
          )}
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="zone-status" className={labelClass}>
            Status
          </label>
          <select
            id="zone-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as FloorZoneStatus)}
            className={inputClass}
          >
            {FLOOR_ZONE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FLOOR_ZONE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {archiveError && (
            <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
              {archiveError}
            </p>
          )}
        </div>

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={
            submitting ? 'Saving…' : mode === 'create' ? 'Create Floor Zone' : 'Save Floor Zone'
          }
          isSubmitting={submitting}
          submitDisabled={!canSubmit}
        />
      </form>
    </AppModal>
  );
};

// ========================= DELETE CONFIRM DIALOG =========================

interface ConfirmDeleteZoneDialogProps {
  zone: FloorZone;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmDeleteZoneDialog: React.FC<ConfirmDeleteZoneDialogProps> = ({
  zone,
  submitting,
  onCancel,
  onConfirm,
}) => {
  useModalDismiss(onCancel);
  return (
    <AppModal
      title="Delete Floor Zone"
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="md"
      closeAriaLabel="Close delete confirmation"
    >
      <div className="p-6 space-y-4 text-left font-sans">
        <p className="text-sm text-[#1d1c17]">
          Delete the zone <strong>{zone.name}</strong>
          {zone.floorPlan?.name ? (
            <>
              {' '}
              from <strong>{zone.floorPlan.name}</strong>
            </>
          ) : null}
          ? Tables already placed in the editor keep their coordinates but lose this zone&apos;s
          colour coding.
        </p>
        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Deleting…' : 'Delete Zone'}
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

interface FloorZonesViewProps {
  onNavigate?: (view: string) => void;
  merchantId?: number;
}

export const FloorZonesView: React.FC<FloorZonesViewProps> = ({ onNavigate, merchantId }) => {
  const activeMerchantId = merchantId ?? 1;

  const [zones, setZones] = useState<FloorZone[]>([]);
  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [tableCountsUnknown, setTableCountsUnknown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | FloorZoneStatus>('');
  const [planFilter, setPlanFilter] = useState<string>('');

  const [formDrawer, setFormDrawer] = useState<null | { mode: 'create' | 'edit'; zone?: FloorZone }>(
    null,
  );
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingZone, setDeletingZone] = useState<FloorZone | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [editorPlan, setEditorPlan] = useState<FloorPlan | null>(null);
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

  const fetchZones = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/floor-zone?limit=100`, { headers: authHeaders() });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar las zonas');
      const json = await res.json();
      setZones((json.data ?? []) as FloorZone[]);
    } catch (err) {
      console.error('Error fetching floor zones:', err);
      setError('Failed to load floor zones. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await fetch(`${API_BASE}/floor-plan?limit=100`, { headers: authHeaders() });
      if (!res.ok) return;
      const json = await res.json();
      setPlans((json.data ?? []) as FloorPlan[]);
    } catch (err) {
      console.error('Error fetching floor plans for zones:', err);
    }
  };

  const fetchTables = async () => {
    try {
      const res = await fetch(`${API_BASE}/tables?limit=100`, { headers: authHeaders() });
      if (!res.ok) {
        setTableCountsUnknown(true);
        return;
      }
      const json = await res.json();
      setTables((json.data ?? []) as DiningTable[]);
      setTableCountsUnknown(false);
    } catch (err) {
      console.error('Error fetching tables for zone counts:', err);
      setTableCountsUnknown(true);
    }
  };

  useEffect(() => {
    fetchZones();
    fetchPlans();
    fetchTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMerchantId]);

  // Aislamiento multi-tenant: /api/floor-zone no filtra por comercio, pero embebe `merchant`.
  const merchantZones = useMemo(
    () => zones.filter((z) => z.merchant?.id == null || z.merchant.id === activeMerchantId),
    [zones, activeMerchantId],
  );

  const merchantPlans = useMemo(
    () => plans.filter((p) => p.merchant?.id == null || p.merchant.id === activeMerchantId),
    [plans, activeMerchantId],
  );

  // Planos ofrecibles en el formulario: los archivados no admiten zonas nuevas.
  const assignablePlans = useMemo(
    () => merchantPlans.filter((p) => normalizeFloorPlanStatus(p.status) !== 'archived'),
    [merchantPlans],
  );

  const tableCountByZone = useMemo(() => {
    const map = new Map<number, number>();
    tables.forEach((t) => {
      const zid = t.floorZone?.id;
      if (zid != null) map.set(zid, (map.get(zid) ?? 0) + 1);
    });
    return map;
  }, [tables]);

  const planById = useMemo(() => {
    const map = new Map<number, FloorPlan>();
    merchantPlans.forEach((p) => map.set(p.id, p));
    return map;
  }, [merchantPlans]);

  const filteredZones = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return merchantZones.filter((z) => {
      if (term) {
        const haystack = [z.name ?? '', z.floorPlan?.name ?? ''].join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (statusFilter && normalizeFloorZoneStatus(z.status) !== statusFilter) return false;
      if (planFilter && String(z.floorPlan?.id ?? '') !== planFilter) return false;
      return true;
    });
  }, [merchantZones, searchQuery, statusFilter, planFilter]);

  const hasActiveFilter = Boolean(searchQuery || statusFilter || planFilter);
  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setPlanFilter('');
  };

  const openCreate = () => {
    setFormError('');
    setFormDrawer({ mode: 'create' });
  };

  const handleCreateSubmit = async (dto: UpdateFloorZoneDto) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      // El comercio no lo elige el usuario: sale de la sesión, igual que en los planos.
      const body: CreateFloorZoneDto = {
        merchant: activeMerchantId,
        name: dto.name ?? '',
        color: dto.color ?? DEFAULT_ZONE_COLOR,
        floorPlan: dto.floorPlan ?? 0,
        status: dto.status ?? 'active',
      };
      const res = await fetch(`${API_BASE}/floor-zone`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to create floor zone');
      await fetchZones();
      setFormDrawer(null);
      setToast({ message: 'Floor zone created successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create floor zone');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (id: number, dto: UpdateFloorZoneDto) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      // PATCH (no PUT) y sin `merchant`: reasignar el comercio rompería el aislamiento.
      const res = await fetch(`${API_BASE}/floor-zone/${id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(dto),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to update floor zone');
      await fetchZones();
      setFormDrawer(null);
      setToast({ message: 'Floor zone updated successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update floor zone');
    } finally {
      setFormSubmitting(false);
    }
  };

  const requestDelete = (z: FloorZone) => {
    if (tableCountsUnknown) {
      setToast({ message: COUNTS_UNAVAILABLE_MESSAGE, type: 'error' });
      return;
    }
    const guard = floorZoneMutationGuard(tableCountByZone.get(z.id) ?? 0);
    if (guard) {
      setToast({ message: guard, type: 'error' });
      return;
    }
    setDeletingZone(z);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingZone) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/floor-zone/${deletingZone.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to delete floor zone');
      }
      setZones((prev) => prev.filter((z) => z.id !== deletingZone.id));
      setDeletingZone(null);
      setToast({ message: 'Floor zone deleted successfully', type: 'success' });
    } catch (err) {
      setDeletingZone(null);
      setToast({
        message: err instanceof Error ? err.message : 'Failed to delete floor zone',
        type: 'error',
      });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // El eje del módulo es el editor en vivo: desde una zona se salta al lienzo de su plano,
  // que es donde las zonas cobran sentido (colorean las mesas colocadas).
  const openEditorForZone = (z: FloorZone) => {
    const plan = z.floorPlan?.id != null ? planById.get(z.floorPlan.id) : undefined;
    if (!plan) {
      setToast({
        message: 'The parent floor plan is not available for this zone.',
        type: 'error',
      });
      return;
    }
    setEditorPlan(plan);
  };

  const isTrueEmpty = !loading && !error && merchantZones.length === 0;
  const isFilteredEmpty =
    !loading && !error && merchantZones.length > 0 && filteredZones.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchZones}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      {/* Section title */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase">
          Floor Zones
        </h2>
        <p className="text-[#5f5e5e] text-body-sm mt-1">
          Section your floor plans into operational areas and colour-code them for the POS floor
          map.
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
            placeholder="Search by zone or floor plan name..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search floor zones"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none min-w-[170px]"
          aria-label="Filter by floor plan"
        >
          <option value="">All Floor Plans</option>
          {merchantPlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | FloorZoneStatus)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none min-w-[150px]"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          {FLOOR_ZONE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {FLOOR_ZONE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {!isTrueEmpty && (
          <button
            type="button"
            onClick={openCreate}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              add
            </span>
            Create Floor Zone
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

      {/* True empty state */}
      {isTrueEmpty && (
        <div
          data-testid="floor-zones-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
            grid_view
          </span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No floor zones configured. Click &apos;Create Floor Zone&apos; to section your floor
            plans into operational areas like Main Dining, VIP, or Terrace.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              add
            </span>
            Create Floor Zone
          </button>
        </div>
      )}

      {/* Table */}
      {(loading || merchantZones.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              FLOOR ZONES
            </span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : pluralize(filteredZones.length, 'zone', 'zones')}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Zone
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Colour
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Floor Plan
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Tables
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
                          No floor zones match your active filters
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
                  filteredZones.map((z) => {
                    const status = normalizeFloorZoneStatus(z.status);
                    const tableCount = tableCountByZone.get(z.id) ?? 0;
                    const swatch = zoneSwatchColor(z.color);
                    return (
                      <tr key={z.id} className="group hover:bg-[#f8f3eb] transition-colors">
                        {/* Zone id + name */}
                        <td className="px-6 py-4">
                          <p className="text-xs text-[#5f5e5e] font-mono">#{z.id}</p>
                          <p className="font-bold text-[#1d1c17]">{z.name}</p>
                        </td>

                        {/* Colour swatch */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span
                              data-testid={`zone-swatch-${z.id}`}
                              aria-hidden="true"
                              style={{ backgroundColor: swatch }}
                              className="inline-block w-5 h-5 rounded border border-[#e8e2d8] shrink-0"
                            />
                            <span className="text-xs font-mono text-[#5f5e5e] uppercase">
                              {z.color?.trim() || swatch}
                            </span>
                          </div>
                        </td>

                        {/* Parent floor plan */}
                        <td className="px-6 py-4">
                          {z.floorPlan?.id != null ? (
                            <button
                              type="button"
                              onClick={() => openEditorForZone(z)}
                              title="Open this zone's floor plan in the live editor"
                              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-[#ece8e0] text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                            >
                              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                                map
                              </span>
                              {z.floorPlan.name ?? `Plan #${z.floorPlan.id}`}
                            </button>
                          ) : (
                            <span className="text-xs text-[#5f5e5e] italic">Unassigned</span>
                          )}
                        </td>

                        {/* Tables count */}
                        <td className="px-6 py-4 text-center">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#ece8e0] text-[#1d1c17]">
                            {tableCountsUnknown ? '—' : pluralize(tableCount, 'Table', 'Tables')}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${FLOOR_ZONE_STATUS_BADGE_STYLES[status]}`}
                          >
                            {FLOOR_ZONE_STATUS_LABELS[status]}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditorForZone(z)}
                              aria-label={`Open editor for ${z.name}`}
                              title="Open the layout editor"
                              className="px-3 py-1.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                                edit_square
                              </span>
                              Open Editor
                            </button>
                            <span className="flex gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => {
                                  setFormError('');
                                  setFormDrawer({ mode: 'edit', zone: z });
                                }}
                                aria-label={`Edit floor zone ${z.name}`}
                                title="Edit floor zone"
                                className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                              >
                                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                  edit
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => requestDelete(z)}
                                aria-label={`Delete floor zone ${z.name}`}
                                title="Delete floor zone"
                                className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                              >
                                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                  delete
                                </span>
                              </button>
                            </span>
                          </div>
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

      <DiningSystemQuickLinks active="floor-zones" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={openCreate}
        aria-label="Quick create floor zone"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
      >
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
          add
        </span>
      </button>

      {formDrawer && (
        <FloorZoneFormDrawer
          mode={formDrawer.mode}
          initial={formDrawer.zone}
          plans={assignablePlans}
          siblings={merchantZones}
          zoneTableCount={
            formDrawer.zone ? (tableCountByZone.get(formDrawer.zone.id) ?? 0) : 0
          }
          tableCountsUnknown={tableCountsUnknown}
          submitting={formSubmitting}
          formError={formError}
          onCancel={() => setFormDrawer(null)}
          onSubmit={(dto) =>
            formDrawer.mode === 'create'
              ? handleCreateSubmit(dto)
              : handleEditSubmit(formDrawer.zone!.id, dto)
          }
        />
      )}

      {deletingZone && (
        <ConfirmDeleteZoneDialog
          zone={deletingZone}
          submitting={deleteSubmitting}
          onCancel={() => setDeletingZone(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {editorPlan && (
        <FloorPlanEditor
          plan={editorPlan}
          merchantId={activeMerchantId}
          onClose={() => setEditorPlan(null)}
          onSaved={() => {
            fetchZones();
            fetchTables();
          }}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default FloorZonesView;
