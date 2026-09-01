// Tipos del dominio de Dining System (floor plans, zonas y mesas).
// Las propiedades mezclan snake_case y camelCase a propósito: reflejan tal cual el
// contrato real del backend (/api/floor-plan, /api/floor-zone, /api/tables), donde las
// columnas escalares viajan en snake_case (merchant_id, pos_x) y las relaciones en
// camelCase (floorPlan, floorZone). No normalizamos para no romper los payloads.

import type { UnitSystem } from '../lib/measurement-units';
import { formatDimensions, formatLength } from '../lib/measurement-units';

// ================= Floor Plan: estados =================

// Tríada de estados que expone la UI. El backend persiste varchar libre y solo valida
// ['active','inactive'] al escribir (más 'deleted' al borrar en soft), así que la UI
// traduce: inactive -> draft, deleted -> archived (ver normalizeFloorPlanStatus).
export type FloorPlanStatus = 'active' | 'draft' | 'archived';

// Lista ordenada para poblar selects y filtros sin recorrer un enum.
export const FLOOR_PLAN_STATUSES: FloorPlanStatus[] = ['active', 'draft', 'archived'];

export const FLOOR_PLAN_STATUS_LABELS: Record<FloorPlanStatus, string> = {
  active: 'Active',
  draft: 'Draft',
  archived: 'Archived',
};

export const FLOOR_PLAN_STATUS_BADGE_STYLES: Record<FloorPlanStatus, string> = {
  active: 'bg-green-500/10 text-green-700',
  draft: 'bg-amber-500/10 text-amber-700',
  archived: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
};

// El backend puede devolver valores legacy fuera de la tríada; caemos a 'active' para
// que la fila siga siendo visible y editable en vez de romper el badge.
export const normalizeFloorPlanStatus = (raw: string): FloorPlanStatus => {
  const value = (raw ?? '').toLowerCase();
  if (value === 'draft' || value === 'inactive') return 'draft';
  if (value === 'archived' || value === 'deleted') return 'archived';
  return 'active';
};

// ================= Mesas: formas =================

// Casing exacto del backend: el DTO valida @IsIn(['Circle','Square','Rectangle']),
// así que enviar minúsculas devuelve 400.
export type TableShape =
  | 'Circle'
  | 'Square'
  | 'Rectangle'
  | 'Oval'
  | 'Booth'
  | 'Counter';

export const TABLE_SHAPES: TableShape[] = [
  'Circle',
  'Square',
  'Rectangle',
  'Oval',
  'Booth',
  'Counter',
];

// Límites del tamaño propio de una mesa, en píxeles de lienzo (100px = 1m). Replican los
// del backend: por debajo de 20cm la mesa es invisible y por encima de 6m desborda
// cualquier sala razonable.
export const TABLE_MIN_SIZE_PX = 20;
export const TABLE_MAX_SIZE_PX = 600;

// ================= Vínculos relacionales =================

// El backend embebe merchant/floorPlan con hidratación variable según el endpoint
// (a veces {id,name}, a veces la entidad completa), por eso solo `id` es garantizado.
export interface MerchantRef {
  id: number;
  name?: string;
}

export interface FloorPlanRef {
  id: number;
  name?: string;
}

// ================= Entidades =================

export interface FloorZone {
  id: number;
  name: string;
  color?: string | null;
  // Región de la zona sobre el lienzo (JSON de puntos en px). null = la zona es sólo una
  // etiqueta de color, sin área dibujada: así nacieron todas antes de existir esta columna.
  area?: string | null;
  // varchar libre en el backend; la UI lo normaliza a la tríada con normalizeFloorZoneStatus.
  status: string;
  // El findAll de /api/floor-zone SÍ embebe {id,name} del plano padre (a diferencia de
  // /api/floor-plan con sus colecciones), así que la parrilla no necesita resolverlo aparte.
  floorPlan?: FloorPlanRef | null;
  merchant?: MerchantRef | null;
  created_at?: string;
  updated_at?: string;
}

// La zona comparte la tríada de estados del plano: mismo vocabulario, mismos badges.
export type FloorZoneStatus = FloorPlanStatus;
export const FLOOR_ZONE_STATUSES = FLOOR_PLAN_STATUSES;
export const FLOOR_ZONE_STATUS_LABELS = FLOOR_PLAN_STATUS_LABELS;
export const FLOOR_ZONE_STATUS_BADGE_STYLES = FLOOR_PLAN_STATUS_BADGE_STYLES;
export const normalizeFloorZoneStatus = normalizeFloorPlanStatus;

// Color por defecto de una zona nueva: el rojo corporativo, para que el swatch nunca
// quede vacío si el usuario no elige nada.
export const DEFAULT_ZONE_COLOR = '#ae001a';

