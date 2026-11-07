import {validateFloorTape} from './floor-tape.mjs?v=5.9.0';
import {AUTHORING_LIMITS,MAX_PROJECT_JSON_BYTES,MAX_FURNITURE_RECORDS,furnitureRecordCount} from '../project-limits.mjs?v=5.7.3';
import {validateFloorEdits} from './floor-edge.mjs?v=5.7.3';
import {validateSurfaceColors,validateSurfaceMaterials} from './surface-style.mjs?v=5.8.0';
import {FLOOR_FINISHES} from './pattern-presets.mjs?v=5.6.1';
import {validateOpenedAreas,closedAreas} from './walkable-spaces.mjs?v=5.8.0';
import {validModelAlignment} from '../model-alignment.mjs?v=5.8.0';
/** Versioned level document. Parsing is deliberately independent of the renderer. */
import {BASE_COMMIT,GAME_VERSION,PATCH_FORMAT,PATCH_SCHEMA} from '../core.mjs?v=5.8.0';
import {validateEnvironment} from './environment-layout.mjs';
import {validateEntry,validateFloorRect} from './architecture.mjs?v=5.8.0';
import {assetHash} from '../library/glb-utils.mjs';
import {makeZip,readZip,PROJECT_ZIP_MAX_BYTES} from '../library/zip.mjs?v=5.7.2';
import {floor5Baseline} from './project-scene.mjs?v=5.8.0';
import {parseArchitecture} from './architecture.mjs?v=5.8.0';
import {LIBRARY_MAP} from '../library/catalog.mjs?v=5.8.0';
import {parsePosters} from './posters.mjs?v=5.7.3';
import {parseTreatments} from './treatments.mjs?v=5.8.0';
import {collisionExport,aiAgentBrief} from './ai-export.mjs?v=5.8.0';
import {validWallMount} from '../wall-mounts.mjs?v=5.8.0';
import {validFurnitureColor} from '../appearance.mjs?v=5.8.0';

export const LEVEL_FORMAT='cartridge-strike-level-project',LEVEL_SCHEMA=2;
export const LEVEL_GAME_VERSION='0.18.0',LEVEL_BASE_COMMIT='f5c63a22483feeeb29583853dab0c0911af5c09a',LEVEL_EDITOR_VERSION='5.9.0';
const emptyArchitecture=()=>({schemaVersion:1,edits:[],added:[],removed:[],floors:[],posters:[],treatments:[]});
const within=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100;
const rect=r=>r&&[r.x0,r.z0,r.x1,r.z1].every(within)&&r.x1>r.x0&&r.z1>r.z0;
const idPattern=/^lvl-[a-z0-9-]{4,60}$/;
const safeName=n=>typeof n==='string'&&n.length>0&&n.length<=80&&!/[\u0000-\u001f]/.test(n);
const fail=m=>{throw Error('Ogiltigt banprojekt: '+m);};
const clone=o=>structuredClone(o);
const counts=()=>({analysts:5,counterAnalysts:5});

export function exportProject({mode='new-level',projectId='lvl-new-level',name='Min bana',ground,
 architecture=emptyArchitecture(),furniture={placements:[],added:[],removed:[]},gameplay,
 navHints=[],intent={},validation={},assets={library:[],local:[],posters:[]},agentBrief={},legacyPatch,environment,
 createdAt=new Date().toISOString(),migrationNotes=[]}={}){
 const project={format:LEVEL_FORMAT,schemaVersion:LEVEL_SCHEMA,editorVersion:LEVEL_EDITOR_VERSION,createdAt,
  projectId,name,game:{repository:'capstere/cartridge-strike',version:LEVEL_GAME_VERSION,
   baseCommit:LEVEL_BASE_COMMIT,compatibleWith:[LEVEL_GAME_VERSION]},mode,
  units:{linear:'model-unit',metricScaleVerified:false,planAxes:['x','z'],upAxis:'y',playerRadius:.22,actorRadius:.20,gridStep:.1},
  rules:{minDoorWidth:1.10,minCorridorWidth:2,doorWidthAppliesTo:mode==='new-level'?'all':'new-and-edited'},
  ground:ground||{bounds:{x0:-40,z0:-40,x1:40,z1:40},wallHeightDefault:2.85,floors:[]},
  architecture,furniture,gameplay:gameplay||{mode:'classic',counts:counts(),spawns:[],objectives:{bomb:null,rescue:null,hostages:[]}},
  navHints,intent,validation,assets,agentBrief};
 if(environment!==undefined)project.environment=environment;
 if(legacyPatch)project.legacyPatch=legacyPatch;
 if(migrationNotes.length)project.migrationNotes=migrationNotes;
 return parseProject(project,{allowLegacy:false});
}

