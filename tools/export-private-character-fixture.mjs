// Generate a compatible private-character regression fixture.
// This exercises the loader contract; it is not a Character Studio UI export.
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {writeFile} from 'node:fs/promises';
import {exportPrivateFixtureBytes} from './appearance-export-fixture.mjs';
const browser=await chromium.launch({channel:'chromium',args:process.platform==='darwin'?['--use-angle=metal']:[]});
try{
 const p=await browser.newPage();p.setDefaultTimeout(120000);p.on('pageerror',e=>console.log('pageerror',e.message));await p.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low'})));await p.goto((process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765')+'/fps/?test&network=local');await p.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden);if(!await p.evaluate(()=>!!window.__fps))throw Error(await p.locator('#fatal').textContent());
 const bytes=await p.evaluate(exportPrivateFixtureBytes);await writeFile(process.env.FPS_CHARACTER_OUT||'/tmp/cs2-compatible-private.glb',Buffer.from(bytes));console.log('exported',bytes.length);
}finally{await browser.close();}
