// Runs inside the normal match. Read the indexed faces instead of assuming every
// mesh that shares the atlas belongs to the static village architecture.
export async function waterfrontFaces({viewpoint, hulls}) {
  const {renderer:r} = __fps;
  const root = r.scene.getObjectByName('Meltem');
  const staticMeshes = [], boats = [];
  const textures = new Set();
  const materialCells = {boards:{},decals:{}};
  const sourceTargets = viewpoint === 'kiosk' ? [
    {name:'KIOSK',kind:'boards',cell:4,center:[-24.17,2.82,9]},
  ] : [
    {name:'FISH TAVERN · CAPTAIN MICHAEL',kind:'boards',cell:2,center:[-22.07,3.09,18.6]},
    {name:'MENU',kind:'decals',cell:4,center:[-22.008,1.45,20.75]},
  ];
  const check = (condition,message) => {if (!condition) throw Error(message);};
  const targets = [];
  root.traverse(mesh => {
    const mat = mesh.material, texture = mat?.map;
    if (!texture?.image?.src?.endsWith('/signs.webp')) return;
    const boat = mesh.parent.name === 'Moored boat';
    check(boat || mesh.parent.name === 'Indexed architecture','Unexpected sign owner '+mesh.parent.name);
    check(texture.image.width===1024 && texture.image.height===512 && !texture.flipY,'Incorrect atlas size or flip');
    const kind = mat.transparent ? 'decals' : 'boards';
    const pos = mesh.geometry.getAttribute('position'), uv = mesh.geometry.getAttribute('uv'), indices = mesh.geometry.index;
    const columns = kind === 'boards' ? 2 : 4, start = kind === 'boards' ? 0 : .5;
    const cells = {};
    for(let i=0;i<uv.count;i++) check(uv.getX(i)>=start && uv.getX(i)<=start+.5 && uv.getY(i)>=0 && uv.getY(i)<=1,'Incorrect atlas UV partition');
    for(let i=0;i<indices.count;i+=3){
      const vertices = [indices.getX(i),indices.getX(i+1),indices.getX(i+2)];
      const u = vertices.reduce((sum,j)=>sum+uv.getX(j),0)/3;
      const v = vertices.reduce((sum,j)=>sum+uv.getY(j),0)/3;
      const cell = Math.min(3,Math.floor(v*4))*columns+Math.min(columns-1,Math.floor((u-start)*2*columns));
      cells[cell] = (cells[cell]||0)+1;
      if (!boat) {
        materialCells[kind][cell]=(materialCells[kind][cell]||0)+1;
        for (const target of sourceTargets.filter(t=>t.kind===kind && t.cell===cell)) {
          // The original facade faces lie in an X-constant plane. No adjacent
          // shop shares the same height, center Z and atlas cell.
          if (vertices.every(j=>Math.abs(pos.getX(j)-target.center[0])<.003 &&
              Math.abs(pos.getY(j)-target.center[1])<.401 &&
              Math.abs(pos.getZ(j)-target.center[2])<1.702)) {
            let face=targets.find(f=>f.source===target);
            if(!face){face={source:target,mesh,indices,offsets:[],vertices:new Set()};targets.push(face);}
            face.offsets.push(i);vertices.forEach(j=>face.vertices.add(j));
          }
        }
      }
    }
    textures.add(texture.uuid);
    if(boat) {
      check(kind==='decals'&&!mat.depthWrite,'Boat decal alpha or depth-write changed');
      boats.push({x:mesh.parent.position.x,z:mesh.parent.position.z,triangles:indices.count/3,cells});
    } else staticMeshes.push({kind,triangles:indices.count/3});
  });
  check(textures.size===1,'Static and floating signs must share one atlas');
  check(targets.length===sourceTargets.length && targets.every(f=>f.offsets.length===2 && f.vertices.size===4),'Original waterfront sign quad missing');
  check(boats.length===hulls.length && hulls.every(h=>boats.some(b=>b.x===h.x && b.z===h.z && b.triangles===h.triangles &&
     Object.keys(h.cells).length===Object.keys(b.cells).length && Object.entries(h.cells).every(([key,n])=>b.cells[key]===n))),'Floating sign anchors or triangles differ from the original hulls');

  // Render two frozen views through the same world and first-person passes as
  // EngineRenderer. Suppress just one quad, then restore its original indices.
  const gpu=r.renderer,gl=gpu.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
  const draw=()=>{
    gpu.autoClear=true;gpu.render(r.scene,r.camera);
    if(r.weaponModel?.visible){gpu.autoClear=false;gpu.clearDepth();gpu.render(r.viewScene,r.viewCamera);}
  };
  const pixels=()=>{draw();const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const visible=[];
  for(const face of targets){
    const {mesh,indices,vertices,offsets,source}=face,pos=mesh.geometry.getAttribute('position');
    const points=[...vertices].map(i=>r.camera.position.clone().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld));
    const center=points.reduce((a,v)=>a.add(v),r.camera.position.clone().set(0,0,0)).multiplyScalar(.25).toArray();
    check(center.every((n,j)=>Math.abs(n-source.center[j])<.003),'Target moved from source placement');
    const projected=points.map(p=>p.project(r.camera));
    const xmin=Math.max(0,Math.floor((1+Math.min(...projected.map(p=>p.x)))*w/2)),xmax=Math.min(w,Math.ceil((1+Math.max(...projected.map(p=>p.x)))*w/2));
    const ymin=Math.max(0,Math.floor((1+Math.min(...projected.map(p=>p.y)))*h/2)),ymax=Math.min(h,Math.ceil((1+Math.max(...projected.map(p=>p.y)))*h/2));
    check(xmax>xmin && ymax>ymin,'Target outside camera');
    const ready=pixels(),saved=offsets.map(o=>indices.array.slice(o,o+3));
    let masked;
    try {
      for(const o of offsets)indices.array.fill(indices.getX(o),o,o+3);
      indices.needsUpdate=true;masked=pixels();
    } finally {
      offsets.forEach((o,i)=>indices.array.set(saved[i],o));indices.needsUpdate=true;
    }
    const restored=pixels();let changed=0,stable=0,bright=0,low=255,high=0;
    for(let y=ymin;y<ymax;y++)for(let x=xmin;x<xmax;x++){
      const i=(y*w+x)*4;
      if([0,1,2].some(k=>restored[i+k]!==ready[i+k]))stable++;
      if([0,1,2].some(k=>Math.abs(masked[i+k]-ready[i+k])>=3)){
        changed++;const lum=(54*ready[i]+183*ready[i+1]+19*ready[i+2])>>8;
        low=Math.min(low,lum);high=Math.max(high,lum);if(lum>=90)bright++;
      }
    }
    check(stable===0 && changed>=32 && high-low>=20,'Insufficient stable visible artwork for '+source.name+' ('+[stable,changed,low,high]+')');
    visible.push({label:source.name,sourceCell:source.cell,center,framebufferBox:[xmin,h-ymax,xmax,h-ymin],visiblePixels:changed,restoredPixelDifferences:stable,visibleLumaRange:[low,high],pixelsAboveLuma90:bright});
  }
  return {staticMeshes,materialCells,markedHulls:boats,sharedAtlasCount:textures.size,visible};
}
