import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { FloorPlanEditor } from './FloorPlanEditor';
import type { DiningTable, FloorPlan, FloorZone } from '../../../../types/dining-system';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

const MERCHANT_ID = 5;

const PLAN: FloorPlan = {
  id: 7,
  name: 'Main Hall',
  width: 600,
  height: 400,
  status: 'active',
};

// Zona 3 cuelga de otro plano: /api/floor-zone no está scopeado, el editor debe descartarla.
const ZONES: FloorZone[] = [
  {
    id: 1,
    name: 'Main Dining',
    color: '#123456',
    status: 'active',
    floorPlan: { id: 7, name: 'Main Hall' },
  },
  {
    id: 2,
    name: 'Terrace',
    color: '#654321',
    status: 'active',
    floorPlan: { id: 7, name: 'Main Hall' },
  },
  {
    id: 3,
    name: 'Foreign Zone',
    color: '#000000',
    status: 'active',
    floorPlan: { id: 99, name: 'Other Plan' },
  },
];

const TABLES: DiningTable[] = [
  {
    id: 101,
    merchant_id: MERCHANT_ID,
    number: 'A1',
    capacity: 4,
    status: 'available',
    location: 'Near window',
    rotation: 0,
    shape: 'Square',
    pos_x: 20,
    pos_y: 40,
    floorPlan: { id: 7, name: 'Main Hall' },
    floorZone: { id: 1, name: 'Main Dining', color: '#123456' },
  },
  {
    id: 102,
    merchant_id: MERCHANT_ID,
    number: 'A2',
    capacity: 2,
    status: 'occupied',
    location: 'Center',
    rotation: 90,
    shape: 'Circle',
    pos_x: 200,
    pos_y: 100,
    floorPlan: { id: 7, name: 'Main Hall' },
    floorZone: { id: 1, name: 'Main Dining', color: '#123456' },
  },
  // Mesa de OTRO plano: GET /api/tables no filtra por plano, el editor sí.
  {
    id: 103,
    merchant_id: MERCHANT_ID,
    number: 'B1',
    capacity: 6,
    status: 'available',
    location: 'Upstairs',
    rotation: 0,
    shape: 'Rectangle',
    pos_x: 10,
    pos_y: 10,
    floorPlan: { id: 99, name: 'Other Plan' },
    floorZone: { id: 3, name: 'Foreign Zone', color: '#000000' },
  },
  // Borrado en soft: la fila sigue viniendo del backend pero no debe pintarse.
  {
    id: 104,
    merchant_id: MERCHANT_ID,
    number: 'A3',
    capacity: 2,
    status: 'deleted',
    location: 'Bar',
    rotation: 0,
    shape: 'Square',
    pos_x: 300,
    pos_y: 200,
    floorPlan: { id: 7, name: 'Main Hall' },
    floorZone: { id: 1, name: 'Main Dining', color: '#123456' },
  },
];

type Body = Record<string, unknown>;

function jsonRes(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

const bodyOf = (init?: RequestInit): Body =>
  JSON.parse(String(init?.body ?? '{}')) as Body;

interface BackendOverrides {
  tables?: DiningTable[];
  zones?: FloorZone[];
  createTable?: (body: Body) => Promise<Response>;
  updateTable?: (id: number, body: Body) => Promise<Response>;
  deleteTable?: (id: number) => Promise<Response>;
  createZone?: (body: Body) => Promise<Response>;
}

/** Router mínimo sobre el contrato real: /api/tables, /api/tables/:id y /api/floor-zone. */
function backend(over: BackendOverrides = {}) {
  const tables = over.tables ?? TABLES;
  const zones = over.zones ?? ZONES;

  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.includes('/floor-zone')) {
      if (method === 'POST') {
        const body = bodyOf(init);
        if (over.createZone) return over.createZone(body);
        return jsonRes(
          {
            statusCode: 201,
            message: 'Floor Zone created successfully',
            data: { id: 42, name: body.name, color: body.color, status: 'active', floorPlan: { id: PLAN.id } },
          },
          201,
        );
      }
      return jsonRes({
        statusCode: 200,
        message: 'Floor Zones retrieved successfully',
        data: zones,
        pagination: { total: zones.length, page: 1, limit: 100, totalPages: 1 },
      });
    }

    const byId = url.match(/\/tables\/(\d+)/);
    if (byId) {
      const id = Number(byId[1]);
      if (method === 'DELETE') {
        if (over.deleteTable) return over.deleteTable(id);
        return jsonRes({ statusCode: 200, message: 'Table deleted successfully', data: { id, status: 'deleted' } });
      }
      if (method === 'PUT') {
        const body = bodyOf(init);
        if (over.updateTable) return over.updateTable(id, body);
        return jsonRes({ statusCode: 200, message: 'Table updated successfully', data: { id, ...body } });
      }
    }

    if (url.includes('/tables')) {
      if (method === 'POST') {
        const body = bodyOf(init);
        if (over.createTable) return over.createTable(body);
        return jsonRes(
          {
            statusCode: 201,
            message: 'Table created successfully',
            data: {
              ...body,
              id: 501,
              floorZone: { id: body.floorZone, name: 'Main Dining' },
              floorPlan: { id: body.floorPlan, name: PLAN.name },
            },
          },
          201,
        );
      }
      return jsonRes({
        statusCode: 200,
        message: 'Tables retrieved successfully',
        data: tables,
        paginationMeta: { page: 1, limit: 100, total: tables.length, totalPages: 1, hasNext: false, hasPrev: false },
      });
    }

    return jsonRes({ data: [] });
  });
}

