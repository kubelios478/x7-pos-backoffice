import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// E2E del workspace de Payment Items (lado merchant): grid con join al voucher padre,
// filtros, alta con validación de suma contra el total del pago, lock de inmovilidad,
// soft-delete y barra inferior de quick links. API mockeada por route interception.

const DRAFT_PAYMENT = {
  id: 1,
  company_id: 1,
  supplier_id: 10,
  payment_number: 'PAY-SEED-1',
  payment_date: '2026-02-01',
  payment_method: 'bank_transfer',
  reference: 'TRX-1',
  total_amount: 1000,
  allocated_amount: 0,
  status: 'draft',
};

// Pago inmovilizado: posted + con monto asignado.
const FROZEN_PAYMENT = {
  id: 3,
  company_id: 1,
  supplier_id: 10,
  payment_number: 'PAY-SEED-3',
  payment_date: '2026-03-01',
  payment_method: 'check',
  reference: null,
  total_amount: 300,
  allocated_amount: 300,
  status: 'fully_allocated',
};

const ITEMS = [
  { id: 11, payment_id: 1, document_number: 'INV-A-001', document_type: 'invoice', amount: 400 },
  { id: 12, payment_id: 1, document_number: 'ADV-A-002', document_type: 'advance', amount: 150 },
  { id: 14, payment_id: 3, document_number: 'INV-C-001', document_type: 'invoice', amount: 300 },
];

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

async function bootstrap(page: Page, items = ITEMS) {
  await page.addInitScript(() => {
    localStorage.setItem('x7_access_token', 'e2e-merchant');
    localStorage.setItem('x7_user', JSON.stringify({ email: 'gm@x7.com', name: 'Marco Rossi' }));
  });

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill(json({ data: [] })),
  );
  await page.route(
    (url) => url.pathname === '/api/supplier-payments',
    (route) => route.fulfill(json({ data: [DRAFT_PAYMENT, FROZEN_PAYMENT] })),
  );
  await page.route(
    (url) => url.pathname === '/api/supplier-payment-items',
    (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        return route.fulfill(json({ data: { id: 99, ...body } }));
      }
      // El drawer pide las líneas hermanas del pago elegido para validar la suma.
      const paymentId = new URL(req.url()).searchParams.get('payment_id');
      const data = paymentId
        ? items.filter((i) => String(i.payment_id) === paymentId)
        : items;
      return route.fulfill(json({ data }));
    },
  );
  await page.route(
    (url) => /^\/api\/supplier-payment-items\/\d+$/.test(url.pathname),
    (route) => route.fulfill(json({ data: { id: 11 } })),
  );
}

async function gotoPaymentItems(page: Page) {
  await page.goto('/dashboard');
  await page.getByText('Finance & HR').click();
  await page.getByText('Accounts Payable').click();
  await page.getByText('Supplier Payment Items Ledger').click();
  await expect(page.getByText('INV-A-001')).toBeVisible();
}

test('grid joins each payment item with its parent voucher and document badge', async ({ page }) => {
  await bootstrap(page);
  await gotoPaymentItems(page);

  const row = page.locator('tr', { hasText: 'INV-A-001' });
  await expect(row.getByRole('button', { name: 'PAY-SEED-1' })).toBeVisible();
  await expect(row.getByText('$400.00')).toBeVisible();
  await expect(page.locator('tr', { hasText: 'ADV-A-002' }).getByText('Advance Payment')).toBeVisible();
});

test('search and document type filters narrow the grid', async ({ page }) => {
  await bootstrap(page);
  await gotoPaymentItems(page);

  await page.getByLabel('Search payment items').fill('ADV-A');
  await expect(page.getByText('ADV-A-002')).toBeVisible();
  await expect(page.getByText('INV-A-001')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear Filters' }).click();
  await page.getByLabel('Filter by document type').selectOption('invoice');
  await expect(page.getByText('INV-A-001')).toBeVisible();
  await expect(page.getByText('ADV-A-002')).toHaveCount(0);
});

test('merchant adds a payment item', async ({ page }) => {
  await bootstrap(page);
  await gotoPaymentItems(page);

  await page.getByRole('button', { name: 'Add Payment Item' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add Payment Item' });
  await expect(dialog).toBeVisible();

  await dialog.locator('#item-payment').selectOption('1');
  await dialog.locator('#item-document').fill('INV-E2E-NEW');
  await dialog.locator('#item-type').selectOption('invoice');
  await dialog.locator('#item-amount').fill('200');
  await dialog.getByRole('button', { name: 'Add Payment Item' }).click();

  await expect(page.getByText('Payment item added successfully')).toBeVisible();
});

test('form blocks an item that would exceed the parent voucher total', async ({ page }) => {
  await bootstrap(page);
  await gotoPaymentItems(page);

  await page.getByRole('button', { name: 'Add Payment Item' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add Payment Item' });

  await dialog.locator('#item-payment').selectOption('1');
  await dialog.locator('#item-document').fill('INV-E2E-TOOBIG');
  // PAY-SEED-1 totals 1000 with 550 already recorded → 500 more overflows it.
  await dialog.locator('#item-amount').fill('500');

  await expect(
    dialog.getByText(
      'The total amount of payment items ($1,050.00) cannot exceed the parent payment voucher total ($1,000.00).',
    ),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Add Payment Item' })).toBeDisabled();
});

test('items of a posted payment are immobilised', async ({ page }) => {
  await bootstrap(page);
  await gotoPaymentItems(page);

  const frozenRow = page.locator('tr', { hasText: 'INV-C-001' });
  await frozenRow.hover();
  await expect(frozenRow.getByRole('button', { name: 'Edit payment item INV-C-001' })).toBeDisabled();
  await expect(frozenRow.getByRole('button', { name: 'Delete payment item INV-C-001' })).toBeDisabled();

  const draftRow = page.locator('tr', { hasText: 'INV-A-001' });
  await draftRow.hover();
  await expect(draftRow.getByRole('button', { name: 'Edit payment item INV-A-001' })).toBeEnabled();
});

test('merchant soft-deletes a payment item', async ({ page }) => {
  await bootstrap(page);
  await gotoPaymentItems(page);

  const row = page.locator('tr', { hasText: 'INV-A-001' });
  await row.hover();
  await row.getByRole('button', { name: 'Delete payment item INV-A-001' }).click();

  const dialog = page.getByRole('dialog', { name: 'Delete Payment Item' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete Item' }).click();

  await expect(page.getByText('Payment item deleted successfully')).toBeVisible();
  await expect(page.getByText('INV-A-001')).toHaveCount(0);
});

test('quick links hub marks PAYMENT ITEMS active and routes to the other workspaces', async ({
  page,
}) => {
  await bootstrap(page);
  await gotoPaymentItems(page);

  const hub = page.getByRole('navigation', { name: 'Accounts payable workspace shortcuts' });
  // exact: la descripción del panel también menciona "payment items" en prosa.
  await expect(hub.getByText('PAYMENT ITEMS', { exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await hub.getByRole('button', { name: 'PAYMENTS & DISBURSEMENTS' }).click();
  await expect(page.getByRole('heading', { name: /payments & disbursements/i })).toBeVisible();
});
