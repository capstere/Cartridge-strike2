/** Publish only validated, rights-reviewed level projects. No URLs or arbitrary output paths. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {parseProject,parseProjectZip} from '../furniture-editor/build/level-project.mjs';
import {validateLevel} from '../furniture-editor/build/validate-level.mjs';
import {createHash} from 'node:crypto';

const [input,id,mode]=process.argv.slice(2);
if(!input||!/^[a-z0-9-]{1,48}$/.test(id||''))throw Error('Usage: node tools/apply-level-project.mjs project.json|project.zip safe-level-id');
const file=resolve(input),bytes=readFileSync(file);
if(bytes.length>96*1024*1024)throw Error('Project exceeds size limit');
const zip=basename(file).toLowerCase().endsWith('.zip'),loaded=zip?await parseProjectZip(bytes):{project:parseProject(bytes.toString('utf8')),files:new Map()};
const {project,files}=loaded;
const makeDefault=mode==='--default-floor5';
if(mode&&!makeDefault||project.mode==='edit-floor5'&&!makeDefault||makeDefault&&project.mode!=='edit-floor5')
 throw Error('Publishing inherited Floor 5 requires an explicit --default-floor5 review');
const rights=JSON.parse(readFileSync(new URL('./approved-level-assets.json',import.meta.url),'utf8'));
for(const asset of [...project.assets.local,...project.assets.posters]){
 const hash=asset.assetId?.slice(6)||asset.sha256,record=rights.sha256[hash];
 if(!record||record.license!==asset.license||record.authorizedLevel&&record.authorizedLevel!==id||!record.source||!record.reviewedBy)
  throw Error(`Asset ${hash} lacks an independent rights record in tools/approved-level-assets.json`);
 if(!files.has(asset.file))throw Error(`Missing ${asset.file}; use the complete ZIP`);
}
const result=validateLevel(project,{engine:true});if(!result.summary.playable)throw Error(`Engine validation found ${result.summary.errors} errors: ${result.results.filter(r=>r.status==='fail').map(r=>r.check+': '+r.detail).join('; ')}`);
const root=new URL('../',import.meta.url),target=new URL(`levels/${id}.json`,root);
if(existsSync(target))throw Error('Existing published level must be reviewed and replaced explicitly');
const manifestPath=new URL('levels/manifest.json',root),manifest=JSON.parse(readFileSync(manifestPath));
if(manifest.levels.some(row=>row.id===id))throw Error('Duplicate level ID');
for(const [path,asset] of files){const dest=new URL(path,root);
 if(existsSync(dest)&&!readFileSync(dest).equals(Buffer.from(asset)))throw Error('Conflicting published asset: '+path);
}
for(const [path,asset] of files){const dest=new URL(path,root);if(existsSync(dest))continue;
 mkdirSync(new URL('.',dest),{recursive:true});writeFileSync(dest,asset);
}
project.validation=result;
writeFileSync(target,JSON.stringify(project,null,2)+'\n');
manifest.levels.push({id,file:`levels/${id}.json`,rights:'reviewed original/approved assets'});
if(makeDefault)manifest.defaultLevel=id;
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
const digest=createHash('sha256').update(readFileSync(target)).digest('hex');
console.log(JSON.stringify({id,sha256:digest,errors:result.summary.errors,warnings:result.summary.warnings,file:target.pathname}));