function renderEditor(props: Partial<React.ComponentProps<typeof FloorPlanEditor>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <FloorPlanEditor
      plan={PLAN}
      merchantId={MERCHANT_ID}
      onClose={onClose}
      onSaved={onSaved}
      {...props}
    />,
  );
  return { onClose, onSaved };
}

/**
 * Selección/arrastre por eventos de puntero crudos: jsdom expone el constructor
 * `PointerEvent` y `getBoundingClientRect()` devuelve un rect en ceros, así que
 * `toCanvasCoords` degrada a `clientX / zoom` — coordenadas de lienzo reales y
 * deterministas mientras el zoom siga a 1 (el efecto de "fit" aborta porque el
 * viewport mide 0px sin layout).
 */
const selectTable = (id: number, clientX = 0, clientY = 0) => {
  const el = screen.getByTestId(`floor-table-${id}`);
  fireEvent.pointerDown(el, { clientX, clientY, pointerId: 1 });
  fireEvent.pointerUp(el, { clientX, clientY, pointerId: 1 });
  return el;
};

const saveButton = () => screen.getByTestId('floor-plan-save');

const postCalls = (mock: ReturnType<typeof backend>) =>
  mock.mock.calls.filter(
    ([url, init]) => String(url).includes('/tables') && init?.method === 'POST',
  );

