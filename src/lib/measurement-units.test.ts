import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PX_PER_METER,
  UNIT_STORAGE_KEY,
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
} from './measurement-units';
import type { UnitSystem } from './measurement-units';

describe('constantes', () => {
  it('asume la escala del editor: 100px = 1m', () => {
    expect(PX_PER_METER).toBe(100);
  });

  it('expone los dos sistemas con sus etiquetas', () => {
    expect(UNIT_SYSTEMS).toEqual(['metric', 'imperial']);
    expect(UNIT_SYSTEM_LABELS.metric).toBe('Meters');
    expect(UNIT_SYSTEM_LABELS.imperial).toBe('Feet & inches');
    expect(UNIT_SYSTEM_SHORT.metric).toBe('m');
    expect(UNIT_SYSTEM_SHORT.imperial).toBe('ft');
  });
});

describe('formatLength · metric', () => {
  it('formatea metros con un decimal', () => {
    expect(formatLength(850, 'metric')).toBe('8.5 m');
    expect(formatLength(1234, 'metric')).toBe('12.3 m');
  });

  it('omite el decimal cuando es cero', () => {
    expect(formatLength(1000, 'metric')).toBe('10 m');
    expect(formatLength(300, 'metric')).toBe('3 m');
    expect(formatLength(4000, 'metric')).toBe('40 m');
  });

  it('usa centímetros enteros por debajo de un metro', () => {
    expect(formatLength(40, 'metric')).toBe('40 cm');
    expect(formatLength(99, 'metric')).toBe('99 cm');
    expect(formatLength(0, 'metric')).toBe('0 cm');
    expect(formatLength(12.4, 'metric')).toBe('12 cm');
  });

  it('nunca anuncia "100 cm": a partir de un metro cambia de unidad', () => {
    expect(formatLength(100, 'metric')).toBe('1 m');
    expect(formatLength(99.6, 'metric')).toBe('1 m');
  });
});

describe('formatLength · imperial', () => {
  it('formatea pies y pulgadas', () => {
    expect(formatLength(850, 'imperial')).toBe('27\' 11"');
    expect(formatLength(1000, 'imperial')).toBe('32\' 10"');
    expect(formatLength(300, 'imperial')).toBe('9\' 10"');
    expect(formatLength(4000, 'imperial')).toBe('131\' 3"');
    expect(formatLength(0, 'imperial')).toBe('0\' 0"');
  });

  it('usa el pie exacto de 0.3048 m', () => {
    // 30.48px es un pie clavado; 304.8px son diez.
    expect(formatLength(30.48, 'imperial')).toBe('1\' 0"');
    expect(formatLength(304.8, 'imperial')).toBe('10\' 0"');
  });

  it('acarrea cuando las pulgadas redondean a 12 (jamás muestra 5\' 12")', () => {
    // 182.8px = 5' 11.97": la pulgada redondea a 12 y debe subir a 6' 0".
    expect(formatLength(182.8, 'imperial')).toBe('6\' 0"');
    // 700px = 22' 11.59": mismo acarreo, un pie más y cero pulgadas.
    expect(formatLength(700, 'imperial')).toBe('23\' 0"');

    for (const px of [182.8, 700, 30.47, 152.39]) {
      expect(formatLength(px, 'imperial')).not.toContain('12"');
    }
  });
});

describe('lengthValue', () => {
  it('devuelve metros con dos decimales', () => {
    expect(lengthValue(850, 'metric')).toBe(8.5);
    expect(lengthValue(1234, 'metric')).toBe(12.34);
    expect(lengthValue(4000, 'metric')).toBe(40);
  });

  it('devuelve pies con dos decimales', () => {
    expect(lengthValue(1000, 'imperial')).toBe(32.81);
    expect(lengthValue(300, 'imperial')).toBe(9.84);
    expect(lengthValue(4000, 'imperial')).toBe(131.23);
  });

  it('no lleva símbolo: es un number listo para un <input>', () => {
    expect(typeof lengthValue(800, 'metric')).toBe('number');
    expect(typeof lengthValue(800, 'imperial')).toBe('number');
  });
});

describe('lengthToPx', () => {
  it('convierte lo tecleado por el usuario a px enteros', () => {
    expect(lengthToPx(10, 'metric')).toBe(1000);
    expect(lengthToPx(8.5, 'metric')).toBe(850);
    expect(lengthToPx(1, 'imperial')).toBe(30);
    expect(lengthToPx(10, 'imperial')).toBe(305);
  });

  it('siempre devuelve enteros: el backend guarda px como int', () => {
    for (const value of [3.33, 9.84, 26.25, 131.23]) {
      expect(Number.isInteger(lengthToPx(value, 'metric'))).toBe(true);
      expect(Number.isInteger(lengthToPx(value, 'imperial'))).toBe(true);
    }
  });
});

