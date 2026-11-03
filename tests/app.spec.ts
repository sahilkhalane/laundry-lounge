import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

async function createTwoPieceOrder(page: Page) {
  await page.getByRole('button', { name: 'New order', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Create an order' });
  await form.getByRole('combobox', { name: 'Customer', exact: true }).selectOption('c-1');
  await form.getByRole('button', { name: 'Continue' }).click();
  await form.getByLabel('Item 1 quantity').fill('2');
  await form.getByLabel('Item 1 rate').fill('60');
  await form.getByRole('button', { name: 'Continue' }).click();
  await form.getByLabel('Discount (₹)').fill('10');
  await form.getByLabel('Payment received (₹)').fill('20');
  await form.getByRole('button', { name: 'Create order & bill' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: /LL-1049/ })).toBeVisible();
}

async function persisted(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('laundry-lounge-v1') || 'null'));
}

async function openSettings(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: 'Settings', exact: true }).click();
}

test('creates a calculated bill, prints unique garment QR tags, records payment and persists after reload', async ({ page }) => {
  const uncaught: string[] = [];
  page.on('pageerror', error => uncaught.push(error.message));
  await createTwoPieceOrder(page);
  let detail = page.getByRole('dialog');
  await expect(detail.locator('.summary-total')).toContainText('₹110');
  await expect(detail.locator('.price-summary > div').last()).toContainText('₹90');
  await detail.getByRole('button', { name: 'Print bill', exact: true }).click();
  const bill = page.getByRole('dialog', { name: 'Bill preview' });
  await expect(bill.locator('.receipt')).toContainText('LL-1049');
  await expect(bill.locator('.receipt')).not.toContainText('Invalid Date');
  await expect(bill.locator('.receipt-totals .summary-total')).toContainText('₹110');
  await page.evaluate(() => { window.print = () => { document.body.dataset.printCalled = 'yes'; }; });
  await bill.getByRole('button', { name: 'Print bill', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-print-called', 'yes');
  await bill.getByRole('button', { name: 'Close print preview' }).click();
  detail = page.getByRole('dialog');
  await detail.getByRole('button', { name: 'Print tags', exact: true }).click();
  const tags = page.getByRole('dialog', { name: 'Garment tags' });
  await expect(tags.locator('.garment-tag')).toHaveCount(2);
  await expect(tags.getByRole('img', { name: 'QR code for LL-1049-1-1' })).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(tags.getByRole('img', { name: 'QR code for LL-1049-1-2' })).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(tags.getByRole('button', { name: 'Print tags', exact: true })).toBeEnabled();
  await tags.getByRole('button', { name: 'Close print preview' }).click();
  detail = page.getByRole('dialog');
  await detail.getByLabel('Record payment (₹)').fill('90');
  await detail.getByRole('button', { name: 'Add payment', exact: true }).click();
  await expect(detail.getByLabel('Record payment (₹)')).toHaveCount(0);
  expect((await persisted(page)).orders.find((order: { id: string }) => order.id === 'LL-1049').paid).toBe(110);
  await page.reload();
  await page.getByRole('button', { name: 'View order LL-1049', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.price-summary > div').last()).toContainText('₹0');
  expect(uncaught).toEqual([]);
});

test('manual tag scanning advances only the selected garment and aggregates the order status', async ({ page }) => {
  await createTwoPieceOrder(page);
  await page.getByRole('button', { name: 'Close order', exact: true }).click();
  await page.getByRole('button', { name: 'Scan tag', exact: true }).click();
  const scanner = page.getByRole('dialog', { name: 'Scan a garment tag' });
  const input = scanner.getByLabel('Or enter the printed tag number');
  await input.fill('laundry-lounge:LL-1049-1-1');
  await scanner.getByRole('button', { name: 'Find garment' }).click();
  await expect(scanner.locator('.scanner-result')).toContainText('Aarav Sharma');
  await scanner.getByLabel('Update garment status').selectOption('Processing');
  await scanner.getByRole('button', { name: 'Save garment status' }).click();
  await expect(scanner.getByRole('status')).toContainText('marked processing');
  let order = (await persisted(page)).orders.find((entry: { id: string }) => entry.id === 'LL-1049');
  expect(order.status).toBe('Received');
  expect(order.tagStatuses['LL-1049-1-1']).toBe('Processing');
  expect(order.tagStatuses['LL-1049-1-2']).toBe('Received');
  await input.fill('LL-1049-1-2');
  await scanner.getByRole('button', { name: 'Find garment' }).click();
  await scanner.getByLabel('Update garment status').selectOption('Processing');
  await scanner.getByRole('button', { name: 'Save garment status' }).click();
  order = (await persisted(page)).orders.find((entry: { id: string }) => entry.id === 'LL-1049');
  expect(order.status).toBe('Processing');
  await input.fill('LL-9999-1-1');
  await scanner.getByRole('button', { name: 'Find garment' }).click();
  await expect(scanner.getByRole('alert')).toContainText('No garment matches');
});

test('adds and edits a customer and searches the persisted directory', async ({ page }) => {
  await page.locator('.sidebar').getByRole('button', { name: 'Customers', exact: true }).click();
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Add a customer' });
  await dialog.getByLabel('Full name').fill('Test Customer');
  await dialog.getByLabel('Phone number').fill('9123456789');
  await dialog.getByLabel('Email').fill('customer@example.org');
  await dialog.getByRole('button', { name: 'Save customer' }).click();
  await page.getByLabel('Search customers').fill('9123456789');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Edit Test Customer', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit customer' });
  await dialog.getByLabel('Full name').fill('Test Customer Updated');
  await dialog.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.locator('.data-table tbody')).toContainText('Test Customer Updated');
  expect((await persisted(page)).customers.filter((customer: { phone: string }) => customer.phone === '9123456789')).toHaveLength(1);
});

test('records an expense and excludes it outside the report date range', async ({ page }) => {
  await page.locator('.sidebar').getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Record an expense' });
  await dialog.getByLabel('Description').fill('E2E detergent');
  await dialog.getByLabel('Amount (₹)').fill('123.45');
  await dialog.getByLabel('Date', { exact: true }).fill('2024-01-15');
  await dialog.getByRole('button', { name: 'Save expense' }).click();
  await page.getByLabel('Search expenses').fill('E2E detergent');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.data-table tbody')).toContainText('₹123.45');
  await expect(page.locator('.data-table tbody')).not.toContainText('Invalid Date');
  await page.locator('.sidebar').getByRole('button', { name: 'Reports', exact: true }).click();
  await page.getByLabel('Report start date').fill('2024-01-01');
  await page.getByLabel('Report end date').fill('2024-01-31');
  const expenseStat = page.locator('.stat-grid .stat-card').filter({ hasText: 'recorded expenses' });
  await expect(expenseStat).toContainText('₹123.45');
  await page.getByLabel('Report start date').fill('2024-02-01');
  await page.getByLabel('Report end date').fill('2024-02-29');
  await expect(expenseStat).toContainText('₹0');
  await page.getByLabel('Report start date').fill('2024-03-01');
  await expect(page.getByRole('alert')).toContainText('end date on or after');
});

test('invalid backups keep records and clearing requires explicit confirmation', async ({ page }) => {
  await createTwoPieceOrder(page);
  await page.getByRole('button', { name: 'Close order', exact: true }).click();
  const before = await persisted(page);
  await openSettings(page);
  await page.getByLabel('Restore backup file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"orders":[]}') });
  await expect(page.getByRole('alert')).toContainText('not a valid Laundry Lounge backup');
  expect(await persisted(page)).toEqual(before);
  await page.getByRole('button', { name: 'Clear workspace data' }).click();
  expect((await persisted(page)).orders).toHaveLength(13);
  await page.getByRole('button', { name: 'Keep my data' }).click();
  expect((await persisted(page)).orders).toHaveLength(13);
  await page.getByRole('button', { name: 'Clear workspace data' }).click();
  await page.getByRole('button', { name: 'Clear all records', exact: true }).click();
  const after = await persisted(page);
  expect(after.orders).toEqual([]);
  expect(after.customers).toEqual([]);
  expect(after.expenses).toEqual([]);
  expect(after.settings).toEqual(before.settings);
  await page.reload();
  await expect(page.getByText('No orders here yet', { exact: true })).toBeVisible();
});