export function migrateV1(input){
 if(!input||input.format!==PATCH_FORMAT||input.schemaVersion!==PATCH_SCHEMA)fail('okänt äldre format');
 if(input.source?.repository!=='capstere/cartridge-strike'||input.source?.commit!==BASE_COMMIT||input.source?.version!==GAME_VERSION)
  fail('äldre projektet har en annan källa');
 if(!Array.isArray(input.placements)||!Array.isArray(input.added)||!Array.isArray(input.removed))fail('möbeländringar saknas');
 const original=clone(input),notes=['Schema 1 öppnades i REDIGERA FLOOR 5.',
  'Spawns och mål ärvs från oförändrad Floor 5-runtime.',
  'Automatisk dörrsväng används; modellenheter är inte verifierade meter.'];
 const architecture={...emptyArchitecture(),...(input.architecture||{})};
 const local=[...new Set(input.added.map(x=>x.assetId).filter(x=>typeof x==='string'&&/^local:[a-f0-9]{64}$/.test(x)))].map(assetId=>({assetId,file:`assets/models/${assetId.slice(6)}.glb`,bytes:0,license:'private, unverified'}));
 // A legacy JSON has no bundled binary size. Zero is a marker until ZIP import supplies bytes.
 const migrated=exportProject({mode:'edit-floor5',projectId:'lvl-floor5-migrated',name:'Floor 5 – migrerat projekt',
  architecture,furniture:{placements:clone(input.placements),added:clone(input.added),removed:clone(input.removed)},
  assets:{library:[],local,posters:[]},legacyPatch:original,migrationNotes:notes,createdAt:input.createdAt||new Date().toISOString()});
 migrated.game.baseCommit=BASE_COMMIT;return migrated;
}

