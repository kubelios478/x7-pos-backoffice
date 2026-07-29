import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// E2E del ciclo de vida de Payments & Disbursements (lado merchant): registrar, borrar (soft)
// y bloqueo de borrado si tiene monto asignado. API mockeada por route interception.

const SUPPLIERS = [
  { id: 10, name: 'Coca-Cola FEMSA' },
  { id: 20, name: 'Nestlé Foods' },
];

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

const ALLOCATED_PAYMENT = {
  id: 2,
  company_id: 1,
  supplier_id: 20,
  payment_number: 'PAY-SEED-2',
  payment_date: '2026-01-15',
  payment_method: 'cash',
  reference: null,
  total_amount: 500,
  allocated_amount: 120,
  status: 'partially_allocated',
};

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

async function bootstrap(page: Page, payments = [DRAFT_PAYMENT, ALLOCATED_PAYMENT]) {
  await page.addInitScript(() => {
    localStorage.setItem('x7_access_token', 'e2e-merchant');
    localStorage.setItem('x7_user', JSON.stringify({ email: 'gm@x7.com', name: 'Marco Rossi' }));
  });

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill(json({ data: [] })),
  );
  await page.route(
    (url) => url.pathname === '/api/suppliers',
    (route) => route.fulfill(json({ data: SUPPLIERS })),
  );
  await page.route(
    (url) => url.pathname === '/api/supplier-payment-allocations',
    (route) => route.fulfill(json({ data: [] })),
  );
  await page.route(
    (url) => url.pathname === '/api/supplier-payments',
    (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        return route.fulfill(json({ data: { id: 999, allocated_amount: 0, status: 'draft', ...body } }));
      }
      return route.fulfill(json({ data: payments }));
    },
  );
  await page.route(
    (url) => /^\/api\/supplier-payments\/\d+$/.test(url.pathname),
    (route) => route.fulfill(json({ data: DRAFT_PAYMENT })),
  );
}

async function gotoPayments(page: Page) {
  await page.goto('/dashboard');
  await page.getByText('Finance & HR').click();
  await page.getByText('Accounts Payable').click();
  await page.getByText('Supplier Payments Hub').click();
  await expect(page.getByText('PAY-SEED-1')).toBeVisible();
}

test('merchant records a supplier payment', async ({ page }) => {
  await bootstrap(page);
  await gotoPayments(page);

  await page.getByRole('button', { name: 'Record Payment' }).click();
  const dialog = page.getByRole('dialog', { name: 'Record Payment' });
  await expect(dialog).toBeVisible();

  await dialog.locator('#pay-supplier').selectOption('10');
  await dialog.locator('#pay-number').fill('PAY-E2E-NEW');
  await dialog.locator('#pay-date').fill('2026-05-01');
  await dialog.locator('#pay-method').selectOption('cash');
  await dialog.locator('#pay-total').fill('750');
  await dialog.getByRole('button', { name: 'Record Payment' }).click();

  await expect(page.getByText('Payment recorded successfully')).toBeVisible();
  await expect(page.getByText('PAY-E2E-NEW')).toBeVisible();
});

test('merchant soft-deletes a draft payment', async ({ page }) => {
  await bootstrap(page);
  await gotoPayments(page);

  const row = page.locator('tr', { hasText: 'PAY-SEED-1' });
  await row.hover();
  await row.getByRole('button', { name: 'Delete payment' }).click();

  const dialog = page.getByRole('dialog', { name: 'Delete Payment' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(page.getByText('Payment deleted successfully')).toBeVisible();
  await expect(page.getByText('PAY-SEED-1')).toHaveCount(0);
});

test('merchant is blocked from deleting an allocated payment', async ({ page }) => {
  await bootstrap(page);
  await gotoPayments(page);

  const row = page.locator('tr', { hasText: 'PAY-SEED-2' });
  await row.hover();
  await row.getByRole('button', { name: 'Delete payment' }).click();

  await expect(page.getByText(/Cannot delete: unlink active allocations/i)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Delete Payment' })).toHaveCount(0);
});
