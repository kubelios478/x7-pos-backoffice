import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { FloorPlansView } from './FloorPlansView';
import type { DiningTable, FloorZone } from '../../../../types/dining-system';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// El editor monta un lienzo con drag & drop y su propio ciclo de fetch: lo sustituimos
// para que estos tests midan SOLO la grid de planos.
vi.mock('./FloorPlanEditor', () => ({
  FloorPlanEditor: ({ plan, onClose }: { plan: { name: string }; onClose: () => void }) => (
    <div data-testid="floor-plan-editor-stub">
      <p>Editing {plan.name}</p>
      <button type="button" onClick={onClose}>
        Close editor stub
      </button>
    </div>
  ),
}));

// El backend persiste el status como varchar: 'inactive' se normaliza a 'draft' en la UI.
type RawFloorPlan = {
  id: number;
  name: string;
  width: number;
  height: number;
  status: string;
  merchant: { id: number; name: string };
};

const MERCHANT = { id: 1, name: 'Restaurant ABC' };

const PLANS: RawFloorPlan[] = [
  { id: 1, name: 'Main Dining Room', width: 800, height: 600, status: 'active', merchant: MERCHANT },
  { id: 2, name: 'Terrace Deck', width: 1200, height: 900, status: 'inactive', merchant: MERCHANT },
];

const ZONES: FloorZone[] = [
  { id: 10, name: 'Window Row', color: 'Blue', status: 'active', floorPlan: { id: 1 } },
  { id: 11, name: 'Bar Side', color: 'Green', status: 'active', floorPlan: { id: 1 } },
  { id: 12, name: 'Sun Deck', color: 'Amber', status: 'active', floorPlan: { id: 2 } },
  // Soft-deleted: no debe entrar en el contador del plano 1.
  { id: 13, name: 'Retired Zone', color: null, status: 'deleted', floorPlan: { id: 1 } },
];

const TABLES: DiningTable[] = [
  {
    id: 100,
    merchant_id: 1,
    number: 'A1',
    capacity: 4,
    status: 'available',
    location: 'Near window',
    rotation: 0,
    shape: 'Square',
    // Justo dentro de 800x600 (huella 80x80): encoger el lienzo la deja fuera.
    pos_x: 700,
    pos_y: 500,
    floorPlan: { id: 1 },
    floorZone: { id: 10, name: 'Window Row' },
  },
  // Soft-deleted en el plano 2: no cuenta, así el plano 2 sigue siendo borrable.
  {
    id: 101,
    merchant_id: 1,
    number: 'T9',
    capacity: 2,
    status: 'deleted',
    location: 'Deck',
    rotation: 0,
    shape: 'Circle',
    pos_x: 20,
    pos_y: 20,
    floorPlan: { id: 2 },
    floorZone: { id: 12, name: 'Sun Deck' },
  },
];

const CLIPPING_WARNING =
  'New canvas dimensions (600px × 600px) will clip 1 existing tables placed outside these bounds. Please adjust table coordinates first.';

const MUTATION_GUARD =
  'Cannot delete or archive a floor plan with active table layouts or open orders. Reassign or clear tables first.';

const DIMENSION_ERROR = 'Canvas dimensions must be between 3 m and 40 m.';

