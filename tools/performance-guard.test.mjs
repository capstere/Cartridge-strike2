import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONFIG} from '../src/fps/config.mjs';
import {DEPTH_STYLE} from '../src/fps/visual-depth.mjs';

test('simulation keeps 60 Hz fixed step with maximum 50 ms catchup',()=>{
 assert.equal(CONFIG.fixedStep,1/60);
 assert.equal(CONFIG.maxCatchUp,.05);
 const app=readFileSync('src/fps/app.mjs','utf8');
 assert.ok(app.includes('Math.min(.05,(now-lastFrame)/1000)'));
});
test('non Floor 5 depth shader has consistent 8-tap AO and up to two samples',()=>{
 assert.equal(DEPTH_STYLE.samples,8);
 const text=readFileSync('src/fps/visual-depth.mjs','utf8');
 assert.ok(text.includes('for(int i=0;i<8;i++)'));
 assert.ok(text.includes('strength*sum/8.0'));
 assert.ok(text.includes('samples:Math.min(2,renderer.capabilities.maxSamples||0)'));
});
test('resolution controller excludes inactive/paused frames',()=>{
 const file=readFileSync('src/fps/render-engine.mjs','utf8');
 assert.ok(file.includes("s.phase==='active'&&!s.paused"));
 assert.ok(file.includes('this.adaptiveResolution.arm(t)'));
});
