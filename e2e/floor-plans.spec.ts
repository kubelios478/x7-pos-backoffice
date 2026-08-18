import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// E2E del workspace de Floor Plans (dining-system): grid con contadores agregados en
// cliente (el backend nunca embebe tables/floorZones en /api/floor-plan), alta con
// validación de dimensiones, guard de borrado por mesas vivas, editor 2D con arrastre
// y barra inferior de quick links. API mockeada por route interception.

const MERCHANT = { id: 7, name: 'X7 Bistro' };

// El backend persiste el status como varchar libre: 'inactive' se normaliza a 'draft'
// en la UI, así que el segundo plano prueba de paso normalizeFloorPlanStatus.
const PLANS = [
  {
    id: 1,
    name: 'Main Dining Room',
    width: 800,
    height: 600,
    status: 'active',
    merchant: MERCHANT,
  },
  {
    id: 2,
    name: 'Terrace Deck',
    width: 1000,
    height: 700,
    status: 'inactive',
    merchant: MERCHANT,
  },
];

const ZONES = [
  { id: 10, name: 'Main Hall', color: '#ae001a', status: 'active', floorPlan: { id: 1, name: 'Main Dining Room' } },
  { id: 11, name: 'Bar', color: '#1d1c17', status: 'active', floorPlan: { id: 1, name: 'Main Dining Room' } },
  { id: 12, name: 'Terrace', color: '#0f766e', status: 'active', floorPlan: { id: 2, name: 'Terrace Deck' } },
];

// Ambas mesas cuelgan del plano 1: eso dispara el guard de borrado y da carga al editor.
// El plano 2 queda sin mesas para poder borrarlo sin bloqueo.
const TABLES = [
  {
    id: 101,
    merchant_id: MERCHANT.id,
    number: 'T1',
    capacity: 4,
    status: 'available',
    location: 'Near window',
    rotation: 0,
    shape: 'Square',
    pos_x: 100,
    pos_y: 100,
    floorPlan: { id: 1, name: 'Main Dining Room' },
    floorZone: { id: 10, name: 'Main Hall', color: '#ae001a' },
    parent_table: null,
  },
  {
    id: 102,
    merchant_id: MERCHANT.id,
    number: 'T2',
    capacity: 2,
    status: 'available',
    location: 'Bar side',
    rotation: 0,
    shape: 'Circle',
    pos_x: 300,
    pos_y: 200,
    floorPlan: { id: 1, name: 'Main Dining Room' },
    floorZone: { id: 11, name: 'Bar', color: '#1d1c17' },
    parent_table: null,
  },
];

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

const pathOf = (url: string) => new URL(url).pathname;

async function bootstrap(page: Page) {
  await page.addInitScript(
    ({ merchant }) => {
      localStorage.setItem('x7_access_token', 'e2e-merchant');
      // `merchant.id` no es opcional: MerchantFrame lo lee con getCurrentMerchantId()
      // para alimentar el prop merchantId de la vista.
      localStorage.setItem(
        'x7_user',
        JSON.stringify({
          id: 42,
          email: 'gm@x7.com',
          role: 'MERCHANT_ADMIN',
          scope: 'MERCHANT_WEB',
          merchant,
          authorizedFeatureIds: [],
        }),
      );
    },
    { merchant: MERCHANT },
  );

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill(json({ data: [] })),
  );

  // /api/floor-plan devuelve la paginación bajo `pagination` (a diferencia de /api/tables).
  await page.route(
    (url) => url.pathname === '/api/floor-plan',
    (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        return route.fulfill(
          json({ statusCode: 201, message: 'Floor Plan created successfully', data: { id: 99, ...body } }, 201),
        );
      }
      return route.fulfill(
        json({
          statusCode: 200,
          message: 'Floor Plans retrieved successfully',
          data: PLANS,
          pagination: { total: PLANS.length, page: 1, limit: 100, totalPages: 1 },
        }),
      );
    },
  );

  await page.route(
    (url) => /^\/api\/floor-plan\/\d+$/.test(url.pathname),
    (route) =>
      route.fulfill(json({ statusCode: 200, message: 'Floor Plan updated successfully', data: PLANS[0] })),
  );

  await page.route(
    (url) => url.pathname === '/api/floor-zone',
    (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        return route.fulfill(
          json({ statusCode: 201, message: 'Floor Zone created successfully', data: { id: 13, ...body } }, 201),
        );
      }
      return route.fulfill(
        json({
          statusCode: 200,
          message: 'Floor Zones retrieved successfully',
          data: ZONES,
          pagination: { total: ZONES.length, page: 1, limit: 100, totalPages: 1 },
        }),
      );
    },
  );

  // /api/tables no acepta filtro por plano: siempre devuelve la colección completa y el
  // front agrupa por floorPlan.id. La paginación viaja bajo `paginationMeta`.
  await page.route(
    (url) => url.pathname === '/api/tables',
    (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        return route.fulfill(
          json({ statusCode: 201, message: 'Table created successfully', data: { id: 199, ...body } }, 201),
        );
      }
      return route.fulfill(
        json({
          statusCode: 200,
          message: 'Tables retrieved successfully',
          data: TABLES,
          paginationMeta: {
            page: 1,
            limit: 100,
            total: TABLES.length,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        }),
      );
    },
  );

  await page.route(
    (url) => /^\/api\/tables\/\d+$/.test(url.pathname),
    (route) => {
      const id = Number(pathOf(route.request().url()).split('/').pop());
      const row = TABLES.find((t) => t.id === id) ?? TABLES[0];
      const body = JSON.parse(route.request().postData() || '{}');
      return route.fulfill(
        json({ statusCode: 200, message: 'Table updated successfully', data: { ...row, ...body } }),
      );
    },
  );
}