export function parseProject(input,{allowLegacy=true}={}){
 if(typeof input==='string'){
  if(input.length>MAX_PROJECT_JSON_BYTES||new TextEncoder().encode(input).length>MAX_PROJECT_JSON_BYTES)fail('JSON över 16 MiB; behåll originalfilen');
  input=JSON.parse(input);
 }
 if(!input||typeof input!=='object'||Array.isArray(input))fail('rotobjekt saknas');
 if(allowLegacy&&input.format===PATCH_FORMAT)return migrateV1(input);
 if(input.format!==LEVEL_FORMAT||input.schemaVersion!==LEVEL_SCHEMA)fail('format eller schemaversion');
 if(!idPattern.test(input.projectId)||!safeName(input.name)||!['new-level','edit-floor5'].includes(input.mode))fail('ID, namn eller läge');
 if(input.game?.repository!=='capstere/cartridge-strike'||input.game?.version!==LEVEL_GAME_VERSION||
  !/^[a-f0-9]{40}$/.test(input.game?.baseCommit)||!input.game?.compatibleWith?.includes(LEVEL_GAME_VERSION))fail('spelkompatibilitet');
 if(input.units?.linear!=='model-unit'||input.units?.metricScaleVerified!==false||
  input.units?.playerRadius!==.22||input.units?.actorRadius!==.20||input.units?.gridStep!==.1)fail('enheter');
 if(input.rules?.minDoorWidth!==1.1||input.rules?.minCorridorWidth!==2||
  input.rules?.doorWidthAppliesTo!==(input.mode==='new-level'?'all':'new-and-edited'))fail('breddregler');
 const g=input.ground;if(!rect(g?.bounds)||!Number.isFinite(g.wallHeightDefault)||g.wallHeightDefault<.45||g.wallHeightDefault>6||!Array.isArray(g.floors)||g.floors.length>AUTHORING_LIMITS.floors)fail('grundyta');
 const ids=new Set();const unique=id=>{if(ids.has(id))fail('dubbelt ID: '+id);ids.add(id);};
 for(const f of g.floors){validateFloorRect(f);if(!['room','corridor'].includes(f.role)||!FLOOR_FINISHES.includes(f.surface)||
  f.x0<g.bounds.x0||f.x1>g.bounds.x1||f.z0<g.bounds.z0||f.z1>g.bounds.z1)fail('golvyta '+f.id);unique(f.id);}
 validateFloorTape(g.tape);
 for(const strip of g.tape||[])unique(strip.id);
 const a=input.architecture;if(a?.schemaVersion!==1||!['edits','added','removed','floors'].every(k=>Array.isArray(a[k]))||
  a.edits.length>AUTHORING_LIMITS.sourceChanges||a.added.length>AUTHORING_LIMITS.buildingParts||a.removed.length>AUTHORING_LIMITS.sourceChanges||a.floors.length>AUTHORING_LIMITS.floors)fail('arkitektur');
 if(input.mode==='new-level'&&(a.edits.length||a.removed.length||a.floors.length))fail('ny bana får inte ärva Floor 5');
 for(const e of a.added){validateEntry(e,{isNew:true});unique(e.id);}
 if(input.mode==='new-level'){parsePosters(a.posters,a.added);parseTreatments(a.treatments,a.added);}
 if(input.mode==='new-level'&&g.floors.length>0){for(const e of a.added){if(![e.a,e.b].every(([x,z])=>x>=g.bounds.x0&&x<=g.bounds.x1&&z>=g.bounds.z0&&z<=g.bounds.z1))fail('byggdel utanför grundytan');}}
 const f=input.furniture,count=furnitureRecordCount(f);
 if(count===null)fail('möbler: placements, added och removed måste vara listor');
 if(count>MAX_FURNITURE_RECORDS)fail(`möbelposter ${count}/${MAX_FURNITURE_RECORDS}. Spara en säkerhetskopia; inga objekt behöver raderas för att rädda arbetet`);
 if(input.mode==='new-level'&&(f.placements.length||f.removed.length))fail('ny bana får inte ärva möbler');
 const checkMount=o=>{
  if(!validModelAlignment(o))fail('modellens framåtriktning eller mått');
  if(o.elevation!==undefined&&(!Number.isFinite(o.elevation)||o.elevation<0||o.elevation>6))fail('höjd över golv');
  if(o.mountId!==undefined&&o.mountId!==null&&(typeof o.mountId!=='string'||o.mountId.length>100||o.mountId===o.id))fail('möbelfäste');
  if(o.mountSurface!==undefined&&o.mountSurface!==null&&(!Number.isInteger(o.mountSurface)||o.mountSurface<0||o.mountSurface>31||!o.mountId))fail('hyllplan');
  if(o.color!==undefined&&!validFurnitureColor(o.color))fail('möbelfärg');
  if(o.wallMount!==undefined&&o.wallMount!==null&&(!validWallMount(o.wallMount)||o.mountId))fail('väggfäste');
 };
 for(const o of f.added){checkMount(o);if(!/^NY-(OBJ|STOL|BORD|SOFFA)-\d{1,5}$/.test(o.id)||!
  [o.x,o.z,o.yaw,o.w,o.d,o.height].every(Number.isFinite)||!within(o.x)||!within(o.z)||o.w<=0||o.d<=0||o.w>8||o.d>8||o.height<=0||o.height>8)fail('möbel');
  if(o.assetId&&!LIBRARY_MAP.has(o.assetId)&&!/^local:[a-f0-9]{64}$/.test(o.assetId))fail('okänd möbelmodell');
  if(o.collision!==undefined&&!['solid','none'].includes(o.collision))fail('okänd möbelkollision');
  // The studio is an authoring tool. An object can temporarily stand outside
  // walkable floor while the user rearranges the plan. Engine validation reports
  // it as unplayable; saving the source project must never lose that draft work.
  unique(o.id);}
 if(input.mode==='edit-floor5'){
  const base=floor5Baseline(),byId=new Map(base.items.map(o=>[o.id,o]));parseArchitecture(a,base.entries);
  for(const o of f.placements){checkMount(o);if(!byId.has(o.id)||![o.x,o.z,o.yaw].every(Number.isFinite)||!within(o.x)||!within(o.z))fail('ändrad Floor 5-möbel');
   if(o.assetId&&!LIBRARY_MAP.has(o.assetId)&&!/^local:[a-f0-9]{64}$/.test(o.assetId))fail('okänd möbelmodell');
   for(const k of ['w','d','height'])if(o[k]!==undefined&&(!Number.isFinite(o[k])||o[k]<=0||o[k]>8))fail('möbelmått');unique(o.id);}
  for(const id of f.removed){if(!byId.has(id))fail('borttagen Floor 5-möbel');unique(id);}
 }
 const sourceData=input.mode==='edit-floor5'?floor5Baseline().data:null;validateOpenedAreas(input,sourceData);validateFloorEdits(input,sourceData);
 const paintIds=new Set([...a.added,...g.floors,...a.floors,...(sourceData?[...floor5Baseline().entries,...sourceData.rooms,...sourceData.corridors,...closedAreas(sourceData)]:[])].map(e=>e.id));validateSurfaceColors(input,paintIds);
 const wallIds=new Set([...a.added,...(sourceData?floor5Baseline().entries:[])].filter(e=>e.kind==='wall').map(e=>e.id));validateSurfaceMaterials(input,wallIds);
 // Floor 5 appearance is an opt-in source-preserving override keyed by original room ID.
 if(input.floorFinishes!==undefined){
  const finishes=input.floorFinishes,allowed=new Set(FLOOR_FINISHES);
  const floorIds=new Set([...g.floors,...a.floors,...(sourceData?[...sourceData.rooms,...sourceData.corridors].filter(f=>f.status!=='uncertain'):[]),
   ...(sourceData?closedAreas(sourceData).filter(f=>(g.openedAreas||[]).includes(f.id)):[])].map(f=>f.id));
  if(!finishes||typeof finishes!=='object'||Array.isArray(finishes)||Object.keys(finishes).length>AUTHORING_LIMITS.floors)fail('golvfinish');
  for(const [id,finish] of Object.entries(finishes))if(!floorIds.has(id)||!allowed.has(finish))fail('okänd golvfinish eller golvyta: '+id);
 }
 const play=input.gameplay;if(play?.mode!=='classic'||!play.counts||!Array.isArray(play.spawns)||play.spawns.length>10||
  !play.objectives||!Array.isArray(play.objectives.hostages))fail('spelregler');
 for(const team of ['analysts','counterAnalysts'])if(!Number.isInteger(play.counts[team])||play.counts[team]<1||play.counts[team]>5)fail('lagstorlek');
 if(play.startElevators!==undefined){
  const list=play.startElevators;
  if(input.mode!=='edit-floor5'||!Array.isArray(list)||list.length>2||new Set(list.map(c=>c?.team)).size!==list.length||
   new Set(list.map(c=>c?.doorId)).size!==list.length||list.some(c=>!c||!['analysts','counterAnalysts'].includes(c.team)||
    !/^I\d{2}$/.test(c.lobbyId)||!/^D\d{2}$|^BYGG-D-\d{1,5}$/.test(c.doorId)||!g.floors.some(f=>f.id===c.floorId)||
    c.excludedAreaId!==undefined&&!/^X\d{2}$/.test(c.excludedAreaId)))fail('startkabiner');
 }
 for(const p of play.spawns){if(!/^SP-[AC]-\d{2}$/.test(p.id)||!['analysts','counterAnalysts'].includes(p.team)||
  !Number.isInteger(p.index)||p.index<0||p.index>4||![p.x,p.z,p.yaw].every(Number.isFinite)||!within(p.x)||!within(p.z)||Math.abs(p.yaw)>Math.PI+.001)fail('spawn');unique(p.id);}
 if(new Set(play.spawns.map(p=>p.team+':'+p.index)).size!==play.spawns.length)fail('dubbelt spawnindex');
 if(play.objectives.hostages.length>2)fail('för många gisslan');
 for(const p of [play.objectives.bomb,play.objectives.rescue,...play.objectives.hostages].filter(Boolean)){
  if(typeof p.id!=='string'||p.id.length>100||!within(p.x)||!within(p.z)||(p.yaw!==undefined&&!Number.isFinite(p.yaw))||
   (p.radius!==undefined&&(!Number.isFinite(p.radius)||p.radius<=0||p.radius>10)))fail('spelmål');unique(p.id);
 }
 if(!Array.isArray(input.navHints)||input.navHints.length>250||typeof input.intent!=='object'||typeof input.validation!=='object'||typeof input.agentBrief!=='object')fail('metadata');
 for(const hint of input.navHints)if(typeof hint.id!=='string'||hint.id.length>100||!Array.isArray(hint.points)||hint.points.length<2||hint.points.length>1000||hint.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(within)))fail('navigationspunkter');
 validateEnvironment(input.environment);
 const assets=input.assets;if(!assets||!Array.isArray(assets.library)||!Array.isArray(assets.local)||!Array.isArray(assets.posters)||assets.local.length>49||assets.posters.length>100)fail('tillgångar');
 for(const row of assets.local){if(!/^local:[a-f0-9]{64}$/.test(row.assetId)||row.file!==`assets/models/${row.assetId.slice(6)}.glb`||
  !Number.isInteger(row.bytes)||row.bytes<0||row.bytes>20e6)fail('modellfil');}
 for(const row of assets.posters){if(!/^[A-Za-z0-9_-]{1,64}$/.test(row.id)||row.file!==`assets/posters/${row.id}.webp`||
  !/^[a-f0-9]{64}$/.test(row.sha256)||!Number.isInteger(row.bytes)||row.bytes<1||row.bytes>5e6)fail('affischfil');}
 if(input.mode==='new-level')for(const o of f.added){if(o.assetId?.startsWith('local:')&&!assets.local.some(row=>row.assetId===o.assetId&&row.bytes>0))fail('saknad lokal modell för '+o.id);}
 if(new TextEncoder().encode(JSON.stringify(input)).length>MAX_PROJECT_JSON_BYTES)fail('JSON över 16 MiB; behåll originalfilen');
 return clone(input);
}

