import fs from 'node:fs';
import vm from 'node:vm';
import { chromium } from 'playwright';

const part1 = fs.readFileSync('product-variant-audit-part1.js', 'utf8');
const part2 = fs.readFileSync('product-variant-audit-part2.js', 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(part1, sandbox, { filename: 'product-variant-audit-part1.js' });
const part2WithoutEval = part2.replace(/\n?\(0,eval\)\(window\.__FORMA_VARIANT_AUDIT_SOURCE__\);[\s\S]*$/, '\n');
vm.runInContext(part2WithoutEval, sandbox, { filename: 'product-variant-audit-part2.js' });
const joinedSource = sandbox.window.__FORMA_VARIANT_AUDIT_SOURCE__ || '';
console.log('JOINED_SOURCE_LENGTH', joinedSource.length);
try {
  new vm.Script(joinedSource, { filename: 'product-variant-audit-joined.js' });
  console.log('JOINED_SOURCE_PARSE_OK');
} catch (error) {
  console.log('JOINED_SOURCE_PARSE_ERROR', error.stack || error.message);
  const match = String(error.stack || '').match(/product-variant-audit-joined\.js:(\d+)/);
  if (match) {
    const line = Number(match[1]);
    const lines = joinedSource.split('\n');
    const start = Math.max(0, line - 4);
    const end = Math.min(lines.length, line + 3);
    console.log('JOINED_SOURCE_CONTEXT');
    for (let index = start; index < end; index += 1) {
      console.log(`${index + 1}: ${lines[index]}`);
    }
  }
  process.exitCode = 1;
}

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
  await page.waitForTimeout(1800);
  const inline = await page.evaluate(() => [...document.scripts]
    .map((script, index) => ({ script, index }))
    .filter(({ script }) => !script.src && script.textContent.trim())
    .map(({ script, index }) => {
      try {
        new Function(script.textContent);
        return null;
      } catch (error) {
        return { index, error: error.message, length: script.textContent.length };
      }
    })
    .filter(Boolean));
  console.log('INLINE_DIAGNOSTIC', JSON.stringify(inline));
  if (pageErrors.length || inline.length) process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
