// Geometría del contorno de sala (room outline) del editor de planos.
//
// El backend persiste el contorno como JSON serializado en `floor_plan.outline` (columna text,
// nullable). `null` significa "rectángulo completo width × height", que es como se comportaban
// los planos anteriores a este campo. Todo lo de aquí es PURO: sin React, sin fetch, sin DOM,
// para que el editor y los tests compartan exactamente la misma verdad geométrica.
//
// Sistema de coordenadas: píxeles del lienzo, origen arriba-izquierda, +y hacia abajo (igual que
// el posicionamiento absoluto del editor). Por eso los polígonos se escriben en sentido horario
// visual; el área se toma en valor absoluto y nada depende de la orientación.

import { tableFootprint } from '../types/dining-system';

export interface Point {
  x: number;
  y: number;
}

export type Outline = Point[];

// Un polígono necesita 3 esquinas para encerrar superficie; con 2 es un segmento.
export const MIN_OUTLINE_VERTICES = 3;

// Tolerancia para comparaciones de punto flotante. Trabajamos en píxeles de lienzo, donde una
// milésima de píxel es ruido de coma flotante y nunca una diferencia real.
const EPSILON = 1e-9;

// ================= Construcción =================

/** Rectángulo completo: el contorno por defecto cuando el plano no tiene forma propia. */
export const rectangleOutline = (w: number, h: number): Outline => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

// Los presets se calculan en fracciones del lienzo y se redondean a enteros: así el contorno
// encaja con el snap de 10px del editor y sobrevive intacto al ida y vuelta de serializeOutline.
const at = (total: number, fraction: number): number => Math.round(total * fraction);

/** Presets de planta. build() recibe el lienzo y devuelve un polígono ajustado a él. */
export const OUTLINE_PRESETS: Array<{
  id: string;
  label: string;
  build: (w: number, h: number) => Outline;
}> = [
  {
    id: 'rectangle',
    label: 'Rectangle',
    build: (w, h) => rectangleOutline(w, h),
  },
  {
    // Letra L: barra vertical a la izquierda + barra horizontal abajo. La muesca es el
    // rectángulo superior derecho, que queda FUERA de la sala aunque esté dentro del lienzo.
    id: 'l-shape',
    label: 'L-Shape',
    build: (w, h) => [
      { x: 0, y: 0 },
      { x: at(w, 0.45), y: 0 },
      { x: at(w, 0.45), y: at(h, 0.6) },
      { x: w, y: at(h, 0.6) },
      { x: w, y: h },
      { x: 0, y: h },
    ],
  },
  {
    // Letra U: dos patas verticales y barra inferior; la muesca se abre por arriba, al centro.
    id: 'u-shape',
    label: 'U-Shape',
    build: (w, h) => [
      { x: 0, y: 0 },
      { x: at(w, 0.3), y: 0 },
      { x: at(w, 0.3), y: at(h, 0.6) },
      { x: at(w, 0.7), y: at(h, 0.6) },
      { x: at(w, 0.7), y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
  },
  {
    // Esquina superior derecha achaflanada. El chaflán se mide sobre el lado corto para que no
    // se coma la sala entera en lienzos muy alargados.
    id: 'cut-corner',
    label: 'Cut Corner',
    build: (w, h) => {
      const cut = Math.round(Math.min(w, h) * 0.25);
      return [
        { x: 0, y: 0 },
        { x: w - cut, y: 0 },
        { x: w, y: cut },
        { x: w, y: h },
        { x: 0, y: h },
      ];
    },
  },
];

// ================= Serialización =================

// Solo aceptamos números finitos: un NaN o un Infinity colado en el JSON reventaría el <path>
// del SVG y dejaría el lienzo en blanco sin decir por qué.
const isPoint = (value: unknown): value is Point => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { x?: unknown; y?: unknown };
  return (
    typeof candidate.x === 'number' &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y)
  );
};

/** Tolera null, string JSON, array ya parseado o basura. NUNCA lanza: cae al rectángulo. */
export const parseOutline = (raw: unknown, w: number, h: number): Outline => {
  const fallback = rectangleOutline(w, h);

  // El backend devuelve string (columna text) pero el editor puede pasar el array ya vivo;
  // aceptamos ambos para no obligar a serializar y volver a parsear en cada render.
  let value: unknown = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return fallback;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return fallback;
    }
  }

  if (!Array.isArray(value)) return fallback;

  // Si UN solo vértice viene corrupto descartamos el contorno entero en vez de filtrarlo: un
  // polígono al que le falta una esquina dibuja una sala equivocada, y eso es peor que caer al
  // rectángulo, porque validaría mesas contra unos límites que el usuario nunca dibujó.
  if (!value.every(isPoint)) return fallback;

  const outline: Outline = value.map((p) => ({ x: p.x, y: p.y }));
  return validateOutline(outline) === '' ? outline : fallback;
};