describe('FloorPlanEditor', () => {
  let fetchMock: ReturnType<typeof backend>;

  beforeEach(() => {
    fetchMock = backend();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('layout hydration', () => {
    it('fetches tables and zones on mount and renders one node per table of this plan', async () => {
      renderEditor();

      expect(await screen.findByTestId('floor-table-101')).toBeInTheDocument();
      expect(screen.getByTestId('floor-table-102')).toBeInTheDocument();
      expect(screen.getAllByTestId(/^floor-table-/)).toHaveLength(2);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/tables?limit=100'),
        expect.anything(),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/floor-zone?limit=100'),
        expect.anything(),
      );
    });

    it('drops tables that belong to a different floor plan and soft-deleted rows', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      expect(screen.queryByTestId('floor-table-103')).not.toBeInTheDocument();
      expect(screen.queryByTestId('floor-table-104')).not.toBeInTheDocument();
      expect(screen.getByText('6 m × 4 m · 2 tables')).toBeInTheDocument();
    });

    it('offers only the zones of this plan in the active zone selector', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      const select = screen.getByLabelText('Active floor zone');
      expect(within(select).getByText('Main Dining')).toBeInTheDocument();
      expect(within(select).getByText('Terrace')).toBeInTheDocument();
      expect(within(select).queryByText('Foreign Zone')).not.toBeInTheDocument();
    });

    it('surfaces a retryable error when the tables request fails', async () => {
      const failing = vi.fn((input: RequestInfo | URL) =>
        String(input).includes('/floor-zone')
          ? jsonRes({ data: ZONES })
          : jsonRes({ message: 'boom' }, 500),
      );
      vi.stubGlobal('fetch', failing);
      renderEditor();

      expect(
        await screen.findByText(/failed to load the floor plan layout/i),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
    });
  });

  describe('selection and inspector', () => {
    it('shows the empty inspector until a table is selected', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      expect(screen.getByTestId('floor-plan-inspector-empty')).toBeInTheDocument();

      selectTable(101);

      expect(screen.getByTestId('floor-plan-inspector')).toBeInTheDocument();
      expect(screen.queryByTestId('floor-plan-inspector-empty')).not.toBeInTheDocument();
    });

    it('populates the inspector with the selected table number and capacity', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-102');
      selectTable(102);

      expect(screen.getByLabelText('Table number')).toHaveValue('A2');
      expect(screen.getByLabelText('Capacity')).toHaveValue(2);
      expect(screen.getByLabelText('Shape')).toHaveValue('Circle');
      expect(screen.getByLabelText('Status')).toHaveValue('occupied');
      expect(screen.getByLabelText(/rotation/i)).toHaveValue('90');
      expect(screen.getByTestId('floor-table-102')).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps the layout clean when a table is clicked without moving it', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      expect(saveButton()).toBeDisabled();

      selectTable(101, 60, 60);

      expect(saveButton()).toBeDisabled();
    });

    it('flags a duplicate table number in the inspector', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      selectTable(101);
      fireEvent.change(screen.getByLabelText('Table number'), { target: { value: 'A2' } });

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Duplicate table number — numbers must be unique per merchant.',
      );
    });
  });

  describe('dirty tracking', () => {
    it('enables Save layout after editing the capacity', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      selectTable(101);
      expect(saveButton()).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '6' } });

      expect(saveButton()).toBeEnabled();
      expect(saveButton()).toHaveAccessibleName('Save layout (1 pending changes)');
      expect(screen.getByLabelText('Capacity')).toHaveValue(6);
    });

    it('enables Save layout after editing the table number', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      selectTable(101);
      fireEvent.change(screen.getByLabelText('Table number'), { target: { value: 'A9' } });

      expect(saveButton()).toBeEnabled();
      expect(within(screen.getByTestId('floor-table-101')).getByText('A9')).toBeInTheDocument();
    });

    it('enables Save layout after editing the rotation', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      selectTable(101);
      fireEvent.change(screen.getByLabelText(/rotation/i), { target: { value: '45' } });

      expect(saveButton()).toBeEnabled();
      expect(screen.getByLabelText('Rotation — 45°')).toBeInTheDocument();
    });

    it('counts several edited tables as separate pending changes', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      selectTable(101);
      fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '6' } });
      selectTable(102);
      fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '8' } });

      expect(saveButton()).toHaveAccessibleName('Save layout (2 pending changes)');
    });
  });

  describe('adding tables from the palette', () => {
    it('renders the new table, marks it as new and enables saving', async () => {
      const user = userEvent.setup();
      renderEditor();

      await screen.findByTestId('floor-table-101');
      await user.click(screen.getByRole('button', { name: 'Add square table' }));

      // Las mesas sin guardar viven con id negativo: -1 es la primera.
      const fresh = await screen.findByTestId('floor-table--1');
      expect(within(fresh).getByText('T1')).toBeInTheDocument();
      expect(within(fresh).getByText('new')).toBeInTheDocument();
      expect(saveButton()).toBeEnabled();
      // Ya hay zonas, así que añadir no dispara ninguna escritura.
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    });

    it('does not stack two consecutive tables on the same spot', async () => {
      const user = userEvent.setup();
      renderEditor();

      await screen.findByTestId('floor-table-101');
      await user.click(screen.getByRole('button', { name: 'Add square table' }));
      await user.click(screen.getByRole('button', { name: 'Add circle table' }));

      const first = await screen.findByTestId('floor-table--1');
      const second = await screen.findByTestId('floor-table--2');
      expect(`${first.style.left}/${first.style.top}`).not.toBe(
        `${second.style.left}/${second.style.top}`,
      );
      expect(saveButton()).toHaveAccessibleName('Save layout (2 pending changes)');
    });

    it('creates a "General" zone on the fly when the plan has none', async () => {
      const user = userEvent.setup();
      fetchMock = backend({ zones: [] });
      vi.stubGlobal('fetch', fetchMock);
      renderEditor();

      await screen.findByTestId('floor-table-101');
      await user.click(screen.getByRole('button', { name: 'Add circle table' }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/floor-zone'),
          expect.objectContaining({ method: 'POST' }),
        ),
      );
      const zoneCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(bodyOf(zoneCall?.[1])).toEqual({
        merchant: MERCHANT_ID,
        name: 'General',
        color: '#ae001a',
        floorPlan: PLAN.id,
        status: 'active',
      });
      expect(await screen.findByTestId('floor-table--1')).toBeInTheDocument();
    });
  });

  describe('saving', () => {
    it('POSTs every required field for a table added on the canvas', async () => {
      const user = userEvent.setup();
      renderEditor();

      await screen.findByTestId('floor-table-101');
      await user.click(screen.getByRole('button', { name: 'Add rectangle table' }));
      await user.click(saveButton());

      await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(1));
      const body = bodyOf(postCalls(fetchMock)[0][1]);
      expect(body).toEqual({
        merchant_id: MERCHANT_ID,
        number: 'T1',
        capacity: 4,
        status: 'available',
        location: 'Main Dining',
        rotation: 0,
        shape: 'Rectangle',
        pos_x: expect.any(Number),
        pos_y: expect.any(Number),
        floorZone: 1,
        floorPlan: PLAN.id,
      });
      // int en Postgres y dentro del lienzo: nada de decimales ni de mesas recortadas.
      expect(Number.isInteger(body.pos_x)).toBe(true);
      expect(Number.isInteger(body.pos_y)).toBe(true);
      expect(body.pos_x as number).toBeGreaterThanOrEqual(0);
      expect(body.pos_y as number).toBeGreaterThanOrEqual(0);
      expect(body.pos_x as number).toBeLessThanOrEqual(PLAN.width - 120);
      expect(body.pos_y as number).toBeLessThanOrEqual(PLAN.height - 70);

      expect(await screen.findByText('Floor plan layout saved')).toBeInTheDocument();
    });

    it('PUTs only the changed fields of an existing table', async () => {
      const user = userEvent.setup();
      const { onSaved } = renderEditor();

      await screen.findByTestId('floor-table-101');
      selectTable(101);
      fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '8' } });
      await user.click(saveButton());

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/tables/101'),
          expect.objectContaining({ method: 'PUT' }),
        ),
      );
      const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
      // El backend rechaza cuerpos vacíos y `merchant_id`; sólo debe viajar el diff.
      expect(bodyOf(putCall?.[1])).toEqual({ capacity: 8 });
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    });

    it('DELETEs an existing table only when the layout is saved', async () => {
      const user = userEvent.setup();
      renderEditor();

      await screen.findByTestId('floor-table-102');
      selectTable(102);
      await user.click(screen.getByRole('button', { name: 'Delete table A2' }));

      expect(screen.queryByTestId('floor-table-102')).not.toBeInTheDocument();
      expect(saveButton()).toBeEnabled();
      // El borrado se encola: nada viaja hasta pulsar "Save layout".
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);

      await user.click(saveButton());

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/tables/102'),
          expect.objectContaining({ method: 'DELETE' }),
        ),
      );
    });

    it('issues no request for a table added and deleted before saving', async () => {
      const user = userEvent.setup();
      renderEditor();

      await screen.findByTestId('floor-table-101');
      await user.click(screen.getByRole('button', { name: 'Add square table' }));
      await screen.findByTestId('floor-table--1');
      await user.click(screen.getByRole('button', { name: 'Delete table T1' }));

      expect(screen.queryByTestId('floor-table--1')).not.toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
      expect(postCalls(fetchMock)).toHaveLength(0);
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    });

    it('keeps the canvas intact and lists the failure when a write is rejected', async () => {
      const user = userEvent.setup();
      fetchMock = backend({
        createTable: () =>
          jsonRes({ statusCode: 409, message: 'Table number already exists' }, 409),
      });
      vi.stubGlobal('fetch', fetchMock);
      renderEditor();

      await screen.findByTestId('floor-table-101');
      await user.click(screen.getByRole('button', { name: 'Add square table' }));
      selectTable(101);
      fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '9' } });
      await user.click(saveButton());

      expect(
        await screen.findByText('Table T1: Table number already exists'),
      ).toBeInTheDocument();
      // El fallo parcial no refresca: la mesa nueva y la edición siguen en el lienzo.
      expect(screen.getByTestId('floor-table--1')).toBeInTheDocument();
      expect(screen.getByTestId('floor-table-101')).toBeInTheDocument();
      expect(screen.getByLabelText('Capacity')).toHaveValue(9);
      expect(saveButton()).toBeEnabled();
      expect(await screen.findByText('1 change could not be saved')).toBeInTheDocument();
    });
  });

  describe('positioning', () => {
    it('snaps a coordinate typed in the inspector to the 10px grid', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      selectTable(101);
      fireEvent.change(screen.getByLabelText('X (m)'), { target: { value: '1.87' } });

      expect(screen.getByLabelText('X (m)')).toHaveValue(1.9);
      expect(saveButton()).toBeEnabled();
    });

    it('clamps a coordinate typed in the inspector to the canvas footprint', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      selectTable(101);
      fireEvent.change(screen.getByLabelText('Y (m)'), { target: { value: '99.99' } });
      fireEvent.change(screen.getByLabelText('X (m)'), { target: { value: '-0.4' } });

      // 400px de alto - 80px de huella cuadrada = 320; nunca por debajo de 0.
      expect(screen.getByLabelText('Y (m)')).toHaveValue(3.2);
      expect(screen.getByLabelText('X (m)')).toHaveValue(0);
    });

    it('moves a table with pointer events, snapping the drop position', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      const table = screen.getByTestId('floor-table-101');
      // Origen del lienzo en (0,0) sin layout: el desplazamiento del puntero es 1:1.
      fireEvent.pointerDown(table, { clientX: 100, clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(table, { clientX: 254, clientY: 196, pointerId: 1 });
      fireEvent.pointerUp(table, { clientX: 254, clientY: 196, pointerId: 1 });

      expect(screen.getByLabelText('X (m)')).toHaveValue(1.7);
      expect(screen.getByLabelText('Y (m)')).toHaveValue(1.4);
      expect(saveButton()).toBeEnabled();
    });

    it('clamps a drag that leaves the canvas', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      const table = screen.getByTestId('floor-table-101');
      fireEvent.pointerDown(table, { clientX: 100, clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(table, { clientX: 5000, clientY: 5000, pointerId: 1 });
      fireEvent.pointerUp(table, { clientX: 5000, clientY: 5000, pointerId: 1 });

      expect(screen.getByLabelText('X (m)')).toHaveValue(5.2);
      expect(screen.getByLabelText('Y (m)')).toHaveValue(3.2);
    });

    it('ignores pointer movement that never started on a table', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      const table = screen.getByTestId('floor-table-101');
      fireEvent.pointerMove(table, { clientX: 400, clientY: 300, pointerId: 1 });

      expect(saveButton()).toBeDisabled();
    });

    it('nudges the focused table with the arrow keys', async () => {
      renderEditor();

      await screen.findByTestId('floor-table-101');
      fireEvent.keyDown(screen.getByTestId('floor-table-101'), { key: 'ArrowRight' });

      expect(screen.getByLabelText('X (m)')).toHaveValue(0.3);
      expect(saveButton()).toBeEnabled();
    });
  });

  describe('zoom', () => {
    it('steps the reported zoom level up and down', async () => {
      const user = userEvent.setup();
      renderEditor();

      await screen.findByTestId('floor-table-101');
      expect(screen.getByTestId('floor-plan-zoom-level')).toHaveTextContent('100%');

      await user.click(screen.getByRole('button', { name: 'Zoom in' }));
      expect(screen.getByTestId('floor-plan-zoom-level')).toHaveTextContent('125%');

      await user.click(screen.getByRole('button', { name: 'Zoom out' }));
      await user.click(screen.getByRole('button', { name: 'Zoom out' }));
      expect(screen.getByTestId('floor-plan-zoom-level')).toHaveTextContent('75%');
    });

    it('stops at the zoom bounds and restores the fit level', async () => {
      const user = userEvent.setup();
      renderEditor();

      await screen.findByTestId('floor-table-101');
      const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
      await user.click(zoomOut);
      await user.click(zoomOut);
      await user.click(zoomOut);

      expect(screen.getByTestId('floor-plan-zoom-level')).toHaveTextContent('25%');
      expect(zoomOut).toBeDisabled();

      await user.click(screen.getByRole('button', { name: 'Reset zoom to fit' }));
      expect(screen.getByTestId('floor-plan-zoom-level')).toHaveTextContent('100%');
    });
  });

  describe('closing', () => {
    it('closes straight away when there is nothing pending', async () => {
      const user = userEvent.setup();
      const { onClose } = renderEditor();

      await screen.findByTestId('floor-table-101');
      await user.click(screen.getByRole('button', { name: 'Close floor plan editor' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('asks for confirmation before discarding pending changes', async () => {
      const user = userEvent.setup();
      const { onClose } = renderEditor();

      await screen.findByTestId('floor-table-101');
      selectTable(101);
      fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '6' } });
      await user.click(screen.getByRole('button', { name: 'Close floor plan editor' }));

      const dialog = await screen.findByRole('dialog', {
        name: /discard unsaved layout changes/i,
      });
      expect(onClose).not.toHaveBeenCalled();
      expect(dialog).toHaveTextContent('You have 1 pending change on this floor plan.');

      await user.click(within(dialog).getByRole('button', { name: /discard & close/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
