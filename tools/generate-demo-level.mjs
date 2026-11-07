/** Rights-clear fictional layout: rectangles and procedural furniture, no source plan. */
import {writeFileSync} from 'node:fs';
import {exportProject} from '../furniture-editor/build/level-project.mjs';

const ground={bounds:{x0:-2,z0:-2,x1:18,z1:8},wallHeightDefault:2.85,floors:[
 {id:'BYGG-G-0001',name:'Västra rummet',role:'room',surface:'carpet',x0:0,z0:0,x1:6,z1:6},
 {id:'BYGG-G-0002',name:'Passagen',role:'corridor',surface:'vinyl',x0:6,z0:1.8,x1:10,z1:4.2},
 {id:'BYGG-G-0003',name:'Östra rummet',role:'room',surface:'carpet',x0:10,z0:0,x1:16,z1:6}]};
let wall=0,door=0;
const segment=(kind,a,b,sill=.9)=>({id:`BYGG-${['wall','glazed','window'].includes(kind)?'V-'+String(++wall).padStart(4,'0'):'D-'+String(++door).padStart(4,'0')}`,
 kind,a,b,height:kind==='door'?2.4:2.85,thickness:.11,sill,finish:'white'});
const pieces=[
 segment('wall',[0,0],[6,0]),segment('wall',[0,0],[0,6]),segment('window',[0,6],[6,6],1.05),
 segment('wall',[6,0],[6,6]),segment('door',[6,2.35],[6,3.65]),
 segment('wall',[6,1.8],[10,1.8]),segment('glazed',[6,4.2],[10,4.2]),
 segment('wall',[10,0],[10,6]),segment('door',[10,2.35],[10,3.65]),
 segment('wall',[10,0],[16,0]),segment('wall',[16,0],[16,6]),
 segment('window',[10,6],[16,6],.85)],
 furniture=[{id:'NY-BORD-0001',roomId:'BYGG-G-0001',kind:'table',x:3,z:1.3,yaw:0,w:1.2,d:.7,height:.75},
 {id:'NY-STOL-0001',roomId:'BYGG-G-0003',kind:'chair',x:13,z:1.2,yaw:0,w:.5,d:.5,height:.9}];
const spawns=[];for(let i=0;i<5;i++){
 spawns.push({id:`SP-A-${String(i+1).padStart(2,'0')}`,team:'analysts',index:i,x:1.2+i*.85,z:4.9,yaw:0});
 spawns.push({id:`SP-C-${String(i+1).padStart(2,'0')}`,team:'counterAnalysts',index:i,x:11.2+i*.85,z:4.9,yaw:Math.PI});
}
const project=exportProject({projectId:'lvl-synthetic-demo',name:'Syntetisk testbana',ground,
 architecture:{schemaVersion:1,edits:[],added:pieces,removed:[],floors:[],posters:[],treatments:[]},
 furniture:{placements:[],added:furniture,removed:[]},gameplay:{mode:'classic',counts:{analysts:5,counterAnalysts:5},spawns,
 objectives:{bomb:{id:'OBJ-BOMB',x:13,z:3,radius:1.1,roomId:'BYGG-G-0003'},
 rescue:{id:'OBJ-RESCUE',x:3,z:3,radius:1.65,roomId:'BYGG-G-0001'},
 hostages:[{id:'OBJ-H1',x:12.1,z:1.3,yaw:0,roomId:'BYGG-G-0003'},{id:'OBJ-H2',x:14,z:1.3,yaw:0,roomId:'BYGG-G-0003'}]}},
 agentBrief:{goal:'Fiktiv provbana för banstudion. Inga arbetsplatsritningar eller privata modeller.'},
 createdAt:'2026-10-28T12:00:00.000Z'});
writeFileSync(new URL('../levels/synthetic-demo.json',import.meta.url),JSON.stringify(project,null,2)+'\n');
