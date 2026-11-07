/** Exercise the real moving capsule and approach-aware door simulation. */
export function testDoorTraversal(world,{ids=null}={}){
 const rows=[];
 for(const d of world.doors.doors.filter(d=>!ids||ids.has(d.id)))for(const side of [-1,1]){
  let route=null;
  search:for(const range of [1.4,1,.7,.45])for(const along of [0,-.12,.12,-.24,.24]){
   let clear=true;
   for(let t=-range;t<=range+.001;t+=.025)if(!world.staticCanOccupy(d.x+d.ux*along+d.nx*t,d.z+d.uz*along+d.nz*t,.2,1.7,0)){clear=false;break;}
   if(!clear)continue;
   route={along,range};break search;
  }
  if(!route){rows.push({id:d.id,side,status:'fail',detail:'Ingen fri kapselpassage genom öppningen.'});continue;}
  const {along,range}=route;world.doors.reset();
  const actor={x:d.x+d.ux*along+d.nx*range*side,z:d.z+d.uz*along+d.nz*range*side,y:0,height:1.7,radius:.2,alive:true};
  let travelled=0;
  for(let i=0;i<180;i++){
   world.doors.update(i/60,1/60,[actor]);world.move(actor,-d.nx*side*.045,0,-d.nz*side*.045);
   travelled=-side*((actor.x-d.x)*d.nx+(actor.z-d.z)*d.nz);if(travelled>range-.06)break;
  }
  rows.push({id:d.id,side,status:travelled>range-.1?'pass':'fail',travelled,angle:d.angle,swingSign:d.sign});
 }
 world.doors.reset();return rows;
}
