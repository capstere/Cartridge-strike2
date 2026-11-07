/** Real menu selection; uses the studio-exported GLB from the preceding journey. */
import assert from 'node:assert/strict';
export async function verifySavedCharacterMenu(page,origin){
 const uploads=[];const watch=r=>{if(!['GET','HEAD'].includes(r.method()))uploads.push(r.method()+' '+r.url());};page.on('request',watch);
 const ready=async()=>{await page.waitForFunction(()=>window.__fps,null,{timeout:240000,polling:100});assert(await page.locator('#fatal').isHidden());};
 const choose=async id=>{await Promise.all([page.waitForURL(u=>u.searchParams.get('avatar')===id),page.locator('#player-character').selectOption(id)]);await ready();};
 await page.goto(origin+'/fps/?test=1');await ready();
 const saved=await page.evaluate(async()=>{const s=await import('../src/fps/private-character-store.mjs');const rows=await s.listPrivateCharacters();return {rows,sha:(await s.loadPrivateCharacter(rows[0].id)).sha256};});
 assert.equal(saved.rows.length,1,'Save for game and rehearsal update the same project copy');
 const id=saved.rows[0].id;assert.equal(await page.locator('#player-character').inputValue(),'');
 await page.locator('#seed').fill('77');await choose(id);assert(await page.locator('#start').isEnabled());assert.equal(await page.locator('#seed').inputValue(),'77');
 assert.match(await page.locator('#character-status').innerText(),/Händerna matchar/);
 assert(await page.evaluate(()=>document.getElementById('player-character').getBoundingClientRect().width>=document.getElementById('character-picker').clientWidth*.95));
 await page.screenshot({path:'test-results/private-character/menu-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('#player-character').scrollIntoViewIfNeeded();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:'test-results/private-character/menu-narrow.png'});await page.setViewportSize({width:1280,height:900});
 await page.locator('#start').click();
 const check=async team=>page.evaluate(async team=>{
  const r=__fps.renderer,g=__fps.game,{privateCharacterAppearance}=await import('../src/fps/character-library.mjs?v=6.1.2');__fps.render();
  if(g.team!==team)throw Error('Wrong team');const rows=g.actors.map(a=>({id:a.id,custom:!!r.actors.get(a.id).userData.avatar.privateDesign}));
  if(rows.filter(a=>a.custom).length!==1||!rows.find(a=>a.id===g.player.id).custom)throw Error('Appearance leaked to a bot or previous team');
  const me=r.actors.get(g.player.id).userData.avatar;if(me.bones.size!==65||me.clips.size!==13)throw Error('Rig/animations missing');
  if(r.weaponModel.userData.characterAppearance?.profile!==privateCharacterAppearance(g.player.id))throw Error('Hands do not follow the selected player');
  const proof=[];me.root.traverse(o=>{if(o.isMesh)proof.push({name:o.name,attributes:['position','uv','skinIndex','skinWeight'].map(k=>Array.from(o.geometry.attributes[k]?.array||[])),bind:o.bindMatrix?.elements,bones:o.skeleton?.bones.map(b=>[b.name,b.parent?.name]),inverses:o.skeleton?.boneInverses.map(m=>m.elements)});});
  const clips=[...me.clips].map(([name,c])=>({name,duration:c.duration,tracks:c.tracks.map(t=>({name:t.name,times:Array.from(t.times),values:Array.from(t.values)}))}));
  const bytes=new TextEncoder().encode(JSON.stringify({proof,clips}));const rigDataHash=await (await import('../src/fps/private-character-store.mjs')).characterHash(bytes.buffer);
  return {team,bones:me.bones.size,clips:me.clips.size,rigDataHash,customActors:rows.filter(a=>a.custom).map(a=>a.id)};
 },team);
 const analysts=await check('analysts');console.log('MENU_ANALYSTS_OK');
 const classic=await page.evaluate(()=>{const g=__fps.game,r=__fps.renderer;g.state.phase='active';g.player.spawnProtectedUntil=0;g.damage(g.player,10000,g.actors.find(a=>a.team!==g.team),'p9');__fps.render();
  if(g.player.alive||r.weaponModel.userData.characterAppearance?.profile)throw Error('Spectator inherited private hands');
  g.beginRound();__fps.render();return g.player.alive&&r.actors.get(g.player.id).userData.avatar.privateDesign;
 });assert(classic);await check('analysts');
 await page.evaluate(()=>__fps.newMatch());await page.locator('[data-team="counterAnalysts"]').click();await page.locator('#game-mode').selectOption('endless');await page.locator('#start').click();
 const counter=await check('counterAnalysts');assert.equal(counter.rigDataHash,analysts.rigDataHash,'Geometry/UV/weights/binds/clips survive team changes');console.log('MENU_COUNTER_OK');
 const respawn=await page.evaluate(()=>{const g=__fps.game;g.state.phase='active';for(const a of g.actors)a.bot=null;g.player.spawnProtectedUntil=0;g.damage(g.player,10000,g.actors.find(a=>a.team!==g.team),'p9');if(g.player.alive)throw Error('Death fixture failed');for(let i=0;i<300;i++)g.update(1/60,{});__fps.render();return g.player.alive;});assert(respawn);assert.equal((await check('counterAnalysts')).rigDataHash,counter.rigDataHash,'Rig data survives death and respawn');
 await page.evaluate(()=>{const r=__fps.renderer;r.switchAt=-10;__fps.render();});await page.screenshot({path:'test-results/private-character/menu-counter-match.png'});
 await page.reload();await ready();assert.equal(await page.locator('#player-character').inputValue(),id,'Choice remembered');
 await page.locator('#start').click();await check('analysts'); // URL team from selection; no team locking by character.
 await page.evaluate(()=>__fps.newMatch());await choose('');assert(await page.locator('#start').isEnabled());await page.locator('#start').click();
 assert(await page.evaluate(()=>__fps.game.actors.every(a=>!__fps.renderer.actors.get(a.id).userData.avatar.privateDesign)));
 assert.equal(await page.evaluate(()=>localStorage.getItem('cartridge-selected-character')),null);
 // A damaged saved copy must not silently substitute the original avatar.
 const bad=await page.evaluate(async id=>{const s=await import('../src/fps/private-character-store.mjs'),row=await s.loadPrivateCharacter(id);row.id=crypto.randomUUID();row.sha256='0'.repeat(64);row.name='Skadad testkopia';const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('cartridge-private-characters',s.CHARACTER_DATABASE_VERSION);q.onsuccess=()=>resolve(q.result);q.onerror=reject;});await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(row);tx.oncomplete=resolve;tx.onerror=reject;});db.close();return row.id;},id);
 await page.goto(origin+'/fps/?test=1&avatar='+bad);await ready();assert(await page.locator('#start').isDisabled());assert.match(await page.locator('#character-status').innerText(),/kontrollsumma/);assert(await page.locator('#player-character').isEnabled());
 await choose(id);assert(await page.locator('#start').isEnabled());
 assert.equal(await page.evaluate(async id=>(await (await import('../src/fps/private-character-store.mjs')).loadPrivateCharacter(id)).sha256,id),saved.sha);
 await page.evaluate(async id=>{await (await import('../src/fps/private-character-store.mjs')).deletePrivateCharacter(id);},bad);
 // Explicit deletion only removes the game copy, then offers the original again.
 page.once('dialog',d=>d.dismiss());await page.locator('#delete-character').click();assert.equal(await page.locator('#player-character').inputValue(),id);
 page.once('dialog',d=>d.accept());await page.locator('#delete-character').click();await page.waitForURL(u=>u.searchParams.get('avatar')==='');await ready();
 assert(await page.locator('#start').isEnabled());assert.equal(await page.locator('#player-character option').count(),1);
 const projects=await page.evaluate(async()=>{const db=await import('../character-design/project-store.mjs?v=53');return (await db.listProjects()).length;});assert(projects>0,'Studio project survives game-copy deletion');
 page.off('request',watch);assert.deepEqual(uploads,[],'No character upload');
 console.log('SAVED_CHARACTER_MENU_OK',JSON.stringify({analysts,counter,classicRound:true,endlessRespawn:respawn,remembered:true,recovery:true,originals:true,studioProjectPreserved:true,uploads:uploads.length}));
}

