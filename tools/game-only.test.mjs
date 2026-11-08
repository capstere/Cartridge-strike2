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
 assert.doesNotMatch(read('src/fps/character-selection.mjs'),/Öppna studion/);
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
 assert.match(js,/Vrid telefonen/);
 assert.doesNotMatch(js,/charPanelToggle|pinchZoom|Level Studio|Character Studio/);
});
