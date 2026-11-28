// Build a public site or private pilot from the verified runtime inventory.
import {createHash} from 'node:crypto';
import {lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {basename, dirname, join, posix, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repo=fileURLToPath(new URL('../',import.meta.url));
const requireServer=createRequire(new URL('../server/package.json',import.meta.url));
const {parse}=requireServer('acorn');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const publicRoots=new Set(['assets','audio','fps','furniture-editor','levels','licenses','shared','src','ui','vendor']);
const publicSingles=new Set(['.nojekyll','index.html','credits.html','robots.txt','Business_Man_Quaternius_Anims.glb','docs/fps-furniture-library.md']);
const privateEntries=['server/local-server.mjs','server/register-shared.mjs','server/account-backup.mjs',
  'server/package.json','server/package-lock.json','server/.node-version','tools/vendor-three-test-loader.mjs'];

export function checkPublicPath(path){
  if(typeof path!=='string'||!path||path.includes('\\')||path.includes('%')||path.includes('?')||path.includes('#')||
     /[\x00-\x1f\x7f]/.test(path)||posix.normalize(path)!==path||path.endsWith('/'))
    throw Error('Invalid runtime path: '+path);
  if(publicSingles.has(path))return;
  const parts=path.split('/');
  if(!publicRoots.has(parts[0])||parts.some(p=>p.startsWith('.')||['node_modules','tests','test','references','frontline'].includes(p))||
     /(?:^|\/)(?:IMG_\d+|ScreenRecording[^/]*)\./i.test(path)||/\.test\.[cm]?js$/i.test(path)||
     !(/\.(?:mjs|js|json|css|html|webmanifest|glb|(?:bin|glb|json)\.gz|mp3|ogg|png|jpe?g|webp|woff2|txt|md)$/i.test(path)||/(?:\/|-)LICENSE$/.test(path)))
    throw Error('Outside public runtime: '+path);
}

function moduleReferences(source,browser,path){
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true}),refs=[];
  const pending=[ast];
  while(pending.length){
    const node=pending.pop();
    if(node.type==='ImportExpression'&&node.source?.type!=='Literal')throw Error(path+' uses a computed module import. Enumerate the supported modules with literal import() paths.');
    if(['ImportDeclaration','ExportAllDeclaration','ExportNamedDeclaration','ImportExpression'].includes(node.type)&&node.source?.type==='Literal')
      refs.push(node.source.value);
    if(browser&&node.type==='NewExpression'&&node.callee.name==='URL'){
      const [file,base]=node.arguments;
      if(file?.type==='Literal'&&typeof file.value==='string'&&!file.value.endsWith('/')&&
         base?.type==='MemberExpression'&&base.object?.type==='MetaProperty'&&base.property?.name==='url'){
        refs.push(file.value.startsWith('.')||file.value.startsWith('/')?file.value:'./'+file.value);
      }
    }
    for(const child of Object.values(node)){
      if(Array.isArray(child)){for(const item of child)if(item?.type)pending.push(item);}
      else if(child?.type)pending.push(child);
    }
  }
  return refs;
}

