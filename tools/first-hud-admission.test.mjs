import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../src/fps/render.mjs';
import {Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshBasicMaterial, Vector4} from '../vendor/three/three.module.js';

function fixture({compile,extension=true,program,wait,fence,draw,count=1}={}){
  const draws=[],compiles=[],rect=new Vector4(4,8,620,310);let scissorTest=false,deleted=0;const meshes=[];
  const gpu={
    getContext:()=>({getExtension:()=>extension,isContextLost:()=>false,fenceSync:fence??(()=>({})),flush(){},clientWaitSync:wait??(()=>1),WAIT_FAILED:2,TIMEOUT_EXPIRED:3,deleteSync(){deleted++;}}),
    getScissor:out=>out.copy(rect),
    setScissor:(...args)=>args.length===1?rect.copy(args[0]):rect.set(...args),
    getScissorTest:()=>scissorTest,setScissorTest:enabled=>{scissorTest=enabled;},
    compile(batch,camera,target){compiles.push(target.name);compile?.(target.name);return new Set(program?[{}]:[]);},
    properties:{get(){return {currentProgram:program};}}
  };
  const original=(scene,camera)=>{draws.push({scene:scene.name,camera,scope:rect.toArray(),scissorTest,masked:scene.children.filter(m=>m.layers.mask===0).length});draw?.();};
  const owner={renderer:gpu,settings:{graphics:'low'},nativeRender:original,render(){
    for(const name of ['world','weapon']){const scene=new Scene();scene.name=name;for(let i=0;i<count;i++){const mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial());mesh.frustumCulled=false;mesh.layers.enable(2);meshes.push(mesh);scene.add(mesh);}this.nativeRender(scene,new PerspectiveCamera());}
  }};
  const prepare=signal=>Renderer.prototype.prepareSpawnFrame.call(owner,{player:{}},signal);
  return {gpu,draws,compiles,owner,original,rect,prepare,meshes,get deleted(){return deleted;}};
}

test('scope stays intact across yields, successful preparation is reused once per renderer',async()=>{
  const f=fixture({compile:()=>{assert.deepEqual(f.rect.toArray(),[4,8,620,310]);assert.equal(f.gpu.getScissorTest(),false);}});
  await f.prepare();
  assert.deepEqual(f.draws.map(x=>x.scene),['world','weapon']);
  assert(f.draws.every(x=>x.scissorTest&&x.scope.join(',')==='0,0,1,1'));
  assert.equal(f.owner.nativeRender,f.original);assert.equal(f.gpu.getScissorTest(),false);
  await f.prepare();assert.equal(f.draws.length,2);
});

test('cancellation during compile cannot submit a late draw or overwrite a viewport change',async()=>{
  const controller=new AbortController();
  const f=fixture({compile:()=>{f.gpu.setScissor(1,2,900,480);controller.abort();}});
  await f.prepare(controller.signal);
  assert.deepEqual(f.rect.toArray(),[1,2,900,480]);assert.equal(f.owner.nativeRender,f.original);
  assert.deepEqual(f.compiles,['world']);assert.deepEqual(f.draws,[]);
  assert.equal(f.owner.spawnFramePrepared,undefined);
});

test('unsupported or already aborted sessions exit before preparing either pass',async()=>{
  for(const [extension,signal] of [[false,undefined],[true,AbortSignal.abort()]]){
    const f=fixture({extension});await f.prepare(signal);assert.equal(f.draws.length,0);assert.equal(f.compiles.length,0);
  }
});

test('a shader or GPU fence which never completes runs out of admission time',async t=>{
  let clock=0;t.mock.method(performance,'now',()=>clock);
  const shader={isReady(){clock+=3000;return false;},getUniforms(){throw Error('unready program');}};
  const linking=fixture({program:shader});await linking.prepare();
  assert.equal(linking.draws.length,0);assert.equal(linking.owner.spawnFramePrepared,undefined);
  const uploading=fixture({wait:()=>{clock+=3000;return 3;}});await uploading.prepare();
  assert.equal(uploading.draws.length,1);assert.equal(uploading.deleted,1);assert.equal(uploading.owner.spawnFramePrepared,undefined);
});

test('unavailable and failed fences restore render state and retire acquired handles',async()=>{
  for(const [options,deleted] of [[{fence:()=>null},0],[{wait:()=>2},1]]){
    const f=fixture(options);await f.prepare();
    assert.equal(f.deleted,deleted);assert.equal(f.owner.spawnFramePrepared,undefined);
    assert.equal(f.gpu.getScissorTest(),false);assert.deepEqual(f.rect.toArray(),[4,8,620,310]);
  }
});

test('layer masks and scissor are restored after every batch, including failed draws',async()=>{
  for(const throws of [false,true]){
    let submitted=0;
    const f=fixture({count:17,draw:()=>{if(++submitted===2&&throws)throw Error('GPU error');}});
    if(throws)await assert.rejects(f.prepare(),/GPU error/);else await f.prepare();
    assert.deepEqual(f.draws.map(row=>row.masked),throws?[1,16]:[1,16,1,16]);
    assert(f.meshes.every(m=>m.layers.mask===5));assert.equal(f.gpu.getScissorTest(),false);
    assert.deepEqual(f.rect.toArray(),[4,8,620,310]);assert.equal(f.owner.nativeRender,f.original);
    assert.equal(f.deleted,throws?1:4);
  }
});

test('a replacement room world waits for the matching local camera actor or a closed seat',async()=>{
  const {NetworkSession}=await import('../src/fps/network/session.mjs');
  const actor={id:'analysts-0',ready:true};
  const session={worldRevision:1,room:{state:{worldRevision:2,actors:new Map([[actor.id,actor]])}},localPlayerId:actor.id,view:{player:null}};
  let completed=false;
  const ready=NetworkSession.prototype.waitForSpawn.call(session).then(()=>{completed=true;});
  session.worldRevision=2;
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(completed,false);
  session.view.player=actor;await ready;
  session.room.state.worldRevision=3;session.closed=true;
  await assert.rejects(NetworkSession.prototype.waitForSpawn.call(session),/closed before spawn/i);
});
