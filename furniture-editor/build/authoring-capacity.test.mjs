import test from 'node:test';
import assert from 'node:assert/strict';
import {AUTHORING_LIMITS,authoringStatus} from '../project-limits.mjs?v=5.7.3';
import {makeEntry,exportArchitecture,parseArchitecture} from './architecture.mjs?v=5.7.3';
import {planPaintOverWall} from './paint-over-wall.mjs?v=5.7.3';
import {createRectangleRoom} from './rectangle-room.mjs?v=5.7.3';
import {exportProject,parseProject,parseProjectZip,exportProjectZip} from './level-project.mjs?v=5.7.3';
import {prepareProjectSave} from './safe-save.mjs?v=5.7.3';
import {validateLevel} from './validate-level.mjs?v=5.7.3';
import {makePoster,parsePosters} from './posters.mjs?v=5.7.3';
import {createBlind,parseTreatments} from './treatments.mjs?v=5.7.3';
import {readFileSync} from 'node:fs';
const walls=n=>Array.from({length:n},(_,i)=>makeEntry('BYGG-V-'+String(i+1).padStart(4,'0'),'wall',[-30+(i%20)*3,10+Math.floor(i/20)],[ -28+(i%20)*3,10+Math.floor(i/20)]));
const fixture=()=>{const p=exportProject();p.architecture.added=walls(250);p.architecture.added[0].a=[0,-20];p.architecture.added[0].b=[8,-20];return p;};

test('window insertion at 250 parts remains atomic and roundtrips all 252 parts',async()=>{
 const p=fixture(),before=structuredClone(p);
 const plan=planPaintOverWall(p.architecture.added,p.architecture.added[0].id,[2,-20],[4,-20],'window');
 assert.deepEqual(p,before);assert.equal(plan.entries.length,252);
 p.architecture=exportArchitecture(plan.entries,[]);
 const read=await parseProjectZip(await exportProjectZip(p));
 assert.deepEqual(read.project,p);
 assert.deepEqual(parseArchitecture(p.architecture,[]).entries.map(x=>x.id),p.architecture.added.map(x=>x.id));
});

test('room creation at 250 parts and over 100 floors is allowed without changing existing parts',()=>{
 const p=fixture(),before=JSON.stringify(p),floors=Array.from({length:100},(_,i)=>({id:'BYGG-G-'+String(i+1).padStart(4,'0')}));
 const room=createRectangleRoom(p.architecture.added,floors,[-10,-10],[-6,-6]);
 assert.equal(room.walls.length,4);assert.equal(room.floor.id,'BYGG-G-0101');assert.equal(JSON.stringify(p),before);
});

test('source Floor 5 and standalone source projects both accept over 250 building parts',()=>{
 for(const mode of ['edit-floor5','new-level']){
  const p=exportProject({mode});p.architecture.added=walls(300);
  assert.equal(parseProject(p).architecture.added.length,300);
  assert.equal(parseArchitecture(p.architecture,[]).entries.length,300);
 }
});

test('41 posters and 121 blinds remain editable instead of reaching old tiny limits',()=>{
 const wall=makeEntry('BYGG-V-0001','glazed',[0,0],[8,0]);
 const posters=[];for(let i=0;i<41;i++)posters.push(makePoster(wall,posters));
 assert.equal(parsePosters(posters,[wall]).length,41);
 const blinds=[];for(let i=0;i<121;i++)blinds.push(createBlind([wall],blinds,wall.id));
 assert.equal(parseTreatments(blinds,[wall]).length,121);
});

test('advisory complexity never mutates source or marks an unfinished map playable',async()=>{
 const p=fixture();p.furniture.added=Array.from({length:1100},(_,i)=>({id:'NY-OBJ-'+String(i+1).padStart(4,'0'),kind:'prop',x:0,z:0,yaw:0,w:.1,d:.1,height:.1}));
 const before=structuredClone(p),status=authoringStatus(p);
 assert.equal(status.large,true);assert.equal(status.furniture,1100);assert.equal(status.parts,250);assert.deepEqual(p,before);
 const save=await prepareProjectSave(p,async()=>null);
 assert.equal(save.kind,'project');assert.equal(save.document.validation.summary.playable,false);
 assert(validateLevel(p,{engine:true}).summary.errors>0);
 assert.deepEqual(p,before);
});

test('source-size ceiling uses UTF-8 bytes and admits a draft larger than the old 5 MiB',()=>{
 const p=exportProject();p.intent.note='x'.repeat(6*1024*1024);
 assert.equal(parseProject(JSON.stringify(p)).intent.note.length,p.intent.note.length);
 p.intent.note='å'.repeat(AUTHORING_LIMITS.jsonBytes/2);
 assert.throws(()=>parseProject(p),/16 MiB/);assert.throws(()=>parseProject(JSON.stringify(p)),/16 MiB/);
});

test('resource ceilings, duplicate IDs, malformed dimensions and foreign assets stay rejected',()=>{
 const p=fixture();p.architecture.added=Array.from({length:AUTHORING_LIMITS.buildingParts+1},(_,i)=>({...p.architecture.added[0],id:'BYGG-V-'+(i+1)}));
 assert.throws(()=>parseProject(p),/arkitektur/);assert.throws(()=>parseArchitecture(p.architecture,[]),/resursgräns/);
 const q=fixture();q.architecture.added.push({...q.architecture.added[0]});assert.throws(()=>parseProject(q),/dubbelt ID/);
 q.architecture.added=walls(1);q.architecture.added[0].height=Infinity;assert.throws(()=>parseProject(q));
 const r=exportProject();r.furniture.added=[{id:'NY-OBJ-1',kind:'prop',assetId:'https://example.invalid/evil.glb',x:0,z:0,yaw:0,w:1,d:1,height:1}];assert.throws(()=>parseProject(r),/okänd möbelmodell/);
});

test('schema, room tools, poster/treatment validation and editor use one authoring capacity source',()=>{
 const schema=JSON.parse(readFileSync(new URL('./level-project.schema.json',import.meta.url)));
 const a=schema.properties.architecture.properties;
 assert.equal(a.added.maxItems,AUTHORING_LIMITS.buildingParts);assert.equal(a.edits.maxItems,AUTHORING_LIMITS.sourceChanges);
 assert.equal(a.floors.maxItems,AUTHORING_LIMITS.floors);assert.equal(a.posters.maxItems,AUTHORING_LIMITS.posters);assert.equal(a.treatments.maxItems,AUTHORING_LIMITS.treatments);
 assert.equal(schema.properties.furniture.properties.added.maxItems,AUTHORING_LIMITS.furnitureRecords);
 assert.equal(schema.properties.ground.properties.floors.maxItems,AUTHORING_LIMITS.floors);
});
