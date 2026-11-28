// Build-time adapter. Game, server and editor continue to own their definitions.
import {createHash} from 'node:crypto';
import {readFile, realpath} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {inspectActorGLB, ACTOR_VERSION} from '../../src/fps/character-runtime-contract.mjs';
import {BUSINESS_HOSTAGE_FILE} from '../../src/fps/business-hostage.mjs';
import {OUTFITS, EARNED_OUTFITS} from '../../src/fps/operator-outfits.mjs';
import {WEAPONS, DIFFICULTIES, TEAMMATE_DIFFICULTY, TEAMS} from '../../src/fps/config.mjs';
import {ATTACHMENTS, attachmentCost, weaponFits, weaponDefinition} from '../../src/fps/arsenal.mjs';
import {BONUSES, BONUS_HZ, BONUS_VERSION, createBonusState} from '../../src/fps/bonuses.mjs';
import {MODE_NAMES} from '../../src/fps/match-presentation.mjs';
import {simulationMode} from '../../src/fps/match-modes.mjs';
import {soloCatalog} from '../../src/fps/solo-maps.mjs';
import {NETWORK_MAPS} from '../../shared/multiplayer/maps.mjs';
import {challenges} from '../../server/progression.mjs';
import {shotTakes, shotSound} from '../../src/fps/shot-audio.mjs';
import {coastalRecordings, coastalClipPath} from '../../src/fps/coastal-recordings.mjs';
import {tephraRecordings} from '../../src/fps/tephra-ambience.mjs';
import {validateContentPackage} from './package.mjs';
export {validateContentPackage};

const root=fileURLToPath(new URL('../../',import.meta.url));
const compare=(a,b)=>a<b?-1:a>b?1:0;
const sha=value=>createHash('sha256').update(value).digest('hex');
const nodeKey=(kind,id)=>kind+'/'+id;
const hashPattern=/^[0-9a-f]{64}$/;
const operatorRigs=['quaternius-operator-male','quaternius-operator-female'];
const riposte='licenses/riposte-MIT.txt', original='credits.html', quaternius='licenses/quaternius-characters-CC0.txt';
const policies={
 character:['src/fps/character-library.mjs','Shared character template; renderer owns player instances.',quaternius],
 rig:['src/fps/character-runtime-contract.mjs','Embedded scene rig and shared animation clips.',quaternius],
 outfit:['src/fps/operator-outfits.mjs','Avatar owns fitted equipment; the wardrobe preview releases its own copy.',riposte],
 weapon:['src/fps/config.mjs','Authority owns inventory; view and dropped models own their visual instances.',original],
 attachment:['src/fps/arsenal.mjs','Authority resolves stats; weapon-fittings releases mesh and finish resources.',riposte],
 map:['shared/multiplayer/maps.mjs','Room owns simulation, renderer, ambience and teardown.',original],
 mode:['src/fps/match-modes.mjs','Solo simulation or authoritative room owns match state.',original],
 bonus:['src/fps/bonuses.mjs','Authority or Solo simulation owns per-life charges and expiry.',riposte],
 audio:['src/fps/shot-audio.mjs','Game audio system owns buffers and stops scheduled voices on reset.','licenses/riposte-sfx-credits.json'],
 bot:['src/fps/config.mjs','Solo simulation or authoritative room owns controller lifetime.',original],
 theme:['ui/cs-theme.css','Browser owns stylesheet and scoped CSS properties.',original],
 progression:['server/progression.mjs','Authority commits match receipts; private account stores own counters.',riposte],
};

function requireValue(value,message){if(!value)throw Error(message);}
function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort(compare).map(key=>[key,stable(value[key])]));
 if(typeof value==='number')requireValue(Number.isFinite(value),'Non-finite catalog value.');
 return value;
}
const digest=value=>sha(JSON.stringify(stable(value)));
const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id);
const positive=n=>Number.isFinite(n)&&n>0;
const relativeFile=p=>typeof p==='string'&&/^[a-zA-Z0-9._/-]+$/.test(p)&&!p.split('/').some(s=>!s||s==='.'||s==='..');

async function readReviewedFile(path){
 requireValue(relativeFile(path),'Invalid reviewed file path: '+path);
 const file=resolve(root,path);
 requireValue(await realpath(file)===file,'Linked catalog assets are unsupported: '+path);
 return readFile(file);
}

const semantics={idle:'Idle_Loop',walk:'Walk_Loop',jog:'Jog_Fwd_Loop',rush:'Sprint_Loop',air:'Jump_Loop',
 crouch:'Crouch_Idle_Loop',crouchWalk:'Crouch_Fwd_Loop',death:'Death01'};
