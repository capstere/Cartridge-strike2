/** Static original facility models. Cell/material merging, no per-frame rebuilds. */
import * as T from '../../vendor/three/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
export function buildFacilityDetails(plan,registry){
 const root=new T.Group();root.name='facility-details-0.17';const buckets=new Map(),owned=[];
 const mats={ceramic:registry.get('table',{color:0xf3f2e8,roughness:.26}),steel:registry.get('metal'),dark:registry.get('polymer'),blue:registry.get('table',{color:0x245a94,roughness:.60}),teal:registry.get('table',{color:0x487c82}),water:registry.get('table',{color:0x739da7,roughness:.19}),screen:registry.get('table',{color:0x143640,emissive:0x143640,emissiveIntensity:.40}),black:registry.get('polymer',{color:0x111b20}),cream:registry.get('table',{color:0xd5d7d0}),mirror:registry.get('metal',{color:0xa0b7c2,roughness:.09}),orange:registry.get('table',{color:0xd76b28})};
 function append(p,g,mat,u,y,v,rot={}){const c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0),local=new T.Matrix4().compose(new T.Vector3(u,y,v),new T.Quaternion().setFromEuler(new T.Euler(rot.x||0,rot.y||0,rot.z||0)),new T.Vector3(rot.sx||1,rot.sy||1,rot.sz||1)),world=new T.Matrix4().makeRotationY(p.yaw||0);world.setPosition(p.x,0,p.z);g.applyMatrix4(world.multiply(local));if(g.index){const n=g.toNonIndexed();g.dispose();g=n;}for(const name of Object.keys(g.attributes))if(!['position','normal','uv'].includes(name))g.deleteAttribute(name);const key=`${Math.floor(p.x/12)}/${Math.floor(p.z/12)}/${mat}`;if(!buckets.has(key))buckets.set(key,{mat:mats[mat],parts:[]});buckets.get(key).parts.push(g);}
 const box=(p,u,y,v,w,h,d,mat='ceramic')=>append(p,new T.BoxGeometry(w,h,d),mat,u,y,v);
 const cyl=(p,u,y,v,r,h,mat='steel',rot={})=>append(p,new T.CylinderGeometry(r,r,h,12),mat,u,y,v,rot);
 function tap(p,u,y,v,scale=1){cyl(p,u,y+.07*scale,v,.012*scale,.14*scale);box(p,u,y+.14*scale,v+.04*scale,.024*scale,.025*scale,.10*scale);cyl(p,u,y+.125*scale,v+.08*scale,.014*scale,.04*scale);box(p,u+.04*scale,y+.08*scale,v,.06*scale,.012*scale,.018*scale);}
 function basin(p,width,depth,y){
  const rx=width*.42,rz=depth*.40;
  append(p,new T.LatheGeometry([new T.Vector2(0,0),new T.Vector2(rx*.55,.015),new T.Vector2(rx,.10),new T.Vector2(rx,.125),new T.Vector2(rx*.85,.125),new T.Vector2(rx*.65,.04),new T.Vector2(0,.035)],16),'ceramic',0,y-.115,0,{sz:rz/rx});
  cyl(p,0,y-.073,0,.014,.006,'steel');tap(p,0,y,-depth*.36,.65);
 }
 for(const p of plan.props){
  const h=p.h,w=p.w,d=p.d,base=p.baseY||0;
  if(p.type==='toilet'){
   box(p,0,.48,-.21,.40,.62,.16);box(p,0,.802,-.21,.42,.025,.18);
   append(p,new T.LatheGeometry([[0,.04],[.10,.04],[.10,.19],[.17,.29],[.205,.385],[.20,.425],[.17,.425],[.145,.34],[.08,.27],[0,.27]].map(v=>new T.Vector2(...v)),16),'ceramic',0,0,.065,{sz:1.28});
   append(p,new T.TorusGeometry(.178,.019,6,20),'cream',0,.437,.07,{x:Math.PI/2,sy:1.30});
   append(p,new T.CircleGeometry(.09,14),'water',0,.285,.055,{x:-Math.PI/2,sy:1.2});
   box(p,-.035,.82,-.21,.045,.008,.047,'steel');box(p,.025,.82,-.21,.055,.008,.047,'steel');
  }else if(p.type==='basin'){
   basin(p,w,d,.83);box(p,0,.745,-.065,w*.6,.08,.08);cyl(p,0,.65,-.06,.018,.17);
   box(p,0,1.22,-d/2-.013,w*.95,.49,.018,'steel');box(p,0,1.22,-d/2+.001,w*.88,.44,.006,'mirror');
  }else if(p.type==='sink'){
   // The basin sits above the original counter surface; no z-fighting plug.
   box(p,0,.93,0,w,.025,d,'steel');box(p,0,.946,0,w*.56,.006,d*.57,'dark');
   box(p,0,.952,-d*.30,w*.64,.025,.035,'steel');box(p,0,.952,d*.30,w*.64,.025,.035,'steel');
   for(const u of[-w*.32,w*.32])box(p,u,.952,0,.035,.025,d*.62,'steel');
   cyl(p,0,.952,0,.026,.006,'steel');tap(p,w*.20,.96,-d*.34,1.2);
   for(let i=0;i<5;i++)box(p,w*.40,.949,-d*.20+i*.052,w*.12,.005,.009,'cream');
  }else if(p.type==='dishwasher'){
   box(p,0,h/2,0,w,h,d,'steel');box(p,0,h*.55,d/2+.008,w*.91,h*.74,.02,'cream');
   box(p,0,h-.08,d/2+.025,w*.87,.08,.02,'dark');box(p,-.10,h-.15,d/2+.038,w*.5,.025,.025,'steel');
   box(p,w*.25,h-.08,d/2+.038,.055,.021,.008,'screen');
  }else if(p.type==='microwave'){
   box(p,0,base+h/2,0,w,h,d,'cream');box(p,-w*.08,base+h*.49,d/2+.01,w*.68,h*.77,.018,'black');
   box(p,-w*.08,base+h*.49,d/2+.023,w*.55,h*.54,.005,'screen');
   box(p,w*.23,base+h*.49,d/2+.044,.022,h*.64,.035,'steel');
   box(p,w*.37,base+h*.74,d/2+.024,.078,.043,.01,'screen');
   cyl(p,w*.36,base+h*.36,d/2+.025,.027,.025,'steel',{x:Math.PI/2});
  }else if(['fridge','freezer','lab-cabinet'].includes(p.type)){
   const col=p.displayOnly?'cream':'ceramic';box(p,0,h/2,0,w,h,d,col);box(p,0,.04,0,w*.91,.08,d*.93,'dark');
   const faces=p.type==='freezer'?2:1;
   for(let i=0;i<faces;i++){const cy=(i+.5)*(h-.13)/faces+.09;box(p,0,cy,d/2+.012,w*.94,(h-.13)/faces-.025,.025,col);box(p,w*.35,cy,d/2+.05,.025,.30,.045,'steel');}
   box(p,0,h-.07,d/2+.03,w*.40,.04,.01,'screen');
   box(p,-w*.30,h-.19,d/2+.03,.10,.05,.008,p.type==='freezer'?'blue':'teal');
  }else if(p.type==='lab-bench'){
   box(p,0,.45,0,w,.87,d,'cream');box(p,0,.905,0,w+.035,.045,d+.035,'steel');
   for(const u of[-.5,.5]){box(p,u,.45,d/2+.007,.91,.74,.02);box(p,u,.72,d/2+.028,.22,.02,.025,'steel');}
   if(p.instrument===1){cyl(p,0,1.085,0,.27,.31,'ceramic');cyl(p,0,1.25,0,.275,.025,'teal');box(p,0,1.08,.263,.17,.09,.018,'screen');}
   else{box(p,0,1.18,0,.68,.56,.50);box(p,-.10,1.23,.26,.34,.30,.025,'screen');box(p,.23,1.03,.265,.09,.07,.01,'teal');for(let i=0;i<5;i++)box(p,.23,1.18+i*.032,.258,.11,.008,.012,'dark');}
   for(let i=0;i<3;i++){cyl(p,-.73+i*.15,.97,.02,.045,.105,'teal');cyl(p,-.73+i*.15,1.03,.02,.047,.015,'cream');}
  }
 }
 for(const f of plan.facades){box(f,0,f.y,0,f.w,f.h,f.d,'blue');const n=Math.min(20,Math.ceil(f.w/.65));for(let i=1;i<n;i++)box(f,-f.w/2+f.w*i/n,f.y,f.side*.013,.012,f.h,.015,'blue');}
 for(const b of buckets.values()){const g=mergeGeometries(b.parts,false);if(!g)throw Error('Facility detail attribute mismatch');const mesh=new T.Mesh(g,b.mat);mesh.receiveShadow=true;mesh.castShadow=false;root.add(mesh);owned.push(g);b.parts.forEach(p=>p.dispose());}
 root.userData.counts=plan.counts;let disposed=false;return {root,dispose(){if(disposed)return;disposed=true;root.removeFromParent();owned.forEach(g=>g.dispose());}};
}