const utf8=new TextDecoder('utf-8',{fatal:true});
export async function exportProjectZip(project,files=new Map()){
 project=parseProject(project);
 const expected=[...project.assets.local,...project.assets.posters];
 const entries=[{name:'project.json',data:JSON.stringify(project,null,2)+'\n'}];
 for(const asset of expected){const bytes=files.get(asset.file);if(!(bytes instanceof Uint8Array)||bytes.length!==asset.bytes||
  await assetHash(bytes)!==(asset.assetId?.slice(6)||asset.sha256))fail('saknad eller ändrad fil '+asset.file);
  entries.push({name:asset.file,data:bytes});}
 if(files.size!==expected.length)fail('oväntade filer');
 entries.push({name:'AGENT_BRIEF.md',data:aiAgentBrief(project)});
 entries.push({name:'COLLISION_MAP.json',data:JSON.stringify(collisionExport(project),null,2)+'\n'});
 return makeZip(entries);
}
export async function parseProjectZip(bytes){
 if(bytes.byteLength>PROJECT_ZIP_MAX_BYTES)fail('ZIP över 96 MiB');
 const files=readZip(bytes),legacy=files.has('projekt.json');
 const project=parseProject(utf8.decode(files.get(legacy?'projekt.json':'project.json')));
 const expected=[...project.assets.local,...project.assets.posters],out=new Map();
 for(const asset of expected){const path=legacy?asset.file.replace('assets/',''):asset.file,data=files.get(path);
  if(!data||data.length!==asset.bytes&&!(legacy&&asset.bytes===0)||await assetHash(data)!==(asset.assetId?.slice(6)||asset.sha256))fail('saknad eller ändrad fil '+path);
  out.set(asset.file,data);if(legacy&&asset.bytes===0)asset.bytes=data.length;}
 const allowed=new Set([legacy?'projekt.json':'project.json',...expected.map(x=>legacy?x.file.replace('assets/',''):x.file),...(!legacy?['AGENT_BRIEF.md','COLLISION_MAP.json']:[])]);
 for(const path of files.keys())if(!allowed.has(path))fail('oväntad ZIP-fil '+path);
 if(!legacy&&files.has('COLLISION_MAP.json')){
  const saved=utf8.decode(files.get('COLLISION_MAP.json'));
  // Verify old exports with their exact historical cutter, not by trusting or
  // ignoring a mismatched map. All new exports use revision 2.
  if(saved!==JSON.stringify(collisionExport(project),null,2)+'\n'&&
   saved!==JSON.stringify(collisionExport(project,{geometryRevision:1}),null,2)+'\n')
   fail('förändrad eller inaktuell kollisionskarta');
 }
 return {project:parseProject(project),files:out};
}
