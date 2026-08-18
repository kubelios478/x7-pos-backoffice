import { describe, expect, it } from 'vitest';
import {
  MIN_OUTLINE_VERTICES,
  OUTLINE_PRESETS,
  clampPointToPolygon,
  insertVertex,
  outlinePath,
  outlineWarning,
  parseOutline,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  rectangleOutline,
  removeVertex,
  serializeOutline,
  tableInsideOutline,
  tablesOutsideOutline,
  validateOutline,
} from './floor-geometry';
import type { Outline } from './floor-geometry';

const preset = (id: string) => {
  const found = OUTLINE_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`preset ${id} missing`);
  return found;
};

// Planta en L de 1000x1000: barra vertical izquierda (0..450) + barra horizontal inferior
// (y 600..1000). La muesca superior derecha está dentro de la caja envolvente pero FUERA
// de la sala: es el caso que distingue un point-in-polygon real de un chequeo de bounds.
const L: Outline = preset('l-shape').build(1000, 1000);

describe('floor-geometry — rectangleOutline', () => {
  it('devuelve las 4 esquinas en orden desde el origen', () => {
    expect(rectangleOutline(800, 600)).toEqual([
      { x: 0, y: 0 },
      { x: 800, y: 0 },
      { x: 800, y: 600 },
      { x: 0, y: 600 },
    ]);
  });

  it('es un polígono válido y su área coincide con w*h', () => {
    expect(validateOutline(rectangleOutline(800, 600))).toBe('');
    expect(polygonArea(rectangleOutline(800, 600))).toBe(480000);
  });
});

describe('floor-geometry — presets', () => {
  it('expone exactamente los cuatro ids del contrato, en orden', () => {
    expect(OUTLINE_PRESETS.map((p) => p.id)).toEqual([
      'rectangle',
      'l-shape',
      'u-shape',
      'cut-corner',
    ]);
    expect(OUTLINE_PRESETS.map((p) => p.label)).toEqual([
      'Rectangle',
      'L-Shape',
      'U-Shape',
      'Cut Corner',
    ]);
  });

  it('todos producen polígonos válidos con coordenadas enteras dentro del lienzo', () => {
    for (const p of OUTLINE_PRESETS) {
      const outline = p.build(1000, 800);
      expect(validateOutline(outline), p.id).toBe('');
      for (const v of outline) {
        expect(Number.isInteger(v.x), `${p.id} x`).toBe(true);
        expect(Number.isInteger(v.y), `${p.id} y`).toBe(true);
        expect(v.x).toBeGreaterThanOrEqual(0);
        expect(v.y).toBeGreaterThanOrEqual(0);
        expect(v.x).toBeLessThanOrEqual(1000);
        expect(v.y).toBeLessThanOrEqual(800);
      }
    }
  });

  it("'rectangle' es el rectángulo completo", () => {
    expect(preset('rectangle').build(500, 400)).toEqual(rectangleOutline(500, 400));
    expect(polygonArea(preset('rectangle').build(500, 400))).toBe(200000);
  });

  it("'l-shape' tiene 6 vértices y recorta la muesca superior derecha", () => {
    expect(L).toHaveLength(6);
    // Área = lienzo entero menos la muesca (550 x 600).
    expect(polygonArea(L)).toBe(1000 * 1000 - 550 * 600);
    // Aunque falte una esquina, la caja envolvente sigue siendo el lienzo completo.
    expect(polygonBounds(L)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 1000,
      maxY: 1000,
      width: 1000,
      height: 1000,
    });
  });

  it("'u-shape' tiene 8 vértices y abre la muesca por arriba, al centro", () => {
    const u = preset('u-shape').build(1000, 1000);
    expect(u).toHaveLength(8);
    expect(pointInPolygon({ x: 500, y: 200 }, u)).toBe(false); // hueco central
    expect(pointInPolygon({ x: 150, y: 300 }, u)).toBe(true); // pata izquierda
    expect(pointInPolygon({ x: 850, y: 300 }, u)).toBe(true); // pata derecha
    expect(pointInPolygon({ x: 500, y: 800 }, u)).toBe(true); // barra inferior
    expect(polygonArea(u)).toBe(1000 * 1000 - 400 * 600);
  });

  it("'cut-corner' achaflana la esquina superior derecha", () => {
    const c = preset('cut-corner').build(1000, 800);
    expect(c).toHaveLength(5);
    // Chaflán = 25% del lado corto (800) = 200 -> triángulo de 200x200.
    expect(polygonArea(c)).toBe(1000 * 800 - (200 * 200) / 2);
    expect(pointInPolygon({ x: 960, y: 20 }, c)).toBe(false); // dentro del chaflán cortado
    expect(pointInPolygon({ x: 960, y: 400 }, c)).toBe(true);
  });
});