describe('ida y vuelta px -> valor -> px', () => {
  const TYPICAL = [300, 800, 1000, 4000];

  it.each(UNIT_SYSTEMS)('conserva los tamaños típicos de lienzo en %s', (system) => {
    for (const px of TYPICAL) {
      expect(lengthToPx(lengthValue(px, system), system)).toBe(px);
    }
  });

  it('no se desvía más de 1px en todo el rango válido del lienzo', () => {
    for (let px = 300; px <= 4000; px += 7) {
      for (const system of UNIT_SYSTEMS) {
        const back = lengthToPx(lengthValue(px, system), system);
        expect(Math.abs(back - px)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('lengthSuffix', () => {
  it('da el sufijo de las etiquetas de formulario', () => {
    expect(lengthSuffix('metric')).toBe('(m)');
    expect(lengthSuffix('imperial')).toBe('(ft)');
  });
});

describe('formatArea', () => {
  it('formatea m² con un decimal', () => {
    expect(formatArea(469000, 'metric')).toBe('46.9 m²');
    expect(formatArea(700000, 'metric')).toBe('70.0 m²');
    expect(formatArea(0, 'metric')).toBe('0.0 m²');
  });

  it('formatea ft² como entero', () => {
    expect(formatArea(469000, 'imperial')).toBe('505 ft²');
    expect(formatArea(700000, 'imperial')).toBe('753 ft²');
    expect(formatArea(0, 'imperial')).toBe('0 ft²');
  });

  it('un metro cuadrado son 10.76 ft² (pie exacto)', () => {
    expect(formatArea(10000, 'metric')).toBe('1.0 m²');
    expect(formatArea(10000, 'imperial')).toBe('11 ft²');
  });
});

describe('formatDimensions', () => {
  it('combina ambos ejes con el signo × (U+00D7)', () => {
    expect(formatDimensions(1000, 700, 'metric')).toBe('10 m × 7 m');
    expect(formatDimensions(1000, 700, 'metric')).toContain('×');
  });

  it('aplica el acarreo de pulgadas en cada eje por separado', () => {
    // 700px redondea a 12" y sube: "23' 0"", nunca "22' 12"".
    expect(formatDimensions(1000, 700, 'imperial')).toBe('32\' 10" × 23\' 0"');
  });

  it('delega en formatLength, así que hereda la regla de los centímetros', () => {
    expect(formatDimensions(80, 80, 'metric')).toBe('80 cm × 80 cm');
    expect(formatDimensions(120, 70, 'metric')).toBe('1.2 m × 70 cm');
  });
});

describe('preferencia persistida', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('usa la clave acordada', () => {
    expect(UNIT_STORAGE_KEY).toBe('x7_unit_system');
  });

  it('cae en metric cuando no hay nada guardado', () => {
    expect(loadUnitSystem()).toBe('metric');
  });

  it('lee lo que se guardó', () => {
    saveUnitSystem('imperial');
    expect(localStorage.getItem(UNIT_STORAGE_KEY)).toBe('imperial');
    expect(loadUnitSystem()).toBe('imperial');

    saveUnitSystem('metric');
    expect(loadUnitSystem()).toBe('metric');
  });

  it('cae en metric cuando lo guardado es basura', () => {
    for (const junk of ['', 'METRIC', 'furlongs', '{"a":1}', 'null', 'undefined']) {
      localStorage.setItem(UNIT_STORAGE_KEY, junk);
      expect(loadUnitSystem()).toBe('metric');
    }
  });

  it('no lanza si el almacenamiento está bloqueado (SecurityError)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(() => loadUnitSystem()).not.toThrow();
    expect(loadUnitSystem()).toBe('metric');
  });

  it('guardar tampoco lanza con el almacenamiento bloqueado', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    expect(() => saveUnitSystem('imperial')).not.toThrow();
  });

  it('acepta cualquier UnitSystem del catálogo', () => {
    for (const system of UNIT_SYSTEMS) {
      saveUnitSystem(system);
      expect(loadUnitSystem()).toBe(system);
    }
  });
});

describe('cobertura de tipos en tiempo de ejecución', () => {
  it('formatea sin romperse en ambos sistemas', () => {
    const systems: UnitSystem[] = UNIT_SYSTEMS;
    for (const system of systems) {
      expect(formatLength(1000, system)).toMatch(/\d/);
      expect(formatArea(1000000, system)).toMatch(/\d/);
      expect(formatDimensions(1000, 1000, system)).toContain('×');
    }
  });
});
