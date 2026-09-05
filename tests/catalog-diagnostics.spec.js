const { test, expect } = require('@playwright/test');

test('catalog bootstrap diagnostics', async ({ page, browserName }, testInfo) => {
  const messages = [];
  const failures = [];
  const responses = [];

  page.on('console', msg => messages.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', error => messages.push(`pageerror: ${error.stack || error.message}`));
  page.on('requestfailed', request => failures.push(`${request.url()} :: ${request.failure()?.errorText || 'unknown'}`));
  page.on('response', response => {
    if (/catalog-index\.json|category-assignments\.json|app\.js|cart-feedback\.js/.test(response.url())) {
      responses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const snapshot = await page.evaluate(() => ({
    href: location.href,
    gridText: document.querySelector('#productGrid')?.textContent?.trim().slice(0, 180) || '',
    resultText: document.querySelector('#resultCount')?.textContent?.trim() || '',
    emptyHidden: document.querySelector('#emptyState')?.hidden,
    productCards: document.querySelectorAll('#productGrid .product-card').length,
    hasState: typeof state !== 'undefined',
    productCount: typeof state !== 'undefined' ? state.products.length : null,
    serviceWorker: 'serviceWorker' in navigator
  }));

  console.log(`[diag:${testInfo.project.name}:${browserName}] responses=${JSON.stringify(responses)}`);
  console.log(`[diag:${testInfo.project.name}:${browserName}] requestFailures=${JSON.stringify(failures)}`);
  console.log(`[diag:${testInfo.project.name}:${browserName}] messages=${JSON.stringify(messages)}`);
  console.log(`[diag:${testInfo.project.name}:${browserName}] snapshot=${JSON.stringify(snapshot)}`);

  expect(snapshot.productCards, `catalog bootstrap failed; messages=${messages.join(' | ')}; failures=${failures.join(' | ')}; responses=${responses.join(' | ')}`).toBeGreaterThan(0);
});