describe('floor-geometry — pointInPolygon con planta en L', () => {
  it('un punto en la muesca queda FUERA aunque esté dentro del bounding box', () => {
    const notch = { x: 800, y: 200 };
    const bounds = polygonBounds(L);
    // Prueba de que el bounding box no basta: el punto lo satisface y aun así está fuera.
    expect(notch.x).toBeLessThan(bounds.maxX);
    expect(notch.y).toBeLessThan(bounds.maxY);
    expect(pointInPolygon(notch, L)).toBe(false);
  });

  it('acepta puntos de la barra vertical y de la barra horizontal', () => {
    expect(pointInPolygon({ x: 200, y: 200 }, L)).toBe(true); // barra vertical
    expect(pointInPolygon({ x: 200, y: 900 }, L)).toBe(true); // barra horizontal
    expect(pointInPolygon({ x: 800, y: 900 }, L)).toBe(true); // ala derecha inferior
  });

  it('el borde cuenta como dentro: vértices, aristas y la arista del hueco', () => {
    for (const v of L) expect(pointInPolygon(v, L)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 500 }, L)).toBe(true); // pared izquierda
    expect(pointInPolygon({ x: 700, y: 600 }, L)).toBe(true); // pared interior del hueco
    expect(pointInPolygon({ x: 450, y: 300 }, L)).toBe(true); // pared vertical del hueco
  });

  it('rechaza puntos fuera del lienzo y polígonos degenerados', () => {
    expect(pointInPolygon({ x: -5, y: 500 }, L)).toBe(false);
    expect(pointInPolygon({ x: 500, y: 1200 }, L)).toBe(false);
    expect(pointInPolygon({ x: 10, y: 10 }, [])).toBe(false);
    expect(pointInPolygon({ x: 10, y: 10 }, [{ x: 0, y: 0 }, { x: 20, y: 20 }])).toBe(false);
  });
});