async function gotoFloorPlans(page: Page) {
  await page.goto('/dashboard');
  await page.getByText('Restaurant Operations').click();
  await page.getByText('Dining System', { exact: true }).click();
  await page.getByText('Floor plans designer').click();
  await expect(page.getByTestId('floor-plan-row-1')).toBeVisible();
}

test('grid lists the seeded plans with dimensions, zone/table pills and status badges', async ({
  page,
}) => {
  await bootstrap(page);
  await gotoFloorPlans(page);

  const main = page.getByTestId('floor-plan-row-1');
  await expect(main.getByText('Main Dining Room')).toBeVisible();
  await expect(main.getByText('8 m × 6 m')).toBeVisible();
  await expect(main.getByText('2 Zones', { exact: true })).toBeVisible();
  await expect(main.getByText('2 Tables', { exact: true })).toBeVisible();
  await expect(main.getByText('Active', { exact: true })).toBeVisible();

  // 'inactive' del backend se pinta como Draft, y el plano no tiene mesas asociadas.
  const terrace = page.getByTestId('floor-plan-row-2');
  await expect(terrace.getByText('10 m × 7 m')).toBeVisible();
  await expect(terrace.getByText('1 Zone', { exact: true })).toBeVisible();
  await expect(terrace.getByText('0 Tables', { exact: true })).toBeVisible();
  await expect(terrace.getByText('Draft', { exact: true })).toBeVisible();
});

