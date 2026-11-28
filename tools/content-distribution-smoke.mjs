// Run the exported game from a new directory containing only distribution files.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {access,mkdtemp,readFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {CONTRACT,MAP_CONTRACTS} from '../shared/multiplayer/build.mjs';
import {exportDistribution,inspectDistribution} from './runtime-distribution.mjs';

const {Client}=createRequire(new URL('../server/package.json',import.meta.url))('@colyseus/sdk');
const args=process.argv.slice(2);
if(args.some(a=>!['--example','--render'].includes(a))||args.includes('--render')&&!args.includes('--example'))
  throw Error('Use --example for an installed Harbor Crew sample, optionally with --render.');
const example=args.includes('--example'),outfit=example?'harbor-crew':'issued';
const scratch=await mkdtemp(join(tmpdir(),'cs3-distribution-smoke-')),pilot=join(scratch,'pilot'),peers=[];
const run=promisify(execFile);
const probe=async(fn,label)=>{const until=performance.now()+15000;while(!fn()){assert(performance.now()<until,label);await delay(20);}};
let child,closed;
try{
  const inv=await inspectDistribution();await exportDistribution(inv,pilot,'pilot');await exportDistribution(inv,join(scratch,'site'),'public');
  for(const excluded of ['server','tools','frontline','docs/cartridge-strike-3','IMG_8150.PNG','content/examples'])
    await assert.rejects(access(join(scratch,'site',excluded)),{code:'ENOENT'});
  await run('npm',['ci','--offline','--prefix','server','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:pilot});
  await assert.rejects(access(join(pilot,'server/node_modules/acorn')),{code:'ENOENT'});
  const program=`import {createLocalServer} from './server/local-server.mjs';
    const server=await createLocalServer({port:0});
    process.once('message',async()=>{await server.close();process.disconnect();});
    process.send(server.url);`;
  child=spawn(process.execPath,['--import','./server/register-shared.mjs','--input-type=module','--eval',program],
    {cwd:pilot,stdio:['ignore','inherit','inherit','ipc']});
  closed=once(child,'exit');
  const [url]=await Promise.race([once(child,'message'),closed.then(([code])=>{throw Error('Exported server exited early: '+code);}),
    delay(30000,null,{ref:false}).then(()=>{throw Error('Exported server did not publish its address');})]);
  const health=await(await fetch(url+'/health')).json();assert.equal(health.contract.buildHash,CONTRACT.buildHash);
  for(const path of ['/','/fps/','/fps/app.webmanifest','/assets/fps/outfit-packs.json']){
    const response=await fetch(url+path);assert.equal(response.status,200,path);await response.arrayBuffer();
  }
  for(const name of ['/server/package.json','/tools/vendor-three-test-loader.mjs','/frontline/source/'])
    assert.equal((await fetch(url+name)).status,404,name);
  const settings={contract:CONTRACT,code:'sample-content-room',name:'Catalog host',fillBots:false,mapId:'compact-arena'};
  for(const name of ['Catalog host','Catalog guest']){
    const sdk=new Client(url,{headers:{Origin:url}});
    const room=peers.length?await sdk.joinById(peers[0].roomId,{...settings,name}):await sdk.create('private-fps',settings);
    room.reconnection.enabled=false;room.onMessage('events',()=>{});room.onMessage('clock-probe',n=>room.send('clock-echo',n));peers.push(room);
    const own=()=>[...(room.state.actors?.values()??[])].find(a=>a.sessionId===room.sessionId);
    await probe(()=>room.state.mapId&&own(),'Reserved room seat');
    room.send('ready',{...MAP_CONTRACTS[room.state.mapId],worldRevision:room.state.worldRevision,outfitId:outfit});
    await probe(()=>own()?.ready&&own().handling?.outfitId===outfit,'Server accepted registered appearance');
  }
  for(const peer of peers)await probe(()=>[...peer.state.actors.values()].filter(a=>a.sessionId&&a.handling?.outfitId===outfit&&a.ready).length===2,'Both peers see both admitted appearances');
  if(args.includes('--render')){
    const driver=fileURLToPath(new URL('./appearance-browser.mjs',import.meta.url));
    await run(process.execPath,[driver],{env:{...process.env,FPS_TEST_ORIGIN:url},timeout:240000});
  }
  const info=JSON.parse(await readFile(join(pilot,'build-info.json')));
  console.log(JSON.stringify({status:'PASS',build:CONTRACT.buildHash,content:info.contentCatalog,publicFiles:inv.publicFiles.length,
    privateFiles:inv.privateFiles.length,clients:peers.length,replicatedOutfit:outfit,rendered:args.includes('--render')}));
}finally{
  await Promise.allSettled(peers.map(p=>p.leave()));
  if(child?.connected)child.send('close');
  if(closed){const timer=setTimeout(()=>child.kill('SIGTERM'),4000);try{await closed;}finally{clearTimeout(timer);}}
  await rm(scratch,{recursive:true,force:true});
}
