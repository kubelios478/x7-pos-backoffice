import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { Toast } from '../../shared/Toast';
import type {
  CreateDiningTableDto,
  DiningTable,
  FloorPlan,
  FloorZone,
  TableShape,
  UpdateDiningTableDto,
} from '../../../../types/dining-system';
import {
  FLOOR_PLAN_MIN_DIMENSION,
  FLOOR_PLAN_STATUS_BADGE_STYLES,
  FLOOR_PLAN_STATUS_LABELS,
  TABLE_FOOTPRINT,
  TABLE_MIN_SIZE_PX,
  TABLE_MAX_SIZE_PX,
  tableFootprint,
  TABLE_SHAPES,
  isTableClipped,
  normalizeFloorPlanStatus,
} from '../../../../types/dining-system';
import type { UnitSystem } from '../../../../lib/measurement-units';
import {
  UNIT_SYSTEMS,
  UNIT_SYSTEM_LABELS,
  UNIT_SYSTEM_SHORT,
  formatArea,
  formatDimensions,
  formatLength,
  lengthSuffix,
  lengthToPx,
  lengthValue,
  loadUnitSystem,
  saveUnitSystem,
} from '../../../../lib/measurement-units';
import type { Outline } from '../../../../lib/floor-geometry';
import {
  MIN_OUTLINE_VERTICES,
  OUTLINE_PRESETS,
  clampPointToPolygon,
  insertVertex,
  outlinePath,
  outlineWarning,
  parseOutline,
  pointInPolygon,
  polygonBounds,
  polygonArea,
  rectangleOutline,
  removeVertex,
  serializeOutline,
  tableInsideOutline,
  tablesOutsideOutline,
  validateOutline,
} from '../../../../lib/floor-geometry';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// ---- Constantes espaciales ----

// El fondo dibuja una retícula de 20px, pero las posiciones encajan cada 10px: media
// celda da precisión suficiente sin que el usuario tenga que "afinar" pixel a pixel.
const GRID_PX = 20;
const SNAP_PX = 10;

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const MIN_ZOOM = ZOOM_STEPS[0];
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

// Color de relleno cuando la zona no define uno (el backend permite color null).
const FALLBACK_TABLE_COLOR = '#ae001a';
const DEFAULT_ZONE_COLOR = '#ae001a';

// ---- Contorno de la sala ----

// El suelo conserva el crema de siempre y el exterior se apaga: sin ese contraste una planta
// en L se leería como un rectángulo con una mancha, no como una sala con una pared dentro.
const FLOOR_FILL = '#fef9f1';
const OUTSIDE_FILL = '#e0d9cd';
const GRID_LINE = '#e2dbd0';
const WALL_COLOR = '#222222';
const WALL_WIDTH = 4;

// Medidas de los manejadores en px de PANTALLA: se dividen por el zoom al pintarlos para que
// sigan siendo agarrables al 25% y no se conviertan en bloques enormes al 200%.
const VERTEX_HANDLE_PX = 12;
const EDGE_HANDLE_PX = 7;

type EditorMode = 'tables' | 'shape' | 'zones';

const TABLE_STATUSES = ['available', 'occupied', 'reserved', 'out_of_service'];

// ---- Unidades de presentación ----

// El botón sólo puede lucir "m"/"ft", así que el nombre completo del sistema viaja en el
// aria-label: un lector de pantalla no debe tener que adivinar qué significa "ft".
const UNIT_SYSTEM_ARIA: Record<UnitSystem, string> = {
  metric: 'Show measurements in meters',
  imperial: 'Show measurements in feet and inches',
};

// Paso de los inputs de coordenadas. En px valía 10 (la retícula); en metros o pies ese
// mismo 10 sería un salto de 10 m, así que se afina a la centésima — que es además la
// precisión con la que `lengthValue` devuelve el número y evita un stepMismatch del navegador.
const COORD_STEP = 0.01;

// `limit` está topado a 100 en /api/tables (@Max(100)); MAX_PAGES es sólo un cinturón de
// seguridad para que un `totalPages` corrupto no deje el editor girando en bucle.
const PAGE_LIMIT = 100;
const MAX_PAGES = 25;

// ---- Helpers ----

const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), max);

const snap = (v: number): number => Math.round(v / SNAP_PX) * SNAP_PX;

// La huella depende de la MESA (puede traer tamaño propio), no solo de su forma. Se
// mantiene una variante por forma para la paleta, donde todavía no existe una mesa.
const footprintOf = (shape: TableShape) =>
  TABLE_FOOTPRINT[shape] ?? TABLE_FOOTPRINT.Square;

const footprintOfTable = (t: {
  shape: TableShape;
  width?: number | null;
  height?: number | null;
}) => tableFootprint(t);

// Redondeo del contorno por forma: un óvalo es una elipse completa, un reservado tiene
// las esquinas muy suavizadas y una barra apenas.
const shapeRadiusClass = (shape: TableShape): string => {
  if (shape === 'Circle' || shape === 'Oval') return 'rounded-full';
  if (shape === 'Booth') return 'rounded-2xl';
  return 'rounded';
};

// Nest devuelve `message` como string o string[], y el ValidationExceptionFilter añade
// `errors`. Aplanamos todo a una sola línea para poder mostrarla junto a la mesa.
interface ApiErrorBody {
  message?: string | string[];
  errors?: string[];
}

const errorMessageOf = (body: ApiErrorBody | null | undefined): string => {
  if (!body) return '';
  if (Array.isArray(body.errors) && body.errors.length > 0) return body.errors.join(', ');
  if (Array.isArray(body.message)) return body.message.join(', ');
  return typeof body.message === 'string' ? body.message : '';
};

// El mayor paso de zoom que deja el lienzo entero dentro del viewport disponible.
const fitZoom = (
  viewportW: number,
  viewportH: number,
  canvasW: number,
  canvasH: number,
): number => {
  if (!viewportW || !viewportH || !canvasW || !canvasH) return 1;
  const raw = Math.min(viewportW / canvasW, viewportH / canvasH);
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i -= 1) {
    if (ZOOM_STEPS[i] <= raw) return ZOOM_STEPS[i];
  }
  return MIN_ZOOM;
};

// Reencaja una mesa dentro del contorno de la sala.
//
// clampPointToPolygon acota PUNTOS y una mesa es un rectángulo, así que la empujamos esquina a
// esquina: proyectar sólo el centro no serviría, porque el centro puede estar cómodamente
// dentro mientras una esquina asoma por la muesca de una planta en L. Cada iteración mete al
// menos una esquina; el tope evita ciclar en salas más estrechas que la propia mesa.
const containToOutline = (
  x: number,
  y: number,
  shape: TableShape,
  outline: Outline,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } => {
  if (tableInsideOutline({ pos_x: x, pos_y: y, shape }, outline)) return { x, y };

  const fp = footprintOf(shape);
  let nextX = x;
  let nextY = y;

  for (let pass = 0; pass < 8; pass += 1) {
    const corners: Outline = [
      { x: nextX, y: nextY },
      { x: nextX + fp.w, y: nextY },
      { x: nextX + fp.w, y: nextY + fp.h },
      { x: nextX, y: nextY + fp.h },
    ];
    const stray = corners.find((c) => !pointInPolygon(c, outline));
    if (!stray) break;
    const target = clampPointToPolygon(stray, outline);
    // Sin desplazamiento posible (sala degenerada): mejor parar que iterar en balde.
    if (target.x === stray.x && target.y === stray.y) break;
    nextX += target.x - stray.x;
    nextY += target.y - stray.y;
  }

  const fit = (px: number, py: number) => ({
    x: clamp(px, 0, Math.max(0, canvasW - fp.w)),
    y: clamp(py, 0, Math.max(0, canvasH - fp.h)),
  });

  const snapped = fit(snap(nextX), snap(nextY));
  if (tableInsideOutline({ pos_x: snapped.x, pos_y: snapped.y, shape }, outline)) return snapped;
  // La retícula de 10px es una comodidad; no salirse de la sala es la regla.
  return fit(Math.round(nextX), Math.round(nextY));
};

// Busca un hueco libre en espiral cuadrada desde el centro del lienzo, para que las
// mesas nuevas no se apilen unas sobre otras al pulsar "Add" varias veces seguidas.
const findFreeSpot = (
  shape: TableShape,
  existing: Array<Pick<DiningTable, 'pos_x' | 'pos_y' | 'shape'>>,
  canvasW: number,
  canvasH: number,
  outline: Outline,
): { x: number; y: number } => {
  const fp = footprintOf(shape);
  const maxX = Math.max(0, canvasW - fp.w);
  const maxY = Math.max(0, canvasH - fp.h);
  const cx = clamp(snap(canvasW / 2 - fp.w / 2), 0, maxX);
  const cy = clamp(snap(canvasH / 2 - fp.h / 2), 0, maxY);

  const overlaps = (x: number, y: number): boolean =>
    existing.some((t) => {
      const other = footprintOfTable(t);
      return (
        x < t.pos_x + other.w &&
        x + fp.w > t.pos_x &&
        y < t.pos_y + other.h &&
        y + fp.h > t.pos_y
      );
    });

  for (let ring = 0; ring < 30; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const x = clamp(snap(cx + dx * GRID_PX), 0, maxX);
        const y = clamp(snap(cy + dy * GRID_PX), 0, maxY);
        // En una planta en L el centro del lienzo puede caer en la muesca: la retícula se
        // recorre igual, pero sólo valen los puntos que además están dentro de la sala.
        if (!tableInsideOutline({ pos_x: x, pos_y: y, shape }, outline)) continue;
        if (!overlaps(x, y)) return { x, y };
      }
    }
  }
  // Sala llena: preferimos una mesa solapada pero visible dentro del salón a una fuera.
  return containToOutline(cx, cy, shape, outline, canvasW, canvasH);
};

