import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// E2E del ciclo de vida de Supplier Invoices (lado merchant): registrar una factura de
// proveedor y hacer soft-delete, navegando el sidebar dinámico del MerchantFrame.
// El perfil merchant es simulado (General Manager, plan 2), así que basta con sembrar
// el token de acceso para pasar ProtectedRoute; la API se mockea por route interception.

const SUPPLIERS = [
  { id: 10, name: 'Coca-Cola FEMSA', email: 'sales@femsa.com', phone: '+56 9 1111 2222' },
  { id: 20, name: 'Nestlé Foods', email: 'orders@nestle.com' },
];

const SEED_INVOICE = {
  id: 1,
  company_id: 1,
  supplier_id: 10,
  supplier: SUPPLIERS[0],
  invoice_number: 'INV-SEED-1',
  invoice_date: '2026-01-05',
  due_date: '2026-02-05',
  subtotal: 1000,
  tax_total: 190,
  total_amount: 1190,
  paid_amount: 0,
  balance_due: 1190,
  status: 'pending',
};

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

async function bootstrap(page: Page, invoices = [SEED_INVOICE]) {
  // isAuthenticated() exige token Y usuario almacenado (x7_user).
  await page.addInitScript(() => {
    localStorage.setItem('x7_access_token', 'e2e-merchant');
    localStorage.setItem('x7_user', JSON.stringify({ email: 'gm@x7.com', name: 'Marco Rossi' }));
  });

  // Fallback para llamadas al backend real; no intercepta módulos fuente (/src/api/...).
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill(json({ data: [] })),
  );

  // Matchers por pathname (ignoran el query string ?companyId=...).
  await page.route(
    (url) => url.pathname === '/api/v1/inventory/suppliers',
    (route) => route.fulfill(json({ data: SUPPLIERS })),
  );

  // Lista + creación de facturas.
  await page.route(
    (url) => url.pathname === '/api/supplier-invoices',
    (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        return route.fulfill(
          json({
            data: {
              id: 999,
              company_id: 1,
              supplier: SUPPLIERS.find((s) => s.id === body.supplier_id) ?? SUPPLIERS[0],
              paid_amount: 0,
              balance_due: (body.subtotal ?? 0) + (body.tax_total ?? 0),
              total_amount: (body.subtotal ?? 0) + (body.tax_total ?? 0),
              status: 'pending',
              ...body,
            },
          }),
        );
      }
      return route.fulfill(json({ data: invoices }));
    },
  );

  // Detalle / soft-delete por id.
  await page.route(
    (url) => /^\/api\/supplier-invoices\/\d+$/.test(url.pathname),
    (route) => route.fulfill(json({ data: SEED_INVOICE })),
  );
}

// Navega el sidebar de 3 niveles hasta la vista de Supplier Invoices.
async function gotoSupplierInvoices(page: Page) {
  await page.goto('/dashboard');
  await page.getByText('Finance & HR').click();
  await page.getByText('Accounts Payable').click();
  await page.getByText('Supplier Invoices Control').click();
  await expect(page.getByText('INV-SEED-1')).toBeVisible();
}

test('merchant registers a supplier invoice', async ({ page }) => {
  await bootstrap(page);
  await gotoSupplierInvoices(page);

  await page.getByRole('button', { name: 'Register Invoice' }).click();
  const dialog = page.getByRole('dialog', { name: 'Register Invoice' });
  await expect(dialog).toBeVisible();

  await dialog.locator('#invoice-supplier').selectOption('10');
  await dialog.locator('#invoice-number').fill('INV-E2E-NEW');
  await dialog.locator('#invoice-date').fill('2026-05-01');
  await dialog.locator('#invoice-due-date').fill('2026-06-01');
  await dialog.locator('#invoice-subtotal').fill('1000');
  await dialog.locator('#invoice-tax-total').fill('190');

  await dialog.getByRole('button', { name: 'Save Invoice' }).click();

  await expect(page.getByText('Invoice registered successfully')).toBeVisible();
  await expect(page.getByText('INV-E2E-NEW')).toBeVisible();
});

test('merchant enforces the maturity date guard', async ({ page }) => {
  await bootstrap(page);
  await gotoSupplierInvoices(page);

  await page.getByRole('button', { name: 'Register Invoice' }).click();
  const dialog = page.getByRole('dialog', { name: 'Register Invoice' });

  await dialog.locator('#invoice-supplier').selectOption('10');
  await dialog.locator('#invoice-number').fill('INV-BAD');
  await dialog.locator('#invoice-date').fill('2026-05-10');
  await dialog.locator('#invoice-due-date').fill('2026-05-01'); // antes de la emisión

  await expect(
    dialog.getByText('Due date cannot be earlier than the invoice issuance date.'),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save Invoice' })).toBeDisabled();
});

test('merchant soft-deletes a supplier invoice', async ({ page }) => {
  await bootstrap(page);
  await gotoSupplierInvoices(page);

  const row = page.locator('tr', { hasText: 'INV-SEED-1' });
  await row.hover();
  await row.getByRole('button', { name: 'Delete invoice' }).click();

  const dialog = page.getByRole('dialog', { name: 'Delete Invoice' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(page.getByText('Invoice deleted successfully')).toBeVisible();
  await expect(page.getByText('INV-SEED-1')).toHaveCount(0);
});
