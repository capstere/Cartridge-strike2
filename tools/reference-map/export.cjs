// Rebuild Meltem on the original front-end, capture canonical geometry before
// GPU upload frees its CPU arrays, and retain the donor's completed navigation.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createHash}=require('node:crypto'),{gzipSync}=require('node:zlib');
const {execFileSync}=require('node:child_process');
const probe=require('./donor-probe.cjs');
const environment=require('./environment-probe.cjs');
const root=process.cwd(),output=path.resolve(process.argv[2]||'');
const assess=process.argv.includes('--assess'),withEnvironment=process.argv.includes('--environment');
const requestedMap=process.argv.find(arg=>arg.startsWith('--map='))?.slice(6)||'meltem';
if(!process.argv[2]||output.startsWith(root+path.sep)||output===root)throw Error('Supply a private output directory outside the checkout.');
fs.mkdirSync(output,{mode:0o700,recursive:true});
const {chromium}=require(path.join(root,'frontline/source/tools/dev/node_modules/playwright-core'));
const donor=path.join(root,'frontline/index.html'),original=fs.readFileSync(donor,'utf8');
const marker='function finalizeWorld(){';
if(original.split(marker).length!==2)throw Error('Review the changed donor finalizeWorld hook.');
const instrumented=original.replace(marker,`(${probe.install})();window.readSourceEnvironment=${environment.capture};${marker}(${probe.capture})(${assess});`);
const inline=html=>[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes(marker))[1];
const hash=script=>createHash('sha256').update(script).digest('base64');
const oldDigest='sha256-'+hash(inline(original));
if(!instrumented.includes(oldDigest))throw Error('Unexpected donor script policy.');
const html=instrumented.replace(oldDigest,'sha256-'+hash(inline(instrumented)));
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.json':'application/json','.webp':'image/webp','.mp3':'audio/mpeg','.css':'text/css'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1'),target=path.resolve(root,'.'+url.pathname.replace(/\/$/,'/index.html'));
  if(!target.startsWith(root+path.sep)||!fs.statSync(target,{throwIfNoEntry:false})?.isFile()){res.writeHead(404);return res.end();}
  res.setHeader('content-type',mime[path.extname(target)]||'application/octet-stream');
  if(target===donor)return res.end(html);
  const stream=fs.createReadStream(target);res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy()).pipe(res);
});
async function saveEnvironment(page,id){
  const data=await page.evaluate(()=>readSourceEnvironment());
  if(data.id!==id)throw Error('Environment belongs to '+data.id);
  const bytes=gzipSync(JSON.stringify(data));
  fs.writeFileSync(path.join(output,id+'-environment.json.gz'),bytes);
  console.log(id,'environment:',data.fabrics.length,'fabrics,',data.mills.length,'mills,',bytes.length,'bytes');
}
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:false,
      args:['--ozone-platform=wayland','--use-angle=gl-egl','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
    const context=await browser.newContext({viewport:{width:640,height:360},locale:'en-US',serviceWorkers:'block'});
    await context.addInitScript(()=>localStorage.setItem('dc_settings',JSON.stringify({quality:'low',lang:'en',eco:true,dynres:false})));
    const page=await context.newPage();page.on('pageerror',e=>console.error(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/frontline/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof startReferenceExport==='function');
    if(assess){
      const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
      const sourceFile=relative=>{
        const bytes=fs.readFileSync(path.join(root,relative)),blob=git('hash-object',relative);
        if(blob!==git('rev-parse','HEAD:'+relative))throw Error('Donor differs from committed source: '+relative);
        return {path:relative,gitBlob:blob,sha256:createHash('sha256').update(bytes).digest('hex')};
      };
      const files={meltem:'02yf-meltem',sable:'02s-sable',givre:'02t-givre',embruns:'02u-embruns',
        floreal:'02v-floreal',tephra:'02yh-tephra',stratus:'02yj-stratus',simoun:'02yl-simoun',lotissement:'02yn-french-dream'};
      const report={upstream:JSON.parse(fs.readFileSync(path.join(root,'frontline/import-manifest.json'))).upstream_sha,
        checkout:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),html:sourceFile('frontline/index.html'),
        instrumentedHtmlSha256:createHash('sha256').update(html).digest('hex'),browser:browser.version(),
        geometryScope:'Indexed static WORLD buffers before finalizeWorld and rest-pose prefab triangles expanded per body. Runtime draw calls depend on the camera, quality and culling.',
        maps:[]};
      for(const [id,factory] of Object.entries(files)){
        const actual=await page.evaluate(id=>startReferenceExport(id),id);
        if(actual!==id)throw Error('Requested '+id+' but the donor loaded '+actual);
        const row=await page.evaluate(()=>readReferenceCapabilities());
        if(withEnvironment&&id==='meltem')await saveEnvironment(page,id);
        if(!row.navigationNodes || !row.volumes || !row.geometry.staticGroups || row.spawns.some(team=>!team))
          throw Error('Incomplete factory output for '+id);
        row.factory=sourceFile('frontline/source/src/'+factory+'.js');
        report.maps.push(row);
        fs.writeFileSync(path.join(output,'map-capabilities.json'),JSON.stringify(report,null,2)+'\n');
        console.log(id,row.volumes,'volumes,',row.navigationNodes,'nodes,',row.geometry.staticTriangles,'static triangles');
      }
      return;
    }
    const loaded=await page.evaluate(id=>startReferenceExport(id),requestedMap);
    if(loaded!==requestedMap)throw Error('Requested '+requestedMap+' but loaded '+loaded);
    if(withEnvironment)await saveEnvironment(page,loaded);
    const result=await page.evaluate(()=>readReferenceMap());
    fs.writeFileSync(path.join(output,'map.json.gz'),gzipSync(JSON.stringify(result)));
    for(let i=0;i<result.renderGroups.length;i++){
      const data=await page.evaluate(probe.group,i);
      fs.writeFileSync(path.join(output,'group-'+i+'.json.gz'),gzipSync(JSON.stringify(data),{level:1}));
    }
    console.log('Exported',result.solids.length,'volumes,',result.nav.x.length,'navigation nodes and',result.renderGroups.length,'draw batches.');
  }finally{await browser?.close();server.closeAllConnections();server.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
