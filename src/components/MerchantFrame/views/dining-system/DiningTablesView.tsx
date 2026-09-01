import React, { useState, useEffect, useMemo } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  DiningTable,
  FloorPlan,
  FloorZone,
  TableShape,
  CreateDiningTableDto,
  UpdateDiningTableDto,
} from '../../../../types/dining-system';
import {
  TABLE_SHAPES,
  TABLE_MIN_SIZE_PX,
  TABLE_MAX_SIZE_PX,
  tableFootprint,
  zoneSwatchColor,
} from '../../../../types/dining-system';
import type { UnitSystem } from '../../../../lib/measurement-units';
import {
  formatDimensions,
  lengthSuffix,
  lengthToPx,
  lengthValue,
  loadUnitSystem,
  saveUnitSystem,
  UNIT_SYSTEMS,
  UNIT_SYSTEM_SHORT,
} from '../../../../lib/measurement-units';
import { DiningSystemQuickLinks } from './DiningSystemQuickLinks';
import { FloorPlanEditor } from './FloorPlanEditor';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter, ModalFormError } from '../../shared/AppModal';
import { Toast } from '../../shared/Toast';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// El backend guarda `status` como varchar libre; éstos son los valores que maneja el POS.
// 'deleted' es el borrado lógico de una mesa: nunca se ofrece en el formulario.
const TABLE_STATUSES = ['available', 'occupied', 'reserved', 'out_of_service'];
const DELETED_STATUS = 'deleted';

const STATUS_BADGE_STYLES: Record<string, string> = {
  available: 'bg-green-500/10 text-green-700',
  occupied: 'bg-blue-500/10 text-blue-700',
  reserved: 'bg-amber-500/10 text-amber-700',
  out_of_service: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
};