// El backend guarda `color` como varchar libre: puede llegar un hex, un nombre CSS o basura.
// Sólo dejamos pasar a un style inline lo que el navegador sabe interpretar sin romper el
// swatch, y para todo lo demás caemos al color por defecto.
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const CSS_NAME = /^[a-z]{3,20}$/i;

export const isRenderableColor = (raw?: string | null): boolean =>
  !!raw && (HEX_COLOR.test(raw.trim()) || CSS_NAME.test(raw.trim()));

export const zoneSwatchColor = (raw?: string | null): string =>
  isRenderableColor(raw) ? (raw as string).trim() : DEFAULT_ZONE_COLOR;

export interface CreateFloorZoneDto {
  merchant: number;
  name: string;
  color: string;
  area?: string | null;
  floorPlan: number;
  status: string;
}

// El backend expone UpdateFloorZoneDto = PartialType(CreateFloorZoneDto); `merchant` se
// omite a propósito al editar para no reasignar la zona de comercio por accidente.
export type UpdateFloorZoneDto = Partial<Omit<CreateFloorZoneDto, 'merchant'>>;

// Nombre único por plano: el backend NO lo valida, así que el guard vive en el formulario.
export const duplicateZoneNameError = (
  name: string,
  planName: string,
): string => `A zone named '${name}' already exists on '${planName}'.`;

// Una zona con mesas asignadas no puede borrarse ni archivarse: las mesas quedarían
// huérfanas de zona y el POS no sabría dónde pintarlas.
export const floorZoneMutationGuard = (tableCount: number): string =>
  tableCount > 0
    ? 'Cannot delete or archive a zone with assigned tables. Reassign tables to another zone or remove them first.'
    : '';

