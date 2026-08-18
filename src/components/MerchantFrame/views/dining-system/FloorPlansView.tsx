import React, { useState, useEffect, useMemo } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  DiningTable,
  FloorPlan,
  FloorPlanStatus,
  FloorZone,
  CreateFloorPlanDto,
  UpdateFloorPlanDto,
} from '../../../../types/dining-system';
import {
  FLOOR_PLAN_STATUSES,
  FLOOR_PLAN_STATUS_LABELS,
  FLOOR_PLAN_STATUS_BADGE_STYLES,
  FLOOR_PLAN_MIN_DIMENSION,
  FLOOR_PLAN_MAX_DIMENSION,
  clippingWarning,
  floorPlanMutationGuard,
  normalizeFloorPlanStatus,
  validateCanvasDimension,
} from '../../../../types/dining-system';
import type { Outline } from '../../../../lib/floor-geometry';
import {
  outlinePath,
  parseOutline,
  polygonArea,
  polygonBounds,
} from '../../../../lib/floor-geometry';
import type { UnitSystem } from '../../../../lib/measurement-units';
import {
  UNIT_SYSTEMS,
  UNIT_SYSTEM_LABELS,
  formatDimensions,
  formatLength,
  lengthSuffix,
  lengthToPx,
  lengthValue,
  loadUnitSystem,
  saveUnitSystem,
} from '../../../../lib/measurement-units';
import { DiningSystemQuickLinks } from './DiningSystemQuickLinks';
import { FloorPlanEditor } from './FloorPlanEditor';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter, ModalFormError } from '../../shared/AppModal';
import { Toast } from '../../shared/Toast';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// ---- Helpers ----

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return isNaN(n) ? 0 : n;
};

// El backend guarda width/height en píxeles de lienzo, pero un gerente de sala mide su
// comedor en metros (o en pies): el píxel es un detalle de implementación y no sale a
// pantalla. `num` sigue delante porque el backend puede devolver el int como string.
const formatResolution = (width: number, height: number, system: UnitSystem): string =>
  formatDimensions(num(width), num(height), system);

// Lienzo por defecto al crear, en píxeles: se convierte a la unidad elegida al pintar el
// formulario, así que no depende del sistema activo.
const DEFAULT_CANVAS_W = 800;
const DEFAULT_CANVAS_H = 600;

const pluralize = (n: number, singular: string, plural: string): string =>
  `${n} ${n === 1 ? singular : plural}`;

// /api/tables cuelga de la feature TABLES y /api/floor-plan de FLOOR_PLANS: una suscripción
// puede conceder una y no la otra, así que el censo de mesas puede fallar (403/500) mientras
// la parrilla carga bien. Sin ese censo NO se puede demostrar que un plano esté vacío, y el
// backend no cascadea el borrado: fallar en abierto dejaría mesas huérfanas colgando de un
// plano invisible. Por eso el guard se bloquea en vez de asumir cero.
const COUNTS_UNAVAILABLE_MESSAGE =
  'Table and zone counts are unavailable right now, so the layout guard cannot be verified. Retry the connection before deleting or archiving a floor plan.';

// ---- Forma de la sala ----

// Un contorno es "propio" cuando NO llena por completo su caja envolvente: solo un rectángulo
// alineado a los ejes iguala área y caja, así que cualquier muesca (L, U) o chaflán baja el área.
// Medirlo así evita comparar vértice a vértice y funciona con cualquier polígono, venga del
// preset que venga. La tolerancia de medio píxel absorbe el redondeo de serializeOutline.
const isCustomShape = (outline: Outline): boolean => {
  const bounds = polygonBounds(outline);
  const boxArea = bounds.width * bounds.height;
  if (boxArea <= 0) return false;
  return outline.length !== 4 || Math.abs(polygonArea(outline) - boxArea) > 0.5;
};