// Siguiente "T{n}" libre. El índice UNIQUE (merchant_id, number) del backend convierte
// una colisión en un 409 duro, así que la deduplicación se hace en cliente antes de POST.
const nextTableNumber = (taken: Set<string>): string => {
  for (let i = 1; i < 5000; i += 1) {
    const candidate = `T${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `T${Date.now()}`;
};

// ---- Tipos locales ----

// Las mesas sin guardar viven con id negativo: sirve como clave estable de React, como
// data-testid y como marcador de "esto todavía no existe en el servidor".
type EditorTable = DiningTable;

export interface FloorPlanEditorProps {
  plan: FloorPlan;
  onClose: () => void;
  onSaved?: () => void;
  merchantId: number;
}

export const FloorPlanEditor: React.FC<FloorPlanEditorProps> = ({
  plan,
  onClose,
  onSaved,
  merchantId,
}) => {
  // Un plano con dimensiones corruptas dejaría un lienzo de 0px sin superficie donde
  // soltar mesas; caemos al mínimo del dominio para que el editor siga siendo usable.
  const canvasW = plan.width > 0 ? plan.width : FLOOR_PLAN_MIN_DIMENSION;
  const canvasH = plan.height > 0 ? plan.height : FLOOR_PLAN_MIN_DIMENSION;
  // El backend persiste el estado como varchar libre ('inactive'/'deleted' incluidos):
  // normalizamos antes de indexar los mapas de badge para no pintar "undefined".
  const planStatus = normalizeFloorPlanStatus(plan.status);

  // El contorno vive en el propio plano (`floor_plan.outline`, columna text nullable) y no en
  // las mesas: por eso se guarda con un PATCH aparte y lleva su propio flag de "sucio".
  const [mode, setMode] = useState<EditorMode>('tables');
  const [outline, setOutline] = useState<Outline>(() =>
    parseOutline(plan.outline, canvasW, canvasH),
  );
  const [outlineDirty, setOutlineDirty] = useState(false);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);

  // Región dibujada de cada zona (id -> polígono). Se hidrata de `zone.area` y vive aparte
  // del contorno de la sala: son polígonos independientes que se guardan por PATCH a su zona.
  const [zoneAreas, setZoneAreas] = useState<Map<number, Outline>>(new Map());
  const [dirtyZoneIds, setDirtyZoneIds] = useState<Set<number>>(new Set());
  const [selectedZoneVertex, setSelectedZoneVertex] = useState<number | null>(null);
  const [pendingPreset, setPendingPreset] = useState<{
    label: string;
    outline: Outline;
    warning: string;
  } | null>(null);

  const [tables, setTables] = useState<EditorTable[]>([]);
  const [zones, setZones] = useState<FloorZone[]>([]);
  const [activeZoneId, setActiveZoneId] = useState<number | null>(null);
  const [takenNumbers, setTakenNumbers] = useState<Set<string>>(new Set());

  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set());
  const [pendingDeletes, setPendingDeletes] = useState<number[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [zoom, setZoom] = useState(1);
  // Unidad de LECTURA. El píxel sigue siendo la unidad de almacenamiento y de cálculo: aquí
  // sólo se decide cómo se enseña y cómo se teclea, nunca lo que viaja a la API.
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(loadUnitSystem);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  // El borrador de zona sirve para crear y para editar: 'edit' guarda el id que se está
  // renombrando/recoloreando, null significa alta nueva.
  const [zoneDraftOpen, setZoneDraftOpen] = useState(false);
  const [zoneDraftEditId, setZoneDraftEditId] = useState<number | null>(null);

  // Zona activa resuelta: alimenta el swatch y el formulario de edición.
  const activeZone = useMemo(
    () => zones.find((z) => z.id === activeZoneId) ?? null,
    [zones, activeZoneId],
  );
  const [zoneDraftName, setZoneDraftName] = useState('');
  const [zoneDraftColor, setZoneDraftColor] = useState(DEFAULT_ZONE_COLOR);
  const [zoneBusy, setZoneBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null,
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  // Estado del arrastre fuera de React: un re-render por pointermove sólo para recordar
  // el offset del puntero sería ruido puro.
  const dragRef = useRef<{ id: number; dx: number; dy: number } | null>(null);
  // Mismo patrón para los vértices del contorno: el desfase puntero-vértice se guarda al
  // agarrar, si no el vértice saltaría bajo el cursor en el primer movimiento.
  const vertexDragRef = useRef<{ index: number; dx: number; dy: number } | null>(null);
  // Espejo síncrono del contorno para los handlers de puntero (ver tablesRef).
  const outlineRef = useRef<Outline>(outline);
  useEffect(() => {
    outlineRef.current = outline;
  }, [outline]);
  // Fotografía de las filas tal como vinieron del servidor, para enviar en el PUT sólo
  // el subconjunto realmente modificado (el backend rechaza cuerpos vacíos con 400).
  const originalById = useRef<Map<number, DiningTable>>(new Map());
  const tempIdRef = useRef(-1);
  const zoomInitialized = useRef(false);
  // Espejo síncrono del estado para los handlers de puntero, que se disparan más rápido
  // de lo que React re-renderiza.
  const tablesRef = useRef<EditorTable[]>([]);
  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // El editor vive en un portal colgado de <body>: al abrirlo el foco se quedaba en el
  // botón del grid que queda detrás del overlay aria-modal, así que lo traemos dentro.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearAuthSession();
    window.location.href = '/login';
  }, []);

  // ---------------- Carga inicial ----------------

  // Ninguno de los dos listados acepta filtro por plano y ambos vienen paginados
  // (`limit` tope 100 en /api/tables), así que hay que recorrer las páginas: con una
  // sola, un comercio con más de 100 mesas vería su plano a medias y el pool de números
  // ocupados incompleto reventaría en 409 al guardar. La clave de paginación difiere por
  // endpoint: `paginationMeta` en /api/tables y `pagination` en /api/floor-zone.
  const fetchAllPages = useCallback(
    async <T,>(
      resource: string,
    ): Promise<{ rows: T[]; ok: boolean; unauthorized: boolean }> => {
      const rows: T[] = [];
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const res = await fetch(`${API_BASE}/${resource}?limit=${PAGE_LIMIT}&page=${page}`, {
          headers: authHeaders(),
        });
        if (res.status === 401) return { rows, ok: false, unauthorized: true };
        if (!res.ok) return { rows, ok: false, unauthorized: false };
        const json = (await res.json()) as {
          data?: T[];
          paginationMeta?: { totalPages?: number };
          pagination?: { totalPages?: number };
        };
        rows.push(...(json.data ?? []));
        const totalPages =
          json.paginationMeta?.totalPages ?? json.pagination?.totalPages ?? 1;
        if (page >= totalPages) break;
      }
      return { rows, ok: true, unauthorized: false };
    },
    [authHeaders],
  );

  const loadLayout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tablesResult, zonesResult] = await Promise.all([
        fetchAllPages<DiningTable>('tables'),
        fetchAllPages<FloorZone>('floor-zone'),
      ]);

      if (tablesResult.unauthorized || zonesResult.unauthorized) {
        handleUnauthorized();
        return;
      }
      if (!tablesResult.ok) throw new Error('Error al cargar las mesas del plano');

      const allTables = tablesResult.rows;

      // GET /api/tables no expone ningún filtro por plano y la respuesta no trae un
      // escalar floor_plan_id: el único vínculo es el objeto anidado `floorPlan`, que sí
      // viene hidratado (leftJoinAndSelect). Por eso filtramos en cliente y no hace falta
      // el fallback por /tables/:id ni /floor-plan/:id.
      const planTables = allTables.filter(
        (t) => t.floorPlan?.id === plan.id && t.status !== 'deleted',
      );

      // El pool de números ocupados incluye las mesas borradas en soft: la fila sigue en
      // la tabla y el índice UNIQUE (merchant_id, number) también.
      setTakenNumbers(new Set(allTables.map((t) => (t.number ?? '').toLowerCase())));

      originalById.current = new Map(planTables.map((t) => [t.id, { ...t }]));
      setTables(planTables.map((t) => ({ ...t })));
      setDirtyIds(new Set());
      setPendingDeletes([]);

      // /api/floor-zone NO está scopeado por merchant (findAll ignora el JWT), así que
      // filtramos por floorPlan.id: el plano ya pertenece a un único comercio.
      const planZones = zonesResult.rows.filter(
        (z) => z.floorPlan?.id === plan.id && z.status !== 'deleted',
      );
      setZones(planZones);
      // Hidratamos las regiones dibujadas; una zona sin `area` simplemente no aparece
      // en el mapa y se sigue comportando como etiqueta de color.
      setZoneAreas(() => {
        const next = new Map<number, Outline>();
        planZones.forEach((z) => {
          if (z.area) {
            const parsed = parseOutline(z.area, canvasW, canvasH);
            if (parsed.length >= 3) next.set(z.id, parsed);
          }
        });
        return next;
      });
      setActiveZoneId((prev) =>
        prev && planZones.some((z) => z.id === prev) ? prev : (planZones[0]?.id ?? null),
      );
    } catch (err) {
      console.error('Error fetching floor plan layout:', err);
      setError('Failed to load the floor plan layout. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  }, [fetchAllPages, handleUnauthorized, plan.id]);

  useEffect(() => {
    void loadLayout();
  }, [loadLayout]);

  // El editor se monta por plano, pero si el padre reutilizara la instancia para otro habría
  // que releer el contorno: seguir editando la sala anterior guardaría la forma equivocada.
  // Se compara el id y no `plan.outline` a propósito: un refresco del padre tras guardar trae
  // el mismo plano y no debe pisar lo que el usuario tenga dibujado.
  const loadedPlanId = useRef(plan.id);
  useEffect(() => {
    if (loadedPlanId.current === plan.id) return;
    loadedPlanId.current = plan.id;
    setOutline(parseOutline(plan.outline, canvasW, canvasH));
    setOutlineDirty(false);
    setSelectedVertex(null);
    setPendingPreset(null);
  }, [plan.id, plan.outline, canvasW, canvasH]);

  // Zoom inicial: el mayor paso que hace caber el plano completo en el viewport.
  useEffect(() => {
    if (zoomInitialized.current) return;
    const el = viewportRef.current;
    if (!el) return;
    const w = el.clientWidth - 64;
    const h = el.clientHeight - 64;
    if (w <= 0 || h <= 0) return;
    zoomInitialized.current = true;
    setZoom(fitZoom(w, h, canvasW, canvasH));
  }, [canvasW, canvasH, loading]);

  // ---------------- Derivados ----------------

  const zoneById = useMemo(() => {
    const map = new Map<number, FloorZone>();
    zones.forEach((z) => map.set(z.id, z));
    return map;
  }, [zones]);

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedId) ?? null,
    [tables, selectedId],
  );

  // El índice sobrevive a borrar un vértice (queda fuera de rango), de ahí el ?? null.
  const selectedVertexPoint = useMemo(
    () => (selectedVertex === null ? null : (outline[selectedVertex] ?? null)),
    [outline, selectedVertex],
  );

  // El contorno cuenta como un cambio pendiente más: se guarda en la misma pulsación de
  // "Save layout" aunque viaje por otro endpoint.
  const dirtyCount = useMemo(
    () =>
      tables.filter((t) => t.id < 0 || dirtyIds.has(t.id)).length +
      pendingDeletes.length +
      (outlineDirty ? 1 : 0) +
      dirtyZoneIds.size,
    [tables, dirtyIds, pendingDeletes, outlineDirty, dirtyZoneIds],
  );

  // Mesas cuya huella se sale de la sala (no del lienzo): con una planta en L el rectángulo
  // del papel ya no es la frontera real.
  const outsideCount = useMemo(() => tablesOutsideOutline(tables, outline), [tables, outline]);

  // Superficie en px² (fórmula del cordón). Se guarda cruda a propósito: la conversión a m²
  // o ft² es cosa del render, que es quien sabe qué unidad ha elegido el usuario.
  const roomAreaPx2 = useMemo(() => polygonArea(outline), [outline]);

  // "Custom" = el contorno ya no es el rectángulo completo del lienzo. Sólo entonces tiene
  // sentido anunciar la superficie: en un rectángulo el usuario ya la deduce de width × height.
  const customShape = useMemo(
    () => outline.length !== 4 || Math.abs(roomAreaPx2 - canvasW * canvasH) > 0.5,
    [outline.length, roomAreaPx2, canvasW, canvasH],
  );

  const clippedCount = useMemo(
    () => tables.filter((t) => isTableClipped(t, canvasW, canvasH)).length,
    [tables, canvasW, canvasH],
  );

  const duplicateNumbers = useMemo(() => {
    const seen = new Map<string, number>();
    const dupes = new Set<string>();
    tables.forEach((t) => {
      const key = (t.number ?? '').trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) dupes.add(key);
      seen.set(key, t.id);
    });
    return dupes;
  }, [tables]);

  const tableColor = useCallback(
    (t: EditorTable): string => {
      const zone = t.floorZone?.id != null ? zoneById.get(t.floorZone.id) : undefined;
      return zone?.color || t.floorZone?.color || FALLBACK_TABLE_COLOR;
    },
    [zoneById],
  );

  // ---------------- Mutaciones locales ----------------

  const markDirty = useCallback((id: number) => {
    if (id < 0) return; // las mesas nuevas ya cuentan como pendientes por su id negativo
    setDirtyIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const patchTable = useCallback(
    (id: number, patch: Partial<EditorTable>) => {
      setTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      markDirty(id);
    },
    [markDirty],
  );

  // Posición siempre en px de lienzo (nunca de pantalla), pegada a la retícula y
  // recortada para que la huella no se salga del plano. Se lee de tablesRef y no de un
  // updater porque marcar "sucio" es un efecto colateral que no puede vivir dentro de
  // setState (React lo invoca dos veces en modo estricto).
  const moveTable = useCallback(
    (id: number, rawX: number, rawY: number) => {
      const current = tablesRef.current.find((t) => t.id === id);
      if (!current) return;
      const fp = footprintOfTable(current);
      const boxX = clamp(snap(rawX), 0, Math.max(0, canvasW - fp.w));
      const boxY = clamp(snap(rawY), 0, Math.max(0, canvasH - fp.h));
      // Dos fronteras: el papel (lienzo) y la sala (contorno). Con un contorno rectangular la
      // segunda no cambia nada; con una planta en L impide soltar la mesa en la muesca.
      const { x, y } = containToOutline(
        boxX,
        boxY,
        current.shape,
        outlineRef.current,
        canvasW,
        canvasH,
      );
      // Un clic sin desplazamiento real no debe ensuciar el layout.
      if (x === current.pos_x && y === current.pos_y) return;
      setTables((prev) =>
        prev.map((t) => (t.id === id ? { ...t, pos_x: x, pos_y: y } : t)),
      );
      markDirty(id);
    },
    [canvasW, canvasH, markDirty],
  );

  const removeTable = useCallback((id: number) => {
    setTables((prev) => prev.filter((t) => t.id !== id));
    setDirtyIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // Una mesa creada localmente y borrada antes de guardar simplemente desaparece: no
    // existe en el servidor, así que no hay DELETE que encolar.
    if (id > 0) setPendingDeletes((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  // ---------------- Contorno de la sala ----------------

  // Toda mutación del contorno pasa por aquí: refresca el espejo síncrono (los handlers de
  // puntero lo leen antes de que React re-renderice) y marca el plano como pendiente de PATCH.
  const applyOutline = useCallback((next: Outline) => {
    outlineRef.current = next;
    setOutline(next);
    setOutlineDirty(true);
  }, []);

  const moveVertex = useCallback(
    (index: number, rawX: number, rawY: number) => {
      const current = outlineRef.current;
      const vertex = current[index];
      if (!vertex) return;
      // Los vértices se acotan al lienzo entero (no a la huella de una mesa): una esquina de
      // la sala sí puede tocar el borde del papel.
      const x = clamp(snap(rawX), 0, canvasW);
      const y = clamp(snap(rawY), 0, canvasH);
      if (x === vertex.x && y === vertex.y) return;
      applyOutline(current.map((p, i) => (i === index ? { x, y } : p)));
    },
    [applyOutline, canvasW, canvasH],
  );

  const insertAtEdge = useCallback(
    (edgeIndex: number) => {
      applyOutline(insertVertex(outlineRef.current, edgeIndex));
      // El vértice nuevo queda justo detrás de la arista: dejarlo seleccionado permite
      // arrastrarlo o borrarlo sin tener que buscarlo entre los demás.
      setSelectedVertex(edgeIndex + 1);
    },
    [applyOutline],
  );

  // Un puntero real dispara pointerdown y DESPUÉS click sobre el mismo manejador; sin esta
  // ventana el gesto insertaría dos vértices. Un click suelto (teclado, pruebas sintéticas)
  // no encuentra rastro reciente y sí inserta.
  const lastEdgeInsert = useRef<{ edge: number; at: number } | null>(null);

  const handleEdgePointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>, edgeIndex: number) => {
      if (e.button !== 0) return;
      e.preventDefault();
      lastEdgeInsert.current = { edge: edgeIndex, at: Date.now() };
      insertAtEdge(edgeIndex);
    },
    [insertAtEdge],
  );

  const handleEdgeActivate = useCallback(
    (edgeIndex: number) => {
      const last = lastEdgeInsert.current;
      if (last && last.edge === edgeIndex && Date.now() - last.at < 600) {
        lastEdgeInsert.current = null;
        return;
      }
      insertAtEdge(edgeIndex);
    },
    [insertAtEdge],
  );

  const deleteVertex = useCallback(
    (index: number) => {
      const next = removeVertex(outlineRef.current, index);
      // removeVertex devuelve la MISMA referencia cuando no puede quitar (suelo de 3
      // esquinas): así la regla vive en un único sitio y aquí sólo se explica al usuario.
      if (next === outlineRef.current) {
        setToast({
          message: `A room needs at least ${MIN_OUTLINE_VERTICES} corners.`,
          type: 'error',
        });
        return;
      }
      applyOutline(next);
      setSelectedVertex(null);
    },
    [applyOutline],
  );

  // Cambiar de forma puede dejar mesas en la calle: se avisa ANTES de aplicar y se deja
  // continuar, pero nunca en silencio.
  const requestOutline = useCallback(
    (label: string, candidate: Outline) => {
      const warning = outlineWarning(tablesOutsideOutline(tablesRef.current, candidate));
      if (warning) {
        setPendingPreset({ label, outline: candidate, warning });
        return;
      }
      applyOutline(candidate);
      setSelectedVertex(null);
    },
    [applyOutline],
  );

  const confirmPendingPreset = useCallback(() => {
    if (!pendingPreset) return;
    applyOutline(pendingPreset.outline);
    setSelectedVertex(null);
    setPendingPreset(null);
  }, [applyOutline, pendingPreset]);

  const bringTablesInside = useCallback(() => {
    const current = outlineRef.current;
    const strays = tablesRef.current.filter((t) => !tableInsideOutline(t, current));
    if (strays.length === 0) return;
    strays.forEach((t) => {
      const spot = containToOutline(t.pos_x, t.pos_y, t.shape, current, canvasW, canvasH);
      if (spot.x === t.pos_x && spot.y === t.pos_y) return;
      patchTable(t.id, { pos_x: spot.x, pos_y: spot.y });
    });
    setToast({
      message: `${strays.length} table${strays.length === 1 ? '' : 's'} moved inside the room`,
      type: 'success',
    });
  }, [canvasW, canvasH, patchTable]);

  // ---------------- Zonas ----------------

  const createZone = useCallback(
    async (name: string, color: string): Promise<FloorZone | null> => {
      setZoneBusy(true);
      try {
        const res = await fetch(`${API_BASE}/floor-zone`, {
          method: 'POST',
          headers: authHeaders(),
          // Los cinco campos son @IsNotEmpty y `floorPlan`/`merchant` viajan como enteros
          // planos (el backend no deriva el comercio del JWT en este módulo).
          body: JSON.stringify({
            merchant: merchantId,
            name,
            color,
            floorPlan: plan.id,
            status: 'active',
          }),
        });
        if (res.status === 401) {
          handleUnauthorized();
          return null;
        }
        const json = (await res.json().catch(() => ({}))) as ApiErrorBody & {
          data?: FloorZone;
        };
        if (!res.ok || !json.data) {
          throw new Error(errorMessageOf(json) || 'Failed to create the floor zone');
        }
        const created = json.data;
        setZones((prev) => [...prev, created]);
        setActiveZoneId(created.id);
        return created;
      } catch (err) {
        setToast({
          message: err instanceof Error ? err.message : 'Failed to create the floor zone',
          type: 'error',
        });
        return null;
      } finally {
        setZoneBusy(false);
      }
    },
    [authHeaders, handleUnauthorized, merchantId, plan.id],
  );

  const updateZone = useCallback(
    async (id: number, name: string, color: string): Promise<FloorZone | null> => {
      setZoneBusy(true);
      try {
        // PATCH y sin `merchant`: la zona no cambia de comercio al renombrarla.
        const res = await fetch(`${API_BASE}/floor-zone/${id}`, {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ name, color }),
        });
        if (res.status === 401) {
          handleUnauthorized();
          return null;
        }
        const json = (await res.json().catch(() => ({}))) as ApiErrorBody & {
          data?: FloorZone;
        };
        if (!res.ok) {
          throw new Error(errorMessageOf(json) || 'Failed to update the floor zone');
        }
        const updated = json.data ?? null;
        setZones((prev) =>
          prev.map((z) => (z.id === id ? { ...z, ...(updated ?? {}), name, color } : z)),
        );
        return updated;
      } catch (err) {
        setToast({
          message: err instanceof Error ? err.message : 'Failed to update the floor zone',
          type: 'error',
        });
        return null;
      } finally {
        setZoneBusy(false);
      }
    },
    [authHeaders, handleUnauthorized],
  );

  // ---------------- Áreas de zona ----------------

  const markZoneDirty = useCallback((id: number) => {
    setDirtyZoneIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  /** Dibuja una región por defecto para la zona activa: un cuarto del lienzo, centrado. */
  const drawZoneArea = useCallback(() => {
    if (activeZoneId == null) return;
    const w = Math.max(120, Math.round(canvasW / 2));
    const h = Math.max(120, Math.round(canvasH / 2));
    const x = Math.round((canvasW - w) / 2);
    const y = Math.round((canvasH - h) / 2);
    const rect: Outline = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
    setZoneAreas((prev) => new Map(prev).set(activeZoneId, rect));
    markZoneDirty(activeZoneId);
    setSelectedZoneVertex(null);
  }, [activeZoneId, canvasW, canvasH, markZoneDirty]);

  /** Quita la región: la zona vuelve a ser sólo una etiqueta de color. */
  const clearZoneArea = useCallback(() => {
    if (activeZoneId == null) return;
    setZoneAreas((prev) => {
      const next = new Map(prev);
      next.delete(activeZoneId);
      return next;
    });
    markZoneDirty(activeZoneId);
    setSelectedZoneVertex(null);
  }, [activeZoneId, markZoneDirty]);

  /** ¿En qué zona cae un punto del lienzo? Da la primera región que lo contiene. */
  const zoneAtPoint = useCallback(
    (x: number, y: number): number | null => {
      for (const [id, poly] of zoneAreas) {
        if (pointInPolygon({ x, y }, poly)) return id;
      }
      return null;
    },
    [zoneAreas],
  );

  const handleSaveZoneDraft = useCallback(async () => {
    const name = zoneDraftName.trim();
    if (!name || zoneBusy) return;
    if (zoneDraftEditId != null) {
      const ok = await updateZone(zoneDraftEditId, name, zoneDraftColor);
      if (ok !== null) {
        setZoneDraftOpen(false);
        setZoneDraftEditId(null);
      }
      return;
    }
    const created = await createZone(name, zoneDraftColor);
    if (created) {
      setZoneDraftOpen(false);
      setZoneDraftName('');
    }
  }, [
    createZone,
    updateZone,
    zoneBusy,
    zoneDraftColor,
    zoneDraftEditId,
    zoneDraftName,
  ]);


  // ---------------- Añadir mesa ----------------

  const addTable = useCallback(
    async (shape: TableShape) => {
      let zone: FloorZone | null =
        zones.find((z) => z.id === activeZoneId) ?? zones[0] ?? null;

      // `floorZone` es obligatorio al crear una mesa (@IsNotEmpty en CreateTableDto): sin
      // ninguna zona el POST /api/tables sería imposible, así que creamos "General" al
      // vuelo la primera vez. Es la única escritura que ocurre antes de "Save layout".
      if (!zone) {
        zone = await createZone('General', DEFAULT_ZONE_COLOR);
        if (!zone) return;
      }
      if (activeZoneId !== zone.id) setActiveZoneId(zone.id);

      const zoneRef = { id: zone.id, name: zone.name, color: zone.color ?? null };
      const tempId = tempIdRef.current;
      tempIdRef.current -= 1;
      // Leemos el contorno fuera del updater: React puede invocarlo dos veces en modo estricto
      // y el hueco debe calcularse contra la misma sala en ambas pasadas.
      const currentOutline = outlineRef.current;

      setTables((prev) => {
        const taken = new Set(takenNumbers);
        prev.forEach((t) => taken.add((t.number ?? '').toLowerCase()));
        const spot = findFreeSpot(shape, prev, canvasW, canvasH, currentOutline);
        const fresh: EditorTable = {
          id: tempId,
          merchant_id: merchantId,
          number: nextTableNumber(taken),
          capacity: 4,
          status: 'available',
          // `location` también es @IsNotEmpty: usamos el nombre de la zona como valor
          // inicial razonable en lugar de mandar una cadena vacía y comerse un 400.
          location: zone.name,
          rotation: 0,
          shape,
          pos_x: spot.x,
          pos_y: spot.y,
          floorPlan: { id: plan.id, name: plan.name },
          floorZone: zoneRef,
        };
        return [...prev, fresh];
      });
      setSelectedId(tempId);
    },
    [activeZoneId, canvasW, canvasH, createZone, merchantId, plan.id, plan.name, takenNumbers, zones],
  );

  // ---------------- Arrastre ----------------

  // Pantalla -> lienzo: el contenedor está escalado con CSS transform, de modo que
  // getBoundingClientRect ya viene multiplicado por el zoom y hay que dividir para
  // recuperar px de lienzo. Guardar px de pantalla corrompería las coordenadas.
  const toCanvasCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
    },
    [zoom],
  );

  const handleTablePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, t: EditorTable) => {
      // Los controles embebidos (botón de borrado rápido) no deben iniciar un arrastre.
      if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) return;
      setSelectedId(t.id);
      // preventDefault() cancela el mousedown y con él el foco implícito, así que lo
      // damos a mano: sin foco las flechas del teclado nunca llegan a la mesa y el foco
      // se queda en el botón del grid que hay detrás del overlay aria-modal.
      // preventScroll evita que el viewport salte justo al empezar a arrastrar.
      e.currentTarget.focus({ preventScroll: true });
      // Sólo el botón primario arrastra: con el secundario el usuario va a por el menú
      // contextual, y mover la mesa ahí dejaba el layout sucio sin que se notara.
      if (e.button !== 0) return;
      const point = toCanvasCoords(e.clientX, e.clientY);
      if (!point) return;
      dragRef.current = { id: t.id, dx: point.x - t.pos_x, dy: point.y - t.pos_y };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // jsdom / navegadores antiguos sin pointer capture: el arrastre sigue funcionando
        // mientras el puntero no salga del elemento.
      }
      e.preventDefault();
    },
    [toCanvasCoords],
  );

  const handleTablePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const point = toCanvasCoords(e.clientX, e.clientY);
      if (!point) return;
      moveTable(drag.id, point.x - drag.dx, point.y - drag.dy);
    },
    [moveTable, toCanvasCoords],
  );

  const handleTablePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ver comentario en pointerdown.
      }
      // Al soltar, la región donde cae el CENTRO de la mesa manda: si pertenece a una zona
      // dibujada, la mesa se reasigna a ella. Es lo que hace que las áreas signifiquen algo
      // en vez de ser sólo decoración.
      const table = tablesRef.current.find((t) => t.id === drag.id);
      if (!table) return;
      const fp = footprintOfTable(table);
      const zoneId = zoneAtPoint(table.pos_x + fp.w / 2, table.pos_y + fp.h / 2);
      if (zoneId != null && table.floorZone?.id !== zoneId) {
        const zone = zones.find((z) => z.id === zoneId);
        if (zone) {
          patchTable(table.id, {
            floorZone: { id: zone.id, name: zone.name, color: zone.color ?? null },
          });
        }
      }
    },
    [patchTable, zoneAtPoint, zones],
  );

  // ---- Arrastre de vértices (modo ROOM SHAPE) ----

  // Arrastre de vértices de la región de zona. Mismo patrón que el contorno de sala:
  // guardamos el desfase del puntero para que el vértice no salte al cursor al agarrarlo.
  const zoneVertexDragRef = useRef<{ index: number; dx: number; dy: number } | null>(null);

  const handleZoneVertexPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>, index: number) => {
      setSelectedZoneVertex(index);
      if (e.button !== 0 || activeZoneId == null) return;
      const point = toCanvasCoords(e.clientX, e.clientY);
      const poly = zoneAreas.get(activeZoneId);
      const vertex = poly?.[index];
      if (!point || !vertex) return;
      zoneVertexDragRef.current = { index, dx: point.x - vertex.x, dy: point.y - vertex.y };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // jsdom no implementa setPointerCapture.
      }
      e.preventDefault();
    },
    [activeZoneId, toCanvasCoords, zoneAreas],
  );

  const handleZoneVertexPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const drag = zoneVertexDragRef.current;
      if (!drag || activeZoneId == null) return;
      const point = toCanvasCoords(e.clientX, e.clientY);
      if (!point) return;
      // Snap a la rejilla y clamp al lienzo, en coordenadas de lienzo (ya sin zoom).
      const x = clamp(snap(point.x - drag.dx), 0, canvasW);
      const y = clamp(snap(point.y - drag.dy), 0, canvasH);
      setZoneAreas((prev) => {
        const poly = prev.get(activeZoneId);
        if (!poly) return prev;
        const next = poly.map((p, i) => (i === drag.index ? { x, y } : p));
        return new Map(prev).set(activeZoneId, next);
      });
      markZoneDirty(activeZoneId);
    },
    [activeZoneId, canvasW, canvasH, markZoneDirty, toCanvasCoords],
  );

  const handleZoneVertexPointerUp = useCallback((e: React.PointerEvent<SVGRectElement>) => {
    zoneVertexDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // jsdom.
    }
  }, []);

  const handleVertexPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>, index: number) => {
      setSelectedVertex(index);
      try {
        // Igual que en las mesas: preventDefault() mata el foco implícito y sin foco las
        // flechas del teclado nunca llegarían al vértice.
        e.currentTarget.focus({ preventScroll: true });
      } catch {
        // jsdom no implementa focus() en SVGElement.
      }
      if (e.button !== 0) return;
      const point = toCanvasCoords(e.clientX, e.clientY);
      const vertex = outlineRef.current[index];
      if (!point || !vertex) return;
      vertexDragRef.current = { index, dx: point.x - vertex.x, dy: point.y - vertex.y };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ver el comentario del arrastre de mesas.
      }
      e.preventDefault();
    },
    [toCanvasCoords],
  );

  const handleVertexPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const drag = vertexDragRef.current;
      if (!drag) return;
      const point = toCanvasCoords(e.clientX, e.clientY);
      if (!point) return;
      moveVertex(drag.index, point.x - drag.dx, point.y - drag.dy);
    },
    [moveVertex, toCanvasCoords],
  );

  const handleVertexPointerUp = useCallback((e: React.PointerEvent<SVGRectElement>) => {
    if (!vertexDragRef.current) return;
    vertexDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ver el comentario del arrastre de mesas.
    }
  }, []);

  const handleVertexKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGRectElement>, index: number) => {
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-SNAP_PX, 0],
        ArrowRight: [SNAP_PX, 0],
        ArrowUp: [0, -SNAP_PX],
        ArrowDown: [0, SNAP_PX],
      };
      const delta = deltas[e.key];
      if (delta) {
        e.preventDefault();
        setSelectedVertex(index);
        const vertex = outlineRef.current[index];
        if (vertex) moveVertex(index, vertex.x + delta[0], vertex.y + delta[1]);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteVertex(index);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSelectedVertex(index);
      }
    },
    [deleteVertex, moveVertex],
  );

  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, t: EditorTable) => {
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-SNAP_PX, 0],
        ArrowRight: [SNAP_PX, 0],
        ArrowUp: [0, -SNAP_PX],
        ArrowDown: [0, SNAP_PX],
      };
      const delta = deltas[e.key];
      if (delta) {
        e.preventDefault();
        setSelectedId(t.id);
        moveTable(t.id, t.pos_x + delta[0], t.pos_y + delta[1]);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSelectedId(t.id);
      }
    },
    [moveTable],
  );

  // ---------------- Guardado ----------------

  const handleSave = useCallback(async () => {
    if (saving || dirtyCount === 0) return;
    setSaving(true);
    setSaveErrors([]);

    const failures: string[] = [];
    const savedDeletes: number[] = [];
    const savedUpdates: number[] = [];
    const created: Array<{ tempId: number; row: DiningTable }> = [];
    let unauthorized = false;

    // El contorno viaja primero y por su cuenta: es una columna del plano, no una mesa. Si
    // falla, las mesas se guardan igual (y al revés): los errores se acumulan y se listan
    // juntos en vez de abortar y perder trabajo del usuario.
    let outlineSaved = false;
    // Regiones de zona: cada una se guarda con PATCH a SU zona, no al plano.
    for (const zoneId of dirtyZoneIds) {
      const poly = zoneAreas.get(zoneId);
      const zone = zones.find((z) => z.id === zoneId);
      try {
        const res = await fetch(`${API_BASE}/floor-zone/${zoneId}`, {
          method: 'PATCH',
          headers: authHeaders(),
          // Sólo `area`: el update hace Object.assign, así que mandar `merchant` o
          // `floorPlan` como enteros planos destrozaría las relaciones.
          body: JSON.stringify({ area: poly ? serializeOutline(poly) : null }),
        });
        if (res.status === 401) {
          unauthorized = true;
        } else if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as ApiErrorBody;
          throw new Error(errorMessageOf(json) || 'Zone area rejected by the server');
        }
      } catch (err) {
        failures.push(
          `Zone ${zone?.name ?? zoneId}: ${err instanceof Error ? err.message : 'area could not be saved'}`,
        );
      }
    }

    if (outlineDirty) {
      const invalid = validateOutline(outline);
      if (invalid) {
        failures.push(`Room shape: ${invalid}`);
      } else {
        try {
          const res = await fetch(`${API_BASE}/floor-plan/${plan.id}`, {
            method: 'PATCH',
            headers: authHeaders(),
            // SÓLO `outline`: el update hace Object.assign sobre la entidad, así que enviar
            // `merchant` (un número plano) sustituiría la relación por basura.
            body: JSON.stringify({ outline: serializeOutline(outline) }),
          });
          if (res.status === 401) {
            unauthorized = true;
          } else if (!res.ok) {
            const json = (await res.json().catch(() => ({}))) as ApiErrorBody;
            throw new Error(errorMessageOf(json) || 'Room shape rejected by the server');
          } else {
            outlineSaved = true;
          }
        } catch (err) {
          failures.push(
            `Room shape: ${err instanceof Error ? err.message : 'could not be saved'}`,
          );
        }
      }
    }

    // Secuencial a propósito: el backend valida unicidad de `number` por comercio y en
    // paralelo dos altas podrían pisarse; además así el error se atribuye a una mesa.
    if (!unauthorized) {
      for (const id of pendingDeletes) {
        try {
          const res = await fetch(`${API_BASE}/tables/${id}`, {
            method: 'DELETE',
            headers: authHeaders(),
          });
          if (res.status === 401) {
            unauthorized = true;
            break;
          }
          if (!res.ok) {
            const json = (await res.json().catch(() => ({}))) as ApiErrorBody;
            throw new Error(errorMessageOf(json) || 'Delete rejected by the server');
          }
          savedDeletes.push(id);
        } catch (err) {
          failures.push(
            `Table #${id}: ${err instanceof Error ? err.message : 'could not be deleted'}`,
          );
        }
      }
    }

    if (!unauthorized) {
      for (const t of tables.filter((row) => row.id < 0)) {
        const zoneId = t.floorZone?.id ?? activeZoneId;
        if (!zoneId) {
          failures.push(`Table ${t.number}: a floor zone is required before saving.`);
          continue;
        }
        const dto: CreateDiningTableDto = {
          merchant_id: merchantId,
          number: t.number.trim(),
          capacity: t.capacity,
          status: t.status,
          location: t.location,
          rotation: Math.round(t.rotation),
          shape: t.shape,
          // Solo se envía el tamaño propio si la mesa lo tiene: omitirlo deja que el
          // backend guarde null y la mesa herede el de su forma.
          ...(t.width != null ? { width: Math.round(t.width) } : {}),
          ...(t.height != null ? { height: Math.round(t.height) } : {}),
          // pos_x/pos_y son int en Postgres: redondeamos aquí para no depender del truncado.
          pos_x: Math.round(t.pos_x),
          pos_y: Math.round(t.pos_y),
          floorZone: zoneId,
          floorPlan: plan.id,
        };
        try {
          const res = await fetch(`${API_BASE}/tables`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(dto),
          });
          if (res.status === 401) {
            unauthorized = true;
            break;
          }
          const json = (await res.json().catch(() => ({}))) as ApiErrorBody & {
            data?: DiningTable;
          };
          if (!res.ok || !json.data) {
            throw new Error(errorMessageOf(json) || 'Create rejected by the server');
          }
          created.push({ tempId: t.id, row: json.data });
        } catch (err) {
          failures.push(
            `Table ${t.number}: ${err instanceof Error ? err.message : 'could not be created'}`,
          );
        }
      }
    }

    if (!unauthorized) {
      for (const t of tables.filter((row) => row.id > 0 && dirtyIds.has(row.id))) {
        const original = originalById.current.get(t.id);
        const dto: UpdateDiningTableDto = {};
        if (!original || original.number !== t.number) dto.number = t.number.trim();
        if (!original || original.capacity !== t.capacity) dto.capacity = t.capacity;
        if (!original || original.status !== t.status) dto.status = t.status;
        if (!original || original.location !== t.location) dto.location = t.location;
        if (!original || original.rotation !== t.rotation) dto.rotation = Math.round(t.rotation);
        if (!original || original.shape !== t.shape) dto.shape = t.shape;
        if (!original || original.width !== t.width) dto.width = t.width ?? null;
        if (!original || original.height !== t.height) dto.height = t.height ?? null;
        if (!original || original.pos_x !== t.pos_x) dto.pos_x = Math.round(t.pos_x);
        if (!original || original.pos_y !== t.pos_y) dto.pos_y = Math.round(t.pos_y);
        if (t.floorZone?.id && original?.floorZone?.id !== t.floorZone.id) {
          dto.floorZone = t.floorZone.id;
        }
        // Un PUT sin campos devuelve 400 ("At least one field must be provided").
        if (Object.keys(dto).length === 0) {
          savedUpdates.push(t.id);
          continue;
        }
        try {
          const res = await fetch(`${API_BASE}/tables/${t.id}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify(dto),
          });
          if (res.status === 401) {
            unauthorized = true;
            break;
          }
          if (!res.ok) {
            const json = (await res.json().catch(() => ({}))) as ApiErrorBody;
            throw new Error(errorMessageOf(json) || 'Update rejected by the server');
          }
          savedUpdates.push(t.id);
        } catch (err) {
          failures.push(
            `Table ${t.number}: ${err instanceof Error ? err.message : 'could not be updated'}`,
          );
        }
      }
    }

    if (unauthorized) {
      setSaving(false);
      handleUnauthorized();
      return;
    }

    if (failures.length > 0) {
      // Fallo parcial: NO refrescamos, para no perder lo que el usuario aún tiene en el
      // lienzo. Sólo consolidamos lo que sí viajó y dejamos el resto marcado como sucio.
      if (created.length > 0) {
        const byTempId = new Map(created.map((c) => [c.tempId, c.row]));
        setTables((prev) =>
          prev.map((t) => {
            const row = byTempId.get(t.id);
            if (!row) return t;
            // El POST devuelve floorZone/floorPlan sólo como {id,name}: conservamos el
            // objeto local cuando el servidor no lo trae para no perder el color.
            return {
              ...t,
              ...row,
              floorPlan: row.floorPlan ?? t.floorPlan,
              floorZone: row.floorZone ?? t.floorZone,
            };
          }),
        );
        // La fila del servidor es la nueva verdad para calcular diffs en el próximo PUT.
        created.forEach((c) => originalById.current.set(c.row.id, { ...c.row }));
        setTakenNumbers((prev) => {
          const next = new Set(prev);
          created.forEach((c) => next.add((c.row.number ?? '').toLowerCase()));
          return next;
        });
      }
      savedUpdates.forEach((id) => {
        const row = tables.find((t) => t.id === id);
        if (row) originalById.current.set(id, { ...row });
      });
      setDirtyIds((prev) => new Set([...prev].filter((id) => !savedUpdates.includes(id))));
      setPendingDeletes((prev) => prev.filter((id) => !savedDeletes.includes(id)));
      // El contorno sí llegó al servidor aunque alguna mesa fallara: no volver a mandarlo.
      if (outlineSaved) setOutlineDirty(false);
      if (failures.length === 0) setDirtyZoneIds(new Set());
      setSaveErrors(failures);
      setToast({
        message: `${failures.length} change${failures.length === 1 ? '' : 's'} could not be saved`,
        type: 'error',
      });
      setSaving(false);
      return;
    }

    // loadLayout() sólo recarga mesas y zonas; el contorno recién guardado ya es la verdad
    // local, y el `plan` que llega por props sigue trayendo el valor viejo hasta que el padre
    // refresque (de ahí que no se vuelva a parsear aquí).
    await loadLayout();
    setOutlineDirty(false);
    setSelectedId(null);
    setSaving(false);
    setToast({ message: 'Floor plan layout saved', type: 'success' });
    onSaved?.();
  }, [
    activeZoneId,
    authHeaders,
    dirtyCount,
    dirtyIds,
    handleUnauthorized,
    loadLayout,
    merchantId,
    onSaved,
    outline,
    outlineDirty,
    pendingDeletes,
    plan.id,
    saving,
    tables,
  ]);

  // ---------------- Cierre ----------------

  const requestClose = useCallback(() => {
    if (dirtyCount > 0) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }, [dirtyCount, onClose]);

  // Escape deselecciona antes de cerrar: perder la selección es barato, perder el layout no.
  useModalDismiss(() => {
    if (dragRef.current || vertexDragRef.current) return;
    if (confirmClose) {
      setConfirmClose(false);
      return;
    }
    if (pendingPreset) {
      setPendingPreset(null);
      return;
    }
    if (selectedVertex !== null) {
      setSelectedVertex(null);
      return;
    }
    if (selectedId !== null) {
      setSelectedId(null);
      return;
    }
    requestClose();
  });

  // Cambiar de modo limpia la selección del otro: en ROOM SHAPE el inspector de mesas no se
  // ve, y dejar una mesa "seleccionada" invisible confunde al volver.
  const switchMode = useCallback((next: EditorMode) => {
    setMode(next);
    if (next === 'shape') setSelectedId(null);
    else if (next === 'zones') {
      setSelectedId(null);
      setSelectedVertex(null);
    } else setSelectedVertex(null);
  }, []);

  // ---------------- Zoom ----------------

  const stepZoom = useCallback((direction: 1 | -1) => {
    setZoom((current) => {
      const index = ZOOM_STEPS.findIndex((s) => s >= current - 0.001);
      const nextIndex = clamp(
        (index < 0 ? ZOOM_STEPS.length - 1 : index) + direction,
        0,
        ZOOM_STEPS.length - 1,
      );
      return ZOOM_STEPS[nextIndex];
    });
  }, []);

  const resetZoom = useCallback(() => {
    const el = viewportRef.current;
    const w = (el?.clientWidth ?? 0) - 64;
    const h = (el?.clientHeight ?? 0) - 64;
    setZoom(w > 0 && h > 0 ? fitZoom(w, h, canvasW, canvasH) : 1);
  }, [canvasW, canvasH]);

  // ---------------- Unidades ----------------

  // Se persiste al vuelo: quien trabaja en pies no debería reelegirlo cada vez que abre un plano.
  const changeUnitSystem = useCallback((next: UnitSystem) => {
    setUnitSystem(next);
    saveUnitSystem(next);
  }, []);

  // ---------------- Render ----------------

  // Un id estable por plano: dos editores del mismo plano nunca coexisten, y con useId el
  // valor generado por React lleva caracteres que ensucian la referencia url(#…) del SVG.
  const gridPatternId = `floor-grid-${plan.id}`;

  const inputClass =
    'w-full bg-[#fef9f1] text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none';
  const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider';

  const statusOptions = selectedTable && !TABLE_STATUSES.includes(selectedTable.status)
    ? [selectedTable.status, ...TABLE_STATUSES]
    : TABLE_STATUSES;

  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      data-testid="floor-plan-editor"
      className="fixed inset-0 z-[1000] flex flex-col bg-[#ece8e0] font-sans text-left outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Floor plan editor — ${plan.name}`}
    >
      {/* ---------------- Top bar ---------------- */}
      <header className="bg-[#222222] px-5 py-3 flex items-center gap-4 shrink-0 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-white text-xl" aria-hidden="true">
            architecture
          </span>
          <div className="min-w-0">
            <h1 className="text-white font-black text-base tracking-tight truncate">
              {plan.name}
            </h1>
            <p className="text-white/50 text-[11px] font-mono">
              {formatDimensions(canvasW, canvasH, unitSystem)} · {tables.length}{' '}
              {tables.length === 1 ? 'table' : 'tables'}
              {/* La superficie sólo se anuncia cuando la sala deja de ser el rectángulo
                  completo: en un rectángulo ya se deduce de width × height. */}
              {customShape ? ` · ${formatArea(roomAreaPx2, unitSystem)}` : ''}
            </p>
          </div>
          <span
            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${FLOOR_PLAN_STATUS_BADGE_STYLES[planStatus]}`}
          >
            {FLOOR_PLAN_STATUS_LABELS[planStatus]}
          </span>
        </div>

        {/* Conmutador de modo: mesas o forma de la sala. Los dos gestos se disparan con el
            mismo pointerdown sobre el lienzo, así que no pueden estar activos a la vez. */}
        <div
          role="group"
          aria-label="Editor mode"
          className="flex items-center gap-1 bg-white/10 rounded px-1 py-1"
        >
          {(
            [
              { value: 'tables', label: 'Edit tables', text: 'Tables', icon: 'table_restaurant' },
              { value: 'shape', label: 'Edit room shape', text: 'Room shape', icon: 'polyline' },
              { value: 'zones', label: 'Edit zone areas', text: 'Zones', icon: 'grid_view' },
            ] as Array<{ value: EditorMode; label: string; text: string; icon: string }>
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => switchMode(option.value)}
              aria-label={option.label}
              aria-pressed={mode === option.value}
              className={`px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest rounded transition-colors duration-200 ${
                mode === option.value
                  ? 'bg-[#ae001a] text-white'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {option.icon}
              </span>
              {option.text}
            </button>
          ))}
        </div>

        {/* Unidades. Va en la barra y no en un menú porque es una lectura constante: el
            gerente piensa la sala en metros (o en pies) y no debería tener que abrir nada
            para cambiar de sistema. */}
        <div
          role="group"
          aria-label="Measurement units"
          data-testid="floor-plan-units"
          className="flex items-center gap-1 ml-auto bg-white/10 rounded px-1 py-1"
        >
          {UNIT_SYSTEMS.map((system) => (
            <button
              key={system}
              type="button"
              onClick={() => changeUnitSystem(system)}
              aria-label={UNIT_SYSTEM_ARIA[system]}
              aria-pressed={unitSystem === system}
              title={UNIT_SYSTEM_LABELS[system]}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded transition-colors duration-200 ${
                unitSystem === system
                  ? 'bg-[#ae001a] text-white'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              {UNIT_SYSTEM_SHORT[system]}
            </button>
          ))}
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1 bg-white/10 rounded px-1 py-1">
          <button
            type="button"
            onClick={() => stepZoom(-1)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
            className="p-1.5 text-white/80 hover:text-white disabled:opacity-30 transition-colors duration-200"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              zoom_out
            </span>
          </button>
          <span
            data-testid="floor-plan-zoom-level"
            className="text-white text-xs font-mono w-12 text-center tabular-nums"
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => stepZoom(1)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
            className="p-1.5 text-white/80 hover:text-white disabled:opacity-30 transition-colors duration-200"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              zoom_in
            </span>
          </button>
          <button
            type="button"
            onClick={resetZoom}
            aria-label="Reset zoom to fit"
            className="p-1.5 text-white/80 hover:text-white transition-colors duration-200"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              fit_screen
            </span>
          </button>
        </div>

        {clippedCount > 0 && (
          <span
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-300"
            role="status"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              warning
            </span>
            {clippedCount} outside canvas
          </span>
        )}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || dirtyCount === 0}
          data-testid="floor-plan-save"
          aria-label={
            dirtyCount > 0 ? `Save layout (${dirtyCount} pending changes)` : 'Save layout'
          }
          className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            save
          </span>
          {saving ? 'Saving…' : 'Save layout'}
          {dirtyCount > 0 && (
            <span className="bg-white/25 rounded-full px-2 py-0.5 text-[10px] tabular-nums">
              {dirtyCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={requestClose}
          aria-label="Close floor plan editor"
          className="p-2 text-white/60 hover:text-white transition-colors duration-200"
        >
          <span className="material-symbols-outlined text-xl" aria-hidden="true">
            close
          </span>
        </button>
      </header>

      {/* ---------------- Body ---------------- */}
      <div className="flex-1 flex min-h-0">
        {/* -------- Left tool palette -------- */}
        <aside className="w-60 shrink-0 bg-white border-r border-[#e8e2d8] overflow-y-auto p-4 flex flex-col gap-5">
          <div>
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a] mb-2">
              Add table
            </h2>
            <div className="flex flex-col gap-2">
              {TABLE_SHAPES.map((shape) => (
                <button
                  key={shape}
                  type="button"
                  onClick={() => void addTable(shape)}
                  disabled={loading || zoneBusy || mode === 'shape'}
                  aria-label={`Add ${shape.toLowerCase()} table`}
                  title={
                    mode === 'shape'
                      ? 'Switch back to Tables mode to add a table.'
                      : undefined
                  }
                  className="flex items-center gap-3 px-3 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-left text-[#1d1c17] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                    table_restaurant
                  </span>
                  {/* La huella se apila bajo el nombre: "80 cm × 80 cm" no cabe en la misma
                      línea que "RECTANGLE" en una barra de 240px. */}
                  <span className="min-w-0 flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-widest">{shape}</span>
                    <span className="text-[10px] text-[#5f5e5e] font-mono">
                      {formatDimensions(
                        TABLE_FOOTPRINT[shape].w,
                        TABLE_FOOTPRINT[shape].h,
                        unitSystem,
                      )}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[#e8e2d8] pt-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a] mb-2">
              Active zone
            </h2>
            <div className="flex items-center gap-2">
              {/* El color es la razón de ser de la zona: sin verlo aquí, el selector no
                  dice nada. El swatch refleja el de la zona activa. */}
              <span
                data-testid="active-zone-swatch"
                aria-hidden="true"
                style={{ backgroundColor: activeZone?.color?.trim() || DEFAULT_ZONE_COLOR }}
                className="inline-block w-6 h-6 rounded border border-[#e8e2d8] shrink-0"
              />
              <select
                value={activeZoneId ?? ''}
                onChange={(e) => setActiveZoneId(e.target.value ? Number(e.target.value) : null)}
                aria-label="Active floor zone"
                className={inputClass}
              >
                {zones.length === 0 && <option value="">No zones yet</option>}
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-[#5f5e5e] mt-1.5 leading-relaxed">
              New tables are assigned to this zone and inherit its colour.
            </p>
            {activeZone && !zoneDraftOpen && (
              <button
                type="button"
                onClick={() => {
                  setZoneDraftEditId(activeZone.id);
                  setZoneDraftName(activeZone.name ?? '');
                  setZoneDraftColor(activeZone.color?.trim() || DEFAULT_ZONE_COLOR);
                  setZoneDraftOpen(true);
                }}
                aria-label={`Edit zone ${activeZone.name}`}
                className="mt-2 w-full flex items-center justify-center gap-2 py-2 border border-[#e8e2d8] bg-white text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  palette
                </span>
                Edit this zone
              </button>
            )}

            {zoneDraftOpen ? (
              <div className="mt-3 flex flex-col gap-2 bg-[#f5efe6] border border-[#e8e2d8] p-3 rounded">
                <label htmlFor="new-zone-name" className={labelClass}>
                  {zoneDraftEditId != null ? 'Rename zone' : 'Zone name'}
                </label>
                <input
                  id="new-zone-name"
                  type="text"
                  value={zoneDraftName}
                  onChange={(e) => setZoneDraftName(e.target.value)}
                  placeholder="e.g., Terrace"
                  className={inputClass}
                />
                <div className="flex items-center gap-2">
                  <label htmlFor="new-zone-color" className={labelClass}>
                    Colour
                  </label>
                  <input
                    id="new-zone-color"
                    type="color"
                    value={zoneDraftColor}
                    onChange={(e) => setZoneDraftColor(e.target.value)}
                    className="h-8 w-12 border border-[#e8e2d8] rounded bg-white"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveZoneDraft()}
                    disabled={zoneBusy || zoneDraftName.trim().length === 0}
                    className="flex-1 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {zoneBusy
                      ? 'Saving…'
                      : zoneDraftEditId != null
                        ? 'Save zone'
                        : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setZoneDraftOpen(false);
                      setZoneDraftEditId(null);
                    }}
                    className="flex-1 py-2 border border-[#e8e2d8] bg-white text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setZoneDraftEditId(null);
                  setZoneDraftName('');
                  setZoneDraftColor(DEFAULT_ZONE_COLOR);
                  setZoneDraftOpen(true);
                }}
                aria-label="Create a new floor zone"
                className="mt-3 w-full flex items-center justify-center gap-2 py-2 border border-dashed border-[#e8e2d8] text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  add
                </span>
                New zone
              </button>
            )}
          </div>

          <div className="border-t border-[#e8e2d8] pt-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a] mb-2">
              How it works
            </h2>
            <ul className="text-[11px] text-[#5f5e5e] leading-relaxed list-disc pl-4 space-y-1">
              {mode === 'tables' ? (
                <>
                  <li>
                    Drag a table to move it — positions snap to a{' '}
                    {formatLength(SNAP_PX, unitSystem)} grid.
                  </li>
                  <li>Arrow keys nudge the focused table.</li>
                  <li>Tables stay inside the room outline, not just inside the canvas.</li>
                </>
              ) : (
                <>
                  <li>Drag a square corner to reshape the room.</li>
                  <li>Click a round midpoint to add a new corner there.</li>
                  <li>Select a corner and press Delete to remove it.</li>
                </>
              )}
              <li>Nothing is persisted until you press Save layout.</li>
            </ul>
          </div>
        </aside>

        {/* -------- Canvas viewport -------- */}
        <div
          ref={viewportRef}
          className="flex-1 min-w-0 overflow-auto p-8 relative"
          onPointerDown={(e) => {
            // Clic en el vacío (fuera del lienzo) = deseleccionar.
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          {error ? (
            <div className="max-w-md mx-auto border border-red-300 bg-red-50 p-8 text-center rounded">
              <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
                error
              </span>
              <p className="mt-3 text-red-700 font-medium text-sm">{error}</p>
              <button
                type="button"
                onClick={() => void loadLayout()}
                className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <div
              style={{ width: canvasW * zoom, height: canvasH * zoom }}
              className="relative mx-auto"
            >
              <div
                ref={canvasRef}
                data-testid="floor-plan-canvas"
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) {
                    setSelectedId(null);
                    setSelectedVertex(null);
                  }
                }}
                style={{
                  width: canvasW,
                  height: canvasH,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  // Fuera del contorno el papel se apaga: así "sala" y "exterior" se
                  // distinguen de un vistazo aunque la planta sea irregular.
                  backgroundColor: OUTSIDE_FILL,
                  boxShadow: '0 0 0 2px #222222, 0 12px 30px rgba(0,0,0,0.15)',
                  touchAction: 'none',
                }}
                className="relative"
              >
                {/* Suelo, retícula y muros. La retícula va como <pattern> DENTRO del relleno
                    del propio contorno: se recorta sola con el polígono, sin clipPath, y así
                    la cuadrícula sólo existe donde hay sala. */}
                <svg
                  width={canvasW}
                  height={canvasH}
                  viewBox={`0 0 ${canvasW} ${canvasH}`}
                  className="absolute inset-0"
                  style={{ pointerEvents: 'none' }}
                  aria-hidden="true"
                >
                  <defs>
                    <pattern
                      id={gridPatternId}
                      width={GRID_PX}
                      height={GRID_PX}
                      patternUnits="userSpaceOnUse"
                    >
                      <rect width={GRID_PX} height={GRID_PX} fill={FLOOR_FILL} />
                      <path
                        d={`M ${GRID_PX} 0 L 0 0 0 ${GRID_PX}`}
                        fill="none"
                        stroke={GRID_LINE}
                        strokeWidth={1}
                      />
                    </pattern>
                  </defs>
                  <path
                    data-testid="room-outline"
                    d={outlinePath(outline)}
                    fill={`url(#${gridPatternId})`}
                    stroke={WALL_COLOR}
                    strokeWidth={WALL_WIDTH}
                    strokeLinejoin="round"
                  />
                </svg>

                {tables.map((t) => {
                  const fp = footprintOfTable(t);
                  const isSelected = t.id === selectedId;
                  const clipped = isTableClipped(t, canvasW, canvasH);
                  const outsideRoom = !clipped && !tableInsideOutline(t, outline);
                  const duplicated = duplicateNumbers.has((t.number ?? '').trim().toLowerCase());
                  return (
                    <div
                      key={t.id}
                      data-testid={`floor-table-${t.id}`}
                      role="button"
                      // En modo ROOM SHAPE las mesas quedan de decorado: sin foco tabulable y
                      // sin eventos, para que el arrastre de vértices no compita con el suyo.
                      tabIndex={mode === 'tables' ? 0 : -1}
                      aria-label={`Table ${t.number}, ${t.capacity} seats, ${t.shape.toLowerCase()}`}
                      aria-pressed={isSelected}
                      onPointerDown={(e) => handleTablePointerDown(e, t)}
                      onPointerMove={handleTablePointerMove}
                      onPointerUp={handleTablePointerUp}
                      onPointerCancel={handleTablePointerUp}
                      // Si el navegador pierde la captura (elemento reemplazado, gesto
                      // del sistema) el pointerup ya no llega aquí y el arrastre se
                      // quedaría pegado al cursor sin botón pulsado.
                      onLostPointerCapture={handleTablePointerUp}
                      onKeyDown={(e) => handleTableKeyDown(e, t)}
                      title={
                        clipped
                          ? 'This table sits outside the canvas bounds — drag it back inside.'
                          : outsideRoom
                            ? 'This table sits outside the room outline — drag it back inside.'
                            : duplicated
                              ? 'Duplicate table number — numbers must be unique per merchant.'
                              : undefined
                      }
                      style={{
                        left: t.pos_x,
                        top: t.pos_y,
                        width: fp.w,
                        height: fp.h,
                        transform: `rotate(${t.rotation}deg)`,
                        backgroundColor: tableColor(t),
                        touchAction: 'none',
                        // Atenuadas y sordas mientras se dibuja la sala: siguen sirviendo de
                        // referencia visual, pero no capturan el puntero.
                        opacity: mode === 'tables' ? 1 : 0.35,
                        pointerEvents: mode === 'tables' ? undefined : 'none',
                        // Aviso ámbar para mesas fuera de la sala o con número repetido: usamos
                        // box-shadow y no `ring` para no chocar con el outline de selección.
                        boxShadow:
                          clipped || outsideRoom || duplicated
                            ? '0 0 0 3px #fbbf24, 0 4px 10px rgba(0,0,0,0.2)'
                            : '0 4px 10px rgba(0,0,0,0.2)',
                      }}
                      className={[
                        'absolute flex flex-col items-center justify-center select-none cursor-grab active:cursor-grabbing text-white',
                        shapeRadiusClass(t.shape),
                        isSelected
                          ? 'outline outline-2 outline-offset-2 outline-[#ae001a] z-10'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className="text-xs font-black tracking-tight drop-shadow">
                        {t.number}
                      </span>
                      <span className="text-[10px] font-semibold opacity-80 flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
                          person
                        </span>
                        {t.capacity}
                      </span>
                      {t.id < 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-white text-[#ae001a] text-[8px] font-black uppercase px-1 rounded-full border border-[#ae001a]">
                          new
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Regiones de zona: rellenos translúcidos con el color de cada zona.
                    Se pintan en TODOS los modos y por debajo de las mesas — son el fondo
                    que responde a "qué parte de la sala es de quién". */}
                <svg
                  width={canvasW}
                  height={canvasH}
                  viewBox={`0 0 ${canvasW} ${canvasH}`}
                  className="absolute inset-0"
                  style={{ pointerEvents: 'none', overflow: 'visible' }}
                  aria-hidden="true"
                >
                  {zones.map((z) => {
                    const poly = zoneAreas.get(z.id);
                    if (!poly || poly.length < 3) return null;
                    const colour = z.color?.trim() || DEFAULT_ZONE_COLOR;
                    const isActive = z.id === activeZoneId;
                    const b = polygonBounds(poly);
                    return (
                      <g key={`zone-area-${z.id}`} data-testid={`zone-area-${z.id}`}>
                        <path
                          d={outlinePath(poly)}
                          fill={colour}
                          fillOpacity={isActive && mode === 'zones' ? 0.28 : 0.16}
                          stroke={colour}
                          strokeOpacity={isActive && mode === 'zones' ? 0.9 : 0.5}
                          strokeWidth={(isActive && mode === 'zones' ? 3 : 2) / zoom}
                          strokeDasharray={mode === 'zones' && !isActive ? `${6 / zoom}` : undefined}
                        />
                        <text
                          x={b.minX + 8 / zoom}
                          y={b.minY + 20 / zoom}
                          fill={colour}
                          fontSize={14 / zoom}
                          fontWeight="700"
                          style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
                        >
                          {z.name}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {mode === 'zones' && activeZoneId != null && zoneAreas.get(activeZoneId) && (
                  <svg
                    width={canvasW}
                    height={canvasH}
                    viewBox={`0 0 ${canvasW} ${canvasH}`}
                    className="absolute inset-0"
                    style={{ pointerEvents: 'none', overflow: 'visible' }}
                  >
                    {zoneAreas.get(activeZoneId)!.map((p, i) => {
                      const size = VERTEX_HANDLE_PX / zoom;
                      return (
                        <rect
                          key={`zone-vertex-${i}`}
                          data-testid={`zone-vertex-${i}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Zone corner ${i + 1}`}
                          x={p.x - size / 2}
                          y={p.y - size / 2}
                          width={size}
                          height={size}
                          fill={selectedZoneVertex === i ? '#ffffff' : activeZone?.color ?? WALL_COLOR}
                          stroke={activeZone?.color ?? WALL_COLOR}
                          strokeWidth={2 / zoom}
                          style={{ pointerEvents: 'auto', cursor: 'grab' }}
                          onPointerDown={(e) => handleZoneVertexPointerDown(e, i)}
                          onPointerMove={handleZoneVertexPointerMove}
                          onPointerUp={handleZoneVertexPointerUp}
                        />
                      );
                    })}
                  </svg>
                )}

                {/* Manejadores del contorno. Van DESPUÉS de las mesas para pintarse encima:
                    con la sala llena, un vértice bajo una mesa sería inagarrable. La capa no
                    intercepta el puntero salvo en los manejadores mismos. */}
                {mode === 'shape' && (
                  <svg
                    width={canvasW}
                    height={canvasH}
                    viewBox={`0 0 ${canvasW} ${canvasH}`}
                    className="absolute inset-0"
                    style={{ pointerEvents: 'none', overflow: 'visible' }}
                  >
                    {outline.map((p, i) => {
                      // Punto medio de la arista i -> i+1 (la última cierra contra el vértice 0).
                      const next = outline[(i + 1) % outline.length];
                      return (
                        <circle
                          key={`edge-${i}`}
                          data-testid={`outline-edge-${i}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Add a corner on wall ${i + 1}`}
                          cx={(p.x + next.x) / 2}
                          cy={(p.y + next.y) / 2}
                          r={EDGE_HANDLE_PX / zoom}
                          fill={WALL_COLOR}
                          fillOpacity={0.35}
                          stroke="#ffffff"
                          strokeWidth={1.5 / zoom}
                          style={{ pointerEvents: 'auto', cursor: 'copy' }}
                          onPointerDown={(e) => handleEdgePointerDown(e, i)}
                          onClick={() => handleEdgeActivate(i)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleEdgeActivate(i);
                            }
                          }}
                        />
                      );
                    })}

                    {outline.map((p, i) => {
                      // Tamaño en px de pantalla: dividir por el zoom mantiene el manejador
                      // igual de agarrable al 25% que al 200%.
                      const size = VERTEX_HANDLE_PX / zoom;
                      const isVertexSelected = selectedVertex === i;
                      return (
                        <rect
                          key={`vertex-${i}`}
                          data-testid={`outline-vertex-${i}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Room corner ${i + 1} at ${formatLength(
                            p.x,
                            unitSystem,
                          )}, ${formatLength(p.y, unitSystem)}`}
                          aria-pressed={isVertexSelected}
                          x={p.x - size / 2}
                          y={p.y - size / 2}
                          width={size}
                          height={size}
                          fill={isVertexSelected ? '#ae001a' : '#ffffff'}
                          stroke={WALL_COLOR}
                          strokeWidth={2 / zoom}
                          style={{
                            pointerEvents: 'auto',
                            cursor: 'grab',
                            touchAction: 'none',
                          }}
                          onPointerDown={(e) => handleVertexPointerDown(e, i)}
                          onPointerMove={handleVertexPointerMove}
                          onPointerUp={handleVertexPointerUp}
                          onPointerCancel={handleVertexPointerUp}
                          onLostPointerCapture={handleVertexPointerUp}
                          onKeyDown={(e) => handleVertexKeyDown(e, i)}
                        />
                      );
                    })}
                  </svg>
                )}
              </div>

              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#ece8e0]/70">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Loading layout…
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* -------- Right inspector -------- */}
        <aside
          className="w-80 shrink-0 bg-white border-l border-[#e8e2d8] overflow-y-auto"
          data-no-drag="true"
        >
          <div className="bg-[#f5efe6] border-b border-[#e8e2d8] px-4 py-3">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#ae001a]">
              {mode === 'shape'
                ? 'Room shape'
                : mode === 'zones'
                  ? 'Zone areas'
                  : 'Table inspector'}
            </h2>
          </div>

          {mode === 'zones' ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: activeZone?.color?.trim() || DEFAULT_ZONE_COLOR }}
                  className="inline-block w-6 h-6 rounded border border-[#e8e2d8] shrink-0"
                />
                <select
                  value={activeZoneId ?? ''}
                  onChange={(e) => {
                    setActiveZoneId(e.target.value ? Number(e.target.value) : null);
                    setSelectedZoneVertex(null);
                  }}
                  aria-label="Zone being edited"
                  className={inputClass}
                >
                  {zones.length === 0 && <option value="">No zones yet</option>}
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>

              {activeZoneId != null && zoneAreas.get(activeZoneId) ? (
                <>
                  <p className="text-[11px] text-[#5f5e5e] leading-relaxed">
                    Drag the square corners to reshape this zone. Tables dropped inside it are
                    assigned to it automatically.
                  </p>
                  <p className="text-[11px] font-mono text-[#1d1c17]">
                    {zoneAreas.get(activeZoneId)!.length} corners ·{' '}
                    {formatArea(polygonArea(zoneAreas.get(activeZoneId)!), unitSystem)}
                  </p>
                  <button
                    type="button"
                    onClick={clearZoneArea}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border border-[#ae001a] text-[#ae001a] text-[10px] font-bold uppercase tracking-widest hover:bg-[#ae001a] hover:text-white transition-colors duration-200"
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      delete
                    </span>
                    Remove area
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-[#5f5e5e] leading-relaxed">
                    This zone has no area drawn yet, so it only colours its tables. Draw one to
                    mark which part of the room belongs to it.
                  </p>
                  <button
                    type="button"
                    onClick={drawZoneArea}
                    disabled={activeZoneId == null}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      draw
                    </span>
                    Draw area
                  </button>
                </>
              )}
            </div>
          ) : mode === 'shape' ? (
            <div className="p-4 flex flex-col gap-4" data-testid="floor-plan-room-panel">
              <div>
                <p className={labelClass}>Room presets</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {OUTLINE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        requestOutline(preset.label, preset.build(canvasW, canvasH))
                      }
                      aria-label={`Apply ${preset.label} room preset`}
                      className="px-2 py-2 border border-[#e8e2d8] bg-[#fef9f1] text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 rounded"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => requestOutline('Rectangle', rectangleOutline(canvasW, canvasH))}
                  aria-label="Reset room shape to the full canvas"
                  className="mt-2 w-full flex items-center justify-center gap-2 py-2 border border-dashed border-[#e8e2d8] text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    restart_alt
                  </span>
                  Reset to full canvas
                </button>
              </div>

              {/* Confirmación previa: aplicar el preset dejaría mesas en la calle. Se puede
                  seguir adelante, pero enterándose. */}
              {pendingPreset && (
                <div
                  data-testid="outline-preset-confirm"
                  className="border border-[#ae001a] bg-[#f5efe6] p-3 rounded flex flex-col gap-2"
                >
                  <p className="text-[11px] text-[#1d1c17] leading-relaxed">
                    <strong>{pendingPreset.label}:</strong> {pendingPreset.warning}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={confirmPendingPreset}
                      className="flex-1 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
                    >
                      Apply anyway
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingPreset(null)}
                      className="flex-1 py-2 border border-[#e8e2d8] bg-white text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="border-t border-[#e8e2d8] pt-4 flex flex-col gap-3">
                <p className="text-[11px] text-[#5f5e5e] font-mono">
                  {outline.length} corners · {formatArea(roomAreaPx2, unitSystem)} ·{' '}
                  {tables.length} {tables.length === 1 ? 'table' : 'tables'}
                </p>

                {selectedVertexPoint ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="insp-corner-x" className={labelClass}>
                        Corner X {lengthSuffix(unitSystem)}
                      </label>
                      <input
                        id="insp-corner-x"
                        type="number"
                        step={COORD_STEP}
                        value={lengthValue(selectedVertexPoint.x, unitSystem)}
                        onChange={(e) =>
                          moveVertex(
                            selectedVertex as number,
                            lengthToPx(Number(e.target.value) || 0, unitSystem),
                            selectedVertexPoint.y,
                          )
                        }
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="insp-corner-y" className={labelClass}>
                        Corner Y {lengthSuffix(unitSystem)}
                      </label>
                      <input
                        id="insp-corner-y"
                        type="number"
                        step={COORD_STEP}
                        value={lengthValue(selectedVertexPoint.y, unitSystem)}
                        onChange={(e) =>
                          moveVertex(
                            selectedVertex as number,
                            selectedVertexPoint.x,
                            lengthToPx(Number(e.target.value) || 0, unitSystem),
                          )
                        }
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#5f5e5e] leading-relaxed">
                    Select a corner on the canvas to nudge or delete it.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => deleteVertex(selectedVertex as number)}
                  disabled={selectedVertex === null || outline.length <= MIN_OUTLINE_VERTICES}
                  aria-label="Delete selected room corner"
                  title={
                    outline.length <= MIN_OUTLINE_VERTICES
                      ? `A room needs at least ${MIN_OUTLINE_VERTICES} corners — add one before deleting another.`
                      : selectedVertex === null
                        ? 'Select a corner on the canvas first.'
                        : undefined
                  }
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-[#ae001a] text-[#ae001a] text-[10px] font-bold uppercase tracking-widest hover:bg-[#ae001a] hover:text-white transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#ae001a]"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    delete
                  </span>
                  Delete corner
                </button>
              </div>

              <div className="border-t border-[#e8e2d8] pt-4 flex flex-col gap-2">
                <p className={labelClass}>Tables outside the room</p>
                <p className="text-2xl font-black text-[#1d1c17] tabular-nums leading-none">
                  {outsideCount}
                </p>
                {outsideCount > 0 && (
                  <>
                    <p
                      data-testid="outline-warning"
                      role="alert"
                      className="text-[11px] font-semibold text-[#ae001a] leading-relaxed"
                    >
                      {outlineWarning(outsideCount)}
                    </p>
                    <button
                      type="button"
                      onClick={bringTablesInside}
                      aria-label="Bring every table inside the room"
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
                    >
                      <span className="material-symbols-outlined text-base" aria-hidden="true">
                        move_selection_down
                      </span>
                      Bring all inside
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : !selectedTable ? (
            <div
              data-testid="floor-plan-inspector-empty"
              className="p-8 text-center flex flex-col items-center gap-3"
            >
              <span className="material-symbols-outlined text-[#5f5e5e] text-4xl" aria-hidden="true">
                touch_app
              </span>
              <p className="text-xs text-[#5f5e5e] leading-relaxed">
                Select a table on the canvas to edit its number, capacity, shape, rotation and
                zone.
              </p>
            </div>
          ) : (
            <div className="p-4 flex flex-col gap-4" data-testid="floor-plan-inspector">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="insp-number" className={labelClass}>
                  Table number
                </label>
                <input
                  id="insp-number"
                  type="text"
                  value={selectedTable.number ?? ''}
                  onChange={(e) => patchTable(selectedTable.id, { number: e.target.value })}
                  maxLength={50}
                  className={`${inputClass} font-mono`}
                />
                {duplicateNumbers.has((selectedTable.number ?? '').trim().toLowerCase()) && (
                  <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
                    Duplicate table number — numbers must be unique per merchant.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="insp-capacity" className={labelClass}>
                    Capacity
                  </label>
                  <input
                    id="insp-capacity"
                    type="number"
                    min={1}
                    value={selectedTable.capacity}
                    onChange={(e) =>
                      patchTable(selectedTable.id, {
                        capacity: Math.max(1, Math.round(Number(e.target.value) || 1)),
                      })
                    }
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="insp-shape" className={labelClass}>
                    Shape
                  </label>
                  <select
                    id="insp-shape"
                    value={selectedTable.shape}
                    onChange={(e) => {
                      const shape = e.target.value as TableShape;
                      const fp = footprintOf(shape);
                      // Cambiar de forma cambia la huella: reencuadramos contra el lienzo y
                      // contra la sala para que la mesa no acabe medio fuera tras el cambio.
                      const spot = containToOutline(
                        clamp(selectedTable.pos_x, 0, Math.max(0, canvasW - fp.w)),
                        clamp(selectedTable.pos_y, 0, Math.max(0, canvasH - fp.h)),
                        shape,
                        outline,
                        canvasW,
                        canvasH,
                      );
                      patchTable(selectedTable.id, {
                        shape,
                        pos_x: spot.x,
                        pos_y: spot.y,
                      });
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
              </div>

              {/* Tamaño propio: una mesa puede salirse del estándar de su forma (una barra
                  larga, un reservado grande). Vacío = hereda el de la forma. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="insp-width" className={labelClass}>
                    Table width {lengthSuffix(unitSystem)}
                  </label>
                  <input
                    id="insp-width"
                    type="number"
                    step={COORD_STEP}
                    min={lengthValue(TABLE_MIN_SIZE_PX, unitSystem)}
                    max={lengthValue(TABLE_MAX_SIZE_PX, unitSystem)}
                    value={lengthValue(footprintOfTable(selectedTable).w, unitSystem)}
                    onChange={(e) => {
                      const px = clamp(
                        lengthToPx(Number(e.target.value) || 0, unitSystem),
                        TABLE_MIN_SIZE_PX,
                        TABLE_MAX_SIZE_PX,
                      );
                      patchTable(selectedTable.id, { width: px });
                    }}
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="insp-height" className={labelClass}>
                    Table depth {lengthSuffix(unitSystem)}
                  </label>
                  <input
                    id="insp-height"
                    type="number"
                    step={COORD_STEP}
                    min={lengthValue(TABLE_MIN_SIZE_PX, unitSystem)}
                    max={lengthValue(TABLE_MAX_SIZE_PX, unitSystem)}
                    value={lengthValue(footprintOfTable(selectedTable).h, unitSystem)}
                    onChange={(e) => {
                      const px = clamp(
                        lengthToPx(Number(e.target.value) || 0, unitSystem),
                        TABLE_MIN_SIZE_PX,
                        TABLE_MAX_SIZE_PX,
                      );
                      patchTable(selectedTable.id, { height: px });
                    }}
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>

              {(selectedTable.width != null || selectedTable.height != null) && (
                <button
                  type="button"
                  onClick={() =>
                    patchTable(selectedTable.id, { width: null, height: null })
                  }
                  className="text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200 text-left"
                >
                  Reset to default size
                </button>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="insp-rotation" className={labelClass}>
                  Rotation — {selectedTable.rotation}°
                </label>
                <input
                  id="insp-rotation"
                  type="range"
                  min={0}
                  max={360}
                  step={5}
                  value={selectedTable.rotation}
                  onChange={(e) =>
                    patchTable(selectedTable.id, { rotation: Number(e.target.value) })
                  }
                  className="w-full accent-[#ae001a]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="insp-status" className={labelClass}>
                  Status
                </label>
                <select
                  id="insp-status"
                  value={selectedTable.status}
                  onChange={(e) => patchTable(selectedTable.id, { status: e.target.value })}
                  className={inputClass}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="insp-location" className={labelClass}>
                  Location
                </label>
                <input
                  id="insp-location"
                  type="text"
                  value={selectedTable.location}
                  onChange={(e) => patchTable(selectedTable.id, { location: e.target.value })}
                  placeholder="e.g., Near window"
                  className={inputClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="insp-zone" className={labelClass}>
                  Floor zone
                </label>
                <select
                  id="insp-zone"
                  value={selectedTable.floorZone?.id ?? ''}
                  onChange={(e) => {
                    const zone = zoneById.get(Number(e.target.value));
                    if (!zone) return;
                    patchTable(selectedTable.id, {
                      floorZone: { id: zone.id, name: zone.name, color: zone.color ?? null },
                    });
                  }}
                  className={inputClass}
                >
                  {zones.length === 0 && <option value="">No zones yet</option>}
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="insp-x" className={labelClass}>
                    X {lengthSuffix(unitSystem)}
                  </label>
                  {/* El usuario teclea en su unidad, pero la mesa se guarda en píxeles: la
                      conversión ocurre aquí y nunca en el camino hacia la API. */}
                  <input
                    id="insp-x"
                    type="number"
                    step={COORD_STEP}
                    value={lengthValue(selectedTable.pos_x, unitSystem)}
                    onChange={(e) =>
                      moveTable(
                        selectedTable.id,
                        lengthToPx(Number(e.target.value) || 0, unitSystem),
                        selectedTable.pos_y,
                      )
                    }
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="insp-y" className={labelClass}>
                    Y {lengthSuffix(unitSystem)}
                  </label>
                  <input
                    id="insp-y"
                    type="number"
                    step={COORD_STEP}
                    value={lengthValue(selectedTable.pos_y, unitSystem)}
                    onChange={(e) =>
                      moveTable(
                        selectedTable.id,
                        selectedTable.pos_x,
                        lengthToPx(Number(e.target.value) || 0, unitSystem),
                      )
                    }
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeTable(selectedTable.id)}
                aria-label={`Delete table ${selectedTable.number}`}
                className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 border border-[#ae001a] text-[#ae001a] text-[10px] font-bold uppercase tracking-widest hover:bg-[#ae001a] hover:text-white transition-colors duration-200"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  delete
                </span>
                Delete table
              </button>
            </div>
          )}

          {saveErrors.length > 0 && (
            <div className="m-4 border border-red-300 bg-red-50 p-3 rounded" role="alert">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-700 mb-1.5">
                Unsaved changes
              </p>
              <ul className="text-[11px] text-red-700 list-disc pl-4 space-y-1">
                {saveErrors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* ---------------- Confirmación de cierre con cambios pendientes ---------------- */}
      {confirmClose && (
        <div className="absolute inset-0 z-[1010] bg-black/60 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Discard unsaved layout changes"
            className="bg-white border border-[#e8e2d8] rounded shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="bg-[#222222] px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white">
                Unsaved layout changes
              </p>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-[#1d1c17]">
                You have {dirtyCount} pending change{dirtyCount === 1 ? '' : 's'} on this floor
                plan. Closing the editor now discards them.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmClose(false)}
                  className="flex-1 py-2.5 border border-[#e8e2d8] text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
                >
                  Discard &amp; close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>,
    document.body,
  );
};

export default FloorPlanEditor;
