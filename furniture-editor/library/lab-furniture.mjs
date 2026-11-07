/** Original, lightweight lab/entrance furniture; authored in metres, +Y up.
 * Support surfaces are local, unscaled coordinates measured from the base.
 * A scaled instance scales x/width, y and z/depth with its catalog dimensions.
 */
export const LAB_FURNITURE_LIBRARY=Object.freeze([
 {
  id:'studio:biosafety-cabinet',name:'Biosafety Cabinet · biosäkerhetsskåp',category:'labb',
  width:1.4,depth:.72,height:2.1,shape:'biosafety-cabinet',placement:'floor',
  keywords:'biosafety cabinet bsc biosäkerhetsskåp säkerhetsbänk sterilbänk laminar labb',
  source:'Original procedurmodell efter användarens referensbilder · 2026-11-04',
  supportSurfaces:[{x:0,y:.904,z:.01,width:1.24,depth:.58,clearance:.72}]
 },
 {
  id:'studio:shoe-rack-black',name:'Skoställ · svart, på golvet',category:'dekor',
  width:1,depth:.34,height:.66,shape:'shoe-rack',placement:'floor',
  keywords:'svart skoställ skohylla skor shoe rack entrance hall omklädning golv',
  supportSurfaces:[.12,.36,.60].map(y=>({x:0,y,z:0,width:.92,depth:.31,clearance:y<.6?.21:null}))
 },
 {
  id:'studio:shoe-shelf-white',name:'Skohylla · vit, på väggen',category:'dekor',
  width:1,depth:.34,height:.14,shape:'shoe-shelf',placement:'wall',
  keywords:'vit skohylla skoställ skor shoe shelf wall väggmonterad vägghylla omklädning',
  supportSurfaces:[{x:0,y:.14,z:0,width:1,depth:.34,clearance:null}]
 },
 {
  id:'studio:shoes',name:'Skor · ett par, valfri färg',category:'dekor',
  width:.26,depth:.3,height:.13,shape:'shoes',placement:'countertop',
  colorable:true,color:'#f2f3ef',defaultColor:'#f2f3ef',
  keywords:'skor skopar shoe shoes sneakers arbetsskor labbskor färg omklädning'
 }
].map(entry=>Object.freeze({
 ...entry,kind:'prop',wallFacing:'-z',pack:'lab-furniture',model:entry.shape,
 thumb:`./library/thumbs/lab-furniture/${entry.shape}.png`,
 license:'Original · Designstudion, procedurbyggd',
 source:entry.source||'Designstudions procedurmodeller · inga extra modellfiler',
 ...(entry.supportSurfaces?{supportSurfaces:Object.freeze(entry.supportSurfaces.map(surface=>Object.freeze(surface)))}:{})
})));

export const LAB_FURNITURE_MAP=new Map(LAB_FURNITURE_LIBRARY.map(entry=>[entry.id,entry]));