function relativeTo(owner,url){
  const path=url.split(/[?#]/,1)[0];
  return posix.normalize(path.startsWith('/')?path.slice(1):posix.join(posix.dirname(owner),path));
}
function webReferences(path,text){
  if(path.endsWith('.webmanifest'))return (JSON.parse(text).icons??[]).map(i=>i.src);
  if(path.endsWith('.css'))return [...text.matchAll(/url\(\s*['"]?([^)'"]+)['"]?\s*\)|@import\s+['"]([^'"]+)['"]/gi)].map(m=>m[1]??m[2]);
  if(!path.endsWith('.html'))return [];
  return [...text.matchAll(/<(?:link|script|img|source)\b[^>]*>/gi)].flatMap(([tag])=>{
    const attr=/\b(?:src|href)\s*=\s*(['"])(.*?)\1/i.exec(tag);
    return attr?[attr[2]]:[];
  });
}

async function regularFile(root,path){
  const full=join(root,path);
  if(await realpath(full)!==full||!(await lstat(full)).isFile())throw Error('Expected a regular runtime file: '+path);
  return readFile(full);
}

export async function inspectDistribution(directory=repo){
  const root=await realpath(directory);
  const manifestBytes=await regularFile(root,'build-info.json'),info=JSON.parse(manifestBytes);
  const publicFiles=new Map(),privateFiles=new Map(),imports=new Map();
  const npmDependencies=Object.keys(JSON.parse(await regularFile(root,'server/package.json')).dependencies);
  function inspect(path,bytes,browser){
    const references=[];
    if(/\.(mjs|js)$/.test(path)){
      for(const spec of moduleReferences(bytes.toString('utf8'),browser,path)){
        if(spec.startsWith('.')||spec.startsWith('/'))references.push(relativeTo(path,spec));
        else if(spec==='three')references.push('vendor/three/three.module.js');
        else if(spec.startsWith('three/addons/'))references.push('vendor/three/addons/'+spec.slice('three/addons/'.length));
        else if(browser||(!spec.startsWith('node:')&&!npmDependencies.includes(spec)))throw Error(path+' imports an undeclared module: '+spec);
      }
    }else if(/\.(html|css|webmanifest)$/.test(path)){
      for(const spec of webReferences(path,bytes.toString('utf8'))){
        if(!spec||spec.startsWith('#')||spec.startsWith('data:'))continue;
        if(/^(?:[a-z]+:|\/\/)/i.test(spec))throw Error(path+' references an external resource: '+spec);
        references.push(relativeTo(path,spec));
      }
    }
    imports.set(path,references);
    return references;
  }
  for(const file of info.files){
    checkPublicPath(file.path);
    if(publicFiles.has(file.path))throw Error('Duplicate public path: '+file.path);
    const data=await regularFile(root,file.path);
    if(file.bytes!==data.length||file.sha256!==digest(data))throw Error('Public bytes differ: '+file.path);
    publicFiles.set(file.path,file);inspect(file.path,data,true);
  }
  for(const [owner,refs] of imports)for(const ref of refs)if(!publicFiles.has(ref))throw Error(owner+' needs a public manifest entry for '+ref);
  if(info.bytes!==[...publicFiles.values()].reduce((n,f)=>n+f.bytes,0))throw Error('Wrong public byte total');
  const pending=[...privateEntries];
  while(pending.length){
    const path=pending.pop();
    if(publicFiles.has(path)||privateFiles.has(path))continue;
    if(!privateEntries.includes(path)&&!/^server\/[a-z][a-z0-9-]*\.mjs$/.test(path))throw Error('Undeclared private dependency: '+path);
    const data=await regularFile(root,path);privateFiles.set(path,{path,bytes:data.length,sha256:digest(data)});
    pending.push(...inspect(path,data,false));
  }
  return {root,manifest:{path:'build-info.json',bytes:manifestBytes.length,sha256:digest(manifestBytes)},
    publicFiles:[...publicFiles.values()],privateFiles:[...privateFiles.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)};
}

export async function exportDistribution(inventory,target,surface){
  if(!['public','pilot'].includes(surface))throw Error('Choose a public or pilot distribution');
  const output=resolve(target),parent=dirname(output);
  const lock=output+'.lock';
  await mkdir(lock);
  let pending;
  try{
    try{await lstat(output);throw Error('Output already exists: '+output);}catch(e){if(e.code!=='ENOENT')throw e;}
    pending=await mkdtemp(join(parent,'.'+basename(output)+'-'));
    for(const file of [inventory.manifest,...inventory.publicFiles,...(surface==='pilot'?inventory.privateFiles:[])]){
      const data=await regularFile(inventory.root,file.path);
      if(data.length!==file.bytes||digest(data)!==file.sha256)throw Error('Runtime changed during export: '+file.path);
      const dest=join(pending,file.path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,data,{flag:'wx'});
    }
    await rename(pending,output);pending=undefined;
  }finally{
    if(pending)await rm(pending,{recursive:true,force:true});
    await rm(lock,{recursive:true});
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [command='check',target,...rest]=process.argv.slice(2);
  if(rest.length||!(command==='check'&&!target||['public','pilot'].includes(command)&&target))throw Error('Usage: node tools/runtime-distribution.mjs check | public NEW_DIRECTORY | pilot NEW_DIRECTORY');
  const inventory=await inspectDistribution();
  if(target)await exportDistribution(inventory,target,command);
  console.log(JSON.stringify({status:'PASS',surface:command,publicFiles:inventory.publicFiles.length,privateFiles:inventory.privateFiles.length,publicManifest:inventory.manifest.sha256}));
}