const statusLabel = (raw: string): string =>
  (raw ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

const pluralize = (n: number, singular: string, plural: string): string =>
  `${n} ${n === 1 ? singular : plural}`;

// ========================= FORM DRAWER (CREATE / EDIT) =========================

interface TableFormDrawerProps {
  mode: 'create' | 'edit';
  initial?: DiningTable;
  plans: FloorPlan[];
  zones: FloorZone[];
  // Números ya usados por el comercio: el índice (merchant_id, number) es ÚNICO en base.
  takenNumbers: Set<string>;
  unitSystem: UnitSystem;
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (dto: UpdateDiningTableDto) => void;
}

const TableFormDrawer: React.FC<TableFormDrawerProps> = ({
  mode,
  initial,
  plans,
  zones,
  takenNumbers,
  unitSystem,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const [number, setNumber] = useState(initial?.number ?? '');
  const [capacity, setCapacity] = useState(String(initial?.capacity ?? 4));
  const [status, setStatus] = useState(initial?.status ?? 'available');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [shape, setShape] = useState<TableShape>(initial?.shape ?? 'Circle');
  const [planId, setPlanId] = useState<string>(
    initial?.floorPlan?.id ? String(initial.floorPlan.id) : '',
  );
  const [zoneId, setZoneId] = useState<string>(
    initial?.floorZone?.id ? String(initial.floorZone.id) : '',
  );
  const base = tableFootprint(initial ?? { shape });
  const [width, setWidth] = useState(String(lengthValue(base.w, unitSystem)));
  const [height, setHeight] = useState(String(lengthValue(base.h, unitSystem)));

  useModalDismiss(onCancel);

  // Sólo las zonas del plano elegido: una mesa no puede caer en la zona de otra sala.
  const planZones = useMemo(
    () => zones.filter((z) => String(z.floorPlan?.id ?? '') === planId),
    [zones, planId],
  );

  const duplicateNumber =
    number.trim().length > 0 &&
    number.trim().toLowerCase() !== (initial?.number ?? '').toLowerCase() &&
    takenNumbers.has(number.trim().toLowerCase());

  const capacityNum = Number(capacity);
  const widthPx = clamp(lengthToPx(Number(width) || 0, unitSystem), TABLE_MIN_SIZE_PX, TABLE_MAX_SIZE_PX);
  const heightPx = clamp(lengthToPx(Number(height) || 0, unitSystem), TABLE_MIN_SIZE_PX, TABLE_MAX_SIZE_PX);

  const canSubmit =
    number.trim().length > 0 &&
    !duplicateNumber &&
    capacityNum >= 1 &&
    planId.trim().length > 0 &&
    zoneId.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    onSubmit({
      number: number.trim(),
      capacity: capacityNum,
      status,
      location: location.trim() || 'Main',
      shape,
      width: widthPx,
      height: heightPx,
      floorPlan: Number(planId),
      floorZone: Number(zoneId),
    });
  };

  const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase';
  const inputClass =
    'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full';

  return (
    <AppModal
      title={mode === 'create' ? 'Create Table' : 'Edit Table'}
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close table form"
    >
      <form
        onSubmit={handleSubmit}
        className="p-6 space-y-4 overflow-y-auto flex-1 text-left font-sans"
      >
        {formError && <ModalFormError message={formError} />}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-number" className={labelClass}>
              Table Number <span className="text-[#ae001a]">*</span>
            </label>
            <input
              id="tbl-number"
              type="text"
              autoFocus
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              maxLength={50}
              aria-invalid={duplicateNumber}
              className={`${inputClass} font-mono`}
              placeholder="e.g., T1"
            />
            {duplicateNumber && (
              <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
                Table number &apos;{number.trim()}&apos; is already used by another table.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-capacity" className={labelClass}>
              Seats <span className="text-[#ae001a]">*</span>
            </label>
            <input
              id="tbl-capacity"
              type="number"
              min={1}
              step={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-plan" className={labelClass}>
              Floor Plan <span className="text-[#ae001a]">*</span>
            </label>
            <select
              id="tbl-plan"
              value={planId}
              onChange={(e) => {
                setPlanId(e.target.value);
                setZoneId(''); // La zona pertenece al plano: cambiar de sala la invalida.
              }}
              className={inputClass}
            >
              <option value="">Select a floor plan…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-zone" className={labelClass}>
              Floor Zone <span className="text-[#ae001a]">*</span>
            </label>
            <select
              id="tbl-zone"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              disabled={!planId}
              className={`${inputClass} disabled:bg-[#f2ede5] disabled:cursor-not-allowed`}
            >
              <option value="">Select a zone…</option>
              {planZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            {planId && planZones.length === 0 && (
              <p className="text-[11px] text-[#5f5e5e] italic">
                This floor plan has no zones yet — create one first.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-shape" className={labelClass}>
              Shape
            </label>
            <select
              id="tbl-shape"
              value={shape}
              onChange={(e) => {
                const next = e.target.value as TableShape;
                setShape(next);
                // Cambiar de forma trae su tamaño estándar salvo que el usuario lo retoque.
                const fp = tableFootprint({ shape: next });
                setWidth(String(lengthValue(fp.w, unitSystem)));
                setHeight(String(lengthValue(fp.h, unitSystem)));
              }}
              className={inputClass}
            >
              {TABLE_SHAPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-width" className={labelClass}>
              Width {lengthSuffix(unitSystem)}
            </label>
            <input
              id="tbl-width"
              type="number"
              step={0.01}
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-height" className={labelClass}>
              Depth {lengthSuffix(unitSystem)}
            </label>
            <input
              id="tbl-height"
              type="number"
              step={0.01}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-status" className={labelClass}>
              Status
            </label>
            <select
              id="tbl-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputClass}
            >
              {TABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tbl-location" className={labelClass}>
              Location note
            </label>
            <input
              id="tbl-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={100}
              className={inputClass}
              placeholder="e.g., Near window"
            />
          </div>
        </div>

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Saving…' : mode === 'create' ? 'Create Table' : 'Save Table'}
          isSubmitting={submitting}
          submitDisabled={!canSubmit}
        />
      </form>
    </AppModal>
  );
};

// ========================= DELETE CONFIRM =========================

const ConfirmDeleteTableDialog: React.FC<{
  table: DiningTable;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ table, submitting, onCancel, onConfirm }) => {
  useModalDismiss(onCancel);
  return (
    <AppModal
      title="Delete Table"
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="md"
      closeAriaLabel="Close delete confirmation"
    >
      <div className="p-6 space-y-4 text-left font-sans">
        <p className="text-sm text-[#1d1c17]">
          Delete table <strong className="font-mono">{table.number}</strong>? It disappears from the
          floor plan canvas and from the POS.
        </p>
        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Deleting…' : 'Delete Table'}
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

interface DiningTablesViewProps {
  onNavigate?: (view: string) => void;
  merchantId?: number;
}

export const DiningTablesView: React.FC<DiningTablesViewProps> = ({ onNavigate, merchantId }) => {
  const activeMerchantId = merchantId ?? 1;

  const [tables, setTables] = useState<DiningTable[]>([]);
  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [zones, setZones] = useState<FloorZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(loadUnitSystem);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');

  const [formDrawer, setFormDrawer] = useState<null | {
    mode: 'create' | 'edit';
    table?: DiningTable;
  }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingTable, setDeletingTable] = useState<DiningTable | null>(null);
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

  const fetchTables = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/tables?limit=100`, { headers: authHeaders() });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar las mesas');
      const json = await res.json();
      // El borrado de mesas es lógico vía status: las 'deleted' no son parte del inventario vivo.
      setTables(((json.data ?? []) as DiningTable[]).filter((t) => t.status !== DELETED_STATUS));
    } catch (err) {
      console.error('Error fetching tables:', err);
      setError('Failed to load tables. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const fetchContext = async () => {
    try {
      const [planRes, zoneRes] = await Promise.all([
        fetch(`${API_BASE}/floor-plan?limit=100`, { headers: authHeaders() }),
        fetch(`${API_BASE}/floor-zone?limit=100`, { headers: authHeaders() }),
      ]);
      if (planRes.ok) setPlans(((await planRes.json()).data ?? []) as FloorPlan[]);
      if (zoneRes.ok) setZones(((await zoneRes.json()).data ?? []) as FloorZone[]);
    } catch (err) {
      console.error('Error fetching plans/zones for tables:', err);
    }
  };

  useEffect(() => {
    fetchTables();
    fetchContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMerchantId]);

  const merchantPlans = useMemo(
    () => plans.filter((p) => p.merchant?.id == null || p.merchant.id === activeMerchantId),
    [plans, activeMerchantId],
  );

  const merchantZones = useMemo(
    () => zones.filter((z) => z.merchant?.id == null || z.merchant.id === activeMerchantId),
    [zones, activeMerchantId],
  );

  const planById = useMemo(() => {
    const m = new Map<number, FloorPlan>();
    merchantPlans.forEach((p) => m.set(p.id, p));
    return m;
  }, [merchantPlans]);

  const zoneById = useMemo(() => {
    const m = new Map<number, FloorZone>();
    merchantZones.forEach((z) => m.set(z.id, z));
    return m;
  }, [merchantZones]);

  const takenNumbers = useMemo(
    () => new Set(tables.map((t) => (t.number ?? '').trim().toLowerCase())),
    [tables],
  );

  const filteredTables = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return tables.filter((t) => {
      if (term) {
        const haystack = [t.number ?? '', t.location ?? '', t.floorZone?.name ?? '']
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (statusFilter && t.status !== statusFilter) return false;
      if (planFilter && String(t.floorPlan?.id ?? '') !== planFilter) return false;
      if (zoneFilter && String(t.floorZone?.id ?? '') !== zoneFilter) return false;
      return true;
    });
  }, [tables, searchQuery, statusFilter, planFilter, zoneFilter]);

  const hasActiveFilter = Boolean(searchQuery || statusFilter || planFilter || zoneFilter);
  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setPlanFilter('');
    setZoneFilter('');
  };

  const changeUnits = (next: UnitSystem) => {
    setUnitSystem(next);
    saveUnitSystem(next);
  };

  const openCreate = () => {
    setFormError('');
    setFormDrawer({ mode: 'create' });
  };

  const handleCreateSubmit = async (dto: UpdateDiningTableDto) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      const body: CreateDiningTableDto = {
        merchant_id: activeMerchantId,
        number: dto.number ?? '',
        capacity: dto.capacity ?? 1,
        status: dto.status ?? 'available',
        location: dto.location ?? 'Main',
        rotation: 0,
        shape: (dto.shape ?? 'Circle') as TableShape,
        width: dto.width ?? null,
        height: dto.height ?? null,
        // Las mesas creadas aquí aterrizan en el origen del lienzo; se colocan luego
        // arrastrándolas en el editor, que es donde la posición tiene sentido visual.
        pos_x: 40,
        pos_y: 40,
        floorZone: dto.floorZone ?? 0,
        floorPlan: dto.floorPlan ?? 0,
      };
      const res = await fetch(`${API_BASE}/tables`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to create table');
      await fetchTables();
      setFormDrawer(null);
      setToast({ message: 'Table created successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create table');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (id: number, dto: UpdateDiningTableDto) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      // Las mesas usan PUT (no PATCH), a diferencia de planos y zonas.
      const res = await fetch(`${API_BASE}/tables/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(dto),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to update table');
      await fetchTables();
      setFormDrawer(null);
      setToast({ message: 'Table updated successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update table');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTable) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/tables/${deletingTable.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to delete table');
      }
      setTables((prev) => prev.filter((t) => t.id !== deletingTable.id));
      setDeletingTable(null);
      setToast({ message: 'Table deleted successfully', type: 'success' });
    } catch (err) {
      setDeletingTable(null);
      setToast({
        message: err instanceof Error ? err.message : 'Failed to delete table',
        type: 'error',
      });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // El eje del módulo: desde la mesa se salta al lienzo donde vive.
  const openEditorForTable = (t: DiningTable) => {
    const plan = t.floorPlan?.id != null ? planById.get(t.floorPlan.id) : undefined;
    if (!plan) {
      setToast({ message: 'This table is not placed on any floor plan yet.', type: 'error' });
      return;
    }
    setEditorPlan(plan);
  };

  const isTrueEmpty = !loading && !error && tables.length === 0;
  const isFilteredEmpty = !loading && !error && tables.length > 0 && filteredTables.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchTables}
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
          Dining Tables
        </h2>
        <p className="text-[#5f5e5e] text-body-sm mt-1">
          The physical table inventory — seats, shape, size, and where each one sits on the floor
          plan.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
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
            placeholder="Search by table number, zone or location..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search tables"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
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
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by zone"
        >
          <option value="">All Zones</option>
          {merchantZones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
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
          {TABLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>

        {/* Unidades: misma preferencia que el editor y la parrilla de planos. */}
        <div className="flex border border-[#e8e2d8] rounded overflow-hidden" role="group" aria-label="Measurement units">
          {UNIT_SYSTEMS.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => changeUnits(u)}
              aria-pressed={unitSystem === u}
              className={`px-3 py-2 text-[11px] font-bold uppercase transition-colors ${
                unitSystem === u
                  ? 'bg-[#ae001a] text-white'
                  : 'bg-white text-[#1d1c17] hover:text-[#ae001a]'
              }`}
            >
              {UNIT_SYSTEM_SHORT[u]}
            </button>
          ))}
        </div>

        {!isTrueEmpty && (
          <button
            type="button"
            onClick={openCreate}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              add
            </span>
            Create Table
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
          data-testid="dining-tables-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
            table_restaurant
          </span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No tables configured. Click &apos;Create Table&apos; to add your first table, or place
            them visually from the floor plan editor.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              add
            </span>
            Create Table
          </button>
        </div>
      )}

      {(loading || tables.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              DINING TABLES
            </span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : pluralize(filteredTables.length, 'table', 'tables')}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Table
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Seats
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Shape &amp; Size
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Zone
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Floor Plan
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
                      {Array.from({ length: 7 }).map((_, c) => (
                        <td key={c} className="px-6 py-4">
                          <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span
                          className="material-symbols-outlined text-[#5f5e5e] text-4xl"
                          aria-hidden="true"
                        >
                          search_off
                        </span>
                        <p className="text-sm text-[#5f5e5e]">No tables match your active filters</p>
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
                  filteredTables.map((t) => {
                    const fp = tableFootprint(t);
                    const zone = t.floorZone?.id != null ? zoneById.get(t.floorZone.id) : undefined;
                    const zoneColor = zoneSwatchColor(zone?.color ?? t.floorZone?.color);
                    return (
                      <tr key={t.id} className="group hover:bg-[#f8f3eb] transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17] font-mono">{t.number}</p>
                          {t.location && (
                            <p className="text-xs text-[#5f5e5e]">{t.location}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#1d1c17]">
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                              person
                            </span>
                            {t.capacity}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-[#1d1c17]">{t.shape ?? 'Square'}</p>
                          <p className="text-xs text-[#5f5e5e] font-mono">
                            {formatDimensions(fp.w, fp.h, unitSystem)}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          {t.floorZone?.id != null ? (
                            <span className="inline-flex items-center gap-2">
                              <span
                                data-testid={`table-zone-swatch-${t.id}`}
                                aria-hidden="true"
                                style={{ backgroundColor: zoneColor }}
                                className="inline-block w-4 h-4 rounded border border-[#e8e2d8] shrink-0"
                              />
                              <span className="text-sm text-[#1d1c17]">
                                {zone?.name ?? t.floorZone.name ?? `Zone #${t.floorZone.id}`}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-[#5f5e5e] italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {t.floorPlan?.id != null ? (
                            <button
                              type="button"
                              onClick={() => openEditorForTable(t)}
                              title="Open this table's floor plan in the live editor"
                              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-[#ece8e0] text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                            >
                              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                                map
                              </span>
                              {planById.get(t.floorPlan.id)?.name ??
                                t.floorPlan.name ??
                                `Plan #${t.floorPlan.id}`}
                            </button>
                          ) : (
                            <span className="text-xs text-[#5f5e5e] italic">Not placed</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                              STATUS_BADGE_STYLES[t.status] ?? 'bg-[#ece8e0] text-[#1d1c17]'
                            }`}
                          >
                            {statusLabel(t.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditorForTable(t)}
                              aria-label={`Open editor for table ${t.number}`}
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
                                  setFormDrawer({ mode: 'edit', table: t });
                                }}
                                aria-label={`Edit table ${t.number}`}
                                title="Edit table"
                                className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                              >
                                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                  edit
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingTable(t)}
                                aria-label={`Delete table ${t.number}`}
                                title="Delete table"
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

      <DiningSystemQuickLinks active="tables" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={openCreate}
        aria-label="Quick create table"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
      >
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
          add
        </span>
      </button>

      {formDrawer && (
        <TableFormDrawer
          mode={formDrawer.mode}
          initial={formDrawer.table}
          plans={merchantPlans}
          zones={merchantZones}
          takenNumbers={takenNumbers}
          unitSystem={unitSystem}
          submitting={formSubmitting}
          formError={formError}
          onCancel={() => setFormDrawer(null)}
          onSubmit={(dto) =>
            formDrawer.mode === 'create'
              ? handleCreateSubmit(dto)
              : handleEditSubmit(formDrawer.table!.id, dto)
          }
        />
      )}

      {deletingTable && (
        <ConfirmDeleteTableDialog
          table={deletingTable}
          submitting={deleteSubmitting}
          onCancel={() => setDeletingTable(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {editorPlan && (
        <FloorPlanEditor
          plan={editorPlan}
          merchantId={activeMerchantId}
          onClose={() => setEditorPlan(null)}
          onSaved={() => {
            fetchTables();
            fetchContext();
          }}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default DiningTablesView;
