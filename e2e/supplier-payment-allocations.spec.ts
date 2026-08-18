import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// E2E del workspace de Payment Allocations (lado merchant): grid con doble fuente de
// fondeo, exclusión mutua pago/nota de crédito, bloqueo por sobre-asignación, unlink con
// reversión de saldos y barra inferior de quick links. API mockeada por route interception.

const SUPPLIERS = [
  { id: 10, name: 'Coca-Cola FEMSA' },
  { id: 20, name: 'Nestlé Foods' },
];

const PAYMENT = {
  id: 1,
  company_id: 1,
  supplier_id: 10,
  payment_number: 'PAY-SEED-1',
  payment_date: '2026-02-01',
  payment_method: 'bank_transfer',
  reference: null,
  total_amount: 1000,
  allocated_amount: 350,
  status: 'partially_allocated',
};

const CREDIT_NOTE = {
  id: 7,
  company_id: 1,
  supplier_id: 10,
  credit_note_number: 'CN-SEED-7',
  issue_date: '2026-02-10',
  total_amount: 400,
  applied_amount: 120,
  status: 'partially_applied',
};

const INVOICE = {
  id: 30,
  company_id: 1,
  supplier_id: 10,
  invoice_number: 'FAC-SEED-001',
  invoice_date: '2026-01-05',
  due_date: '2026-02-05',
  subtotal: 800,
  tax_total: 0,
  total_amount: 800,
  paid_amount: 350,
  balance_due: 450,
  status: 'partially_paid',
};

const ALLOCATIONS = [
  {
    id: 101,
    payment_id: 1,
    credit_note_id: null,
    supplier_id: 10,
    document_number: 'FAC-SEED-001',
    document_type: 'invoice',
    allocated_amount: 350,
    created_at: '2026-03-03T10:30:00.000Z',
  },
  {
    id: 102,
    payment_id: null,
    credit_note_id: 7,
    supplier_id: 10,
    document_number: 'DN-SEED-004',
    document_type: 'debit_note',
    allocated_amount: 120,
    created_at: '2026-03-04T09:00:00.000Z',
  },
];

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

async function bootstrap(page: Page, allocations = ALLOCATIONS) {
  await page.addInitScript(() => {
    localStorage.setItem('x7_access_token', 'e2e-merchant');
    localStorage.setItem('x7_user', JSON.stringify({ email: 'gm@x7.com', name: 'Marco Rossi' }));
  });

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill(json({ data: [] })),
  );
  await page.route(
    (url) => url.pathname === '/api/v1/inventory/suppliers',
    (route) => route.fulfill(json({ data: SUPPLIERS })),
  );
  await page.route(
    (url) => url.pathname === '/api/supplier-payments',
    (route) => route.fulfill(json({ data: [PAYMENT] })),
  );
  await page.route(
    (url) => url.pathname === '/api/supplier-credit-notes',
    (route) => route.fulfill(json({ data: [CREDIT_NOTE] })),
  );
  await page.route(
    (url) => url.pathname === '/api/supplier-invoices',
    (route) => route.fulfill(json({ data: [INVOICE] })),
  );
  await page.route(
    (url) => url.pathname === '/api/supplier-payment-allocations',
    (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        return route.fulfill(json({ data: { id: 200, ...body } }));
      }
      return route.fulfill(json({ data: allocations }));
    },
  );
  await page.route(
    (url) => /^\/api\/supplier-payment-allocations\/\d+$/.test(url.pathname),
    (route) => route.fulfill(json({ data: { id: 101 } })),
  );
}

async function gotoAllocations(page: Page) {
  await page.goto('/dashboard');
  await page.getByText('Finance & HR').click();
  await page.getByText('Accounts Payable').click();
  await page.getByText('Supplier Payments Allocation').click();
  await expect(page.getByText('#101')).toBeVisible();
}