test('mobile navigation and order creation fit a phone without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/laundry-mobile.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.locator('.mobile-bottom-nav').getByRole('button', { name: 'Customers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
  await page.locator('.mobile-bottom-nav').getByRole('button', { name: 'Orders', exact: true }).click();
  await page.getByRole('button', { name: 'New order', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Create an order' });
  await modal.getByRole('button', { name: 'Continue' }).click();
  await expect(modal.getByLabel('Item 1 quantity')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  const box = await modal.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

test('corrupt saved data is preserved until a valid backup is explicitly restored', async ({ page }) => {
  await createTwoPieceOrder(page);
  await page.getByRole('button', { name: 'Close order', exact: true }).click();
  const backup = await persisted(page);
  const original = '{"broken":"original customer data"';
  await page.evaluate(value => localStorage.setItem('laundry-lounge-v1', value), original);
  await page.reload();
  await expect(page.locator('.storage-error')).toContainText('original data has been preserved');
  await page.getByRole('button', { name: 'Open recovery settings', exact: true }).click();
  await expect(page.locator('.storage-error')).toBeVisible();
  await page.getByLabel('Business name', { exact: true }).fill('Should not overwrite');
  await page.getByRole('button', { name: 'Save business details', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Restore a valid backup');
  expect(await page.evaluate(() => localStorage.getItem('laundry-lounge-v1'))).toBe(original);
  await page.getByLabel('Restore backup file').setInputFiles({ name: 'valid-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByRole('heading', { name: 'Replace the data on this device?', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('laundry-lounge-v1'))).toBe(original);
  await page.getByRole('button', { name: 'Replace and restore', exact: true }).click();
  await expect(page.locator('.storage-error')).toHaveCount(0);
  expect(await persisted(page)).toEqual(backup);
  await expect(page.getByLabel('Business name', { exact: true })).toHaveValue('Laundry Lounge');
});
