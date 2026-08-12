import { chromium } from 'playwright';

const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const pageErrors = [];

page.on('pageerror', error => {
  const item = { name: error.name, message: error.message, stack: error.stack || '' };
  pageErrors.push(item);
  console.log('PAGEERROR', JSON.stringify(item));
});
page.on('console', message => {
  if (message.type() === 'error') console.log('CONSOLE_ERROR', message.text());
});

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(2500);
  const diagnostic = await page.evaluate(() => {
    const inline = [...document.scripts]
      .map((script, index) => ({ script, index }))
      .filter(({ script }) => !script.src && script.textContent.trim())
      .map(({ script, index }) => {
        try {
          new Function(script.textContent);
          return null;
        } catch (error) {
          return {
            index,
            error: error.message,
            length: script.textContent.length,
            head: script.textContent.slice(0, 1000),
            tail: script.textContent.slice(-1000)
          };
        }
      })
      .filter(Boolean);
    return {
      inline,
      scriptCount: document.scripts.length,
      srcScripts: [...document.scripts].filter(script => script.src).map(script => script.src)
    };
  });
  console.log('INLINE_DIAGNOSTIC', JSON.stringify(diagnostic.inline, null, 2));
  console.log('SCRIPT_COUNT', diagnostic.scriptCount);
  console.log('SRC_SCRIPTS', JSON.stringify(diagnostic.srcScripts));
  if (pageErrors.length || diagnostic.inline.length) process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
