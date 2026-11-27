import assert from 'node:assert/strict';
import {join} from 'node:path';

const sites={
  meltem:{x:-33,z:0,y:0,pitch:.12,yaw:-2.62},
  embruns:{x:-33.5,z:21.5,y:.4,pitch:.02,yaw:-1.78},
  tephra:{x:-14,z:20,y:4,pitch:.08,yaw:-2.4},
};
const expected={
  meltem:{waveBands:8,mills:2,fabrics:12,boats:22,ponds:8,ash:0},
  embruns:{waveBands:8,mills:0,fabrics:6,boats:14,ponds:17,ash:0},
  tephra:{waveBands:0,mills:0,fabrics:0,boats:0,ponds:0,ash:700},
};

// These two explicitly labeled observation frames follow the real match sample.
// The observer stands on a genuine pier, working deck or raised field station.
export async function verifyEnvironment(page,output,id){
  const camera={...sites[id],height:1.72,radius:.20};
  async function read(){
    return page.evaluate(()=>{
      const r=mapProbe.last.deref(), group=r.referenceScene.root.getObjectByName('Map environment');
      const get=name=>group.getObjectByName(name), all=name=>group.children.filter(mesh=>mesh.name===name);
      const sky=get('Photographic sky'), water=get('Harbor waves'), ash=get('Volcanic ash and embers'), steam=get('Geothermal steam');
      const fabrics=all('Wind-blown fabric'), boats=all('Moored boat'), mills=all('Windmill sails');
      return {draws:r.stats.drawCalls,skyWidth:sky.material.uniforms.skyImage.value.image.width,
        weatherTime:(water||ash).material.uniforms.time.value,
        counts:{waveBands:water?.material.uniforms.waves.value.length||0,mills:mills.length,
          fabrics:fabrics.length,boats:boats.length,ponds:all('Water basin').length,
          ash:ash?.geometry.attributes.position.count||0},
        shoreWidth:water?.material.uniforms.field.value.image.width, steam:steam?.geometry.attributes.position.count,
        canopy:ash&&[ash.material.uniforms.roofs.value.image.width,ash.material.uniforms.roofs.value.image.height],
        millAngles:mills.map(m=>m.rotation.x),boatHeights:boats.map(boat=>boat.position.y),
        fourPoses:fabrics.every(mesh=>[0,1,2,3].every(i=>mesh.geometry.hasAttribute('gust'+i))),
        failedPrograms:r.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length};
    });
  }
  try{
    await page.evaluate(observer=>{
      const r=mapProbe.last.deref();
      observer.y=r.world.groundHeight(observer.x,observer.z,observer.y);
      if(!r.world.canOccupy(observer.x,observer.z,observer.radius,observer.height,observer.y))throw Error('Observer is obstructed.');
      mapProbe.camera=observer;
    },camera);
    await page.waitForTimeout(250);
    const first=await read();
    await page.screenshot({path:join(output,id+'-environment-a.jpg'),quality:87});
    await page.waitForTimeout(850);
    const second=await read();
    await page.screenshot({path:join(output,id+'-environment-b.jpg'),quality:87});
    assert.deepEqual(second.counts,expected[id]);
    assert.equal(second.skyWidth,2048);assert.equal(second.failedPrograms,0);
    assert.ok(second.draws>0 && second.weatherTime>first.weatherTime);
    assert.ok(second.fourPoses);
    if(id==='tephra'){
      assert.deepEqual(second.canopy,[32,62]);assert.ok(second.steam>0);
    }else{
      assert.equal(second.shoreWidth,256);
      assert.ok(second.boatHeights.some((y,i)=>Math.abs(y-first.boatHeights[i])>.0001));
      assert.ok(second.millAngles.every((angle,i)=>angle>first.millAngles[i]));
    }
    return {camera,first,second};
  }finally{
    await page.evaluate(()=>{mapProbe.camera=null;});
  }
}