function inspectRig(bytes){
 const model=inspectActorGLB(bytes), animations=new Set(model.animations?.map(a=>a.name));
 for(const name of Object.values(semantics))requireValue(animations.has(name),'Missing character animation '+name);
 const parents=new Map(model.nodes.flatMap((node,i)=>(node.children||[]).map(child=>[child,i])));
 // Include bind matrices as bytes, as well as hierarchy and rest transforms.
 const rigs=model.skins.map(skin=>{
  const joints=skin.joints.map(j=>{
   const node=model.nodes[j];requireValue(node?.name,'A joint has no name.');
   return {name:node.name,parent:model.nodes[parents.get(j)]?.name||null,
    matrix:node.matrix||null,translation:node.translation||null,rotation:node.rotation||null,scale:node.scale||null};
  });
  const accessor=model.accessors[skin.inverseBindMatrices],view=model.bufferViews[accessor?.bufferView];
  requireValue(accessor?.type==='MAT4'&&accessor.componentType===5126&&accessor.count===joints.length&&view?.buffer===0,'Invalid inverse bind matrix table.');
  const size=bytes.readUInt32LE(12), binStart=28+size+(view.byteOffset??0)+(accessor.byteOffset??0);
  const stride=view.byteStride??64;
  requireValue(stride>=64&&binStart+(joints.length-1)*stride+64<=bytes.length,'Incomplete rig bind matrices.');
  const matrices=Buffer.concat(joints.map((_,i)=>bytes.subarray(binStart+i*stride,binStart+i*stride+64)));
  return {joints,bindMatrices:sha(matrices)};
 });
 return {up:'+Y',front:'+Z',contractVersion:ACTOR_VERSION,skinCount:rigs.length,jointCounts:rigs.map(s=>s.joints.length),
  signature:digest(rigs),clips:[...animations].sort(compare),semantics};
}

