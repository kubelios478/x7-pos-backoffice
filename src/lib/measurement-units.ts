/** El lienzo se mide en px; ésta es la escala física que asume el editor. */
export const PX_PER_METER = 100;

/** 1 pie = 0.3048 m por definición internacional (exacto, no es una aproximación). */
const METERS_PER_FOOT = 0.3048;
const INCHES_PER_FOOT = 12;
const PX_PER_FOOT = PX_PER_METER * METERS_PER_FOOT;
const SQ_METERS_PER_SQ_FOOT = METERS_PER_FOOT * METERS_PER_FOOT;

export type UnitSystem = 'metric' | 'imperial';

export const UNIT_SYSTEMS: UnitSystem[] = ['metric', 'imperial'];

export const UNIT_SYSTEM_LABELS: Record<UnitSystem, string> = {
  metric: 'Meters',
  imperial: 'Feet & inches',
};

export const UNIT_SYSTEM_SHORT: Record<UnitSystem, string> = {
  metric: 'm',
  imperial: 'ft',
};

/**
 * Pies y pulgadas ya redondeadas y normalizadas. La normalización es el punto delicado:
 * 11.96" redondea a 12", que NO es una medida válida — son 1' 0". Sin este acarreo el
 * editor mostraría `5' 12"`, que a un gerente de sala le parece (con razón) un error.
 */
function toFeetAndInches(px: number): { feet: number; inches: number } {
  const totalInches = (px / PX_PER_FOOT) * INCHES_PER_FOOT;
  const feet = Math.floor(totalInches / INCHES_PER_FOOT);
  const inches = Math.round(totalInches - feet * INCHES_PER_FOOT);

  if (inches >= INCHES_PER_FOOT) {
    return { feet: feet + 1, inches: 0 };
  }

  return { feet, inches };
}

/** Longitud: px -> unidad elegida, ya formateada y con su símbolo. */
export const formatLength = (px: number, system: UnitSystem): string => {
  if (system === 'imperial') {
    const { feet, inches } = toFeetAndInches(px);
    return `${feet}' ${inches}"`;
  }

  // A 100px = 1m, 1px = 1cm exacto. Se compara sobre los cm YA redondeados para que
  // 99.6px no se anuncie como "100 cm" (que es un metro escrito de la peor manera).
  const cm = Math.round(px);
  if (Math.abs(cm) < 100) {
    return `${cm} cm`;
  }

  // Un decimal, pero sin el `.0` colgando: el lienzo por defecto es de metros redondos
  // y "10 m" se lee mucho mejor que "10.0 m".
  return `${(px / PX_PER_METER).toFixed(1).replace(/\.0$/, '')} m`;
};

/** Igual pero SIN símbolo, para meterlo en un <input numérico>. */
export const lengthValue = (px: number, system: UnitSystem): number => {
  const raw = system === 'imperial' ? px / PX_PER_FOOT : px / PX_PER_METER;
  return Number(raw.toFixed(2));
};

/** Inverso de lengthValue: el número que teclea el usuario -> px enteros. */
export const lengthToPx = (value: number, system: UnitSystem): number =>
  Math.round(value * (system === 'imperial' ? PX_PER_FOOT : PX_PER_METER));

/** Sufijo para las etiquetas de formulario: '(m)' | '(ft)'. */
export const lengthSuffix = (system: UnitSystem): string =>
  `(${UNIT_SYSTEM_SHORT[system]})`;

/** Área: px² -> superficie formateada. */
export const formatArea = (pxSquared: number, system: UnitSystem): string => {
  const squareMeters = pxSquared / (PX_PER_METER * PX_PER_METER);

  if (system === 'imperial') {
    return `${Math.round(squareMeters / SQ_METERS_PER_SQ_FOOT)} ft²`;
  }

  return `${squareMeters.toFixed(1)} m²`;
};

/** Dimensiones de un lienzo o footprint, ya combinadas. */
export const formatDimensions = (
  wPx: number,
  hPx: number,
  system: UnitSystem,
): string => `${formatLength(wPx, system)} × ${formatLength(hPx, system)}`;

/** Preferencia persistida en localStorage (clave 'x7_unit_system'). */
export const UNIT_STORAGE_KEY = 'x7_unit_system';

function isUnitSystem(value: unknown): value is UnitSystem {
  return UNIT_SYSTEMS.includes(value as UnitSystem);
}

export const loadUnitSystem = (): UnitSystem => {
  // En SSR `localStorage` no existe y con cookies de terceros bloqueadas el mero acceso
  // tira SecurityError. Una preferencia de unidades jamás debe tumbar el editor: ante
  // cualquier fallo se cae al sistema métrico.
  try {
    const stored = localStorage.getItem(UNIT_STORAGE_KEY);
    return isUnitSystem(stored) ? stored : 'metric';
  } catch {
    return 'metric';
  }
};

export const saveUnitSystem = (s: UnitSystem): void => {
  try {
    localStorage.setItem(UNIT_STORAGE_KEY, s);
  } catch {
    // Guardar es best-effort: si el almacenamiento está bloqueado el usuario conserva su
    // elección durante la sesión y sólo pierde la persistencia.
  }
};