/** JSON con coordenadas redondeadas a enteros. */
export const serializeOutline = (o: Outline): string =>
  JSON.stringify(o.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })));

// ================= Medidas =================

export const polygonBounds = (
  o: Outline,
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } => {
  // Un contorno vacío no tiene caja: devolvemos el origen degenerado para que el consumidor
  // pueda dividir por width/height sin comprobar null (obtendrá 0, no una excepción).
  if (o.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

  let minX = o[0].x;
  let minY = o[0].y;
  let maxX = o[0].x;
  let maxY = o[0].y;

  for (const p of o) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

/** Área por la fórmula del cordón (shoelace), en valor absoluto y en px². */
export const polygonArea = (o: Outline): number => {
  if (o.length < MIN_OUTLINE_VERTICES) return 0;

  let sum = 0;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    sum += o[j].x * o[i].y - o[i].x * o[j].y;
  }
  return Math.abs(sum) / 2;
};

// ================= Pertenencia =================

// ¿Está `p` sobre el segmento a-b? Producto vectorial ~0 (colineal) y producto escalar <=0
// (entre los dos extremos, no en la prolongación de la recta).
const isOnSegment = (p: Point, a: Point, b: Point): boolean => {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > EPSILON) return false;
  const dot = (p.x - a.x) * (p.x - b.x) + (p.y - a.y) * (p.y - b.y);
  return dot <= EPSILON;
};

/** Ray casting horizontal, con el borde contando como DENTRO. */
export const pointInPolygon = (p: Point, o: Outline): boolean => {
  if (o.length < MIN_OUTLINE_VERTICES) return false;

  // El borde se resuelve aparte: el ray casting es ambiguo justo sobre la arista (según de qué
  // lado caiga el redondeo da dentro o fuera), y una mesa pegada a la pared debe ser válida.
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    if (isOnSegment(p, o[j], o[i])) return true;
  }

  let inside = false;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const a = o[i];
    const b = o[j];
    // Solo cruzamos aristas que cubren la altura del punto; la comparación asimétrica (> vs >)
    // evita contar dos veces un vértice compartido por dos aristas.
    if (a.y > p.y !== b.y > p.y) {
      const xCross = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < xCross) inside = !inside;
    }
  }
  return inside;
};

/** Atributo `d` de un <path> SVG, cerrado con Z. */
export const outlinePath = (o: Outline): string => {
  if (o.length === 0) return '';
  return `M ${o.map((p) => `${p.x} ${p.y}`).join(' L ')} Z`;
};

// ================= Arrastre dentro de la sala =================

// Proyección de p sobre el segmento a-b, acotada a sus extremos (t en [0,1]).
const projectOnSegment = (p: Point, a: Point, b: Point): Point => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPSILON) return { x: a.x, y: a.y };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + t * dx, y: a.y + t * dy };
};

const distance2 = (a: Point, b: Point): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Punto más cercano DENTRO del polígono (para arrastrar sin salirse). */
export const clampPointToPolygon = (p: Point, o: Outline): Point => {
  // Sin polígono usable no hay nada que acotar: devolver el punto tal cual es menos dañino que
  // inventarse una posición.
  if (o.length < MIN_OUTLINE_VERTICES) return { x: p.x, y: p.y };
  if (pointInPolygon(p, o)) return { x: p.x, y: p.y };

  // Buscamos la proyección más cercana sobre TODAS las aristas, no sobre la caja envolvente:
  // en una planta en L el punto puede estar en la muesca, rodeado de caja pero fuera de la sala.
  let nearest = projectOnSegment(p, o[o.length - 1], o[0]);
  let best = distance2(p, nearest);
  let edgeStart = o[o.length - 1];
  let edgeEnd = o[0];

  for (let i = 1; i < o.length; i += 1) {
    const candidate = projectOnSegment(p, o[i - 1], o[i]);
    const d = distance2(p, candidate);
    if (d < best) {
      best = d;
      nearest = candidate;
      edgeStart = o[i - 1];
      edgeEnd = o[i];
    }
  }

  // La proyección cae EXACTAMENTE sobre la pared. Nos metemos un píxel hacia dentro porque el
  // consumidor redondea coordenadas y un borde justo puede caer al lado de fuera al redondear;
  // además así la mesa queda visualmente dentro de la sala y no montada sobre la línea.
  const dx = edgeEnd.x - edgeStart.x;
  const dy = edgeEnd.y - edgeStart.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len > EPSILON) {
    // No sabemos de antemano qué normal apunta al interior (depende de la orientación del
    // polígono), así que probamos las dos y nos quedamos con la que cae dentro.
    const nx = -dy / len;
    const ny = dx / len;
    for (const sign of [1, -1]) {
      const candidate = { x: nearest.x + nx * sign, y: nearest.y + ny * sign };
      if (pointInPolygon(candidate, o)) return candidate;
    }
  }

  // Polígono demasiado estrecho para caber un píxel adentro: el borde ya cuenta como dentro.
  return nearest;
};

