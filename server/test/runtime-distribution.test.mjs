import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {checkPublicPath,exportDistribution,inspectDistribution} from '../../tools/runtime-distribution.mjs';

test('public membership excludes source material, absolute or ambiguous paths, private code and recordings',()=>{
  for(const path of ['frontline/source/game.js','IMG_8150.PNG','assets/fps/ScreenRecording-test.mov',
    'shared/private.zip','server/local-server.mjs','/assets/level.json','assets/x/../a.json','assets/%2e/secret.json',
    'assets/a\\b.json','assets/.private/file.json','src/fps/a.test.mjs','docs/cartridge-strike-3/tasks.json']){
    assert.throws(()=>checkPublicPath(path),/runtime/);
  }
  for(const path of ['src/fps/app.mjs','licenses/riposte-NOTICE.md','assets/fps/Danceman/Danceman.glb.gz'])checkPublicPath(path);
});

test('export verifies imports and bytes, separates pilot files and refuses partial or replacing exports',async t=>{
  const base=await mkdtemp(join(tmpdir(),'cs3-distribution-')),root=join(base,'input');
  t.after(()=>rm(base,{recursive:true,force:true}));
  const put=async(path,bytes)=>{const file=join(root,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);};
  const pub={
    'index.html':'<script type="module" src="./src/game.mjs?v=1"></script>',
    'src/game.mjs':"export {x} from './module.mjs'; import('./lazy.mjs'); new URL('../assets/test.png',import.meta.url);",
    'src/module.mjs':'export const x=1;', 'src/lazy.mjs':'export default true;', 'assets/test.png':'fixture'
  };
  const records=Object.entries(pub).map(([path,bytes])=>({path,bytes:Buffer.byteLength(bytes),sha256:createHash('sha256').update(bytes).digest('hex')}));
  async function manifest(files){await put('build-info.json',JSON.stringify({files,bytes:files.reduce((s,f)=>s+f.bytes,0)}));}
  for(const [path,bytes] of Object.entries(pub))await put(path,bytes);
  for(const path of ['server/.node-version','server/register-shared.mjs','tools/vendor-three-test-loader.mjs','server/account-backup.mjs','server/helper.mjs'])await put(path,'');
  await put('server/local-server.mjs',"import './helper.mjs';");
  await put('server/package.json','{"dependencies":{}}');await put('server/package-lock.json','{}');
  for(const path of ['src/lazy.mjs','assets/test.png']){
    await manifest(records.filter(f=>f.path!==path));await assert.rejects(inspectDistribution(root),/public manifest entry/);
  }
  const computed="const moduleName='./module.mjs'; import(moduleName);";
  await put('src/game.mjs',computed);
  await manifest(records.map(file=>file.path==='src/game.mjs'?{...file,bytes:Buffer.byteLength(computed),sha256:createHash('sha256').update(computed).digest('hex')}:file));
  await assert.rejects(inspectDistribution(root),/src\/game.mjs uses a computed module import/);
  await put('src/game.mjs',pub['src/game.mjs']);
  await manifest(records);const input=await inspectDistribution(root);
  await exportDistribution(input,join(base,'public'),'public');await exportDistribution(input,join(base,'pilot'),'pilot');
  assert.equal(await readFile(join(base,'pilot/server/helper.mjs'),'utf8'),'');
  assert(!(await readdir(join(base,'public'))).includes('server'));
  await assert.rejects(exportDistribution(input,join(base,'pilot'),'pilot'),/already exists/);
  await put('src/module.mjs','changed');await assert.rejects(exportDistribution(input,join(base,'partial'),'pilot'),/changed/);
  assert(!(await readdir(base)).includes('partial'));assert(!(await readdir(base)).includes('partial.lock'));
  await rm(join(root,'src/module.mjs'));await symlink(join(root,'src/lazy.mjs'),join(root,'src/module.mjs'));
  await assert.rejects(inspectDistribution(root),/regular runtime file/);
});
