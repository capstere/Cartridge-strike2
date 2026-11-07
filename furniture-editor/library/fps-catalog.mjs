/** Placeable props from Cartridge Strike. Data only: browsing this catalogue
 * never builds game geometry or starts a renderer. New reconstructions are
 * identified separately from reused FPS geometry and source GLBs.
 */
const gameSource='Befintlig Cartridge Strike-geometri · återanvänd utan spelmekanik';
const originals=[
 {id:'fps:cartridge',name:'Cartridge · stängd',model:'cartridge',category:'labb',width:.05685382,depth:.06527775,height:.08074350,placement:'countertop',wallFacing:'+z',collision:'none',keywords:'cartridge kassett counter analyst cepheid prov stangd closed'},
 {id:'fps:cartridge-open',name:'Cartridge · öppet lock',model:'cartridge-open',category:'labb',width:.05685382,depth:.06527775,height:.12241361,placement:'countertop',wallFacing:'+z',collision:'none',keywords:'cartridge kassett counter analyst cepheid prov oppen open lock'},
 {id:'fps:cartridge-rack',name:'Cartridge-ställ · 6 kassetter',model:'cartridge-rack',category:'labb',width:.324,depth:.234,height:.086,placement:'countertop',wallFacing:'+z',collision:'none',keywords:'cartridge kassett rack stall prov sex sample'},
 {id:'fps:bench-instrument',name:'Labbapparat · röd överdel',model:'bench-instrument',category:'labb',width:.47,depth:.38,height:.505,placement:'countertop',wallFacing:'-z',keywords:'labb instrument pqc rod röd ovandel benchtop'},
 {id:'fps:lab-cart',name:'Labbvagn · rostfritt stål',model:'lab-cart',category:'labb',width:.7,depth:.46,height:1.0125,placement:'floor',wallFacing:'-z',supportSurfaces:[{y:.19,width:.58,depth:.42,clearance:.585,label:'Nedre hyllplan'},{y:.835,z:-.02,width:.58,depth:.38,label:'Övre hyllplan'}],keywords:'labb lab cart vagn rostfri stål stal rullvagn hylla'},
 {id:'fps:lab-bench',name:'Labbänk med instrument',model:'lab-bench',category:'labb',width:2.035,depth:.818,height:1.445,placement:'floor',wallFacing:'+z',supportSurfaces:[{x:.68,z:-.0115,y:.9125,width:.58,depth:.74,label:'Fri arbetsyta'}],keywords:'labbank labbänk lab bench bank instrument analysator'},
 {id:'fps:centrifuge',name:'Centrifug · bänkmodell',model:'centrifuge',category:'labb',width:.55,depth:.55,height:.3325,placement:'countertop',wallFacing:'+z',keywords:'centrifug centrifuge labb benchtop analysator'},
 {id:'fps:lab-freezer',name:'Laboratoriefrys · två luckor',model:'lab-freezer',category:'labb',width:.72,depth:.7325,height:1.9,placement:'floor',wallFacing:'+z',keywords:'labb laboratoriefrys frys freezer cold storage'},
 {id:'fps:lab-cabinet',name:'Laboratorieskåp',model:'lab-cabinet',category:'labb',width:.8,depth:.6725,height:1.8,placement:'floor',wallFacing:'+z',keywords:'labb laboratorie skåp skap cabinet forvaring förvaring'},
 {id:'fps:tube-rack',name:'Provrörsställ · 10 rör',model:'tube-rack',category:'labb',width:.27,depth:.18,height:.164,placement:'countertop',wallFacing:'+z',collision:'none',keywords:'provrör provror stall rör rack test tube labb'},
 {id:'fps:tip-box',name:'Labbask · blå',model:'tip-box',category:'labb',width:.23,depth:.164,height:.2,placement:'countertop',wallFacing:'+z',collision:'none',keywords:'labbask lab box pipett spetsask tip box'},
 {id:'fps:binders',name:'Kontorspärmar · 3 stycken',model:'binders',category:'kontor',width:.215,depth:.2595,height:.32,placement:'countertop',wallFacing:'+z',collision:'none',keywords:'kontorsparmar pärmar parm parmar binder ring binder office'}
].map(o=>Object.freeze({...o,kind:'prop',assetRole:'other',shape:'fps-model',pack:'fps',
 thumb:`./library/thumbs/fps/${o.model}.png`,source:gameSource,
 license:o.model.startsWith('cartridge')?'Befintlig spelmodell · ägarens uppdrag 2026-11-04':'Original · Cartridge Strike'}));

