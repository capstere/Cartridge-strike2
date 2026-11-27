import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const has=path=>existsSync(resolve(root,path));
const read=path=>readFileSync(resolve(root,path),'utf8');

test('FPS entrypoints expose only gameplay, not editor navigation',()=>{
 const html=read('fps/index.html');
 assert.match(html,/id="start"/);
 assert.match(html,/id="character-picker"/); // playable local characters stay available
 assert.doesNotMatch(html,/href="[^"]*(?:character-design|furniture-editor|\/studio\/)/i);
 assert.doesNotMatch(read('src/fps/app.mjs'),/href=['"]\.\.\/character-design\//);
 assert.doesNotMatch(read('src/fps/character-selection.mjs'),/Öppna studion|Open the studio/i);
});

test('standalone authoring pages and source trees are absent',()=>{
 for(const path of ['studio/index.html','character-design/index.html',
  'furniture-editor/index.html','furniture-editor/new.html','furniture-editor/level-shell.mjs',
  'fps/walk.html']) assert.equal(has(path),false,path);
});

test('shared level runtime and lobby audio remain available',()=>{
 for(const path of ['index.html','fps/index.html','src/fps/app.mjs','levels/manifest.json',
  'furniture-editor/build/level-project.mjs','furniture-editor/build/project-visuals.mjs',
  'furniture-editor/library/models.mjs','audio/Preparation.mp3'])assert.ok(has(path),path);
 const flow=read('src/fps/match-flow.mjs');
 assert.match(flow,/Preparation\.mp3/);
 assert.match(flow,/music\.stop/);
});

test('mobile orientation refers only to playing the game',()=>{
 const js=read('ui/cs-mobile.mjs');
 assert.match(js,/Rotate your phone/);
 assert.doesNotMatch(js,/charPanelToggle|pinchZoom|Level Studio|Character Studio/);
});

test('normal and early entry, credits and touch controls have English accessible labels',()=>{
 for(const path of ['index.html','fps/index.html','credits.html']) assert.match(read(path),/<html lang="en">/,path);
 assert.match(read('index.html'),/Opening the lobby/);
 assert.match(read('credits.html'),/>Back to game</);
 const html=read('fps/index.html');
 for(const copy of ['aria-label="Main menu"','aria-label="Move with your left thumb"','The game could not start','Choose equipment']) assert.ok(html.includes(copy),copy);
 for(const path of ['index.html','fps/index.html','credits.html','ui/cs-mobile.mjs','fps/hud.css']) {
  assert.doesNotMatch(read(path),/Starta match|Laddar |Vrid telefonen|Köptid|Inställningar|RUSTNING|Öppna spelet/i,path);
 }
});
