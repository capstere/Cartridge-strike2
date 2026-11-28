// Runs in the game page through Playwright. Material colors, fitted shoes,
// skeleton and all thirteen original clips follow the established local GLB fixture.
export async function exportPrivateFixtureBytes(){
  const {loadCharacterLibrary,createAuthoredAvatar,disposeAvatar}=await import('../src/fps/character-library.mjs?v=6.1.2');
  const {GLTFExporter}=await import('../vendor/three/addons/exporters/GLTFExporter.js');
  await loadCharacterLibrary();const avatar=createAuthoredAvatar('analysts','compatible-private-fixture',false,{gender:'male',ignoreOverrides:true});
  try{
  const T=await import('../vendor/three/three.module.js');
  const skin=[...avatar.materials.values()].find(m=>m.name==='face-skin')?.color||new T.Color('#bd9270');
  // A compatible generated T-shirt fixture, not a Character Studio UI export.
  avatar.root.traverse(mesh=>{if(!mesh.isSkinnedMesh||mesh.material.name!=='jacket-fabric')return;
   mesh.geometry=mesh.geometry.clone();avatar.ownedGeometry.push(mesh.geometry);const g=mesh.geometry,values=new Float32Array(g.attributes.position.count*3);
   for(let i=0;i<g.attributes.position.count;i++){let lower=0;for(let j=0;j<4;j++)if(/^lowerarm_[lr]$/.test(mesh.skeleton.bones[g.attributes.skinIndex.array[i*4+j]]?.name))lower+=g.attributes.skinWeight.array[i*4+j];
    values.set(lower>.8?skin.toArray():[1,1,1],i*3);
   }g.setAttribute('color',new T.BufferAttribute(values,3));mesh.material.vertexColors=true;
  });
  const glb=await new GLTFExporter().parseAsync(avatar.holder,{binary:true,animations:[...avatar.clips.values()]});
  return Array.from(new Uint8Array(glb));
  }finally{disposeAvatar(avatar);}

}
