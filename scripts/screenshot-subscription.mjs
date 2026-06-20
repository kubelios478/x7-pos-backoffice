import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MOCK_USER = {
  id: 1,
  email: 'admin@x7pos.com',
  role: 'super_admin',
  scope: 'platform',
  merchant: { id: 1 },
  planId: 1,
  authorizedFeatureIds: [1, 2, 3],
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// Inject auth before navigation
await context.addInitScript(({ user }) => {
  localStorage.setItem('x7_access_token', 'mock-token-for-screenshot');
  localStorage.setItem('x7_user', JSON.stringify(user));
}, { user: MOCK_USER });

const page = await context.newPage();

// Navigate directly to saas-admin
await page.goto('http://localhost:5173/saas-admin', { waitUntil: 'networkidle' });

console.log('Current URL:', page.url());

// Take screenshot of the saas dashboard (overview)
const overviewPath = join(__dirname, 'screenshot-saas-overview.png');
await page.screenshot({ path: overviewPath, fullPage: false });
console.log('SaaS overview screenshot:', overviewPath);

// Click Subscription Plans in the sidebar
const subLink = page.getByText('Subscription Plans');
if (await subLink.isVisible().catch(() => false)) {
  await subLink.click();
  await page.waitForTimeout(1500); // wait for mock 600ms delay + render
  const subPath = join(__dirname, 'screenshot-subscription-plans.png');
  await page.screenshot({ path: subPath, fullPage: true });
  console.log('Subscription Plans screenshot:', subPath);
} else {
  console.log('Subscription Plans link not found — checking sidebar...');
  const bodyText = await page.locator('body').innerText();
  console.log('Page content:', bodyText.slice(0, 500));
}

await browser.close();
