const { test, expect } = require('@playwright/test');

const KATINA_NAME = /Катина\/Katina/i;

async function waitForCatalog(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#productGrid .product-card').first()).toBeVisible();
}

test('catalog loads and stays inside the viewport', async ({ page }) => {
  await waitForCatalog(page);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    cards: document.querySelectorAll('#productGrid .product-card').length
  }));
  expect(metrics.cards).toBeGreaterThan(0);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 2);
});

test('shared Katina cart restores exact item, quantity and total', async ({ page }) => {
  await page.goto('/#view=cart&cart=1616.1', { waitUntil: 'domcontentloaded' });
  const dialog = page.locator('#cartDialog');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(dialog).toContainText(KATINA_NAME);
  await expect(dialog).toContainText(/арт\.\s*1616/i);
  await expect(dialog.locator('.qty span')).toHaveText('1');
  await expect(dialog.locator('.cart-total')).toContainText(/2\s*500\s*₽/);
});

test('shared multi-item cart restores quantities and total', async ({ page }) => {
  await page.goto('/#view=cart&cart=1616.2~1617.1', { waitUntil: 'domcontentloaded' });
  const dialog = page.locator('#cartDialog');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(dialog).toContainText(KATINA_NAME);
  await expect(dialog).toContainText(/Буфамела\/Bufamela/i);
  await expect(dialog.locator('.cart-total')).toContainText(/9\s*100\s*₽/);
  const katina = dialog.locator('.cart-item[data-source="1616"]');
  const bufamela = dialog.locator('.cart-item[data-source="1617"]');
  await expect(katina.locator('.qty span')).toHaveText('2');
  await expect(bufamela.locator('.qty span')).toHaveText('1');
});

test('legacy comma-separated shared cart still restores', async ({ page }) => {
  await page.goto('/#view=cart&cart=1616.1,1617.1', { waitUntil: 'domcontentloaded' });
  const dialog = page.locator('#cartDialog');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(dialog.locator('.cart-item[data-source="1616"]')).toBeVisible();
  await expect(dialog.locator('.cart-item[data-source="1617"]')).toBeVisible();
});

test('missing product in a shared cart does not erase valid products', async ({ page }) => {
  await page.goto('/#view=cart&cart=1616.1~999999.1', { waitUntil: 'domcontentloaded' });
  const dialog = page.locator('#cartDialog');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(dialog).toContainText(KATINA_NAME);
  await expect(dialog.locator('.shared-cart-warning')).toContainText(/999999/);
});

test('checkout links keep the shareable cart URL and preserve readable line breaks', async ({ page }) => {
  await page.goto('/#view=cart&cart=1616.1', { waitUntil: 'domcontentloaded' });
  const footer = page.locator('#cartFooter');
  await expect(footer).toBeVisible();
  const emailHref = await footer.locator('a[href^="mailto:"]').getAttribute('href');
  const telegramHref = await footer.locator('a[href^="https://t.me/"]').getAttribute('href');
  const whatsappHref = await footer.locator('a[href^="https://wa.me/"]').getAttribute('href');
  for (const href of [emailHref, telegramHref, whatsappHref]) {
    expect(href).toBeTruthy();
    expect(decodeURIComponent(href)).toContain('cart=1616.1');
  }
  const decodedEmail = decodeURIComponent(emailHref);
  expect(decodedEmail).toMatch(/FORMA HOME:\n•/);
  expect(decodedEmail).toMatch(/Итого:[^\n]+\n\nОкончательное наличие/);
  expect(decodedEmail).toMatch(/Ссылка на собранную корзину:\nhttps?:/);
});

test('shared cart survives a reload', async ({ page }) => {
  await page.goto('/#view=cart&cart=1616.1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#cartDialog')).toHaveAttribute('open', '');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#cartDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#cartDialog')).toContainText(KATINA_NAME);
});

test('cart closes with Escape and restores page scrolling', async ({ page }) => {
  await page.goto('/#view=cart&cart=1616.1', { waitUntil: 'domcontentloaded' });
  const dialog = page.locator('#cartDialog');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toHaveAttribute('open', '');
  const inlineOverflow = await page.locator('body').evaluate(body => body.style.overflow);
  expect(inlineOverflow).toBe('');
});

test('service worker becomes ready on supported browsers', async ({ page, browserName }) => {
  await waitForCatalog(page);
  const supported = await page.evaluate(() => 'serviceWorker' in navigator);
  if (!supported) test.skip(true, `${browserName} has no service worker support in this runtime`);
  const ready = await page.evaluate(async () => {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise(resolve => setTimeout(() => resolve(null), 8000))
    ]);
    return Boolean(registration);
  });
  expect(ready).toBe(true);
});

test('product dialog opens and cart can be changed with pointer/touch clicks', async ({ page }) => {
  await waitForCatalog(page);
  const openControl = page.locator('#productGrid .product-card [data-open]').first();
  await expect(openControl).toBeVisible();
  await openControl.click();
  await expect(page.locator('#productDialog')).toHaveAttribute('open', '');
  const add = page.locator('#productDialog [data-add]').first();
  await expect(add).toBeVisible();
  await add.click();
  await expect(page.locator('#cartCount')).not.toHaveText('0');
});