// ================= Mesas =================

/** Una mesa cabe si las 4 esquinas de su footprint caen dentro del polígono. */
export const tableInsideOutline = (
  t: {
    pos_x: number;
    pos_y: number;
    shape: string;
    width?: number | null;
    height?: number | null;
  },
  o: Outline,
): boolean => {
  // pos_x/pos_y es la esquina superior izquierda de la huella, igual que en isTableClipped.
  const footprint = tableFootprint(t as never);
  const corners: Outline = [
    { x: t.pos_x, y: t.pos_y },
    { x: t.pos_x + footprint.w, y: t.pos_y },
    { x: t.pos_x + footprint.w, y: t.pos_y + footprint.h },
    { x: t.pos_x, y: t.pos_y + footprint.h },
  ];
  return corners.every((c) => pointInPolygon(c, o));
};

export const tablesOutsideOutline = (
  tables: Array<{
    pos_x: number;
    pos_y: number;
    shape: string;
    width?: number | null;
    height?: number | null;
  }>,
  o: Outline,
): number => tables.filter((t) => !tableInsideOutline(t, o)).length;

/** Aviso de reforma. '' cuando ninguna mesa queda fuera. */
export const outlineWarning = (n: number): string =>
  n > 0
    ? `The new room shape leaves ${n} tables outside its boundary. Move them inside before saving.`
    : '';

// ================= Edición de vértices =================

/** Inserta un vértice en el punto medio de la arista i -> i+1. Devuelve un array NUEVO. */
export const insertVertex = (o: Outline, edgeIndex: number): Outline => {
  // Índice fuera de rango: devolvemos una copia igualmente, para que el llamante pueda tratar
  // el resultado siempre como estado nuevo y no tenga que ramificar.
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= o.length) {
    return [...o];
  }

  // La última arista cierra el polígono (n-1 -> 0), de ahí el módulo.
  const a = o[edgeIndex];
  const b = o[(edgeIndex + 1) % o.length];
  const midpoint: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  const next = [...o];
  next.splice(edgeIndex + 1, 0, midpoint);
  return next;
};

/** Quita el vértice i. Si quedaran menos de MIN_OUTLINE_VERTICES, devuelve el original sin tocar. */
export const removeVertex = (o: Outline, index: number): Outline => {
  if (!Number.isInteger(index) || index < 0 || index >= o.length) return o;
  // Suelo duro: por debajo de 3 esquinas el "polígono" deja de encerrar sala y el editor se
  // quedaría sin nada que dibujar ni contra qué validar mesas.
  if (o.length - 1 < MIN_OUTLINE_VERTICES) return o;

  return o.filter((_, i) => i !== index);
};

/** Valida que el polígono sea usable (>=3 vértices, sin NaN, área > 0). '' si es válido. */
export const validateOutline = (o: Outline): string => {
  if (!Array.isArray(o) || o.length < MIN_OUTLINE_VERTICES) {
    return `A room outline needs at least ${MIN_OUTLINE_VERTICES} corners.`;
  }
  if (!o.every(isPoint)) {
    return 'Room outline corners must be valid numbers.';
  }
  // Área cero = todos los vértices alineados: se ve como una raya y ninguna mesa cabría dentro.
  if (polygonArea(o) <= EPSILON) {
    return 'Room outline must enclose an area.';
  }
  return '';
};