export async function verifyCharacterStorage(browser,origin){
 const context=await browser.newContext(),page=await context.newPage();await page.goto(origin+'/credits.html');
 const result=await page.evaluate(async()=>{
  const s=await import('./src/fps/private-character-store.mjs');
  // Tiny schema-valid fixture exercises IndexedDB transactions, not GLB rig compatibility.
  const raw=new TextEncoder().encode(JSON.stringify({asset:{version:'2.0'},meshes:[{}],skins:[{}],animations:Array.from({length:13},()=>({}))})),n=Math.ceil(raw.length/4)*4,bytes=new ArrayBuffer(20+n),v=new DataView(bytes);
  [0x46546c67,2,bytes.byteLength,n,0x4e4f534a].forEach((x,i)=>v.setUint32(i*4,x,true));new Uint8Array(bytes,20).fill(32);new Uint8Array(bytes,20,raw.length).set(raw);
  const sourceHash='a'.repeat(64),projectId=crypto.randomUUID(),ids=[];
  const legacyId=crypto.randomUUID(),legacy={id:legacyId,schema:1,bytes,name:'Äldre provkopia',sourceHash,sha256:await s.characterHash(bytes),created:1,projectId};
  const old=await new Promise((resolve,reject)=>{const r=indexedDB.open('cartridge-private-characters',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
  await new Promise((resolve,reject)=>{const tx=old.transaction('drafts','readwrite');tx.objectStore('drafts').put(legacy);tx.oncomplete=resolve;tx.onerror=reject;});old.close();
  if((await s.loadPrivateCharacter(legacyId)).name!==legacy.name)throw Error('Migration lost old copy');
  const oldWriterBlocked=await new Promise(resolve=>{const r=indexedDB.open('cartridge-private-characters',1);r.onerror=()=>resolve(r.error.name==='VersionError');r.onsuccess=()=>{r.result.close();resolve(false);};});if(!oldWriterBlocked)throw Error('Old pruning writer is still allowed');
  const first=await s.savePrivateCharacter({bytes,name:'A',sourceHash,projectId});if(first!==legacyId)throw Error('Legacy identity changed');const update=await s.savePrivateCharacter({bytes,name:'Uppdaterad',sourceHash,projectId});if(first!==update)throw Error('Duplicate copy for same project');ids.push(first);
  for(let i=1;i<8;i++)ids.push(await s.savePrivateCharacter({bytes,name:'Test '+i,sourceHash}));
  let bounded=false;try{await s.savePrivateCharacter({bytes,name:'Overflow',sourceHash});}catch(e){bounded=/Åtta/.test(e.message);}if(!bounded)throw Error('Unbounded storage');
  const rows=await s.listPrivateCharacters();if(rows.length!==8||rows.some(r=>'bytes' in r))throw Error('Metadata listing retained payloads');
  for(const id of ids)await s.loadPrivateCharacter(id); // No silent oldest-copy eviction.
  await s.savePrivateCharacter({bytes,name:'Uppdaterad igen',sourceHash,projectId});
  await s.deletePrivateCharacter(first);let missing=false;try{await s.loadPrivateCharacter(first);}catch(e){missing=/saknas/.test(e.message);}if(!missing)throw Error('Deleted copy still loads');
  const open=indexedDB.open;try{indexedDB.open=()=>{throw Error('blocked test');};document.body.innerHTML='<select id="player-character"></select><p id="character-status"></p><button id="delete-character"></button><button id="start"></button>';const menu=await (await import('./src/fps/character-selection.mjs')).setupCharacterMenu({getTeam:()=> 'analysts',getSeed:()=>42});if(menu.id!==''||document.getElementById('player-character').value!==''||!document.getElementById('character-status').textContent.includes('Originalkaraktär'))throw Error('Blocked storage removed original option');}finally{indexedDB.open=open;}
  return {limit:s.MAX_SAVED_CHARACTERS,updateAtCapacity:true,metadataOnly:true,missing:true,blockedStorageRecovery:true,legacyPreserved:true,oldWriterBlocked:true};
 });console.log('CHARACTER_STORAGE_OK',JSON.stringify(result));await context.close();
}
