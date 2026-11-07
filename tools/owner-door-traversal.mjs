import {writeFile,mkdir} from 'node:fs/promises';
import {createWorld} from '../src/fps/world.mjs';
const w=createWorld(),rows=[];
for(const d of w.doors.doors)for(const side of [-1,1]){
 // Derive existing capsule clearance, never remove geometry to manufacture PASS.
 // Short vestibules may not have 1.4 m of straight run-up on both sides.
 let route=null;
 search:for(const range of [1.4,1,.7,.45])for(const along of [0,-.12,.12,-.24,.24]){
  let clear=true;
  for(let t=-range;t<=range+.001;t+=.025)if(!w.staticCanOccupy(d.x+d.ux*along+d.nx*t,d.z+d.uz*along+d.nz*t,.2,1.7,0)){clear=false;break;}
  if(clear){route={along,range};break search;}
 }
 if(!route){rows.push({id:d.id,side,status:'no-straight-static-route'});continue;}
 const {along,range}=route;w.doors.reset();const a={x:d.x+d.ux*along+d.nx*range*side,z:d.z+d.uz*along+d.nz*range*side,y:0,height:1.7,radius:.2,alive:true};
 let travelled=0;
 for(let i=0;i<180;i++){w.doors.update(i/60,1/60,[a]);w.move(a,-d.nx*side*.045,0,-d.nz*side*.045);travelled=-side*((a.x-d.x)*d.nx+(a.z-d.z)*d.nz);if(travelled>range-.06)break;}
 rows.push({id:d.id,side,status:travelled>range-.10?'PASS':'FAIL',travelled,angle:d.angle,sign:d.sign,...route,swing:d.swingScores});
}
await mkdir('test-results',{recursive:true});await writeFile('test-results/owner-door-traversal.json',JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify({pass:rows.filter(r=>r.status==='PASS').length,fail:rows.filter(r=>r.status==='FAIL'),noStaticRoute:[...new Set(rows.filter(r=>r.status==='no-straight-static-route').map(r=>r.id))]},null,2));
if(rows.length!==102||rows.some(r=>r.status!=='PASS'))process.exitCode=1;
