#!/usr/bin/env node
/** Explicit owner-side installation. Default is read-only; never uploads PROJECT.json. */
import {readFile,writeFile,mkdir,rename,realpath} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readRuntimePackage} from '../character-design/runtime-package.mjs?v=6.1.2';
import {validateActorAsset,actorHash} from '../src/fps/character-runtime-contract.mjs?v=6.1.2';
import {roleSelection} from '../src/fps/character-roles.mjs?v=6.1.2';
import {createDwarfAsset} from '../src/fps/dwarf-rig.mjs?v=6.1.2';
import {characterDataLoader,asBuffer} from './character-data-loader.mjs';
export async function installPackage(packageFile,{root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),apply=false}={}){
 root=await realpath(root);const {contract:c,bytes,files}=await readRuntimePackage(await readFile(packageFile));
 const project=JSON.parse(new TextDecoder().decode(files.get('PROJECT.json'))),selection=roleSelection(project);
 if(selection.role!==c.role||selection.target!==c.target)throw Error('Designoriginalet och spelplatsen stämmer inte överens.');
 const loader=characterDataLoader(),source=c.role==='dwarf'?createDwarfAsset():await (async()=>{
  const original=await readFile(resolve(root,'assets/fps/models',c.source.file));
  if(await actorHash(original)!==c.source.sha256||await actorHash(files.get('BASE_RIG.glb'))!==c.source.sha256)throw Error('Originalriggen skiljer sig från spelets modell. Gör en ny export.');
  return loader.parseAsync(asBuffer(original),'');
 })();
 const asset=await loader.parseAsync(asBuffer(bytes),''),report=validateActorAsset(asset,c,source),file=`assets/fps/custom-characters/${c.sha256}.glb`;
 const registryPath=resolve(root,'assets/fps/character-overrides.json'),registry=JSON.parse(await readFile(registryPath,'utf8'));
 if(registry.schema!==1||!Array.isArray(registry.characters))throw Error('Ogiltigt karaktärsregister.');
 const row={file,contract:c};registry.characters=registry.characters.filter(x=>x.contract.target!==c.target);registry.characters.push(row);
 registry.characters.sort((a,b)=>a.contract.target.localeCompare(b.contract.target));
 if(registry.characters.length>48)throw Error('För många alternativa profiler.');
 if(apply){
  // Write the immutable content first, then atomically replace the roster.
  const dest=resolve(root,file);if(relative(root,dest).startsWith('..'))throw Error('Ogiltig sökväg.');await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes);
  await writeFile(registryPath+'.tmp',JSON.stringify(registry,null,2)+'\n');await rename(registryPath+'.tmp',registryPath);
  const infoPath=resolve(root,'build-info.json'),info=JSON.parse(await readFile(infoPath,'utf8'));
  for(const path of [file,'assets/fps/character-overrides.json']){const b=await readFile(resolve(root,path)),entry={path,bytes:b.length,sha256:await actorHash(b)},index=info.files.findIndex(r=>r.path===path);if(index>=0)info.files[index]=entry;else info.files.push(entry);}
  info.files.sort((a,b)=>a.path.localeCompare(b.path));info.bytes=info.files.reduce((n,r)=>n+r.bytes,0);await writeFile(infoPath,JSON.stringify(info,null,2)+'\n');
 }
 return {applied:apply,target:c.target,role:c.role,file,report,originalProjectPublished:false,visualInspectionRequired:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),file=args.find(a=>!a.startsWith('--'));
 if(!file||args.some(a=>a.startsWith('--')&&!['--apply','--check'].includes(a))){console.error('Usage: node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/install-character-package.mjs FILE.zip [--check | --apply]');process.exitCode=2;}
 else try{console.log(JSON.stringify(await installPackage(file,{apply:args.includes('--apply')}),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