function jsonRes(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

/** Backend por defecto: los tres GET del hidratado inicial. */
function defaultFetch(plans: RawFloorPlan[] = PLANS) {
  return vi.fn((url: string | URL | Request) => {
    const u = String(url);
    // El envelope de floor-plan/floor-zone usa `pagination`; el de tables `paginationMeta`.
    if (u.includes('/floor-zone')) {
      return jsonRes({ data: ZONES, pagination: { total: ZONES.length } });
    }
    if (u.includes('/tables')) {
      return jsonRes({ data: TABLES, paginationMeta: { total: TABLES.length } });
    }
    if (u.includes('/floor-plan')) {
      return jsonRes({ data: plans, pagination: { total: plans.length } });
    }
    return jsonRes({ data: [] });
  });
}

/** Igual que el anterior, pero interceptando una mutación concreta. */
function mutatingFetch(
  match: (url: string, opts?: RequestInit) => boolean,
  response: () => Promise<Response>,
) {
  const base = defaultFetch();
  return vi.fn((url: string | URL | Request, opts?: RequestInit) => {
    const u = String(url);
    if (match(u, opts)) return response();
    return base(u);
  });
}

const openEditDrawer = async (user: ReturnType<typeof userEvent.setup>, planName: string) => {
  await user.click(screen.getByRole('button', { name: `Edit floor plan ${planName}` }));
  return screen.findByRole('dialog', { name: /edit floor plan/i });
};

describe('FloorPlansView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', defaultFetch());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('dataset hydration and grid mapping', () => {
    it('renders the empty state message when no floor plans exist', async () => {
      vi.stubGlobal('fetch', defaultFetch([]));
      render(<FloorPlansView />);

      const empty = await screen.findByTestId('floor-plans-empty-state');
      expect(empty).toHaveTextContent(
        "No floor plans configured. Click 'Create Floor Plan' to set up your restaurant layout canvas.",
      );
    });

    it('hydrates the grid from the three catalogue endpoints', async () => {
      const fetchMock = defaultFetch();
      vi.stubGlobal('fetch', fetchMock);
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');
      const requested = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(requested).toEqual(
        expect.arrayContaining([
          expect.stringContaining('/floor-plan?limit=100'),
          expect.stringContaining('/floor-zone?limit=100'),
          // El backend capa `limit` a 100 en tables: pedir más devuelve 400.
          expect.stringContaining('/tables?limit=100'),
        ]),
      );
    });

    it('renders identity, canvas resolution, counters and status badge per row', async () => {
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');

      const mainRow = within(screen.getByTestId('floor-plan-row-1'));
      expect(mainRow.getByText('#1')).toBeInTheDocument();
      expect(mainRow.getByText('Main Dining Room')).toBeInTheDocument();
      expect(mainRow.getByText('8 m × 6 m')).toBeInTheDocument();
      // La zona con status 'deleted' queda fuera del contador.
      expect(mainRow.getByText('2 Zones')).toBeInTheDocument();
      expect(mainRow.getByText('1 Table')).toBeInTheDocument();

      const terraceRow = within(screen.getByTestId('floor-plan-row-2'));
      expect(terraceRow.getByText('12 m × 9 m')).toBeInTheDocument();
      expect(terraceRow.getByText('1 Zone')).toBeInTheDocument();
      // La única mesa del plano 2 está soft-deleted.
      expect(terraceRow.getByText('0 Tables')).toBeInTheDocument();

      // Los badges: 'inactive' del backend se muestra como Draft.
      expect(mainRow.getByText('Active')).toBeInTheDocument();
      expect(terraceRow.getByText('Draft')).toBeInTheDocument();
      // El contador vive en la barra negra, fuera del <table>.
      expect(screen.getByText('2 floor plans')).toBeInTheDocument();
    });

    it('surfaces a retryable error banner when the floor plan request fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string | URL | Request) => {
          const u = String(url);
          if (u.includes('/floor-plan')) return jsonRes({ message: 'boom' }, 500);
          return jsonRes({ data: [] });
        }),
      );
      render(<FloorPlansView />);

      expect(
        await screen.findByText('Failed to load floor plans. Please check if the backend is running.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
    });
  });

  describe('search and filters', () => {
    it('filters the grid by floor plan name', async () => {
      const user = userEvent.setup();
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');
      await user.type(screen.getByLabelText('Search floor plans'), 'terrace');

      expect(screen.getByText('Terrace Deck')).toBeInTheDocument();
      expect(screen.queryByText('Main Dining Room')).not.toBeInTheDocument();
      expect(screen.getByText('1 floor plans')).toBeInTheDocument();
    });

    it('filters the grid by status', async () => {
      const user = userEvent.setup();
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');
      await user.selectOptions(screen.getByLabelText('Filter by status'), 'draft');

      expect(screen.getByText('Terrace Deck')).toBeInTheDocument();
      expect(screen.queryByText('Main Dining Room')).not.toBeInTheDocument();
    });

    it('restores every row from the toolbar clear action', async () => {
      const user = userEvent.setup();
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');
      await user.type(screen.getByLabelText('Search floor plans'), 'terrace');
      expect(screen.queryByText('Main Dining Room')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Clear Filters' }));

      expect(screen.getByText('Main Dining Room')).toBeInTheDocument();
      expect(screen.getByText('Terrace Deck')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Clear Filters' })).not.toBeInTheDocument();
    });

    it('shows the filtered empty state with an in-grid clear action', async () => {
      const user = userEvent.setup();
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');
      await user.type(screen.getByLabelText('Search floor plans'), 'zzz-nope');

      expect(screen.getByText('No floor plans match your active filters')).toBeInTheDocument();
      // El botón de la grid, no el de la barra de filtros.
      await user.click(within(screen.getByRole('table')).getByRole('button', { name: 'Clear filters' }));

      expect(screen.getByText('Main Dining Room')).toBeInTheDocument();
    });
  });

  describe('create workflow', () => {
    it('keeps submission blocked until the form is valid', async () => {
      const user = userEvent.setup();
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');
      await user.click(screen.getByRole('button', { name: 'Create Floor Plan' }));

      const dialog = await screen.findByRole('dialog', { name: /create floor plan/i });
      const submit = within(dialog).getByRole('button', { name: 'Create Floor Plan' });
      expect(submit).toBeDisabled();

      await user.type(within(dialog).getByLabelText(/floor plan name/i), 'Roof Garden');

      await waitFor(() => expect(submit).toBeEnabled());
    });

    it.each([
      ['below the minimum', '200'],
      ['above the maximum', '5000'],
    ])('rejects a canvas width %s', async (_case, value) => {
      const user = userEvent.setup();
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');
      await user.click(screen.getByRole('button', { name: 'Create Floor Plan' }));

      const dialog = await screen.findByRole('dialog', { name: /create floor plan/i });
      await user.type(within(dialog).getByLabelText(/floor plan name/i), 'Roof Garden');
      const width = within(dialog).getByLabelText(/canvas width/i);
      await user.clear(width);
      await user.type(width, value);

      expect(await within(dialog).findByText(DIMENSION_ERROR)).toBeInTheDocument();
      expect(width).toHaveAttribute('aria-invalid', 'true');
      expect(within(dialog).getByRole('button', { name: 'Create Floor Plan' })).toBeDisabled();
    });

    it('posts the new plan with the merchant taken from the prop', async () => {
      const user = userEvent.setup();
      const fetchMock = mutatingFetch(
        (u, opts) => u.includes('/floor-plan') && opts?.method === 'POST',
        () => jsonRes({ statusCode: 201, data: { id: 3 } }, 201),
      );
      vi.stubGlobal('fetch', fetchMock);
      render(<FloorPlansView merchantId={7} />);

      // Las fixtures pertenecen a otro comercio, así que con merchantId=7 la grid queda vacía
      // por el aislamiento multi-tenant: esperamos al toolbar, no a una fila.
      const createBtn = await screen.findByRole('button', { name: 'Create Floor Plan' });
      await user.click(createBtn);

      const dialog = await screen.findByRole('dialog', { name: /create floor plan/i });
      await user.type(within(dialog).getByLabelText(/floor plan name/i), 'Roof Garden');
      await user.click(within(dialog).getByRole('button', { name: 'Create Floor Plan' }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/floor-plan'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              merchant: 7,
              name: 'Roof Garden',
              width: 800,
              height: 600,
              status: 'active',
            }),
          }),
        );
      });
      expect(await screen.findByText('Floor plan created successfully')).toBeInTheDocument();
    });

    it('surfaces a backend rejection inline and keeps the drawer open', async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        'fetch',
        mutatingFetch(
          (u, opts) => u.includes('/floor-plan') && opts?.method === 'POST',
          () => jsonRes({ message: 'Merchant not found' }, 404),
        ),
      );
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');
      await user.click(screen.getByRole('button', { name: 'Create Floor Plan' }));

      const dialog = await screen.findByRole('dialog', { name: /create floor plan/i });
      await user.type(within(dialog).getByLabelText(/floor plan name/i), 'Roof Garden');
      await user.click(within(dialog).getByRole('button', { name: 'Create Floor Plan' }));

      expect(await screen.findByText('Merchant not found')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: /create floor plan/i })).toBeInTheDocument();
    });
  });

  describe('edit workflow and canvas clipping guard', () => {
    it('pre-populates the drawer from the selected plan', async () => {
      const user = userEvent.setup();
      render(<FloorPlansView />);

      await screen.findByText('Terrace Deck');
      const dialog = await openEditDrawer(user, 'Terrace Deck');

      expect(within(dialog).getByLabelText(/floor plan name/i)).toHaveValue('Terrace Deck');
      expect(within(dialog).getByLabelText(/canvas width/i)).toHaveValue(12);
      expect(within(dialog).getByLabelText(/canvas height/i)).toHaveValue(9);
      expect(within(dialog).getByLabelText(/status/i)).toHaveValue('draft');
    });

    it('blocks a shrink that would clip existing tables', async () => {
      const user = userEvent.setup();
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');
      const dialog = await openEditDrawer(user, 'Main Dining Room');

      const width = within(dialog).getByLabelText(/canvas width/i);
      await user.clear(width);
      await user.type(width, '6');

      expect(await within(dialog).findByText(CLIPPING_WARNING)).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Save Floor Plan' })).toBeDisabled();
    });

    it('allows growing the canvas without any clipping warning', async () => {
      const user = userEvent.setup();
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');
      const dialog = await openEditDrawer(user, 'Main Dining Room');

      const width = within(dialog).getByLabelText(/canvas width/i);
      await user.clear(width);
      await user.type(width, '10');

      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: 'Save Floor Plan' })).toBeEnabled(),
      );
      expect(within(dialog).queryByText(/will clip/i)).not.toBeInTheDocument();
    });

    it('blocks archiving a plan that still holds tables', async () => {
      const user = userEvent.setup();
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');
      const dialog = await openEditDrawer(user, 'Main Dining Room');

      await user.selectOptions(within(dialog).getByLabelText(/status/i), 'archived');

      expect(await within(dialog).findByText(MUTATION_GUARD)).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Save Floor Plan' })).toBeDisabled();
    });

    it('PATCHes the plan without the merchant field', async () => {
      const user = userEvent.setup();
      const fetchMock = mutatingFetch(
        (u, opts) => u.includes('/floor-plan/2') && opts?.method === 'PATCH',
        () => jsonRes({ statusCode: 200, data: { id: 2 } }),
      );
      vi.stubGlobal('fetch', fetchMock);
      render(<FloorPlansView />);

      await screen.findByText('Terrace Deck');
      const dialog = await openEditDrawer(user, 'Terrace Deck');

      const name = within(dialog).getByLabelText(/floor plan name/i);
      await user.clear(name);
      await user.type(name, 'Terrace Deck II');
      await user.click(within(dialog).getByRole('button', { name: 'Save Floor Plan' }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/floor-plan/2'),
          expect.objectContaining({
            method: 'PATCH',
            // `merchant` se omite a propósito: Object.assign corrompería la relación.
            body: JSON.stringify({
              name: 'Terrace Deck II',
              width: 1200,
              height: 900,
              status: 'draft',
            }),
          }),
        );
      });
      expect(await screen.findByText('Floor plan updated successfully')).toBeInTheDocument();
    });
  });

  describe('delete workflow', () => {
    it('refuses to open the confirmation for a plan that still has tables', async () => {
      const user = userEvent.setup();
      const fetchMock = defaultFetch();
      vi.stubGlobal('fetch', fetchMock);
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');
      await user.click(screen.getByRole('button', { name: 'Delete floor plan Main Dining Room' }));

      expect(await screen.findByText(MUTATION_GUARD)).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: /delete floor plan/i })).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    // /api/tables cuelga de la feature TABLES y /api/floor-plan de FLOOR_PLANS: una
    // suscripción puede conceder una y no la otra. Con el censo caído, "0 mesas" es una
    // suposición, no un hecho, y el backend no cascadea: el guard debe fallar en cerrado.
    it('fails the guard closed when the table census could not be loaded', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request) => {
        const u = String(url);
        if (u.includes('/tables')) return jsonRes({ message: 'Forbidden resource' }, 403);
        if (u.includes('/floor-zone')) return jsonRes({ data: ZONES });
        if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);
      render(<FloorPlansView />);

      // El plano 2 no tiene mesas vivas ni siquiera con el censo completo: aun así se bloquea.
      await screen.findByText('Terrace Deck');
      expect(await screen.findByTestId('floor-plans-counts-stale')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Delete floor plan Terrace Deck' }));

      expect(
        screen.queryByRole('dialog', { name: /delete floor plan/i }),
      ).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ method: 'DELETE' }),
      );

      // El mismo censo caído bloquea archivar desde el formulario de edición.
      const dialog = await openEditDrawer(user, 'Terrace Deck');
      await user.selectOptions(within(dialog).getByLabelText(/status/i), 'archived');
      expect(within(dialog).getByRole('button', { name: 'Save Floor Plan' })).toBeDisabled();
    });

    it('deletes a plan with no tables and drops the row', async () => {
      const user = userEvent.setup();
      const fetchMock = mutatingFetch(
        (u, opts) => u.includes('/floor-plan/2') && opts?.method === 'DELETE',
        () => jsonRes({ statusCode: 200, data: { id: 2, status: 'deleted' } }),
      );
      vi.stubGlobal('fetch', fetchMock);
      render(<FloorPlansView />);

      await screen.findByText('Terrace Deck');
      await user.click(screen.getByRole('button', { name: 'Delete floor plan Terrace Deck' }));

      const dialog = await screen.findByRole('dialog', { name: /delete floor plan/i });
      expect(within(dialog).getByText('12 m × 9 m')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Delete Floor Plan' }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/floor-plan/2'),
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
      await waitFor(() => expect(screen.queryByTestId('floor-plan-row-2')).not.toBeInTheDocument());
      expect(screen.getByTestId('floor-plan-row-1')).toBeInTheDocument();
      expect(await screen.findByText('Floor plan deleted successfully')).toBeInTheDocument();
    });

    it('reports a failed delete through an error toast and keeps the row', async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        'fetch',
        mutatingFetch(
          (u, opts) => u.includes('/floor-plan/2') && opts?.method === 'DELETE',
          () => jsonRes({ message: 'Floor Plan not found' }, 404),
        ),
      );
      render(<FloorPlansView />);

      await screen.findByText('Terrace Deck');
      await user.click(screen.getByRole('button', { name: 'Delete floor plan Terrace Deck' }));

      const dialog = await screen.findByRole('dialog', { name: /delete floor plan/i });
      await user.click(within(dialog).getByRole('button', { name: 'Delete Floor Plan' }));

      expect(await screen.findByText('Floor Plan not found')).toBeInTheDocument();
      expect(screen.getByTestId('floor-plan-row-2')).toBeInTheDocument();
    });
  });

  describe('layout editor and navigation hub', () => {
    it('mounts the layout editor for the selected plan', async () => {
      const user = userEvent.setup();
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');
      await user.click(screen.getByRole('button', { name: 'Open editor for Main Dining Room' }));

      const stub = await screen.findByTestId('floor-plan-editor-stub');
      expect(within(stub).getByText('Editing Main Dining Room')).toBeInTheDocument();

      await user.click(within(stub).getByRole('button', { name: 'Close editor stub' }));
      expect(screen.queryByTestId('floor-plan-editor-stub')).not.toBeInTheDocument();
    });

    it('renders the dining system hub with FLOOR PLANS active', async () => {
      render(<FloorPlansView />);

      await screen.findByText('Main Dining Room');
      // Acotado al landmark: la cabecera de la grid repite el mismo texto.
      const hub = within(
        screen.getByRole('navigation', { name: /dining system workspace shortcuts/i }),
      );
      expect(hub.getByText('FLOOR PLANS')).toHaveAttribute('aria-current', 'page');
      expect(hub.getByRole('button', { name: 'DINING TABLES' })).toBeInTheDocument();
    });

    it('routes the hub shortcuts through onNavigate', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      render(<FloorPlansView onNavigate={onNavigate} />);

      await screen.findByText('Main Dining Room');
      const hub = within(
        screen.getByRole('navigation', { name: /dining system workspace shortcuts/i }),
      );
      await user.click(hub.getByRole('button', { name: 'FLOOR ZONES' }));

      expect(onNavigate).toHaveBeenCalledWith('table-zones');
    });
  });
});
