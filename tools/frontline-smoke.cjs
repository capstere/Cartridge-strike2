#!/usr/bin/env node
// Browser smoke test for the licensed standalone Frontline edition.
// Run after: npm ci --prefix frontline/source/tools/dev
//            node frontline/source/tools/dev/node_modules/playwright-core/cli.js install chromium
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(__dirname, '../frontline/source/tools/dev/node_modules/playwright-core'));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      bypassCSP: true,
    });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    const url = 'file://' + path.resolve(__dirname, '../frontline/index.html');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => typeof MATCH !== 'undefined' && MATCH.state === 'menu',
      null, { timeout: 90000, polling: 500 });
    const ready = await page.evaluate(() => ({
      title: document.title,
      state: MATCH.state,
      map: Settings.map,
      loaded: !!document.querySelector('#ui'),
      canvas: !!document.querySelector('canvas'),
    }));
    assert.match(ready.title, /Cartridge Strike/i);
    assert.equal(ready.state, 'menu');
    assert.equal(ready.loaded, true);
    assert.equal(ready.canvas, true);
    assert.equal(errors.length, 0, 'Unhandled browser errors: ' + errors.join(' | '));
    console.log('Frontline actual browser boot passed:', JSON.stringify(ready));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
