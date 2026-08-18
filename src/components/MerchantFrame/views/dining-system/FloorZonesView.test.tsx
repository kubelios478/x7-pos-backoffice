import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { FloorZonesView } from './FloorZonesView';

vi.mock('../../../../lib/auth-storage', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
  clearAuthSession: vi.fn(),
}));

// El editor real monta un lienzo a pantalla completa: lo sustituimos por un testigo para
// poder afirmar que la zona salta al editor sin arrastrar toda su maquinaria.
vi.mock('./FloorPlanEditor', () => ({
  FloorPlanEditor: ({ plan, onClose }: { plan: { name: string }; onClose: () => void }) => (
    <div data-testid="floor-plan-editor-stub">
      <span>{plan.name}</span>
      <button type="button" onClick={onClose}>
        close editor
      </button>
    </div>
  ),
}));

const MERCHANT = { id: 3, name: 'prueba1' };

const PLANS = [
  { id: 1, name: 'Main Floor Plan', width: 1000, height: 700, status: 'active', merchant: MERCHANT },
  { id: 2, name: 'Rooftop Terrace', width: 800, height: 600, status: 'active', merchant: MERCHANT },
];

const ZONES = [
  {
    id: 10,
    name: 'Main Dining',
    color: '#2563EB',
    status: 'active',
    merchant: MERCHANT,
    floorPlan: { id: 1, name: 'Main Floor Plan' },
  },
  {
    id: 11,
    name: 'VIP Lounge',
    color: '#D97706',
    status: 'inactive', // legacy -> se normaliza a Draft
    merchant: MERCHANT,
    floorPlan: { id: 1, name: 'Main Floor Plan' },
  },
  {
    id: 12,
    name: 'Terrace',
    color: '#16A34A',
    status: 'active',
    merchant: MERCHANT,
    floorPlan: { id: 2, name: 'Rooftop Terrace' },
  },
];

// Dos mesas en Main Dining, ninguna en VIP Lounge ni en Terrace.
const TABLES = [
  { id: 100, number: 'T1', floorZone: { id: 10 }, floorPlan: { id: 1 } },
  { id: 101, number: 'T2', floorZone: { id: 10 }, floorPlan: { id: 1 } },
];

function jsonRes(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function defaultFetch(zones: unknown[] = ZONES, tables: unknown[] = TABLES) {
  return vi.fn((url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/floor-zone')) return jsonRes({ data: zones });
    if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
    if (u.includes('/tables')) return jsonRes({ data: tables });
    return jsonRes({ data: [] });
  });
}

/** Abre el drawer de creación desde la barra de herramientas. */
async function openCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Create Floor Zone' }));
  return screen.findByRole('dialog', { name: /create floor zone/i });
}

