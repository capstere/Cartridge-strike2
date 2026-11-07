import test from 'node:test';
import assert from 'node:assert/strict';
import {planPaintOverWall,wallAtPoint,projectToWall} from './paint-over-wall.mjs?v=5.1.0';
import {exportArchitecture,parseArchitecture} from './architecture.mjs?v=5.1.0';
const old={id:'WALL-0001',source:true,kind:'wall',a:[1,2],b:[9,2],height:2.85,thickness:.11,sill:.9,finish:'gray'};
const make=()=>[{...old,a:[...old.a],b:[...old.b]}];

test('paint on existing 8m wall replaces 2m section, keeping exact connected wall endpoints',()=>{
 const input=make(),result=planPaintOverWall(input,old.id,[3.02,2.08],[5,1.98],'window');
 assert.equal(input.length,1);
 assert.equal(input[0].deleted,undefined);
 assert.equal(result.entries.filter(x=>!x.deleted).length,3);
 const [before,middle,after]=result.pieces;
 assert.equal(before.kind,'wall');assert.equal(middle.kind,'window');assert.equal(after.kind,'wall');
 assert.deepEqual(before.b,middle.a);assert.deepEqual(middle.b,after.a);
 assert.deepEqual(before.a,old.a);assert.deepEqual(after.b,old.b);
 assert.equal(before.height,2.85);assert.equal(after.thickness,.11);
 assert.equal(before.finish,'gray');
 assert.equal(result.entries.find(e=>e.id===old.id).deleted,true);
});
test('full-span paint is a single edit with original ID retained and no split',()=>{
 const plan=planPaintOverWall(make(),old.id,[1,2],[9,2],'glazed');
 assert.equal(plan.full,true);assert.equal(plan.pieces.length,0);
 assert.equal(plan.entries.length,1);
 assert.equal(plan.entries[0].id,old.id);assert.equal(plan.entries[0].kind,'glazed');
 const patch=exportArchitecture(plan.entries,make());
 assert.equal(patch.edits.length,1);assert.equal(patch.added.length,0);assert.equal(patch.removed.length,0);
});
test('partial source wall becomes deleted source plus imported valid pieces',()=>{
 const baseline=make(),plan=planPaintOverWall(baseline,old.id,[3,2],[5,2],'window');
 const saved=exportArchitecture(plan.entries,baseline);
 assert.deepEqual(saved.removed,[old.id]);
 assert.equal(saved.added.length,3);
 const read=parseArchitecture(saved,baseline);
 assert.deepEqual(exportArchitecture(read.entries,baseline),saved);
});
test('partial new room wall is replaced atomically and remains removable',()=>{
 const authored={...old,id:'BYGG-V-0021',source:undefined};
 const p=planPaintOverWall([authored],authored.id,[3,2],[5,2],'window');
 assert(!p.entries.some(x=>x.id===authored.id));
 assert.equal(p.entries.length,3);
 assert.equal(new Set(p.entries.map(x=>x.id)).size,3);
});
test('short edge remnants are absorbed and no degenerate segments created',()=>{
 const p=planPaintOverWall(make(),old.id,[1.08,2],[5,2],'window');
 assert.equal(p.pieces.length,2);
 assert.deepEqual(p.pieces[0].a,old.a);
 assert.equal(p.pieces[0].kind,'window');
});
test('repeated overlay paints on already-split walls without recreating solid overlap',()=>{
 const first=planPaintOverWall(make(),old.id,[3,2],[5,2],'window');
 const wall=first.entries.find(x=>!x.deleted&&x.kind==='wall'&&x.a[0]>4);
 const again=planPaintOverWall(first.entries,wall.id,[6,2],[8,2],'glazed');
 assert(again.entries.filter(x=>!x.deleted&&x.kind==='window').length===1);
 assert(again.entries.filter(x=>!x.deleted&&x.kind==='glazed').length===1);
});
test('rejects wrong wall, too-short span, off-wall second click, invalid kind, repeated kind',()=>{
 assert.throws(()=>planPaintOverWall(make(),'absent',[3,2],[5,2],'window'),/Starta/);
 assert.throws(()=>planPaintOverWall(make(),old.id,[3,2],[3.1,2],'window'),/minst 25 cm/);
 assert.throws(()=>planPaintOverWall(make(),old.id,[3,2],[5,3],'window'),/samma vägglinje/);
 assert.throws(()=>planPaintOverWall(make(),old.id,[3,2],[5,2],'floor'),/Välj/);
 assert.throws(()=>planPaintOverWall(make(),old.id,[3,2],[5,2],'wall'),/redan/);
});
test('will not overwrite a door already inserted into painted span',()=>{
 const door={...old,id:'D01',kind:'door',a:[3.5,2],b:[4.4,2],height:2.4};
 assert.throws(()=>planPaintOverWall([...make(),door],old.id,[3,2],[5,2],'window'),/dörr/);
});
test('automatically reanchors valid value poster to residual solid wall',()=>{
 const posters=[{id:'BYGG-P-0001',wallId:old.id,t:.18,y:1.5,side:1,width:.5,height:.7,text:'KVALITET',subtitle:'',color:'navy'}];
 const p=planPaintOverWall(make(),old.id,[4,2],[6,2],'window',{posters});
 assert.equal(p.posters.length,1);
 assert.notEqual(p.posters[0].wallId,old.id);
 assert.equal(p.entries.find(w=>w.id===p.posters[0].wallId).kind,'wall');
});
test('safely rejects painting through an existing poster, without input mutation',()=>{
 const entries=make(),posters=[{id:'BYGG-P-0001',wallId:old.id,t:.5,y:1.5,side:1,width:.75,height:1,text:'KVALITET',subtitle:'',color:'navy'}];
 const before=JSON.stringify({entries,posters});
 assert.throws(()=>planPaintOverWall(entries,old.id,[4,2],[6,2],'door',{posters}),/affisch/);
 assert.equal(JSON.stringify({entries,posters}),before);
});
test('exact line projection accepts both reverse directions and rejects perpendicular overlap',()=>{
 const projected=projectToWall([5,2.08],old);
 assert.equal(projected.t,.5);
 assert.deepEqual(projected.point,[5,2]);
 const found=wallAtPoint(make(),[6,2.09]);
 assert.equal(found.wall.id,old.id);
 assert.equal(wallAtPoint(make(),[6,2.8]),null);
 const backwards=planPaintOverWall(make(),old.id,[6,2],[4,2],'window');
 assert.deepEqual(backwards.span,[[4,2],[6,2]]);
});

test('SMART RITA door and leafless opening ALWAYS produce same standard 1.20 span',()=>{
 for(const kind of ['door','card-door','opening']){
  for(const points of [[[2,2],[3.5,2]],[[3,2],[7,2]],[[7,2],[5,2]]]){
   const plan=planPaintOverWall(make(),old.id,points[0],points[1],kind),entry=plan.entries.find(e=>e.id===plan.paintedId);
   assert(entry);assert(Math.abs(Math.hypot(entry.b[0]-entry.a[0],entry.b[1]-entry.a[1])-1.2)<.002,kind);
   assert.equal(plan.full,false);
   assert.equal(plan.pieces.length,3);
  }
 }
 assert.throws(()=>planPaintOverWall([{...old,b:[2.4,2]}],old.id,[1,2],[2.4,2],'door'),/STANDARD/);
});
