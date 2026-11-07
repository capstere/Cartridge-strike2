import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const info=JSON.parse(readFileSync('build-info.json','utf8'));
assert.equal(info.gameVersion,'0.18.0');
const names=new Set();
for(const f of info.files){
 assert(!names.has(f.path));names.add(f.path);
 assert(!/^(references|reviews|tools|tests|asset-portfolio|\.git)\//.test(f.path));
 assert(!/\.(pdf|b64|zip|blend)$/i.test(f.path));
 const bytes=readFileSync(f.path);
 assert.equal(bytes.length,f.bytes,f.path+' size');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256,f.path+' SHA256');
}
for(const p of ['src/fps/mobile-controls.mjs','src/fps/grenade-physics.mjs','src/fps/focus-hud.mjs','src/fps/trajectory-cache.mjs','src/fps/frame-time-window.mjs'])assert(existsSync(p),p);
assert.equal(info.ownerLayout.wallSpans,339);
assert.equal(info.ownerLayout.doorLeaves,65);
console.log(JSON.stringify({status:'PASS',runtimeFiles:names.size,version:info.gameVersion,originalsIncluded:false}));