export interface DiningTable {
  id: number;
  merchant_id: number;
  number: string;
  capacity: number;
  status: string; // varchar libre: no lo tipamos como unión para no perder valores del POS.
  location: string;
  rotation: number; // Grados 0-360.
  shape: TableShape;
  // Tamaño propio en píxeles de lienzo. null/ausente = usar el de su forma, que es como
  // se comportaban todas las mesas antes de existir estas columnas.
  width?: number | null;
  height?: number | null;
  pos_x: number;
  pos_y: number;
  // No existe un escalar floor_plan_id en la respuesta: la única forma de saber a qué
  // plano pertenece la mesa es este objeto anidado (puede venir null si el FK es null).
  floorPlan?: FloorPlanRef | null;
  floorZone?: { id: number; name?: string; color?: string | null } | null;
  parent_table_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface FloorPlan {
  id: number;
  name: string;
  width: number;
  height: number;
  status: FloorPlanStatus;
  // Contorno de la sala (polígono en px del lienzo) tal y como lo persiste el backend:
  // columna `text` nullable con el JSON serializado, NO un array. `null` (o ausente en planos
  // anteriores a la columna) significa "rectángulo completo width × height". La geometría vive
  // en src/lib/floor-geometry.ts: parseOutline() es quien traduce este string a puntos.
  outline?: string | null;
  merchant?: MerchantRef | null;
  // El backend NUNCA embebe tables/floorZones en /api/floor-plan: se agregan en el
  // front cruzando /api/tables y /api/floor-zone por floorPlan.id.
  tables?: DiningTable[];
  floorZones?: FloorZone[];
  created_at?: string;
  updated_at?: string;
}

// ================= DTOs de escritura =================

// El campo del comercio es `merchant` (número), no merchant_id: el backend no lo deriva
// del JWT en floor-plan, hay que enviarlo explícito.
export interface CreateFloorPlanDto {
  merchant: number;
  name: string;
  width: number;
  height: number;
  // Opcional en el DTO del backend (@IsOptional + @MaxLength(20000)): omitirlo equivale a
  // mandar null, es decir, a un plano rectangular.
  outline?: string | null;
  status: string;
}

// PATCH /api/floor-plan/:id usa whitelist estricta; omitimos `merchant` porque
// Object.assign sobreescribiría la relación con un número crudo y la corrompería.
// `outline` sí viaja aquí (hereda de CreateFloorPlanDto): al ser PATCH parcial, omitirlo
// preserva el contorno guardado y enviar null explícito lo devuelve a rectángulo.
export type UpdateFloorPlanDto = Partial<Omit<CreateFloorPlanDto, 'merchant'>>;

// Todos los campos son @IsNotEmpty en el backend salvo parent_table_id; floorZone es
// obligatorio al crear (a diferencia del update).
export interface CreateDiningTableDto {
  merchant_id: number;
  number: string;
  capacity: number;
  status: string;
  location: string;
  rotation: number;
  shape: TableShape;
  width?: number | null;
  height?: number | null;
  pos_x: number;
  pos_y: number;
  floorZone: number;
  floorPlan: number;
  parent_table_id?: number | null;
}

// PUT /api/tables/:id rechaza merchant_id con 400 (forbidNonWhitelisted).
export type UpdateDiningTableDto = Partial<Omit<CreateDiningTableDto, 'merchant_id'>>;

// ================= Reglas espaciales del canvas =================

export const FLOOR_PLAN_MIN_DIMENSION = 300;
export const FLOOR_PLAN_MAX_DIMENSION = 4000;

// width/height son int en Postgres: un decimal se truncaría en silencio, así que lo
// bloqueamos en el form en vez de dejar que el backend lo redondee.
// `v` SIEMPRE llega en píxeles (es lo que persiste el backend); `system` solo redacta el
// mensaje en la unidad que el usuario tiene delante, porque exigirle "entre 300px y 4000px"
// mientras teclea metros es pedirle que haga la conversión de cabeza. Omitirlo conserva el
// texto en píxeles para cualquier llamador que siga hablando en esa unidad.
export const validateCanvasDimension = (v: number, system?: UnitSystem): string => {
  if (
    Number.isInteger(v) &&
    v >= FLOOR_PLAN_MIN_DIMENSION &&
    v <= FLOOR_PLAN_MAX_DIMENSION
  ) {
    return '';
  }
  const min = system
    ? formatLength(FLOOR_PLAN_MIN_DIMENSION, system)
    : `${FLOOR_PLAN_MIN_DIMENSION}px`;
  const max = system
    ? formatLength(FLOOR_PLAN_MAX_DIMENSION, system)
    : `${FLOOR_PLAN_MAX_DIMENSION}px`;
  return `Canvas dimensions must be between ${min} and ${max}.`;
};

// Huella renderizada por defecto de cada forma, en px de canvas. La comparten el editor
// y el chequeo de recorte para que "lo que se ve" y "lo que se valida" no diverjan.
export const TABLE_FOOTPRINT: Record<TableShape, { w: number; h: number }> = {
  Circle: { w: 80, h: 80 },
  Square: { w: 80, h: 80 },
  Rectangle: { w: 120, h: 70 },
  Oval: { w: 120, h: 80 },
  Booth: { w: 140, h: 90 },
  Counter: { w: 200, h: 60 },
};

// Huella REAL de una mesa: su tamaño propio si lo tiene, y si no el de su forma.
// Todo el editor (arrastre, clamp, colisiones, contención en el polígono) debe pasar por
// aquí: si alguien usa TABLE_FOOTPRINT directamente, las mesas redimensionadas se
// comportarían como si midieran lo que dicta su forma.
export const tableFootprint = (
  t: Pick<DiningTable, 'shape'> & { width?: number | null; height?: number | null },
): { w: number; h: number } => {
  const base = TABLE_FOOTPRINT[t.shape] ?? TABLE_FOOTPRINT.Square;
  return {
    w: t.width != null && t.width > 0 ? t.width : base.w,
    h: t.height != null && t.height > 0 ? t.height : base.h,
  };
};

// pos_x/pos_y son la esquina superior izquierda de la huella (mismo origen que el
// posicionamiento absoluto del editor), por eso el borde derecho/inferior suma w/h.
export const isTableClipped = (
  t: Pick<DiningTable, 'pos_x' | 'pos_y' | 'shape'> & {
    width?: number | null;
    height?: number | null;
  },
  width: number,
  height: number,
): boolean => {
  const footprint = tableFootprint(t);
  return (
    t.pos_x < 0 ||
    t.pos_y < 0 ||
    t.pos_x + footprint.w > width ||
    t.pos_y + footprint.h > height
  );
};

// Aviso previo a guardar un redimensionado: si alguna mesa quedaría fuera del lienzo,
// el usuario debe recolocarla antes (el backend no reubica nada por su cuenta).
// `width`/`height` viajan en píxeles igual que las coordenadas de las mesas: `system` solo
// decide cómo se leen esas dimensiones en el aviso.
export const clippingWarning = (
  tables: DiningTable[],
  width: number,
  height: number,
  system?: UnitSystem,
): string => {
  const n = tables.filter((t) => isTableClipped(t, width, height)).length;
  if (n === 0) return '';
  const size = system
    ? formatDimensions(width, height, system)
    : `${width}px × ${height}px`;
  return `New canvas dimensions (${size}) will clip ${n} existing tables placed outside these bounds. Please adjust table coordinates first.`;
};

// Borrar/archivar un plano no cascadea en el backend: las mesas quedarían huérfanas
// apuntando a un plano invisible, así que la UI lo bloquea antes de llamar a la API.
export const floorPlanMutationGuard = (tableCount: number): string =>
  tableCount > 0
    ? 'Cannot delete or archive a floor plan with active table layouts or open orders. Reassign or clear tables first.'
    : '';
