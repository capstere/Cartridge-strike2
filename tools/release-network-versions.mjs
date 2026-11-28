// Keep the previous shipping browser SDK and contract in memory while a disposable
// authority is changed at the same TLS origin. The old and new releases own no live state.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {startPilotFixture} from './network-pilot-fixture.mjs';
import {authority} from './release-network-stage.mjs';
const [previous,current,output]=process.argv.slice(2);
assert(previous&&current&&output,'Usage: node tools/release-network-versions.mjs OLD_RELEASE CANDIDATE_PILOT RECEIPTS');
let runtime=resolve(previous),browser;
const edge=await startPilotFixture({host:'127.0.0.1',familyRoom:true,startAuthority:options=>authority(runtime,options)});
const probeCode=randomBytes(20).toString('hex');
const report={date:new Date().toISOString(),transport:'pinned loopback TLS/WSS',oldSeatReached:false};
let stage='launch';
try{
  browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH||undefined,args:edge.args});
  const context=await browser.newContext();
  const page=await context.newPage();
  let sockets=0;
  page.on('websocket',ws=>{if(new URL(ws.url()).protocol==='wss:')sockets++;});
  await page.goto(edge.origin+'/room/JESPERS-ROOM');
  // The gate document disallows third-party code. Navigate to an authenticated
  // static document before loading the exact SDK bundled with the old release.
  async function login(){
    const signIn=await page.context().newPage();
    try {
      await signIn.goto(edge.origin+'/room/JESPERS-ROOM');
      await signIn.locator('input[name=invite]').fill(edge.invite);
      const [res]=await Promise.all([signIn.waitForResponse(r=>new URL(r.url()).pathname==='/pilot/session'),
        signIn.locator('button[type=submit]').click({noWaitAfter:true})]);
      assert.equal(res.status(),303);
    } finally {await signIn.close();}
  }
  async function client(){
    await page.goto(edge.origin+'/credits.html');
    await page.addScriptTag({url:edge.origin+'/vendor/colyseus/colyseus.js'});
    return page.evaluate(async()=>{
      window.testContract=(await import('/shared/multiplayer/build.mjs')).CONTRACT;
      window.testClient=new Colyseus.Client(location.origin);
      return {build:window.testContract.buildHash,protocol:window.testContract.protocolVersion};
    });
  }
  async function connect(){
    await page.evaluate(async code=>{
      window.testRoom=await window.testClient.create('private-fps',{contract:window.testContract,code,name:'Version guest',fillBots:false,mapId:'compact-arena'});
      window.testRoom.onMessage('events',()=>{});window.testRoom.onMessage('clock-probe',n=>window.testRoom.send('clock-echo',n));
    },probeCode);
    await page.waitForFunction(()=>window.testRoom.state.actors?.size>0);
  }
  stage='old login';await login();stage='previous SDK';report.previous=await client();stage='previous seat';await connect();report.oldSeatReached=true;
  await page.evaluate(()=>{
    const room=window.testRoom;
    window.testConnection={dropped:false,reconnected:false,ended:false};
    room.onDrop(()=>window.testConnection.dropped=true);room.onReconnect(()=>window.testConnection.reconnected=true);
    room.onLeave(()=>window.testConnection.ended=true);
    Object.assign(room.reconnection,{enabled:true,minUptime:0,minDelay:500,maxDelay:900,maxRetries:12});
  });
  stage='stale reservation';edge.setReachable(false);
  await page.waitForFunction(()=>window.testConnection.dropped);
  runtime=resolve(current);await edge.restart();edge.setReachable(true);
  await page.waitForFunction(()=>window.testConnection.ended,undefined,{timeout:30000});
  assert.equal(await page.evaluate(()=>window.testConnection.reconnected),false);
  report.wssAttemptsBeforeFreshLogin=sockets;assert(sockets>1,'previous SDK attempted reconnection');
  let idle=await (await fetch(edge.authority.url+'/health')).json();
  assert.equal(idle.players,0);assert.equal(idle.rooms,0);
  report.previousSessionStatus=await page.evaluate(async()=>(await fetch('/shared/multiplayer/build.mjs',{cache:'no-store'})).status);
  assert.equal(report.previousSessionStatus,401);
  stage='authenticated stale build';await login();
  const mismatch=await page.evaluate(async code=>{
    try {const room=await window.testClient.create('private-fps',{contract:window.testContract,code,name:'Version guest',fillBots:false});
      await room.leave();return {rejected:false};}
    catch(error){return {rejected:true,reason:String(error.message).includes('Incompatible protocolVersion')?'Incompatible protocolVersion':'unexpected'};}
  },probeCode);
  assert.deepEqual(mismatch,{rejected:true,reason:'Incompatible protocolVersion'});report.authenticatedPreviousBuild=mismatch;
  stage='fresh release';report.current=await client();
  assert.notEqual(report.current.build,report.previous.build);
  await connect();const health=await (await fetch(edge.authority.url+'/health')).json();
  assert.equal(health.players,1);assert.equal(health.rooms,1);assert.equal(health.contract.buildHash,report.current.build);
  await page.evaluate(()=>window.testRoom.leave());
  await page.waitForFunction(()=>!window.testRoom.connection.isOpen);
  idle=await (await fetch(edge.authority.url+'/health')).json();
  assert.equal(idle.players,0);report.freshBuildAdmitted=true;report.staleSeatResumed=false;
  report.status='PASS';
  await mkdir(output,{recursive:true,mode:0o700});await writeFile(join(output,'versions.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} catch(error) {
  // SDK/Playwright error strings may include reservation IDs or the test invite.
  const diagnostic=String(error.message).split('\n')[0].replaceAll(edge.invite,'[redacted]').replaceAll(probeCode,'[redacted]').replace(/(?:https?|wss?):\/\/[^\s]+/g,'[address]');
  console.error('Version transition failed at '+stage+' ('+diagnostic+')');process.exitCode=1;
} finally{try{await browser?.close();}finally{await edge.close();}}