test('search narrows the grid', async ({ page }) => {
  await bootstrap(page);
  await gotoFloorPlans(page);

  await page.getByLabel('Search floor plans').fill('Terrace');
  await expect(page.getByTestId('floor-plan-row-2')).toBeVisible();
  await expect(page.getByTestId('floor-plan-row-1')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear Filters' }).click();
  await expect(page.getByTestId('floor-plan-row-1')).toBeVisible();
});

test('merchant creates a floor plan', async ({ page }) => {
  await bootstrap(page);
  await gotoFloorPlans(page);

  // exact: el FAB se llama "Quick create floor plan" y el match por defecto es subcadena.
  await page.getByRole('button', { name: 'Create Floor Plan', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create Floor Plan' });
  await expect(dialog).toBeVisible();

  await dialog.locator('#plan-name').fill('Rooftop Lounge');
  // Los inputs están en metros; lo que viaja al backend siguen siendo píxeles.
  await dialog.locator('#plan-width').fill('12');
  await dialog.locator('#plan-height').fill('9');

  const postRequest = page.waitForRequest(
    (r) => pathOf(r.url()) === '/api/floor-plan' && r.method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Create Floor Plan' }).click();

  // El campo del comercio es `merchant` (número) y sale de la sesión, no del JWT.
  const body = JSON.parse((await postRequest).postData() || '{}');
  expect(body).toMatchObject({
    merchant: MERCHANT.id,
    name: 'Rooftop Lounge',
    width: 1200,
    height: 900,
    status: 'active',
  });

  await expect(page.getByText('Floor plan created successfully')).toBeVisible();
});

test('a canvas width below 300px blocks submission', async ({ page }) => {
  await bootstrap(page);
  await gotoFloorPlans(page);

  // exact: el FAB se llama "Quick create floor plan" y el match por defecto es subcadena.
  await page.getByRole('button', { name: 'Create Floor Plan', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create Floor Plan' });

  await dialog.locator('#plan-name').fill('Too Small');
  await dialog.locator('#plan-width').fill('2');

  await expect(
    dialog.getByText('Canvas dimensions must be between 3 m and 40 m.'),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Create Floor Plan' })).toBeDisabled();
});

test('deleting a plan with tables is blocked before any confirmation opens', async ({ page }) => {
  await bootstrap(page);
  await gotoFloorPlans(page);

  const row = page.getByTestId('floor-plan-row-1');
  await row.hover();
  await row.getByRole('button', { name: 'Delete floor plan Main Dining Room' }).click();

  await expect(
    page.getByText(
      'Cannot delete or archive a floor plan with active table layouts or open orders. Reassign or clear tables first.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Delete Floor Plan' })).toHaveCount(0);

  // El plano sin mesas sí abre el diálogo: confirma que el guard es por mesas, no global.
  const empty = page.getByTestId('floor-plan-row-2');
  await empty.hover();
  await empty.getByRole('button', { name: 'Delete floor plan Terrace Deck' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete Floor Plan' })).toBeVisible();
});

test('2D editor renders the seeded tables and persists a drag with PUT /api/tables/:id', async ({
  page,
}) => {
  await bootstrap(page);
  await gotoFloorPlans(page);

  await page
    .getByTestId('floor-plan-row-1')
    .getByRole('button', { name: 'Open editor for Main Dining Room' })
    .click();

  const canvas = page.getByTestId('floor-plan-canvas');
  await expect(canvas).toBeVisible();
  const table = page.getByTestId('floor-table-101');
  await expect(table).toBeVisible();
  await expect(page.getByTestId('floor-table-102')).toBeVisible();
  await expect(page.getByTestId('floor-plan-save')).toBeDisabled();

  // El lienzo se escala con CSS transform, así que un delta de pantalla equivale a
  // delta/zoom px de lienzo: leemos el zoom real para que el arrastre sea determinista.
  const zoomLabel = await page.getByTestId('floor-plan-zoom-level').textContent();
  const zoom = Number((zoomLabel ?? '100%').replace('%', '')) / 100;
  expect(zoom).toBeGreaterThan(0);

  const box = (await table.boundingBox())!;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 100 * zoom, startY + 60 * zoom, { steps: 12 });
  await page.mouse.up();

  // pos_x 100 -> 200 y pos_y 100 -> 160, ya pegados a la retícula de 10px.
  // El inspector muestra metros (200 px = 2 m); pos_x/pos_y persisten en píxeles.
  await expect(page.locator('#insp-x')).toHaveValue('2');
  await expect(page.locator('#insp-y')).toHaveValue('1.6');

  const putRequest = page.waitForRequest(
    (r) => pathOf(r.url()) === '/api/tables/101' && r.method() === 'PUT',
  );
  await page.getByTestId('floor-plan-save').click();

  // El PUT sólo lleva el diff: merchant_id iría con 400 por forbidNonWhitelisted.
  const body = JSON.parse((await putRequest).postData() || '{}');
  expect(body).toMatchObject({ pos_x: 200, pos_y: 160 });
  expect(body).not.toHaveProperty('merchant_id');

  await expect(page.getByText('Floor plan layout saved')).toBeVisible();
});

test('quick links hub marks FLOOR PLANS active and routes to the other dining workspaces', async ({
  page,
}) => {
  await bootstrap(page);
  await gotoFloorPlans(page);

  const hub = page.getByRole('navigation', { name: 'Dining system workspace shortcuts' });
  // exact: la descripción del panel también menciona "floor plans" en prosa.
  await expect(hub.getByText('FLOOR PLANS', { exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await hub.getByRole('button', { name: 'FLOOR ZONES' }).click();
  // El header de la shell repite el nombre de la feature: acotamos al <main>.
  await expect(
    page.getByRole('main').getByRole('heading', { name: /floor zones/i }),
  ).toBeVisible();
});
