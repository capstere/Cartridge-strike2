// Exercise a locally saved Character Studio pilot without publishing its GLB.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const origin = process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
const file = process.env.FPS_CHARACTER_GLB, rig = process.env.FPS_CHARACTER_RIG;
if (!file || !rig) throw Error('Set FPS_CHARACTER_GLB and FPS_CHARACTER_RIG to the Studio export and its original rig.');
const sourceHash = createHash('sha256').update(await readFile(rig)).digest('hex');

function inspectAppearance() {
  const fps = window.__fps, game = fps.game, player = game.player, renderer = fps.renderer;
  fps.render();
  const model = renderer.actorModel(player), avatar = model.userData.avatar;
  const teammate = game.actors.find(a=>a.id!==player.id && a.team===player.team);
  const view = renderer.weaponModel.userData.characterAppearance;
  const hands = view?.targets.filter(t=>t.role==='hand') || [];
  const sleeves = view?.targets.filter(t=>t.role.includes('sleeve')) || [];
  const matches = hands.length>0 && sleeves.length>0 &&
    hands.every(t=>t.mesh.material===view.profile.glove) && sleeves.every(t=>t.mesh.material===view.profile.sleeve);
  const exportedGlove = avatar?.meshes.flatMap(mesh=>[mesh.material].flat()).find(m=>m.name==='gloves-leather');
  const gloveColorMatches = !!exportedGlove && exportedGlove.color.equals(view?.profile?.glove.color);

  // Observe the selected player's mesh from a nearby walkable position. The
  // spectator renderer uses a view actor, so this does not move either actor.
  let spot;
  for (let i=0;i<24;i++) {
    const candidate = {x:player.x+1.05*Math.sin(i*Math.PI/12),z:player.z+1.05*Math.cos(i*Math.PI/12)};
    if (fps.world.canOccupy(candidate.x,candidate.z,.2,1.7) &&
      fps.world.segmentClear({...candidate,y:1.3},{x:player.x,y:1,z:player.z},{vision:false})) {
      spot = candidate;
      break;
    }
  }
  if (!spot) throw Error('No third-person sightline');
  const camera = {...teammate,...spot,y:0,yaw:Math.atan2(spot.x-player.x,spot.z-player.z),pitch:-.35};
  let drawn = 0;
  const restores = [];
  model.traverse(node=>{
    if (!node.isSkinnedMesh) return;
    const previous = node.onBeforeRender;
    restores.push(()=>{node.onBeforeRender=previous;});
    node.onBeforeRender = function(...args) {drawn++;return previous.apply(this,args);};
  });
  try {
    renderer.render(game,camera,1/60);
  } finally {
    for (const restore of restores) restore();
    fps.render();
  }
  return {
    team:player.team, drawn, hands:hands.length, sleeves:sleeves.length, matches, gloveColorMatches,
    thirdPerson:!!avatar?.privateDesign && !!avatar.root.getObjectByName('boot-sole-l') && !!avatar.root.getObjectByName('boot-sole-r'),
    otherOriginal:!renderer.actorModel(teammate).userData.avatar?.privateDesign,
  };
}

const browser = await chromium.launch({channel:'chromium'});
try {
  const page = await browser.newPage({viewport:{width:1100,height:700}});
  const errors = [], writes = [];
  page.setDefaultTimeout(90000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const method = route.request().method();
    if (['GET','HEAD','OPTIONS'].includes(method)) return route.continue();
    writes.push(method);
    return route.abort();
  });
  await page.goto(origin+'/fps/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
    const input = document.createElement('input');
    input.type='file';input.id='local-audit-file';document.body.append(input);
  });
  await page.locator('#local-audit-file').setInputFiles(file);
  const {good,bad} = await page.evaluate(async hash=>{
    const {savePrivateCharacter} = await import(new URL('../src/fps/private-character-store.mjs',location.href));
    const bytes = await document.getElementById('local-audit-file').files[0].arrayBuffer();
    return {
      good:await savePrivateCharacter({bytes,name:'Saved Studio operator',sourceHash:hash}),
      bad:await savePrivateCharacter({bytes,name:'Prior rig revision',sourceHash:'0'.repeat(64)}),
    };
  }, sourceHash);
  const picker = page.locator('#player-character'), start = page.locator('#start');
  const ready = () => page.waitForFunction(()=>window.__fps && document.querySelector('#loading').hidden);
  async function select(id) {
    await picker.selectOption(id);
    await page.waitForURL(url=>(url.searchParams.get('avatar') || '')===id,{waitUntil:'commit'});
  }
  async function match() {
    await page.waitForFunction(()=>window.__fps?.game.player && !document.querySelector('#hud').hidden && document.querySelector('#cs-loading').hidden);
    if (await page.locator('#resume').isVisible()) await page.locator('#resume').click();
    await page.waitForFunction(()=>__fps.modal===null && !__fps.game.state.paused);
  }
  async function back() {
    await page.keyboard.press('Escape');
    await page.locator('#restart').click();
    await page.locator('#menu').waitFor({state:'visible'});
  }
  async function appearance(team) {
    const result = await page.evaluate(inspectAppearance);
    assert.equal(result.team,team);
    assert.ok(result.thirdPerson && result.drawn>0 && result.matches && result.gloveColorMatches && result.otherOriginal,JSON.stringify(result));
    return result;
  }
  await page.goto(origin+'/fps/?test&seed=42',{waitUntil:'domcontentloaded'});
  await ready();
  await page.locator('.team-option[data-team=counterAnalysts]').click();

  // Keep rig validation in flight until the visible loading screen is cancelled.
  const rigRequest = '**/assets/fps/models/quaternius-operator-male.glb*';
  let release;
  const gate = new Promise(resolve=>{release=resolve;});
  await page.route(rigRequest,async route=>{
    await gate;
    await route.continue();
  },{times:1});
  await Promise.all([page.waitForRequest(rigRequest),select(good)]);
  await start.click();
  await page.locator('#csl-cancel').click();
  assert.ok(await page.locator('#cs-loading').isHidden());
  release();
  await ready();
  assert.equal(await picker.inputValue(),good);
  assert.match(await page.locator('#character-status').innerText(),/Saved Studio operator/);

  // A single controlled HTTP failure allows the normal Retry path to complete.
  await page.route('**/levels/floor5-prepared.json*',route=>route.fulfill({status:503,body:'temporarily unavailable'}),{times:1});
  await page.reload({waitUntil:'domcontentloaded'});
  await start.click();
  await page.locator('#csl-retry').click();
  await match();
  const first = await appearance('counterAnalysts');
  await back();
  await page.locator('.team-option[data-team=analysts]').click();
  await start.click();
  await match();
  const replay = await appearance('analysts');
  await back();

  await select(bad);
  await ready();
  assert.match(await page.locator('#character-status').innerText(),/Originalkaraktär/);
  assert.ok(await start.isDisabled());
  await select('');
  await ready();
  assert.ok(await start.isEnabled());
  await start.click();
  await match();
  assert.equal(await page.evaluate(()=>!!__fps.renderer.actorModel(__fps.game.player).userData.avatar?.privateDesign),false);
  await back();
  await page.goto(origin+'/fps/?test',{waitUntil:'domcontentloaded'});
  await ready();
  assert.equal(await picker.inputValue(),'');
  assert.ok(await picker.locator('option').count()>=3);
  assert.deepEqual(writes,[]);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',first,replay,cancel:true,retry:true,incompatibleRecovery:true,writeRequests:writes.length}));
} finally {await browser.close();}