// Miniatura de la planta para la parrilla: se DERIVA del contorno persistido en
// `floor_plan.outline`, de modo que un salón en L o en U se distingue de uno rectangular sin
// abrir el editor. Con `outline` nulo, parseOutline ya devuelve el rectángulo width × height,
// que es exactamente lo que representa ese null, así que aquí no hace falta ramificar.
const FloorPlanShapeThumb: React.FC<{ outline: Outline }> = ({ outline }) => {
  const bounds = polygonBounds(outline);
  // El trazo se dibuja a 1px reales (non-scaling-stroke), así que no escala con el viewBox y
  // sin este margen quedaría cortado justo contra el borde de la caja.
  const pad = Math.max(bounds.width, bounds.height) * 0.05 || 1;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="44"
      height="32"
      viewBox={`${bounds.minX - pad} ${bounds.minY - pad} ${bounds.width + pad * 2} ${
        bounds.height + pad * 2
      }`}
      preserveAspectRatio="xMidYMid meet"
      className="shrink-0"
    >
      <path
        d={outlinePath(outline)}
        fill="#f5efe6"
        stroke="#5f5e5e"
        strokeWidth="1"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

// ========================= FORM DRAWER (CREATE / EDIT) =========================

interface FloorPlanFormDrawerProps {
  mode: 'create' | 'edit';
  initial?: FloorPlan;
  // Mesas ya colocadas en ESTE plano: alimentan el aviso de recorte y el guard de archivado.
  planTables: DiningTable[];
  // `planTables` vacío es ambiguo cuando /api/tables falló: distinguimos "no hay mesas" de
  // "no lo sabemos" para no archivar un plano lleno creyéndolo vacío.
  tableCountsUnknown: boolean;
  unitSystem: UnitSystem;
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  // El drawer nunca conoce el merchant: solo emite los campos editables y la vista
  // completa `merchant` al construir el POST.
  onSubmit: (dto: UpdateFloorPlanDto) => void;
}

const FloorPlanFormDrawer: React.FC<FloorPlanFormDrawerProps> = ({
  mode,
  initial,
  planTables,
  tableCountsUnknown,
  unitSystem,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [width, setWidth] = useState(String(initial?.width ?? DEFAULT_CANVAS_W));
  const [height, setHeight] = useState(String(initial?.height ?? DEFAULT_CANVAS_H));
  const [status, setStatus] = useState<FloorPlanStatus>(initial?.status ?? 'active');

  useModalDismiss(onCancel);

  const widthNum = Number(width);
  const heightNum = Number(height);
  // La validación sigue siendo en píxeles (es el rango que impone el backend), pero el
  // mensaje habla en la unidad que el usuario está viendo.
  const dimensionRangeMessage = `Canvas dimensions must be between ${formatLength(
    FLOOR_PLAN_MIN_DIMENSION,
    unitSystem,
  )} and ${formatLength(FLOOR_PLAN_MAX_DIMENSION, unitSystem)}.`;
  const widthError = validateCanvasDimension(widthNum) ? dimensionRangeMessage : '';
  const heightError = validateCanvasDimension(heightNum) ? dimensionRangeMessage : '';

  // Solo al ENCOGER el lienzo pueden quedar mesas fuera de los límites; agrandarlo
  // nunca recorta, así que no molestamos al usuario con el aviso en ese caso.
  const shrinking =
    mode === 'edit' && !!initial && (widthNum < initial.width || heightNum < initial.height);
  const clipError =
    shrinking && !widthError && !heightError
      ? clippingWarning(planTables, widthNum, heightNum)
      : '';

  // Guard de reforma: el contorno propio se persiste en píxeles ABSOLUTOS, así que —al revés
  // que un plano rectangular (outline null), que se estira con el lienzo— no se reescala al
  // cambiar width/height. Un lienzo más pequeño que su caja envolvente dejaría media sala
  // dibujada fuera del área editable, sin forma de recuperarla desde este formulario.
  // Solo miramos planos CON contorno guardado, y reutilizamos polygonBounds en vez de rehacer
  // la cuenta de mínimos y máximos.
  const outlineFitError = useMemo(() => {
    if (mode !== 'edit' || !initial?.outline || widthError || heightError) return '';
    const bounds = polygonBounds(parseOutline(initial.outline, initial.width, initial.height));
    const fits =
      bounds.minX >= 0 && bounds.minY >= 0 && bounds.maxX <= widthNum && bounds.maxY <= heightNum;
    return fits
      ? ''
      : `The saved room shape spans ${Math.round(bounds.maxX)}px × ${Math.round(bounds.maxY)}px, so a ${widthNum}px × ${heightNum}px canvas would leave part of it outside the editable area. Enlarge the canvas or redraw the room shape in the editor first.`;
  }, [mode, initial, widthNum, heightNum, widthError, heightError]);

  // Archivar equivale a borrar de cara al POS: mismo guard que el diálogo de borrado.
  const archiveError =
    mode === 'edit' && status === 'archived'
      ? tableCountsUnknown
        ? COUNTS_UNAVAILABLE_MESSAGE
        : floorPlanMutationGuard(planTables.length)
      : '';

  const canSubmit =
    name.trim().length > 0 &&
    name.length <= 255 &&
    !widthError &&
    !heightError &&
    !clipError &&
    !outlineFitError &&
    !archiveError;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    // `outline` se omite a propósito: el contorno se dibuja en el editor, no aquí, y el PATCH
    // es parcial, así que no mandarlo lo preserva intacto. Enviarlo desde este formulario
    // (donde nadie lo ha tocado) sería reescribirlo con una copia potencialmente vieja.
    onSubmit({
      name: name.trim(),
      width: widthNum,
      height: heightNum,
      status,
    });
  };

  return (
    <AppModal
      title={mode === 'create' ? 'Create Floor Plan' : 'Edit Floor Plan'}
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close floor plan form"
    >
      <form
        onSubmit={handleSubmit}
        className="p-6 space-y-4 overflow-y-auto flex-1 text-left font-sans"
      >
        {formError && <ModalFormError message={formError} />}

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="plan-name" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
            Floor Plan Name <span className="text-[#ae001a]">*</span>
          </label>
          <input
            id="plan-name"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={255}
            className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
            placeholder="e.g., Main Dining Room"
          />
          <span className="text-[11px] text-[#5f5e5e]">{name.length}/255</span>
        </div>

        {/* Canvas dimensions */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="plan-width" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Canvas Width {lengthSuffix(unitSystem)} <span className="text-[#ae001a]">*</span>
            </label>
            {/* El estado se mantiene en píxeles (es lo que persiste el backend); el input solo
                traduce a la unidad del usuario a la entrada y a la salida. */}
            <input
              id="plan-width"
              type="number"
              step={unitSystem === 'metric' ? 0.1 : 0.5}
              min={lengthValue(FLOOR_PLAN_MIN_DIMENSION, unitSystem)}
              max={lengthValue(FLOOR_PLAN_MAX_DIMENSION, unitSystem)}
              value={lengthValue(widthNum, unitSystem)}
              onChange={(e) =>
                setWidth(String(lengthToPx(Number(e.target.value) || 0, unitSystem)))
              }
              aria-invalid={Boolean(widthError)}
              className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="plan-height" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Canvas Height {lengthSuffix(unitSystem)} <span className="text-[#ae001a]">*</span>
            </label>
            <input
              id="plan-height"
              type="number"
              step={unitSystem === 'metric' ? 0.1 : 0.5}
              min={lengthValue(FLOOR_PLAN_MIN_DIMENSION, unitSystem)}
              max={lengthValue(FLOOR_PLAN_MAX_DIMENSION, unitSystem)}
              value={lengthValue(heightNum, unitSystem)}
              onChange={(e) =>
                setHeight(String(lengthToPx(Number(e.target.value) || 0, unitSystem)))
              }
              aria-invalid={Boolean(heightError)}
              className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full font-mono"
            />
          </div>
        </div>

        {(widthError || heightError) && (
          <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
            {widthError || heightError}
          </p>
        )}

        {clipError && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-xs">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              crop_free
            </span>
            <span role="alert">{clipError}</span>
          </div>
        )}

        {outlineFitError && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-xs">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              warning
            </span>
            <span role="alert">{outlineFitError}</span>
          </div>
        )}

        {/* Status */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="plan-status" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
            Status <span className="text-[#ae001a]">*</span>
          </label>
          <select
            id="plan-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as FloorPlanStatus)}
            className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none w-full"
          >
            {FLOOR_PLAN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FLOOR_PLAN_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {archiveError && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-xs">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              lock
            </span>
            <span role="alert">{archiveError}</span>
          </div>
        )}

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={
            submitting ? 'Saving…' : mode === 'create' ? 'Create Floor Plan' : 'Save Floor Plan'
          }
          isSubmitting={submitting}
          submitDisabled={!canSubmit}
        />
      </form>
    </AppModal>
  );
};

// ========================= DELETE CONFIRM DIALOG =========================

interface ConfirmDeletePlanDialogProps {
  plan: FloorPlan;
  unitSystem: UnitSystem;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmDeletePlanDialog: React.FC<ConfirmDeletePlanDialogProps> = ({
  plan,
  unitSystem,
  submitting,
  onCancel,
  onConfirm,
}) => {
  useModalDismiss(onCancel);
  return (
    <AppModal
      title="Delete Floor Plan"
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="md"
      closeAriaLabel="Close delete confirmation"
    >
      <div className="p-6 space-y-4 text-left font-sans">
        <p className="text-sm text-[#1d1c17]">
          Delete the floor plan <strong>{plan.name}</strong> (
          <span className="font-mono">
            {formatResolution(plan.width, plan.height, unitSystem)}
          </span>
          )? The
          layout is archived, not erased — it disappears from active grids but stays in the audit
          trail.
        </p>
        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Deleting…' : 'Delete Floor Plan'}
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

export interface FloorPlansViewProps {
  onNavigate?: (view: string) => void;
  merchantId?: number;
}

export const FloorPlansView: React.FC<FloorPlansViewProps> = ({ onNavigate, merchantId }) => {
  const activeMerchantId = merchantId ?? 1;

  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [zones, setZones] = useState<FloorZone[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [countsStale, setCountsStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  // La unidad se comparte con el editor a través de localStorage: elegir pies aquí
  // se respeta al abrir el lienzo, y al revés.
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(loadUnitSystem);

  const changeUnitSystem = (next: UnitSystem) => {
    setUnitSystem(next);
    saveUnitSystem(next);
  };

  const [formDrawer, setFormDrawer] = useState<null | { mode: 'create' | 'edit'; plan?: FloorPlan }>(
    null,
  );
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingPlan, setDeletingPlan] = useState<FloorPlan | null>(null);
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

  // /api/floor-plan NUNCA embebe tables ni floorZones (findAll solo hace join con merchant),
  // y ni /api/tables ni /api/floor-zone aceptan un filtro por plano: la única forma de
  // obtener los contadores es traer ambas colecciones una vez y agruparlas por floorPlan.id.
  const fetchFloorPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, zonesRes, tablesRes] = await Promise.all([
        fetch(`${API_BASE}/floor-plan?limit=100`, { headers: authHeaders() }),
        fetch(`${API_BASE}/floor-zone?limit=100`, { headers: authHeaders() }),
        // limit está capado a 100 en tables: pedir más devuelve 400.
        fetch(`${API_BASE}/tables?limit=100`, { headers: authHeaders() }),
      ]);
      if (plansRes.status === 401 || zonesRes.status === 401 || tablesRes.status === 401) {
        return handleUnauthorized();
      }
      if (!plansRes.ok) throw new Error('Error al cargar los planos de sala');

      const plansJson = await plansRes.json();
      const rows = (plansJson.data ?? []) as Array<Omit<FloorPlan, 'status'> & { status: string }>;
      setPlans(
        rows.map((row) => ({
          ...row,
          width: num(row.width),
          height: num(row.height),
          status: normalizeFloorPlanStatus(row.status),
        })),
      );

      // La grid sigue siendo usable con 0, pero el contador de mesas también alimenta el
      // guard de borrado/archivado: marcamos el censo como no fiable para bloquearlo.
      setCountsStale(!zonesRes.ok || !tablesRes.ok);
      const zonesJson = zonesRes.ok ? await zonesRes.json() : { data: [] };
      const tablesJson = tablesRes.ok ? await tablesRes.json() : { data: [] };
      // El soft-delete deja las filas con status 'deleted' en la lista; contarlas
      // bloquearía el borrado del plano por mesas que ya no existen.
      setZones(((zonesJson.data ?? []) as FloorZone[]).filter((z) => z.status !== 'deleted'));
      setTables(((tablesJson.data ?? []) as DiningTable[]).filter((t) => t.status !== 'deleted'));
    } catch (err) {
      console.error('Error fetching floor plans:', err);
      setError('Failed to load floor plans. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFloorPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMerchantId]);

  const zoneCountByPlan = useMemo(() => {
    const map = new Map<number, number>();
    zones.forEach((z) => {
      const planId = z.floorPlan?.id;
      if (planId === undefined || planId === null) return;
      map.set(planId, (map.get(planId) ?? 0) + 1);
    });
    return map;
  }, [zones]);

  const tablesByPlan = useMemo(() => {
    const map = new Map<number, DiningTable[]>();
    tables.forEach((t) => {
      const planId = t.floorPlan?.id;
      if (planId === undefined || planId === null) return;
      const bucket = map.get(planId);
      if (bucket) bucket.push(t);
      else map.set(planId, [t]);
    });
    return map;
  }, [tables]);

  const tablesOf = (planId: number): DiningTable[] => tablesByPlan.get(planId) ?? [];

  const filteredPlans = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return plans.filter((p) => {
      // Aislamiento multi-tenant: GET /api/floor-plan NO filtra por comercio (devuelve los
      // planos de todos), pero sí embebe `merchant`, así que recortamos aquí. Los planos sin
      // merchant resuelto se muestran para no ocultar datos por un join incompleto.
      if (p.merchant?.id != null && p.merchant.id !== activeMerchantId) return false;
      if (term && !(p.name ?? '').toLowerCase().includes(term)) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    });
  }, [plans, searchQuery, statusFilter, activeMerchantId]);

  const hasActiveFilter = Boolean(searchQuery || statusFilter);
  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
  };

  const openCreate = () => {
    setFormError('');
    setFormDrawer({ mode: 'create' });
  };

  const handleCreateSubmit = async (dto: UpdateFloorPlanDto) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      // El campo del comercio es `merchant` (número) y no se deriva del JWT en floor-plan.
      const body: CreateFloorPlanDto = {
        merchant: activeMerchantId,
        name: dto.name ?? '',
        width: dto.width ?? 0,
        height: dto.height ?? 0,
        status: dto.status ?? 'active',
      };
      const res = await fetch(`${API_BASE}/floor-plan`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to create floor plan');
      await fetchFloorPlans();
      setFormDrawer(null);
      setToast({ message: 'Floor plan created successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create floor plan');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (id: number, dto: UpdateFloorPlanDto) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      // PATCH (no PUT) y sin `merchant`: Object.assign sobreescribiría la relación.
      const res = await fetch(`${API_BASE}/floor-plan/${id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(dto),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to update floor plan');
      await fetchFloorPlans();
      setFormDrawer(null);
      setToast({ message: 'Floor plan updated successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update floor plan');
    } finally {
      setFormSubmitting(false);
    }
  };

  // El backend no cascadea el borrado: las mesas quedarían apuntando a un plano invisible.
  const requestDelete = (plan: FloorPlan) => {
    if (countsStale) {
      setToast({ message: COUNTS_UNAVAILABLE_MESSAGE, type: 'error' });
      return;
    }
    const guard = floorPlanMutationGuard(tablesOf(plan.id).length);
    if (guard) {
      setToast({ message: guard, type: 'error' });
      return;
    }
    setDeletingPlan(plan);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingPlan) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/floor-plan/${deletingPlan.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to delete floor plan');
      }
      setPlans((prev) => prev.filter((p) => p.id !== deletingPlan.id));
      setDeletingPlan(null);
      setToast({ message: 'Floor plan deleted successfully', type: 'success' });
    } catch (err) {
      setDeletingPlan(null);
      setToast({
        message: err instanceof Error ? err.message : 'Failed to delete floor plan',
        type: 'error',
      });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const isTrueEmpty = !loading && !error && plans.length === 0;
  const isFilteredEmpty = !loading && !error && plans.length > 0 && filteredPlans.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchFloorPlans}
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
          Floor Plans
        </h2>
        <p className="text-[#5f5e5e] text-body-sm mt-1">
          Define the canvases that hold your restaurant layout — zones and tables are placed on top
          of these coordinates.
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
            placeholder="Search by floor plan name..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search floor plans"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none min-w-[160px]"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          {FLOOR_PLAN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {FLOOR_PLAN_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {/* Conmutador de unidades: el gerente lee metros, no píxeles. */}
        <select
          value={unitSystem}
          onChange={(e) => changeUnitSystem(e.target.value as UnitSystem)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Measurement units"
        >
          {UNIT_SYSTEMS.map((s) => (
            <option key={s} value={s}>
              {UNIT_SYSTEM_LABELS[s]}
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
            Create Floor Plan
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

      {/* Censo de mesas/zonas degradado: las píldoras de la parrilla mostrarían 0 sin serlo. */}
      {countsStale && !loading && (
        <div
          data-testid="floor-plans-counts-stale"
          role="status"
          className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-xs"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            warning
          </span>
          <span>{COUNTS_UNAVAILABLE_MESSAGE}</span>
        </div>
      )}

      {/* True empty state */}
      {isTrueEmpty && (
        <div
          data-testid="floor-plans-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
            map
          </span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No floor plans configured. Click &apos;Create Floor Plan&apos; to set up your restaurant
            layout canvas.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              add
            </span>
            Create Floor Plan
          </button>
        </div>
      )}

      {/* Table */}
      {(loading || plans.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              FLOOR PLANS
            </span>
            <span className="text-white/50 text-xs">
              {loading ? 'Loading...' : `${filteredPlans.length} floor plans`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Floor Plan
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Canvas Resolution
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Zones
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
                          No floor plans match your active filters
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
                  filteredPlans.map((p) => {
                    const zoneCount = zoneCountByPlan.get(p.id) ?? 0;
                    const tableCount = tablesOf(p.id).length;
                    // parseOutline nunca lanza: ante un JSON corrupto cae al rectángulo, de modo
                    // que una fila con datos rotos sigue pintando una miniatura coherente.
                    const outline = parseOutline(p.outline, p.width, p.height);
                    return (
                      <tr
                        key={p.id}
                        data-testid={`floor-plan-row-${p.id}`}
                        className="group hover:bg-[#f8f3eb] transition-colors"
                      >
                        {/* Identity */}
                        <td className="px-6 py-4">
                          <p className="text-[11px] text-[#5f5e5e] font-mono">#{p.id}</p>
                          <p className="font-bold text-[#1d1c17]">{p.name}</p>
                        </td>

                        {/* Canvas resolution + silueta de la sala */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <FloorPlanShapeThumb outline={outline} />
                            <div>
                              <p className="text-sm text-[#1d1c17] font-mono">
                                {formatResolution(p.width, p.height, unitSystem)}
                              </p>
                              {isCustomShape(outline) && (
                                <p className="text-[11px] text-[#5f5e5e]">Custom shape</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Zone count */}
                        <td className="px-6 py-4 text-center">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#ece8e0] text-[#1d1c17]">
                            {pluralize(zoneCount, 'Zone', 'Zones')}
                          </span>
                        </td>

                        {/* Table count */}
                        <td className="px-6 py-4 text-center">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#ece8e0] text-[#1d1c17]">
                            {pluralize(tableCount, 'Table', 'Tables')}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${FLOOR_PLAN_STATUS_BADGE_STYLES[p.status]}`}
                          >
                            {FLOOR_PLAN_STATUS_LABELS[p.status]}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center items-center gap-2">
                            {/* El editor 2D es la acción estrella del módulo: va como botón
                                etiquetado y siempre visible, no oculto tras el hover como
                                las acciones secundarias. */}
                            <button
                              type="button"
                              onClick={() => setEditorPlan(p)}
                              aria-label={`Open editor for ${p.name}`}
                              title="Open the layout editor"
                              className="px-3 py-1.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <span
                                className="material-symbols-outlined text-[16px]"
                                aria-hidden="true"
                              >
                                edit_square
                              </span>
                              Open Editor
                            </button>
                            <span className="flex gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => {
                                setFormError('');
                                setFormDrawer({ mode: 'edit', plan: p });
                              }}
                              aria-label={`Edit floor plan ${p.name}`}
                              title="Edit floor plan"
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                            >
                              <span
                                className="material-symbols-outlined text-[20px]"
                                aria-hidden="true"
                              >
                                edit
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => requestDelete(p)}
                              aria-label={`Delete floor plan ${p.name}`}
                              title="Delete floor plan"
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                            >
                              <span
                                className="material-symbols-outlined text-[20px]"
                                aria-hidden="true"
                              >
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

      <DiningSystemQuickLinks active="floor-plans" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={openCreate}
        aria-label="Quick create floor plan"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
      >
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
          add
        </span>
      </button>

      {formDrawer && (
        <FloorPlanFormDrawer
          mode={formDrawer.mode}
          initial={formDrawer.plan}
          planTables={formDrawer.plan ? tablesOf(formDrawer.plan.id) : []}
          tableCountsUnknown={countsStale}
          unitSystem={unitSystem}
          submitting={formSubmitting}
          formError={formError}
          onCancel={() => setFormDrawer(null)}
          onSubmit={(dto) =>
            formDrawer.mode === 'create'
              ? handleCreateSubmit(dto)
              : handleEditSubmit(formDrawer.plan!.id, dto)
          }
        />
      )}

      {deletingPlan && (
        <ConfirmDeletePlanDialog
          plan={deletingPlan}
          unitSystem={unitSystem}
          submitting={deleteSubmitting}
          onCancel={() => setDeletingPlan(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {editorPlan && (
        <FloorPlanEditor
          plan={editorPlan}
          merchantId={activeMerchantId}
          onClose={() => setEditorPlan(null)}
          onSaved={fetchFloorPlans}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default FloorPlansView;