export const FPS_LIBRARY=Object.freeze([
 ...originals,
 Object.freeze({id:'fps:binder-vacuum-oven',name:'BINDER-vakuumugn',category:'labb',kind:'prop',assetRole:'other',
  width:.638,depth:.55,height:.815,shape:'fps-model',model:'binder-vacuum-oven',pack:'fps',placement:'countertop',wallFacing:'+z',
  thumb:'./library/thumbs/fps/binder-vacuum-oven.png',keywords:'binder vakuumugn vakuum ugn vacuum oven vd labb',
  source:'Ny lågpolymodell efter BINDER VD-referens · ungefärliga spelmått',
  license:'Original · Designstudion, ny procedurmodell',
  reference:'https://www.binder-world.com/us-en/products/drying-ovens/vacuum-drying-chambers/product/vd-56'}),
 Object.freeze({id:'fps:wall-vent',name:'Ventilationsgaller · vägg',category:'industri',kind:'prop',assetRole:'other',pack:'fps',model:'wall-vent',
  width:.62,depth:.0885,height:.42,placement:'wall',wallFacing:'+z',
  url:'../assets/fps/models/nord01-wall_vent-lod0.glb',thumb:'./library/thumbs/fps/wall-vent.png',
  keywords:'ventilation ventilationsgaller wall vent luft galler fps',license:'Original · NORD-01',source:gameSource}),
 Object.freeze({id:'fps:strip-light',name:'Lysrörsarmatur',category:'industri',kind:'prop',assetRole:'other',pack:'fps',model:'strip-light',
  width:1.2,depth:.1425,height:.0905,placement:'wall',wallFacing:'+z',
  url:'../assets/fps/models/nord01-strip_light-lod0.glb',thumb:'./library/thumbs/fps/strip-light.png',
  keywords:'lysror lysrör lampa armatur strip light tak vägg',license:'Original · NORD-01',source:gameSource}),
 Object.freeze({id:'fps:drying-oven',name:'Torkugn · öppna dörrar',category:'labb',kind:'prop',assetRole:'other',pack:'fps',model:'laboratory-drying-oven',
  width:1.5857738238763233,depth:1.3498444653821382,height:1.071157193253329,placement:'floor',wallFacing:'+z',
  modelSize:[1.5857738238763233,1.071157193253329,1.3498444653821382],
  url:'./library/models/fps/laboratory-drying-oven.glb',thumb:'./library/thumbs/fps/laboratory-drying-oven.png',
  keywords:'torkugn laboratory drying oven labb ugn torkskåp torkskap',
  license:'CC-BY-4.0 · GokouFG',source:'capstere/onboard · optimerad originalfil, oförändrad',
  sourcePath:'asset-portfolio/custom/optimized/laboratory_drying_oven.glb',sourceCommit:'55d8dacb6df7b3373ca771d8de22982a1e900d36',
  attribution:'https://sketchfab.com/3d-models/laboratory-drying-oven-ac0b535f92ac4134a00df12a219d88d7',
  sha256:'0e45d530895e94d5e8d132d12ddc89e7d762eb270c2dc5d0ad7e098999db918e',bytes:1301856,triangles:4811,staticOnly:true})
]);
export const FPS_MAP=new Map(FPS_LIBRARY.map(o=>[o.id,o]));
