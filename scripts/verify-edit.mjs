import pkg from '../node_modules/@playwright/test/index.js';
const { chromium } = pkg;
import path from 'path';
import os from 'os';
import { mkdirSync } from 'fs';

const SCREENSHOTS = path.join(os.tmpdir(), 'edit-plan-verify');
mkdirSync(SCREENSHOTS, { recursive: true });

const browser = await chromium.launch({ headless: false, slowMo: 400 });
const page = await browser.newPage();
page.setDefaultTimeout(15000);

// 1. Go to saas-admin
await page.goto('http://localhost:5173/saas-admin');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SCREENSHOTS}/01-initial.png`, fullPage: true });

// 2. Login if overlay is present
const emailInput = page.locator('input[type="email"]');
if (await emailInput.isVisible()) {
  console.log('Login overlay — logging in...');
  await emailInput.fill('john@example.com');
  await page.locator('input[type="password"]').fill('softPassword');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOTS}/02-after-login.png`, fullPage: true });
}

// 3. Navigate to Subscription Plans tab
const subscriptionTab = page.getByRole('button', { name: /subscription/i });
if (await subscriptionTab.isVisible()) {
  await subscriptionTab.click();
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: `${SCREENSHOTS}/03-subscription-tab.png`, fullPage: true });

// 4. Hover first row to reveal edit button
const firstRow = page.locator('tbody tr').first();
await firstRow.hover();
await page.waitForTimeout(600);
await page.screenshot({ path: `${SCREENSHOTS}/04-row-hover.png`, fullPage: true });

// 5. Click edit button
const editBtn = firstRow.locator('button[aria-label^="Edit"]').first();
console.log('Edit aria-label:', await editBtn.getAttribute('aria-label'));
await editBtn.click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${SCREENSHOTS}/05-edit-modal.png`, fullPage: true });

// 6. Log pre-filled values
const nameVal = await page.locator('input[placeholder="e.g. Professional"]').inputValue();
const priceVal = await page.locator('input[placeholder="0.00"]').inputValue();
console.log('Pre-filled name:', nameVal);
console.log('Pre-filled price:', priceVal);

// 7. Edit name and save
await page.locator('input[placeholder="e.g. Professional"]').fill(nameVal + ' (Edited)');
await page.screenshot({ path: `${SCREENSHOTS}/06-name-edited.png`, fullPage: true });
await page.getByRole('button', { name: /save changes/i }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SCREENSHOTS}/07-after-save.png`, fullPage: true });

console.log('Screenshots saved to:', SCREENSHOTS);
await browser.close();