export async function buildContentCatalog({mapContracts}={}){
 // The network builder supplies the fingerprints it just measured. Standalone
 // inspection uses the published map contracts and never hashes its own build.
 mapContracts??=(await import('../../shared/multiplayer/map-build.mjs')).MAP_CONTRACTS;
 const entries=[], assets=new Map(), ids=new Set();
 async function asset(path,bytes){
  if(!assets.has(path)){
   bytes??=await readReviewedFile(path);assets.set(path,{path,bytes:bytes.length,sha256:sha(bytes)});
  }
  return path;
 }
 function add(kind,id,label,details,files=[],patch={}){
  const key=nodeKey(kind,id),[source,owner,license]=policies[kind];
  requireValue(safeId(id)&&typeof label==='string'&&label.trim()&&!ids.has(key),'Invalid or duplicate content identity: '+key);
  ids.add(key);
  const entry={kind,id,version:1,label,source,owner,license,assets:files,details,...patch};
  entry.digest=digest([entry,files.map(f=>assets.get(f)?.sha256)]);entries.push(entry);
 }

 for(const id of [...operatorRigs,'business-hostage']){
  const hostage=id==='business-hostage',path=hostage?BUSINESS_HOSTAGE_FILE:'assets/fps/models/'+id+'.glb';
  const bytes=await readReviewedFile(path),rig=inspectRig(bytes);await asset(path,bytes);
  add('rig',id,id,rig,[path]);
  add('character',id,hostage?'Business visitor':id.endsWith('female')?'Female operator':'Male operator',
   {rig:id,role:hostage?'hostage':'player',teams:hostage?[]:Object.keys(TEAMS),wardrobe:!hostage,
    view:hostage?null:'src/fps/view-character-appearance.mjs',fallback:hostage?'procedural hostage':'issued'},[path]);
 }
 const installedOutfits=OUTFITS.filter(outfit=>outfit.kit);
 const packPath='assets/fps/outfit-packs.json';
 const declarations=installedOutfits.length?JSON.parse(await readReviewedFile(packPath)).packages:[];
 if(installedOutfits.length)await asset(packPath);
 for(const outfit of [...OUTFITS,...EARNED_OUTFITS]){
  requireValue(outfit.id==='issued'||['shirt','vest','glove'].every(k=>Number.isInteger(outfit[k])&&outfit[k]>=0&&outfit[k]<=0xffffff),'Invalid outfit material: '+outfit.id);
  const goals=challenges.filter(c=>c.outfit===outfit.id).map(c=>c.id);
  const declaration=declarations.find(pack=>pack.id===outfit.id),installed=installedOutfits.includes(outfit);
  if(installed){
   requireValue(declaration?.rights?.creator&&declaration.rights.license,'Missing installed palette attribution: '+outfit.id);
   for(const sex of ['male','female'])requireValue(declaration.rigs[sex]===assets.get('assets/fps/models/quaternius-operator-'+sex+'.glb').sha256,'Installed outfit rig differs from shipped model: '+outfit.id);
  }
  add('outfit',outfit.id,outfit.name,{style:outfit,rigs:operatorRigs,teams:Object.keys(TEAMS),requiresAll:goals,cosmetic:true,
   ...(installed?{attribution:declaration.rights}:{})},installed?[packPath]:[],installed?{source:packPath,license:declaration.rights.license}:{});
 }
 for(const w of Object.values(WEAPONS)){
  requireValue(Number.isInteger(w.cost)&&w.cost>=0,'Invalid Classic price: '+w.id);
  requireValue(['primary','pistol','knife','grenade','bomb','armor'].includes(w.slot),'Invalid weapon slot: '+w.id);
  if(['primary','pistol','knife'].includes(w.slot))requireValue(positive(w.interval)&&positive(w.range)&&positive(w.damage),'Invalid weapon range, damage or cadence: '+w.id);
  if(['primary','pistol'].includes(w.slot))requireValue(Number.isInteger(w.magazine)&&w.magazine>0&&Number.isInteger(w.reserve)&&w.reserve>=0&&positive(w.reload),'Invalid weapon ammunition or reload: '+w.id);
  if(w.team)requireValue(Object.hasOwn(TEAMS,w.team),'Unknown weapon team: '+w.id);
  const sound=shotSound({weapon:w.id,actorId:'self'},{x:0,y:0,z:0},'self');
  add('weapon',w.id,w.name,{stats:w,classicPrice:w.cost,model:'src/fps/strike-kit-models.mjs',
   fitting:'src/fps/weapon-fittings.mjs',audio:sound?sound.bank+'-1':null});
 }
 for(const a of Object.values(ATTACHMENTS)){
  const weapons=Object.keys(WEAPONS).filter(w=>weaponFits(w,a.id));
  requireValue(weapons.length&&Number.isInteger(a.level)&&a.level>=1&&['optic','barrel','under','side','magazine','stock'].includes(a.group),'Unreachable attachment: '+a.id);
  for(const w of weapons){
   const stats=weaponDefinition(w,[a.id]);
   requireValue([stats.interval,stats.reload,stats.range,stats.damage,stats.adsTime,stats.magazine].every(positive),'Invalid fitted weapon stats: '+w+'/'+a.id);
  }
  add('attachment',a.id,a.name,{...a,weapons,classicCost:attachmentCost,model:'src/fps/weapon-fittings.mjs'});
 }

 const manifest=JSON.parse(await readReviewedFile('levels/manifest.json')), solo=soloCatalog(manifest);
 for(const m of NETWORK_MAPS){
  const bytes=await readReviewedFile(m.file),level=JSON.parse(bytes),contract=mapContracts[m.id];
  requireValue(hashPattern.test(contract?.mapHash)&&hashPattern.test(contract?.collisionHash),'Missing map fingerprint: '+m.id);
  requireValue(contract.mapHash===sha(bytes),'Map bytes disagree with authority: '+m.id);
  const bounds=level.ground?.bounds,spawns=level.gameplay?.spawns;
  requireValue(bounds&&[bounds.x0,bounds.z0,bounds.x1,bounds.z1].every(Number.isFinite)&&bounds.x0<bounds.x1&&bounds.z0<bounds.z1,'Invalid map bounds: '+m.id);
  for(const team of Object.keys(TEAMS))requireValue(spawns?.some(s=>s.team===team),'No spawn for '+team+' on '+m.id);
  for(const spawn of spawns)requireValue(Object.hasOwn(TEAMS,spawn.team)&&[spawn.x,spawn.z,spawn.yaw].every(Number.isFinite)&&
   spawn.x>=bounds.x0&&spawn.x<=bounds.x1&&spawn.z>=bounds.z0&&spawn.z<=bounds.z1,'Invalid team spawn: '+m.id);
  const online=[...m.modes],soloModes=solo.find(s=>s.id===m.id)?.modes??[];
  for(const mode of [...online,...soloModes])requireValue(Object.hasOwn(MODE_NAMES,mode),'Unknown map mode: '+mode);
  const rights=manifest.levels.find(l=>l.id===m.id)?.rights;requireValue(rights,'Missing map rights: '+m.id);
  add('map',m.id,m.name,{levelVersion:level.schemaVersion,units:level.units,bounds,spawns,online,solo:soloModes,
   objectives:Object.keys(level.gameplay.objectives||{}),mapHash:contract.mapHash,collisionHash:contract.collisionHash,rights},
   [await asset(m.file,bytes),await asset(m.preview)],{license:level.referenceMap?riposte:original});
 }
 for(const [id,name] of Object.entries(MODE_NAMES)){
  add('mode',id,name,{simulation:simulationMode(id),online:NETWORK_MAPS.filter(m=>m.modes.includes(id)).map(m=>m.id),
   solo:solo.filter(m=>m.modes.includes(id)).map(m=>m.id)},[],{license:['ffa','dom'].includes(id)?riposte:original});
 }
 const charges=createBonusState().charges;
 for(const [index,b] of BONUSES.entries()){
  requireValue(Object.hasOwn(charges,b.id)&&b.slot===index+1&&Number.isInteger(b.threshold)&&b.threshold>0&&
   Number.isInteger(b.durationTicks)&&b.durationTicks>0,'Invalid bonus timing: '+b.id);
  add('bonus',b.id,b.name,{...b,stateVersion:BONUS_VERSION,ticksPerSecond:BONUS_HZ});
 }
 for(const profile of [...Object.values(DIFFICULTIES),TEAMMATE_DIFFICULTY]){
  requireValue(positive(profile.reactionMin)&&profile.reactionMax>=profile.reactionMin&&Number.isInteger(profile.burstMax)&&
   profile.burstMax>=profile.burstMin&&profile.burstMin>=1&&profile.humanDamage>0&&profile.humanDamage<=1,'Invalid bot profile: '+profile.id);
  add('bot',profile.id,profile.name,{profile,owner:profile.id==='teammate'?'team':'opponent'});
 }
 const credits=JSON.parse(await readReviewedFile('licenses/riposte-sfx-credits.json'));
 async function recording(id,take,pack,path,channel,source,owner){
  const refs=credits.sons.filter(s=>s.pack===pack&&s.id===take);
  requireValue(refs.length,'Missing recording attribution: '+pack+'/'+take);
  const attribution=[...new Set(refs.map(s=>s.source))].map(id=>{
   const credit=credits.sources[id];requireValue(credit?.licence&&credit?.auteur,'Incomplete recording rights: '+id);
   return {id,creator:credit.auteur,license:credit.licence,url:credit.url};
  });
  add('audio',id,take,{channel,take,pack,attribution},[await asset(path)],{source,owner});
 }
 for(const take of shotTakes)await recording(take,take,'armes','assets/fps/audio/riposte-'+take+'.mp3','weapon','src/fps/shot-audio.mjs',
  'Game audio owns buffers; each firearm voice is released when stopped or ended.');
 for(const [map,takes] of Object.entries({...coastalRecordings,tephra:tephraRecordings})){
  for(const take of Object.keys(takes))await recording(map+'-'+take,take,'amb_'+map,coastalClipPath(map,take),'ambience',
   map==='tephra'?'src/fps/tephra-ambience.mjs':'src/fps/coastal-recordings.mjs','Map ambience owns scheduler, spatial nodes and sources until map disposal.');
 }
 const theme='ui/cs-theme.css',css=await readReviewedFile(theme);
 const tokens=Object.fromEntries([...css.toString().matchAll(/(--cs-[a-z0-9-]+)\s*:\s*([^;{}]+)/g)].map(m=>[m[1],m[2].trim()]));
 requireValue(tokens['--cs-mono']&&tokens['--cs-ease'],'Missing interface theme tokens.');
 add('theme','tactical-industrial','Tactical Industrial',{tokens},[await asset(theme,css)]);
 for(const c of challenges){
  requireValue(ids.has(nodeKey('outfit',c.outfit))&&Number.isInteger(c.goal)&&c.goal>0,'Invalid challenge: '+c.id);
  add('progression',c.id,c.label,{goal:c.goal,outfit:c.outfit,awarder:'server/match-credits.mjs'});
 }
 entries.sort((a,b)=>compare(nodeKey(a.kind,a.id),nodeKey(b.kind,b.id)));
 const result={version:1,entries,assets:[...assets.values()].sort((a,b)=>compare(a.path,b.path))};
 return {...result,digest:digest(result)};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const [command,path,...extra]=process.argv.slice(2);
  requireValue(!extra.length&&(command==='list'&&!path||command==='check'&&path),'Usage: node tools/content/catalog.mjs list | check PACKAGE.json');
  const catalog=await buildContentCatalog();
  const output=command==='list'?catalog:validateContentPackage(JSON.parse(await readFile(path,'utf8')),catalog);
  console.log(JSON.stringify(output,null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