/** Opens the allocation drawer from the toolbar. */
async function openDrawer(page: Page) {
  await page.getByRole('button', { name: 'Allocate Payment / Credit' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Allocate Payment / Credit' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('grid disambiguates payment-funded from credit-note-funded allocations', async ({ page }) => {
  await bootstrap(page);
  await gotoAllocations(page);

  const paymentRow = page.locator('tr', { hasText: '#101' });
  await expect(paymentRow.getByText('PAY-SEED-1')).toBeVisible();
  await expect(paymentRow.getByText('Payment Voucher')).toBeVisible();
  await expect(paymentRow.getByText('$350.00')).toBeVisible();

  const creditRow = page.locator('tr', { hasText: '#102' });
  await expect(creditRow.getByText('CN-SEED-7')).toBeVisible();
  await expect(creditRow.getByText('Credit Note')).toBeVisible();
});

test('source filter separates direct payments from credit note applications', async ({ page }) => {
  await bootstrap(page);
  await gotoAllocations(page);

  await page.getByLabel('Filter by allocation source').selectOption('credit_note');
  await expect(page.getByText('#102')).toBeVisible();
  await expect(page.getByText('#101')).toHaveCount(0);

  await page.getByLabel('Filter by allocation source').selectOption('payment');
  await expect(page.getByText('#101')).toBeVisible();
  await expect(page.getByText('#102')).toHaveCount(0);
});

test('funding sources are mutually exclusive', async ({ page }) => {
  await bootstrap(page);
  await gotoAllocations(page);
  const dialog = await openDrawer(page);

  await dialog.locator('#alloc-supplier').selectOption('10');
  // Payment is the default source: the credit note selector starts disabled.
  await expect(dialog.locator('#alloc-payment')).toBeEnabled();
  await expect(dialog.locator('#alloc-credit-note')).toBeDisabled();

  await dialog.locator('#alloc-payment').selectOption('1');
  await expect(dialog.locator('#alloc-payment')).toHaveValue('1');

  // Switching source resets and disables the previous one.
  await dialog.getByRole('button', { name: 'Credit Note' }).click();
  await expect(dialog.locator('#alloc-payment')).toBeDisabled();
  await expect(dialog.locator('#alloc-payment')).toHaveValue('');
  await expect(dialog.locator('#alloc-credit-note')).toBeEnabled();
});

test('form blocks an amount above the funding source available balance', async ({ page }) => {
  await bootstrap(page);
  await gotoAllocations(page);
  const dialog = await openDrawer(page);

  await dialog.locator('#alloc-supplier').selectOption('10');
  await dialog.locator('#alloc-payment').selectOption('1');
  await dialog.locator('#alloc-document').selectOption('FAC-SEED-001');
  // PAY-SEED-1 has 1000 - 350 = 650 available.
  await dialog.locator('#alloc-amount').fill('700');

  await expect(
    dialog.getByText(
      'Allocation amount ($700.00) exceeds the available unallocated balance ($650.00) of the selected funding source.',
    ),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Allocate Funds' })).toBeDisabled();
});

test('form blocks an amount above the target document balance', async ({ page }) => {
  await bootstrap(page);
  await gotoAllocations(page);
  const dialog = await openDrawer(page);

  await dialog.locator('#alloc-supplier').selectOption('10');
  await dialog.locator('#alloc-payment').selectOption('1');
  await dialog.locator('#alloc-document').selectOption('FAC-SEED-001');
  // The source allows 650 but the invoice only owes 450.
  await dialog.locator('#alloc-amount').fill('500');

  await expect(
    dialog.getByText(
      'Allocation amount ($500.00) exceeds the outstanding balance ($450.00) of the target document.',
    ),
  ).toBeVisible();
});

test('merchant allocates a credit note against a pending document', async ({ page }) => {
  await bootstrap(page);
  await gotoAllocations(page);

  const postBody = page.waitForRequest(
    (req) =>
      req.url().includes('/api/supplier-payment-allocations') && req.method() === 'POST',
  );

  const dialog = await openDrawer(page);
  await dialog.locator('#alloc-supplier').selectOption('10');
  await dialog.getByRole('button', { name: 'Credit Note' }).click();
  await dialog.locator('#alloc-credit-note').selectOption('7');
  await dialog.locator('#alloc-document').selectOption('FAC-SEED-001');
  await dialog.locator('#alloc-amount').fill('100');
  await dialog.getByRole('button', { name: 'Allocate Funds' }).click();

  // Exactly one funding source travels in the payload.
  const body = JSON.parse((await postBody).postData() || '{}');
  expect(body.credit_note_id).toBe(7);
  expect(body.payment_id).toBeNull();

  await expect(page.getByText('Allocation applied successfully')).toBeVisible();
});

test('unlinking an allocation warns about balance reversion and removes the row', async ({
  page,
}) => {
  let deleted = false;
  await bootstrap(page);
  // Después del DELETE la lista vuelve sin la asignación revertida.
  await page.route(
    (url) => url.pathname === '/api/supplier-payment-allocations',
    (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill(json({ data: { id: 200 } }));
      }
      return route.fulfill(json({ data: deleted ? ALLOCATIONS.slice(1) : ALLOCATIONS }));
    },
  );
  await page.route(
    (url) => /^\/api\/supplier-payment-allocations\/\d+$/.test(url.pathname),
    (route) => {
      deleted = true;
      return route.fulfill(json({ data: { id: 101 } }));
    },
  );

  await gotoAllocations(page);

  const row = page.locator('tr', { hasText: '#101' });
  await row.hover();
  await row.getByRole('button', { name: 'Unlink allocation 101' }).click();

  const dialog = page.getByRole('dialog', { name: 'Unlink Allocation' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Balances will be restored/i)).toBeVisible();
  await expect(dialog.getByText('PAY-SEED-1')).toBeVisible();
  await dialog.getByRole('button', { name: 'Unlink Allocation' }).click();

  await expect(page.getByText('Allocation unlinked and balances restored')).toBeVisible();
  await expect(page.getByText('#101')).toHaveCount(0);
});

test('quick links hub exposes all five accounts payable sub-modules', async ({ page }) => {
  await bootstrap(page);
  await gotoAllocations(page);

  const hub = page.getByRole('navigation', { name: 'Accounts payable workspace shortcuts' });
  // exact: la descripción del panel también menciona "allocations" en prosa.
  await expect(hub.getByText('PAYMENT ALLOCATIONS', { exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (const label of [
    'SUPPLIER INVOICES',
    'INVOICE LINE ITEMS',
    'CREDIT NOTES',
    'PAYMENTS & DISBURSEMENTS',
    'PAYMENT ITEMS',
  ]) {
    await expect(hub.getByRole('button', { name: label })).toBeVisible();
  }

  await hub.getByRole('button', { name: 'SUPPLIER INVOICES' }).click();
  // exact: la vista destino muestra además el breadcrumb "Supplier Invoices Control".
  await expect(
    page.getByRole('heading', { name: 'Supplier Invoices', exact: true }),
  ).toBeVisible();
});
