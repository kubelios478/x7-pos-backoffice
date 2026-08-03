import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Flujo crítico de dinero end-to-end: la plataforma (SaaS admin) ejecuta el "pago de caja"
// diario — transfiere al merchant el neto recaudado de sus órdenes del día.

const PENDING_SETTLEMENT = {
  id: 1,
  company_id: 10,
  merchant_name: 'Bella Napoli',
  settlement_date: '2026-07-25',
  orders_count: 12,
  gross_collected: 1000,
  refunds: 20,
  platform_fee: 50,
  net_payout: 930,
  status: 'PENDING' as const,
};

const ORDERS = [
  {
    id: 1,
    company_id: 10,
    merchant_name: 'Bella Napoli',
    branch_name: 'Downtown',
    order_number: 'ORD-1001',
    order_date: '2026-07-25',
    channel: 'POS',
    payment_method: 'CARD',
    gross_amount: 1000,
    status: 'COMPLETED',
  },
];

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

// Semilla de auth SaaS + mocks de API. Debe correr antes de cargar la app.
async function bootstrap(page: Page, settlements = [PENDING_SETTLEMENT]) {
  await page.addInitScript(() => {
    localStorage.setItem('x7_saas_admin_token', 'e2e-token');
  });

  // Fallback para cualquier otra llamada al backend real (/api/...) — p. ej. las métricas
  // del dashboard. Se usa un matcher por pathname para NO interceptar los módulos fuente
  // de Vite (p. ej. /src/api/auth.ts), que sí contienen "api" en la ruta.
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill(json({ data: [] })),
  );

  // Registro de órdenes.
  await page.route('**/v1/platform/orders', (route) => route.fulfill(json({ data: ORDERS })));

  // Lista de liquidaciones.
  await page.route('**/v1/platform/merchant-settlements', (route) =>
    route.fulfill(json({ data: settlements })),
  );

  // Ejecución del payout: devuelve la liquidación pagada con referencia.
  await page.route('**/v1/platform/merchant-settlements/*/payout', (route) =>
    route.fulfill(
      json({
        data: {
          ...PENDING_SETTLEMENT,
          status: 'PAID',
          payout_reference: 'PO-0001',
          paid_at: '2026-07-26T10:00:00.000Z',
        },
      }),
    ),
  );
}

test('platform executes a merchant daily cash payout', async ({ page }) => {
  await bootstrap(page);

  await page.goto('/saas-admin');

  // Navegar al hub de liquidaciones desde el sidebar de plataforma.
  await page.getByRole('button', { name: 'Merchant Settlements' }).click();
  await expect(page.getByText('Bella Napoli')).toBeVisible();

  // Ejecutar el pago de caja para el merchant.
  const row = page.locator('tr', { hasText: 'Bella Napoli' });
  await row.getByRole('button', { name: 'Execute payout' }).click();

  // El diálogo de confirmación muestra el neto a transferir.
  const dialog = page.getByRole('dialog', { name: 'Execute Payout' });
  await expect(dialog.getByTestId('payout-net-amount')).toHaveText('$930.00');
  await dialog.getByRole('button', { name: 'Confirm Payout' }).click();

  // Confirmación: toast + referencia de pago + botón deshabilitado (ya pagado).
  await expect(page.getByText('Payout executed successfully')).toBeVisible();
  const paidRow = page.locator('tr', { hasText: 'Bella Napoli' });
  await expect(paidRow.getByText('PO-0001')).toBeVisible();
  await expect(paidRow.getByRole('button', { name: 'Execute payout' })).toBeDisabled();
});

test('orders registry lists collected merchant orders', async ({ page }) => {
  await bootstrap(page);

  await page.goto('/saas-admin');
  await page.getByRole('button', { name: 'Orders Registry' }).click();

  await expect(page.getByText('ORD-1001')).toBeVisible();
  await expect(page.getByText(/Bella Napoli · Downtown/)).toBeVisible();
});