describe('floor-geometry — parseOutline', () => {
  it('cae al rectángulo con null, undefined y cadena vacía', () => {
    expect(parseOutline(null, 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline(undefined, 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline('', 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline('   ', 800, 600)).toEqual(rectangleOutline(800, 600));
  });

  it('cae al rectángulo con JSON inválido sin lanzar', () => {
    expect(() => parseOutline('{no soy json', 800, 600)).not.toThrow();
    expect(parseOutline('{no soy json', 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline('[{"x":0,"y":', 800, 600)).toEqual(rectangleOutline(800, 600));
  });

  it('cae al rectángulo con tipos que no son un array de puntos', () => {
    expect(parseOutline(42, 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline({ x: 1, y: 2 }, 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline('"soy un string json"', 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline('null', 800, 600)).toEqual(rectangleOutline(800, 600));
  });

  it('cae al rectángulo con un array de basura o con vértices corruptos', () => {
    expect(parseOutline('[1,2,3]', 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(parseOutline([null, 'x', 7], 800, 600)).toEqual(rectangleOutline(800, 600));
    expect(
      parseOutline([{ x: 0, y: 0 }, { x: 10, y: 'diez' }, { x: 0, y: 10 }], 800, 600),
    ).toEqual(rectangleOutline(800, 600));
    expect(
      parseOutline([{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 0, y: 10 }], 800, 600),
    ).toEqual(rectangleOutline(800, 600));
  });

  it('cae al rectángulo con polígonos inservibles (pocos vértices o área cero)', () => {
    expect(parseOutline([{ x: 0, y: 0 }, { x: 10, y: 10 }], 800, 600)).toEqual(
      rectangleOutline(800, 600),
    );
    // Tres vértices colineales: sin superficie, no es una sala.
    expect(
      parseOutline([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }], 800, 600),
    ).toEqual(rectangleOutline(800, 600));
  });

  it('acepta un string JSON válido (lo que devuelve el backend)', () => {
    const raw = '[{"x":0,"y":0},{"x":800,"y":0},{"x":800,"y":600},{"x":0,"y":600}]';
    expect(parseOutline(raw, 999, 999)).toEqual(rectangleOutline(800, 600));
  });

  it('acepta un array ya parseado y descarta claves extra', () => {
    const parsed = parseOutline(L, 1000, 1000);
    expect(parsed).toEqual(L);
    expect(parsed).not.toBe(L); // copia defensiva: el editor puede mutar su propio estado
    expect(
      parseOutline([
        { x: 0, y: 0, id: 'a' },
        { x: 10, y: 0, id: 'b' },
        { x: 10, y: 10, id: 'c' },
      ], 800, 600),
    ).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  });
});

describe('floor-geometry — serializeOutline', () => {
  it('redondea a enteros', () => {
    expect(serializeOutline([{ x: 0.4, y: 0.6 }, { x: 99.5, y: 10.2 }, { x: 0, y: 20 }])).toBe(
      '[{"x":0,"y":1},{"x":100,"y":10},{"x":0,"y":20}]',
    );
  });

  it('ida y vuelta serialize -> parse conserva el polígono', () => {
    for (const p of OUTLINE_PRESETS) {
      const original = p.build(1200, 900);
      expect(parseOutline(serializeOutline(original), 1200, 900), p.id).toEqual(original);
    }
  });

  it('ida y vuelta con decimales: el parse recupera el polígono ya redondeado', () => {
    const messy: Outline = [
      { x: 0.2, y: 0.7 },
      { x: 300.49, y: 1.1 },
      { x: 299.51, y: 200.4 },
      { x: 1.4, y: 199.6 },
    ];
    expect(parseOutline(serializeOutline(messy), 800, 600)).toEqual([
      { x: 0, y: 1 },
      { x: 300, y: 1 },
      { x: 300, y: 200 },
      { x: 1, y: 200 },
    ]);
  });
});

describe('floor-geometry — polygonBounds y polygonArea', () => {
  it('calcula la caja envolvente de un polígono desplazado', () => {
    expect(
      polygonBounds([{ x: 40, y: 10 }, { x: 240, y: 10 }, { x: 240, y: 110 }, { x: 40, y: 110 }]),
    ).toEqual({ minX: 40, minY: 10, maxX: 240, maxY: 110, width: 200, height: 100 });
  });

  it('devuelve una caja degenerada en el origen si el contorno está vacío', () => {
    expect(polygonBounds([])).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
    });
  });

  it('el área es absoluta: no depende del sentido de giro', () => {
    const cw = rectangleOutline(300, 200);
    const ccw = [...cw].reverse();
    expect(polygonArea(cw)).toBe(60000);
    expect(polygonArea(ccw)).toBe(60000);
  });

  it('el área de un triángulo y de figuras degeneradas', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 50 }])).toBe(2500);
    expect(polygonArea([])).toBe(0);
    expect(polygonArea([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBe(0);
    expect(polygonArea([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }])).toBe(0);
  });
});

describe('floor-geometry — outlinePath', () => {
  it('genera un path SVG cerrado', () => {
    expect(outlinePath(rectangleOutline(800, 600))).toBe(
      'M 0 0 L 800 0 L 800 600 L 0 600 Z',
    );
  });

  it('devuelve cadena vacía sin vértices', () => {
    expect(outlinePath([])).toBe('');
  });
});

describe('floor-geometry — clampPointToPolygon', () => {
  const rect = rectangleOutline(800, 600);

  it('devuelve el punto tal cual si ya está dentro', () => {
    expect(clampPointToPolygon({ x: 400, y: 300 }, rect)).toEqual({ x: 400, y: 300 });
  });

  it('mete hacia dentro un punto que se salió del rectángulo', () => {
    const clamped = clampPointToPolygon({ x: 950, y: 300 }, rect);
    expect(clamped).toEqual({ x: 799, y: 300 });
    expect(pointInPolygon(clamped, rect)).toBe(true);
  });

  it('acota por las cuatro paredes', () => {
    expect(clampPointToPolygon({ x: -50, y: 300 }, rect)).toEqual({ x: 1, y: 300 });
    expect(clampPointToPolygon({ x: 400, y: -50 }, rect)).toEqual({ x: 400, y: 1 });
    expect(clampPointToPolygon({ x: 400, y: 999 }, rect)).toEqual({ x: 400, y: 599 });
  });

  it('un punto en la muesca de la L se pega a la pared REAL, no a la caja', () => {
    // (500, 100) está en el hueco; la pared más cercana es la vertical x=450.
    const clamped = clampPointToPolygon({ x: 500, y: 100 }, L);
    expect(pointInPolygon(clamped, L)).toBe(true);
    expect(clamped).toEqual({ x: 449, y: 100 });
  });

  it('un punto muy metido en la muesca sigue cayendo dentro de la sala', () => {
    const clamped = clampPointToPolygon({ x: 900, y: 100 }, L);
    expect(pointInPolygon(clamped, L)).toBe(true);
  });

  it('devuelve el punto sin tocar si el polígono no es usable', () => {
    expect(clampPointToPolygon({ x: 5, y: 5 }, [])).toEqual({ x: 5, y: 5 });
    expect(clampPointToPolygon({ x: 5, y: 5 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual({
      x: 5,
      y: 5,
    });
  });
});

describe('floor-geometry — tableInsideOutline', () => {
  const rect = rectangleOutline(800, 600);

  it('una mesa entera dentro pasa', () => {
    expect(tableInsideOutline({ pos_x: 100, pos_y: 100, shape: 'Square' }, rect)).toBe(true);
    expect(tableInsideOutline({ pos_x: 100, pos_y: 100, shape: 'Circle' }, rect)).toBe(true);
    expect(tableInsideOutline({ pos_x: 100, pos_y: 100, shape: 'Rectangle' }, rect)).toBe(true);
  });

  it('una mesa a caballo del borde NO pasa: se comprueban las 4 esquinas', () => {
    // Origen dentro, esquina derecha en 840 > 800.
    expect(tableInsideOutline({ pos_x: 760, pos_y: 100, shape: 'Square' }, rect)).toBe(false);
    // Justo pegada a la pared (borde incluido) sí pasa.
    expect(tableInsideOutline({ pos_x: 720, pos_y: 100, shape: 'Square' }, rect)).toBe(true);
    // Rectangle es 120x70: mide distinto que Square en el mismo sitio.
    expect(tableInsideOutline({ pos_x: 700, pos_y: 100, shape: 'Rectangle' }, rect)).toBe(false);
    expect(tableInsideOutline({ pos_x: 680, pos_y: 100, shape: 'Rectangle' }, rect)).toBe(true);
  });

  it('una forma desconocida cae al footprint de Square', () => {
    expect(tableInsideOutline({ pos_x: 720, pos_y: 100, shape: 'Hexagon' }, rect)).toBe(true);
    expect(tableInsideOutline({ pos_x: 760, pos_y: 100, shape: 'Hexagon' }, rect)).toBe(false);
  });

  it('en la L, una mesa dentro de la muesca queda fuera de la sala', () => {
    expect(tableInsideOutline({ pos_x: 600, pos_y: 100, shape: 'Square' }, L)).toBe(false);
    // Y una que asoma la esquina al hueco también: el bounding box la daría por buena.
    expect(tableInsideOutline({ pos_x: 400, pos_y: 100, shape: 'Square' }, L)).toBe(false);
    expect(tableInsideOutline({ pos_x: 350, pos_y: 100, shape: 'Square' }, L)).toBe(true);
  });
});

describe('floor-geometry — tablesOutsideOutline y outlineWarning', () => {
  const rect = rectangleOutline(800, 600);

  it('cuenta solo las mesas que se salen', () => {
    const tables = [
      { pos_x: 10, pos_y: 10, shape: 'Square' },
      { pos_x: 780, pos_y: 10, shape: 'Square' },
      { pos_x: 10, pos_y: 580, shape: 'Circle' },
      { pos_x: 200, pos_y: 200, shape: 'Rectangle' },
    ];
    expect(tablesOutsideOutline(tables, rect)).toBe(2);
    expect(tablesOutsideOutline([], rect)).toBe(0);
  });

  it('la misma distribución pierde más mesas al pasar a planta en L', () => {
    const tables = [
      { pos_x: 100, pos_y: 100, shape: 'Square' }, // barra vertical
      { pos_x: 700, pos_y: 100, shape: 'Square' }, // cae en la muesca
      { pos_x: 700, pos_y: 800, shape: 'Square' }, // barra horizontal
    ];
    expect(tablesOutsideOutline(tables, rectangleOutline(1000, 1000))).toBe(0);
    expect(tablesOutsideOutline(tables, L)).toBe(1);
  });

  it('el aviso usa el texto exacto del contrato y plural siempre', () => {
    expect(outlineWarning(0)).toBe('');
    expect(outlineWarning(-1)).toBe('');
    expect(outlineWarning(1)).toBe(
      'The new room shape leaves 1 tables outside its boundary. Move them inside before saving.',
    );
    expect(outlineWarning(7)).toBe(
      'The new room shape leaves 7 tables outside its boundary. Move them inside before saving.',
    );
  });
});

describe('floor-geometry — insertVertex', () => {
  const rect = rectangleOutline(800, 600);

  it('inserta el punto medio justo detrás de la arista', () => {
    const next = insertVertex(rect, 0);
    expect(next).toHaveLength(5);
    expect(next[1]).toEqual({ x: 400, y: 0 });
    expect(next[0]).toEqual({ x: 0, y: 0 });
    expect(next[2]).toEqual({ x: 800, y: 0 });
  });

  it('la última arista cierra el polígono (n-1 -> 0)', () => {
    const next = insertVertex(rect, 3);
    expect(next).toHaveLength(5);
    expect(next[4]).toEqual({ x: 0, y: 300 });
  });

  it('no muta el original y devuelve un array nuevo', () => {
    const next = insertVertex(rect, 1);
    expect(rect).toHaveLength(4);
    expect(next).not.toBe(rect);
  });

  it('con índice inválido devuelve una copia intacta', () => {
    for (const bad of [-1, 4, 99, 1.5, Number.NaN]) {
      const next = insertVertex(rect, bad);
      expect(next).toEqual(rect);
      expect(next).not.toBe(rect);
    }
  });

  it('el polígono resultante sigue siendo válido y con la misma área', () => {
    const next = insertVertex(L, 2);
    expect(validateOutline(next)).toBe('');
    expect(polygonArea(next)).toBe(polygonArea(L)); // un punto medio no cambia la superficie
  });
});

describe('floor-geometry — removeVertex', () => {
  it('quita el vértice indicado', () => {
    const pentagon = insertVertex(rectangleOutline(800, 600), 0);
    const next = removeVertex(pentagon, 1);
    expect(next).toHaveLength(4);
    expect(next).toEqual(rectangleOutline(800, 600));
  });

  it('no muta el original', () => {
    const hex = [...L];
    const next = removeVertex(hex, 0);
    expect(hex).toHaveLength(6);
    expect(next).toHaveLength(5);
  });

  it('respeta el suelo de MIN_OUTLINE_VERTICES: un triángulo no se puede reducir', () => {
    const triangle: Outline = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    expect(MIN_OUTLINE_VERTICES).toBe(3);
    expect(removeVertex(triangle, 0)).toBe(triangle);
    expect(removeVertex(triangle, 2)).toBe(triangle);
    expect(triangle).toHaveLength(3);
  });

  it('un cuadrilátero sí baja a triángulo, pero solo una vez', () => {
    const quad = rectangleOutline(800, 600);
    const tri = removeVertex(quad, 3);
    expect(tri).toHaveLength(3);
    expect(removeVertex(tri, 0)).toBe(tri);
  });

  it('con índice inválido devuelve el original sin tocar', () => {
    const rect = rectangleOutline(800, 600);
    for (const bad of [-1, 4, 99, 0.5, Number.NaN]) {
      expect(removeVertex(rect, bad)).toBe(rect);
    }
  });
});

describe('floor-geometry — validateOutline', () => {
  it('acepta los polígonos usables', () => {
    expect(validateOutline(rectangleOutline(300, 300))).toBe('');
    expect(validateOutline(L)).toBe('');
    expect(validateOutline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }])).toBe('');
  });

  it('exige al menos 3 esquinas', () => {
    expect(validateOutline([])).toBe('A room outline needs at least 3 corners.');
    expect(validateOutline([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBe(
      'A room outline needs at least 3 corners.',
    );
  });

  it('rechaza coordenadas que no son números finitos', () => {
    expect(
      validateOutline([{ x: 0, y: 0 }, { x: Number.NaN, y: 10 }, { x: 10, y: 10 }]),
    ).toBe('Room outline corners must be valid numbers.');
    expect(
      validateOutline([{ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 10 }, { x: 10, y: 10 }]),
    ).toBe('Room outline corners must be valid numbers.');
    expect(
      validateOutline([{ x: 0, y: 0 }, { x: 10, y: 10 }, { y: 20 }] as unknown as Outline),
    ).toBe('Room outline corners must be valid numbers.');
  });

  it('rechaza polígonos sin superficie', () => {
    expect(
      validateOutline([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }]),
    ).toBe('Room outline must enclose an area.');
    expect(
      validateOutline([{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }]),
    ).toBe('Room outline must enclose an area.');
  });
});
