// Exercise the recovery redirects from the real project subpath with one browser profile.
import assert from 'node:assert/strict';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const base = 'http://127.0.0.1:8914/Cartridge-strike2/';
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH, headless:true});
try {
  const page = await browser.newPage();
  await page.goto(base+'credits.html?recover=credits#member');
  await page.waitForURL(base+'cs2-recovery/credits.html?recover=credits#member');
  await page.evaluate(()=>localStorage.setItem('cs2-pages-restore-check','kept'));
  await page.goto(base+'fps/?recover=play#member');
  await page.waitForURL(base+'cs2-recovery/fps/?recover=play#member');
  await page.locator('#start').waitFor({state:'attached'});
  const result = await page.evaluate(async()=>({
    contract:(await import('../shared/multiplayer/build.mjs')).CONTRACT,
    saved:localStorage.getItem('cs2-pages-restore-check')
  }));
  assert.equal(result.contract.protocolVersion,14);
  assert.equal(result.contract.buildHash,'30f8f4af97b2b082f995196f06f498b132ba9bf8d303671ee8ab8d4b69590385');
  assert.equal(result.saved,'kept');
  await page.goto(base+'?recover=home#member');
  await page.waitForURL(base+'cs2-recovery/fps/?recover=home#member');
  console.log('CS2 home, game and credits recovered under the Pages project path. Query, fragment, build and local storage verified.');
} finally { await browser.close(); }
