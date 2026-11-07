/** Optional visual-only dressing in a portable level project. Dimensions are model units. */
export const FIXTURES=Object.freeze({
 exit:[.82,.28,.025],wayfinding:[.84,.25,.022],room:[.56,.22,.018],
 extinguisher:[.30,1.20,.24],bell:[.26,.26,.13],callpoint:[.14,.17,.065],
 firstAid:[.46,.43,.15],eyewash:[.34,.30,.018],ppe:[.41,.40,.15],
 reader:[.105,.17,.034],clock:[.34,.34,.045],thermostat:[.15,.12,.035],
 vent:[.66,.22,.035],rota:[.28,.38,.012],service:[.20,.085,.008],
 board:[1.36,.77,.034],print:[.63,.50,.024],notice:[.38,.48,.014]
});
export const SCREEN_ART=['standby','bars','dashboard','instrument','snow','glitch'];
export const BOARD_ART=['coffee','formula','trend','botany','orbit','memo'];
export const BACKGROUND_KINDS=['workstation','seat','bookcase','labBench','labShelf','cartons'];
export const WORKSTATION='local:9c4b643b35b92a91a5def38040b8847b6fe2619668e8fa3830832a43c41e4249';

// Measured planar writing/display areas of the fitted source models. Values are
// relative to the centred footprint and bottom of the model. The inset retains the bezel.
export const DISPLAY_FACES=Object.freeze({
 'onboard:tv-with-a-wall-mount':{x:0,y:.50762,z:.41763,w:.971,h:.871,side:1},
 [WORKSTATION]:{x:-.03608,y:.60928,z:.26173,w:.85,h:.676,side:-1},
 'office:whiteboard-mobile':{x:0,y:.73649,z:.02457,w:.844,h:.46,side:1},
 'studio:monitor':{x:0,y:.65,z:0,w:.925,h:.585,side:-1,absoluteZ:-.026}
});

export function fixturePose(record,wall){
 if(!wall||wall.kind!=='wall')return null;
 const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],length=Math.hypot(dx,dz);
 if(length<.01)return null;
 const nx=-dz/length*record.side,nz=dx/length*record.side,offset=(wall.thickness||.10)/2+.004;
 return {x:wall.a[0]+dx*record.t+nx*offset,z:wall.a[1]+dz*record.t+nz*offset,
  y:record.y,yaw:Math.atan2(nx,nz),nx,nz};
}

export function validateEnvironment(e){
 if(e===undefined)return;
 const fail=()=>{throw Error('Miljödekoren innehåller ogiltiga mått, fästen eller motiv.');};
 const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
 const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
 const rows=(v,max)=>Array.isArray(v)&&v.length<=max;
 const point=v=>Array.isArray(v)&&v.length===2&&v.every(n=>finite(n,-100,100));
 const text=v=>v===undefined||typeof v==='string'&&v.length<=60;
 if(!e||e.version!==1||e.collision!=='none'||!Number.isSafeInteger(e.seed)||e.seed<0||e.seed>0xffffffff||
    !rows(e.fixtures,400)||!rows(e.background,700)||!rows(e.displays,200))fail();
 const seen=new Set();
 for(const row of [...e.fixtures,...e.background]){
  if(!row||!id(row.id)||seen.has(row.id)||!id(row.roomId))fail();
  seen.add(row.id);
 }
 for(const f of e.fixtures){
  if(!Object.hasOwn(FIXTURES,f.kind)||!id(f.wallId)||!finite(f.t,0,1)||![1,-1].includes(f.side)||
     !finite(f.y,.05,5)||!text(f.title)||!text(f.subtitle)||f.art!==undefined&&!BOARD_ART.includes(f.art))fail();
  if(f.kind==='exit'&&(!['left','right'].includes(f.arrow)||!id(f.target)))fail();
 }
 for(const b of e.background)if(!BACKGROUND_KINDS.includes(b.kind)||!finite(b.x,-100,100)||!finite(b.z,-100,100)||!finite(b.yaw,-Math.PI*2,Math.PI*2))fail();
 const hosts=new Set();
 for(const d of e.displays){
  if(!d||!id(d.host)||hosts.has(d.host)||![...SCREEN_ART,...BOARD_ART].includes(d.art)||
     (d.side!==undefined&&(!BOARD_ART.includes(d.art)||![-1,1].includes(d.side))))fail();
  hosts.add(d.host);
 }
 const f=e.facade;
 if(!f||!/^#[0-9a-f]{6}$/i.test(f.color)||!rows(f.outline,500)||f.outline.length<3||!f.outline.every(point)||
    !rows(f.edges,500)||f.edges.some(v=>!v||!id(v.wallId)||![-1,1].includes(v.side)||!finite(v.lo,0,1)||!finite(v.hi,0,1)||v.lo>=v.hi))fail();
}