describe('FloorZonesView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', defaultFetch());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('hidratación y parrilla', () => {
    it('muestra el estado vacío literal cuando no hay zonas', async () => {
      vi.stubGlobal('fetch', defaultFetch([]));
      render(<FloorZonesView merchantId={3} />);

      const empty = await screen.findByTestId('floor-zones-empty-state');
      expect(empty).toHaveTextContent(
        "No floor zones configured. Click 'Create Floor Zone' to section your floor plans into operational areas like Main Dining, VIP, or Terrace.",
      );
    });

    it('renderiza id, nombre, plano padre y contador de mesas', async () => {
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      const grid = within(screen.getByRole('table'));
      expect(grid.getByText('#10')).toBeInTheDocument();
      expect(grid.getAllByRole('button', { name: /main floor plan/i }).length).toBeGreaterThan(0);
      expect(grid.getByText('2 Tables')).toBeInTheDocument();
      // VIP Lounge y Terrace no tienen mesas.
      expect(grid.getAllByText('0 Tables')).toHaveLength(2);
    });

    it('pinta el swatch con el color almacenado', async () => {
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      const swatch = screen.getByTestId('zone-swatch-10');
      expect(swatch).toHaveStyle({ backgroundColor: '#2563EB' });
      expect(screen.getByText('#2563EB')).toBeInTheDocument();
    });

    it('cae a un color por defecto cuando el almacenado no es representable', async () => {
      vi.stubGlobal(
        'fetch',
        defaultFetch([{ ...ZONES[0], color: 'javascript:alert(1)' }]),
      );
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      expect(screen.getByTestId('zone-swatch-10')).toHaveStyle({ backgroundColor: '#ae001a' });
    });

    it('normaliza los estados legacy del backend a la tríada de la UI', async () => {
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('VIP Lounge');
      // Acotado a la parrilla: el selector de estado repite las mismas etiquetas.
      // 'inactive' del backend se muestra como Draft.
      expect(within(screen.getByRole('table')).getByText('Draft')).toBeInTheDocument();
    });

    it('aísla las zonas de otros comercios', async () => {
      vi.stubGlobal(
        'fetch',
        defaultFetch([...ZONES, { ...ZONES[0], id: 99, name: 'Ajena', merchant: { id: 77 } }]),
      );
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      expect(screen.queryByText('Ajena')).not.toBeInTheDocument();
    });
  });

  describe('búsqueda y filtros', () => {
    it('busca por nombre de zona', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.type(screen.getByLabelText('Search floor zones'), 'VIP');

      expect(screen.getByText('VIP Lounge')).toBeInTheDocument();
      expect(screen.queryByText('Main Dining')).not.toBeInTheDocument();
    });

    it('busca por nombre del plano padre', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.type(screen.getByLabelText('Search floor zones'), 'Rooftop');

      expect(screen.getByText('Terrace')).toBeInTheDocument();
      expect(screen.queryByText('Main Dining')).not.toBeInTheDocument();
    });

    it('filtra por plano padre', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.selectOptions(screen.getByLabelText('Filter by floor plan'), '2');

      expect(screen.getByText('Terrace')).toBeInTheDocument();
      expect(screen.queryByText('Main Dining')).not.toBeInTheDocument();
    });

    it('filtra por estado', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.selectOptions(screen.getByLabelText('Filter by status'), 'draft');

      expect(screen.getByText('VIP Lounge')).toBeInTheDocument();
      expect(screen.queryByText('Main Dining')).not.toBeInTheDocument();
    });

    it('ofrece limpiar filtros desde la parrilla vacía', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.type(screen.getByLabelText('Search floor zones'), 'zzz-nada');

      expect(screen.getByText(/no floor zones match your active filters/i)).toBeInTheDocument();
      await user.click(
        within(screen.getByRole('table')).getByRole('button', { name: /clear filters/i }),
      );
      expect(screen.getByText('Main Dining')).toBeInTheDocument();
    });
  });

  describe('creación y validación', () => {
    it('mantiene el envío bloqueado sin nombre y sin plano', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      const dialog = await openCreate(user);
      const submit = within(dialog).getByRole('button', { name: 'Create Floor Zone' });
      expect(submit).toBeDisabled();

      await user.type(within(dialog).getByLabelText(/zone name/i), 'Bar Area');
      expect(submit).toBeDisabled(); // aún falta el plano

      await user.selectOptions(within(dialog).getByLabelText(/parent floor plan/i), '1');
      await waitFor(() => expect(submit).toBeEnabled());
    });

    it('bloquea un nombre duplicado en el mismo plano con el mensaje literal', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      const dialog = await openCreate(user);
      await user.type(within(dialog).getByLabelText(/zone name/i), 'VIP Lounge');
      await user.selectOptions(within(dialog).getByLabelText(/parent floor plan/i), '1');

      expect(
        await within(dialog).findByText(
          "A zone named 'VIP Lounge' already exists on 'Main Floor Plan'.",
        ),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Create Floor Zone' })).toBeDisabled();
    });

    it('permite el mismo nombre en un plano distinto', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      const dialog = await openCreate(user);
      await user.type(within(dialog).getByLabelText(/zone name/i), 'VIP Lounge');
      await user.selectOptions(within(dialog).getByLabelText(/parent floor plan/i), '2');

      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: 'Create Floor Zone' })).toBeEnabled(),
      );
    });

    it('avisa cuando el color ya lo usa otra zona del mismo plano', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      const dialog = await openCreate(user);
      await user.selectOptions(within(dialog).getByLabelText(/parent floor plan/i), '1');
      const hexInput = within(dialog).getByLabelText(/zone colour value/i);
      await user.clear(hexInput);
      await user.type(hexInput, '#2563EB');

      expect(
        await within(dialog).findByText(/already uses this colour/i),
      ).toBeInTheDocument();
    });

    it('publica la zona con el comercio de la sesión', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/floor-zone') && opts?.method === 'POST') {
          return jsonRes({ data: { id: 20 } }, 201);
        }
        if (u.includes('/floor-zone')) return jsonRes({ data: ZONES });
        if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
        if (u.includes('/tables')) return jsonRes({ data: TABLES });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<FloorZonesView merchantId={3} />);
      await screen.findByText('Main Dining');
      const dialog = await openCreate(user);
      await user.type(within(dialog).getByLabelText(/zone name/i), 'Bar Area');
      await user.selectOptions(within(dialog).getByLabelText(/parent floor plan/i), '1');
      await user.click(within(dialog).getByRole('button', { name: 'Create Floor Zone' }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/floor-zone'),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"merchant":3'),
          }),
        );
      });
      expect(await screen.findByText(/floor zone created successfully/i)).toBeInTheDocument();
    });

    it('muestra el rechazo del backend inline sin cerrar el drawer', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/floor-zone') && opts?.method === 'POST') {
          return jsonRes({ message: 'Backend rechazó la zona' }, 400);
        }
        if (u.includes('/floor-zone')) return jsonRes({ data: ZONES });
        if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
        if (u.includes('/tables')) return jsonRes({ data: TABLES });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<FloorZonesView merchantId={3} />);
      await screen.findByText('Main Dining');
      const dialog = await openCreate(user);
      await user.type(within(dialog).getByLabelText(/zone name/i), 'Bar Area');
      await user.selectOptions(within(dialog).getByLabelText(/parent floor plan/i), '1');
      await user.click(within(dialog).getByRole('button', { name: 'Create Floor Zone' }));

      expect(await screen.findByText('Backend rechazó la zona')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: /create floor zone/i })).toBeInTheDocument();
    });
  });

  describe('edición y guard de mesas asignadas', () => {
    it('edita con PATCH y sin reasignar el comercio', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/floor-zone/11') && opts?.method === 'PATCH') {
          return jsonRes({ data: { id: 11 } });
        }
        if (u.includes('/floor-zone')) return jsonRes({ data: ZONES });
        if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
        if (u.includes('/tables')) return jsonRes({ data: TABLES });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<FloorZonesView merchantId={3} />);
      await screen.findByText('VIP Lounge');
      await user.click(screen.getByRole('button', { name: 'Edit floor zone VIP Lounge' }));

      const dialog = await screen.findByRole('dialog', { name: /edit floor zone/i });
      const nameInput = within(dialog).getByLabelText(/zone name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'VIP Room');
      await user.click(within(dialog).getByRole('button', { name: /save floor zone/i }));

      await waitFor(() => {
        const call = fetchMock.mock.calls.find(
          (c) => String(c[0]).includes('/floor-zone/11') && (c[1] as RequestInit)?.method === 'PATCH',
        );
        expect(call).toBeTruthy();
        expect(String((call![1] as RequestInit).body)).not.toContain('merchant');
      });
    });

    it('impide archivar una zona con mesas asignadas', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.click(screen.getByRole('button', { name: 'Edit floor zone Main Dining' }));

      const dialog = await screen.findByRole('dialog', { name: /edit floor zone/i });
      await user.selectOptions(within(dialog).getByLabelText(/^status$/i), 'archived');

      expect(
        await within(dialog).findByText(
          'Cannot delete or archive a zone with assigned tables. Reassign tables to another zone or remove them first.',
        ),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /save floor zone/i })).toBeDisabled();
    });

    it('impide borrar una zona con mesas y no abre el diálogo', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.click(screen.getByRole('button', { name: 'Delete floor zone Main Dining' }));

      expect(
        await screen.findByText(
          'Cannot delete or archive a zone with assigned tables. Reassign tables to another zone or remove them first.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: /delete floor zone/i })).not.toBeInTheDocument();
    });

    it('borra una zona sin mesas', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn((url: string | URL | Request, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/floor-zone/12') && opts?.method === 'DELETE') {
          return jsonRes({ data: { id: 12 } });
        }
        if (u.includes('/floor-zone')) return jsonRes({ data: ZONES });
        if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
        if (u.includes('/tables')) return jsonRes({ data: TABLES });
        return jsonRes({ data: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<FloorZonesView merchantId={3} />);
      await screen.findByText('Terrace');
      await user.click(screen.getByRole('button', { name: 'Delete floor zone Terrace' }));

      const dialog = await screen.findByRole('dialog', { name: /delete floor zone/i });
      await user.click(within(dialog).getByRole('button', { name: /delete zone/i }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/floor-zone/12'),
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
      await waitFor(() => expect(screen.queryByText('Terrace')).not.toBeInTheDocument());
    });

    it('bloquea el borrado cuando el censo de mesas no está disponible', async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string | URL | Request) => {
          const u = String(url);
          if (u.includes('/floor-zone')) return jsonRes({ data: ZONES });
          if (u.includes('/floor-plan')) return jsonRes({ data: PLANS });
          if (u.includes('/tables')) return jsonRes({ message: 'forbidden' }, 403);
          return jsonRes({ data: [] });
        }),
      );

      render(<FloorZonesView merchantId={3} />);
      await screen.findByText('Terrace');
      await user.click(screen.getByRole('button', { name: 'Delete floor zone Terrace' }));

      expect(await screen.findByText(/assignment guard cannot be verified/i)).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: /delete floor zone/i })).not.toBeInTheDocument();
    });
  });

  describe('eje del editor en vivo y hub', () => {
    it('abre el editor del plano padre desde la zona', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      await user.click(screen.getByRole('button', { name: 'Open editor for Main Dining' }));

      const stub = await screen.findByTestId('floor-plan-editor-stub');
      expect(within(stub).getByText('Main Floor Plan')).toBeInTheDocument();
    });

    it('abre el editor también desde la píldora del plano', async () => {
      const user = userEvent.setup();
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Terrace');
      const row = screen.getByText('Terrace').closest('tr')!;
      await user.click(within(row).getByRole('button', { name: /rooftop terrace/i }));

      expect(await screen.findByTestId('floor-plan-editor-stub')).toBeInTheDocument();
    });

    it('renderiza el hub con FLOOR ZONES activo', async () => {
      render(<FloorZonesView merchantId={3} />);

      await screen.findByText('Main Dining');
      const hub = within(
        screen.getByRole('navigation', { name: /dining system workspace shortcuts/i }),
      );
      expect(hub.getByText('FLOOR ZONES', { exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(hub.getByRole('button', { name: 'FLOOR PLANS' })).toBeInTheDocument();
    });

    it('navega a otro workspace desde el hub', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      render(<FloorZonesView merchantId={3} onNavigate={onNavigate} />);

      await screen.findByText('Main Dining');
      const hub = within(
        screen.getByRole('navigation', { name: /dining system workspace shortcuts/i }),
      );
      await user.click(hub.getByRole('button', { name: 'DINING TABLES' }));

      expect(onNavigate).toHaveBeenCalledWith('tables');
    });
  });
});
