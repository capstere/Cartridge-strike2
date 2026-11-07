#!/usr/bin/env node
/**
 * Binary-safe, fail-closed restoration of the 13 larger owner-provided onboard GLBs.
 *
 * Commands:
 *   node tools/restore-onboard-large.mjs --plan
 *   node tools/restore-onboard-large.mjs --restore --source ../onboard
 *   GENERATE_THUMBS=1 node tools/onboard-library-smoke.mjs  # requires local HTTP server + Chromium
 *   node tools/restore-onboard-large.mjs --finalize
 *
 * Never downloads private binaries via a connector or writes into the source repo.
 * The entire source binary is read by Git at a PINNED commit and SHA-256 checked
 * before a single destination file is written.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectGLB} from '../furniture-editor/library/glb-utils.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(join(root,path),'utf8');
const digest=data=>createHash('sha256').update(data).digest('hex');
const bytes=data=>Buffer.byteLength(data,'utf8');
const spec=JSON.parse(read('tools/onboard-large-source-catalog.json'));
const sourceRepo='capstere/onboard';
const sourceCommit='fef84ac9686014ea960346ed60eea17756f81c0e';
assert.equal(spec.schemaVersion,1);
assert.equal(spec.sourceRepo,sourceRepo);
assert.equal(spec.sourceCommit,sourceCommit);
assert.equal(spec.entries.length,28);
const expected=spec.entries;
const expectedIds=new Set(expected.map(e=>e.id));
assert.equal(expectedIds.size,28,'Duplicate catalog entries');

function parseCatalog(source){
  return JSON.parse(source.slice(source.indexOf('['),source.lastIndexOf(']')+1));
}
const catalogPath='furniture-editor/library/onboard-catalog.mjs';
const oldCatalog=read(catalogPath),current=parseCatalog(oldCatalog);
const currentIds=new Set(current.map(e=>e.id));
assert.equal(currentIds.size,current.length);
for(const e of current){
  const pinned=expected.find(v=>v.id===e.id);
  assert(pinned,'Unexpected onboard entry: '+e.id);
  assert.deepEqual(e,pinned,'Existing onboard metadata has changed: '+e.id);
}
assert([15,28].includes(current.length),'Expected 15 original or 28 restored models');
const missing=expected.filter(e=>!currentIds.has(e.id));
assert([0,13].includes(missing.length),'Unexpected set of missing models');
const recordModel=e=>'furniture-editor/'+e.url.slice(2);
const recordThumb=e=>'furniture-editor/'+e.thumb.slice(2);

for(const e of expected){
  assert(e.id.startsWith('onboard:') && e.source===sourceRepo,'Wrong source identity');
  assert(e.sourceCommit===sourceCommit,'Source commit drift');
  assert(/^asset-portfolio\/[A-Za-z0-9_ /.-]+\.glb$/.test(e.sourcePath));
  assert(!e.sourcePath.split('/').includes('..'),'Unsafe source path');
  assert(e.url.startsWith('./library/models/onboard/') && e.url.endsWith('.glb'));
  assert(e.thumb.startsWith('./library/thumbs/onboard/') && e.thumb.endsWith('.png'));
  assert(/^[0-9a-f]{64}$/.test(e.sha256),'Invalid SHA-256');
  assert(Number.isInteger(e.bytes) && e.bytes>28 && e.bytes<=8*1024*1024,'Invalid size');
}

function replaceOne(path,from,to){
  const original=read(path);
  const matches=original.split(from).length-1;
  assert.equal(matches,1,'Out-of-date patch for '+path+': '+from);
  return original.replace(from,to);
}
function patchSequence(path,changes){
  let value=read(path);
  for(const [from,to] of changes){
    assert.equal(value.split(from).length-1,1,'Unexpected '+path+' content: '+from);
    value=value.replace(from,to);
  }
  return value;
}
function validateBinary(entry,data){
  assert.equal(data.byteLength,entry.bytes,'Size mismatch: '+entry.id);
  assert.equal(digest(data),entry.sha256,'SHA-256 mismatch: '+entry.id);
  inspectGLB(data); // Reject unsupported, truncated or external-URI glTF files.
}
const command=process.argv[2]||'--plan';

if(command==='--plan'){
  const report={status:'PLAN_OK',source:sourceRepo,sourceCommit,expected:expected.length,
    installed:current.length,toRestore:missing.length,
    sourceBytes:missing.reduce((n,x)=>n+x.bytes,0),
    models:missing.map(x=>({id:x.id,bytes:x.bytes,path:x.sourcePath}))};
  if(missing.length===0){
    for(const e of expected)validateBinary(e,readFileSync(join(root,recordModel(e))));
    report.status='RESTORED_BINARY_VERIFIED';
  }
  console.log(JSON.stringify(report,null,2));
}else if(command==='--restore'){
  assert.equal(missing.length,13,'Restore only from the documented 15-model baseline');
  const pos=process.argv.indexOf('--source');
  assert(pos>=0 && process.argv[pos+1],'Pass --source /path/to/private/onboard-clone');
  const source=resolve(process.argv[pos+1]);
  // A pinned Git checkout is preferred. An authenticated source ZIP extracted
  // as a folder is also safe: byte length + SHA-256 remain mandatory for each file.
  let gitCheckout=false;
  try{
    gitCheckout=execFileSync('git',['-C',source,'rev-parse','--is-inside-work-tree'],
      {encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()==='true';
  }catch{}
  assert(existsSync(source),'No such source directory: '+source);
  // Validate ALL 13 originals before writing ANY data.
  const files=missing.map(entry=>{
    const data=gitCheckout
      ? execFileSync('git',['-C',source,'show',sourceCommit+':'+entry.sourcePath],
          {encoding:'buffer',maxBuffer:16*1024*1024})
      : readFileSync(join(source,entry.sourcePath));
    validateBinary(entry,data);
    const dest=join(root,recordModel(entry));
    assert(!existsSync(dest),'Destination already exists; refusing to overwrite '+dest);
    return {entry,dest,data};
  });

  const updates=new Map();
  const prefix=oldCatalog.slice(0,oldCatalog.indexOf('['));
  const suffix=oldCatalog.slice(oldCatalog.lastIndexOf(']')+1);
  updates.set(catalogPath,prefix+JSON.stringify(expected,null,2)+suffix);
  updates.set('furniture-editor/library/onboard.test.mjs',replaceOne(
    'furniture-editor/library/onboard.test.mjs','ONBOARD_LIBRARY.length,15','ONBOARD_LIBRARY.length,28'));
  updates.set('tools/onboard-library-smoke.mjs',patchSequence('tools/onboard-library-smoke.mjs',[
    ['result.count,15','result.count,28'],
    ["locator('.catalog-card').count(),15","locator('.catalog-card').count(),28"]
  ]));
  updates.set('furniture-editor/editor-browser.mjs',patchSequence('furniture-editor/editor-browser.mjs',[
    ['alongside 15 verified onboard models','alongside 28 verified onboard models'],
    ['catalogCounts.onboard===15','catalogCounts.onboard===28'],
    ['catalogCounts.total===141','catalogCounts.total===154'],
    ['catalogCounts.visible===141','catalogCounts.visible===154']
  ]));
  updates.set('tools/level-browser-smoke.mjs',replaceOne('tools/level-browser-smoke.mjs',
    "'#catalogCards .catalog-card').count(),141","'#catalogCards .catalog-card').count(),154"));
  updates.set('furniture-editor/README.md',replaceOne('furniture-editor/README.md',
    '15 nya objekt med förhandsbilder','28 nya objekt med förhandsbilder'));
  updates.set('docs/onboard-library.md',[
    '# Onboard-biblioteket · 30 oktober 2026',
    '',
    '**28 SHA-256-verifierade GLB-modeller** från capstere/onboard är nu tillgängliga.',
    'Designstudion har totalt **154 katalogobjekt** (104 kuraterade, 22 procedurmodeller och 28 onboard).',
    'Välj Möblera → Nytt från onboard. Flervordssökning, svenska/originalnamn,',
    'filtret Används i banan och Rensa sökning och filter fungerar som tidigare.',
    '',
    'Samtliga 13 större original laddades via lokal Git direkt från källcommit',
    sourceCommit+'. Alla 28 modeller har verifierad SHA-256 och glTF-struktur.',
    'Förhandsbilderna är genererade i riktig Chromium/WebGL efter importen.',
    'Spelbanornas geometri, kollisionssystem och FPS-stridslogik är oförändrade.',
    '',
    '**Rättigheter:** Innan offentlig distribution måste licensvillkor vara',
    'säkerställda för varje modell, särskilt tredjepartskaraktärer och kändisliknelser.',
    'Ägarens godkännande är inte automatiskt samma sak som upphovsrättstillstånd.',
    '',
    '## Nästa steg',
    'Dela samlingsmodeller, optimera högpolygonmodeller vid behov och ge riggade',
    'karaktärer separat animationsstöd. Statiska figurer/vapen/dörrar är dekor.',
    ''
  ].join('\n'));

  for(const file of files){
    mkdirSync(dirname(file.dest),{recursive:true});
    writeFileSync(file.dest,file.data);
    console.log('RESTORED '+file.entry.id+' '+file.data.byteLength+' bytes');
  }
  for(const [path,value] of updates)writeFileSync(join(root,path),value,'utf8');
  console.log('PASS: 13 exact originals restored. Generate WebGL previews, then run --finalize; DO NOT PUSH before finalization.');
}else if(command==='--finalize'){
  assert.equal(missing.length,0,'Restore all 13 files first');
  // Regenerate previews with GENERATE_THUMBS=1 before calling this step.
  // Every static runtime file has to match its pinned source checksum.
  const infoPath='build-info.json',info=JSON.parse(read(infoPath));
  assert(Array.isArray(info.files) && Number.isSafeInteger(info.bytes),'Malformed build manifest');
  const byPath=new Map(info.files.map(row=>[row.path,row]));
  assert.equal(byPath.size,info.files.length,'Duplicate build-manifest paths');
  let change=0;
  function register(path,expectedHash=null,expectedLength=null){
    const filename=join(root,path);
    assert(existsSync(filename),'Missing '+path);
    const data=readFileSync(filename),sha=digest(data);
    if(expectedHash!==null)assert.equal(sha,expectedHash,'Wrong SHA: '+path);
    if(expectedLength!==null)assert.equal(data.length,expectedLength,'Wrong length: '+path);
    const previous=byPath.get(path);
    change+=data.length-(previous?.bytes||0);
    byPath.set(path,{path,bytes:data.length,sha256:sha});
    return data;
  }
  const pngMagic=Buffer.from([137,80,78,71,13,10,26,10]);
  for(const e of expected){
    validateBinary(e,register(recordModel(e),e.sha256,e.bytes));
    const thumbnail=register(recordThumb(e));
    assert(thumbnail.length>100 && thumbnail.subarray(0,8).equals(pngMagic),'Bad preview: '+e.id);
  }
  register(catalogPath);
  info.files=[...byPath.values()].sort((a,b)=>a.path.localeCompare(b.path,'en'));
  info.bytes+=change;
  writeFileSync(join(root,infoPath),JSON.stringify(info,null,2)+'\n','utf8');
  console.log(JSON.stringify({status:'READY_FOR_TESTS',restored:13,catalog:expected.length,
    total:154,manifestFiles:info.files.length,manifestByteDelta:change},null,2));
}else{
  throw Error('Usage: --plan | --restore --source PATH | --finalize');
}
