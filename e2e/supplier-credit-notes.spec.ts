import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// E2E del ciclo de vida de Supplier Credit Notes (lado merchant): emitir, borrar (soft)
// y bloqueo de borrado si tiene monto aplicado. API mockeada por route interception.

const SUPPLIERS = [
  { id: 10, name: 'Coca-Cola FEMSA', email: 'sales@femsa.com' },
  { id: 20, name: 'Nestlé Foods', email: 'orders@nestle.com' },
];

const DRAFT_NOTE = {
  id: 1,
  company_id: 1,
  supplier_id: 10,
  credit_note_number: 'CN-SEED-1',
  issue_date: '2026-02-01',
  total_amount: 500,
  applied_amount: 0,
  status: 'draft',
};

const APPLIED_NOTE = {
  id: 2,
  company_id: 1,
  supplier_id: 20,
  credit_note_number: 'CN-SEED-2',
  issue_date: '2026-01-15',
  total_amount: 300,
  applied_amount: 120,
  status: 'partially_applied',
};

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

async function bootstrap(page: Page, notes = [DRAFT_NOTE, APPLIED_NOTE]) {
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
    (url) => url.pathname === '/api/supplier-payment-allocations',
    (route) => route.fulfill(json({ data: [] })),
  );
  // Lista + creación.
  await page.route(
    (url) => url.pathname === '/api/supplier-credit-notes',
    (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        return route.fulfill(
          json({ data: { id: 999, applied_amount: 0, status: 'draft', ...body } }),
        );
      }
      return route.fulfill(json({ data: notes }));
    },
  );
  // Detalle / borrado / update por id.
  await page.route(
    (url) => /^\/api\/supplier-credit-notes\/\d+$/.test(url.pathname),
    (route) => route.fulfill(json({ data: DRAFT_NOTE })),
  );
}

async function gotoCreditNotes(page: Page) {
  await page.goto('/dashboard');
  await page.getByText('Finance & HR').click();
  await page.getByText('Accounts Payable').click();
  await page.getByText('Supplier Credit Notes').click();
  await expect(page.getByText('CN-SEED-1')).toBeVisible();
}

test('merchant issues a credit note', async ({ page }) => {
  await bootstrap(page);
  await gotoCreditNotes(page);

  await page.getByRole('button', { name: 'Issue Credit Note' }).click();
  const dialog = page.getByRole('dialog', { name: 'Issue Credit Note' });
  await expect(dialog).toBeVisible();

  await dialog.locator('#cn-supplier').selectOption('10');
  await dialog.locator('#cn-number').fill('CN-E2E-NEW');
  await dialog.locator('#cn-issue-date').fill('2026-05-01');
  await dialog.locator('#cn-total').fill('400');
  await dialog.getByRole('button', { name: 'Issue Credit Note' }).click();

  await expect(page.getByText('Credit note issued successfully')).toBeVisible();
  await expect(page.getByText('CN-E2E-NEW')).toBeVisible();
});

test('merchant soft-deletes a draft credit note', async ({ page }) => {
  await bootstrap(page);
  await gotoCreditNotes(page);

  const row = page.locator('tr', { hasText: 'CN-SEED-1' });
  await row.hover();
  await row.getByRole('button', { name: 'Delete credit note' }).click();

  const dialog = page.getByRole('dialog', { name: 'Delete Credit Note' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(page.getByText('Credit note deleted successfully')).toBeVisible();
  await expect(page.getByText('CN-SEED-1')).toHaveCount(0);
});

test('merchant is blocked from deleting an applied credit note', async ({ page }) => {
  await bootstrap(page);
  await gotoCreditNotes(page);

  const row = page.locator('tr', { hasText: 'CN-SEED-2' });
  await row.hover();
  await row.getByRole('button', { name: 'Delete credit note' }).click();

  await expect(page.getByText(/Cannot delete: unlink active allocations/i)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Delete Credit Note' })).toHaveCount(0);
});
