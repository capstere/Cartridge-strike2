import {preparedFloorFinish} from '../../furniture-editor/build/floor5-appearance.mjs';
import {microFinishMaterial} from '../../furniture-editor/build/pattern-materials.mjs?v=5.6.1';
import {buildEnvironment} from '../../furniture-editor/build/environment-visuals.mjs';
import {buildFpsFurniture} from './project-batches.mjs';
import {buildDoorVisuals} from './door-visuals.mjs?v=5.5.0';
import {buildFacilityDetails} from './facility-details-view.mjs';
import {GlassVisuals} from './glass-visuals.mjs';
import {buildRiposteProps} from './riposte-props.mjs';
import {makeWeapon} from './models.mjs?v=6.1.2';
import {WEAPONS} from './config.mjs';
import {buildProjectFurniture,buildProjectDecorations} from '../../furniture-editor/build/project-visuals.mjs?v=5.9.0';
import {hasPattern} from '../../furniture-editor/build/pattern-presets.mjs?v=5.6.1';
import {patternMaterial} from '../../furniture-editor/build/pattern-materials.mjs?v=5.6.1';
import {buildFacilityScene} from './facility-scene.mjs';
import {installFocusLighting} from './strike-kit-environment.mjs';
import {VisualDepth} from './visual-depth.mjs';
import {inspectPose} from './view-surface.mjs';
import {ZombieVisuals} from './zombie-visuals.mjs';
import {isZombieFloor} from './zombie-sites.mjs';
import {CombatVisuals} from './combat-visuals.mjs';
/** Presentation-quality entrypoint. The engine, game state and geometry remain separate.
 * The engine imports the public model API. Arcade visual effects remain separate
 * from authoritative movement, combat, death and respawn state.
 */
import * as THREE from '../../vendor/three/three.module.js';
import { Renderer as EngineRenderer } from './render-engine.mjs?v=6.1.2';
import {loadCharacterLibrary,loadDefaultHostages,disposeCharacterLibrary} from './character-library.mjs?v=6.1.2';
import { bakeLightfield } from './presentation-lightfield.mjs';
import {ActionVisuals} from './action-visuals.mjs?v=6.1.2';
import { buildLivingScene } from './living-floor-scene.mjs';
import { freezeStaticTransforms } from './render-engine.mjs?v=6.1.2';
export { freezeStaticTransforms } from './render-engine.mjs?v=6.1.2';

function installField(material, texture, bounds) {
  if(!material?.isMeshStandardMaterial || material.transparent || material.emissiveIntensity>1)return null;
  const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey;
  const key=previousKey.call(material);
  material.onBeforeCompile=function(shader,renderer){
    previous.call(this,shader,renderer);
    shader.uniforms.uPresentationField={value:texture};
    shader.uniforms.uPresentationBounds={value:new THREE.Vector4(bounds[0],bounds[1],bounds[2]-bounds[0],bounds[3]-bounds[1])};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vPresentationWorld;');
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
      vec4 presentationPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        presentationPosition = instanceMatrix * presentationPosition;
      #endif
      vPresentationWorld = (modelMatrix * presentationPosition).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      uniform sampler2D uPresentationField;
      uniform vec4 uPresentationBounds;
      varying vec3 vPresentationWorld;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
      vec2 presentationUV = (vPresentationWorld.xz - uPresentationBounds.xy) / uPresentationBounds.zw;
      vec3 presentationIndirect = texture2D(uPresentationField, clamp(presentationUV, 0.0, 1.0)).rgb * 1.3;
      float presentationHeight = clamp(1.08 - vPresentationWorld.y * .15, .55, 1.0);
      reflectedLight.indirectDiffuse *= mix(vec3(.98), presentationIndirect, presentationHeight);`);
  };
  material.customProgramCacheKey=()=>key+'|presentation-indirect-v1';material.needsUpdate=true;
  return ()=>{material.onBeforeCompile=previous;material.customProgramCacheKey=previousKey;material.needsUpdate=true;};
}

export class Renderer extends EngineRenderer {
  constructor(canvas,world,settings){
    const visualWorld={...world,description:{...world.description,boxes:world.description.boxes.filter(b=>!b.livingVisual)}};
    super(canvas,visualWorld,settings);
    if(!world.newLevel){this.detailScene=buildFacilityDetails(world.details,this.registry);this.scene.add(this.detailScene.root);freezeStaticTransforms(this.detailScene.root);}
    this.glassVisuals=new GlassVisuals(this.scene,world.glass,this.registry);
    this.visualDepth=this.neutralLighting?null:new VisualDepth(this.renderer);this.inspectAt=-Infinity;this.inspectActor=null;
    this.onInspectKey=e=>{if(e.code==='KeyV'&&!e.repeat&&document.pointerLockElement===canvas&&this.presentationGame)this.requestInspect(this.presentationGame);};
    window.addEventListener('keydown',this.onInspectKey);
    // Intercept only the engine's world draw; recursive offscreen/composite draws
    // use the unmodified native renderer. Restore this hook at final teardown.
    this.nativeRender=this.renderer.render.bind(this.renderer);this.inDepthPass=false;
    this.renderer.render=(scene,camera)=>{
      if(scene===this.scene&&!this.inDepthPass)this.doorVisuals?.update(camera,this.renderer.shadowMap.enabled?this.lights:[]);
      if(scene===this.scene&&!this.inDepthPass){
        this.zombieVisuals?.update(this.presentationGame,camera);
        this.projectBatches?.update(camera);
        this.floorEnvironment?.update(camera,this.presentationGame?.state.time||0,this.settings,world);
      }
      if(scene===this.scene&&!this.inDepthPass&&this.visualDepth&&this.settings.graphics!=='low'){
        this.inDepthPass=true;try{this.visualDepth.render(scene,camera);}finally{this.inDepthPass=false;}return;
      }
      if(scene===this.viewScene)this.applyInspection();
      return this.nativeRender(scene,camera);
    };
    this.viewFill=new THREE.DirectionalLight(0xb5d8ee,.75);this.viewFill.position.set(2,.5,-1);this.viewScene.add(this.viewFill);
    this.scene.environmentIntensity=.72;
    this.combatVisuals=new CombatVisuals(this.scene,world,settings);
    this.presentationDisposed=false;this.presentationRestores=[];this.presentationField=null;
    // Stage the field before the existing app declares its assets ready. Never bake in render().
    if(isZombieFloor(world))this.zombieVisuals=new ZombieVisuals(this.scene,settings.mobile);
    this.assetsReady=Promise.all([this.assetsReady,this.zombieVisuals?.ready]).then(async()=>{
      if(this.presentationDisposed)return;
      if(world.projectScene){
       this.projectFurniture=new THREE.Group();this.scene.add(this.projectFurniture);
       const options={assets:world.project.assets.local,world};
       if(this.neutralLighting)this.projectBatches=await buildFpsFurniture(world.projectScene.items,this.projectFurniture,options);
       else await buildProjectFurniture(world.projectScene.items,this.projectFurniture,options);
       const decorationStart=this.projectFurniture.children.length;
       buildProjectDecorations(world.project,world.projectScene.entries,this.projectFurniture);
       if(this.projectBatches){
        for(const node of this.decor.children)this.projectBatches.register(node);
        for(const node of this.projectFurniture.children.slice(decorationStart))this.projectBatches.register(node);
        for(const node of this.scene.children)if(node.name==='room-static-batch')this.projectBatches.register(node);
       }
       if(world.project.environment){
        const environment=await buildEnvironment(world.project,world.projectScene.entries,world.projectScene.items);
        if(this.presentationDisposed){environment.dispose();return;}
        this.floorEnvironment=environment;this.projectFurniture.add(environment.root);
        for(const cell of environment.root.children)this.projectBatches?.register(cell);
       }
       freezeStaticTransforms(this.projectFurniture);
      }
      this.actionVisuals=new ActionVisuals(this.scene,world);
      await Promise.all([loadCharacterLibrary(),loadDefaultHostages()]);
      if(this.presentationDisposed)return;
      this.facilityScene=world.newLevel?null:await buildFacilityScene(world,settings);
      if(this.presentationDisposed){this.facilityScene?.dispose();return;}
      this.livingScene=world.newLevel?null:buildLivingScene(world,this.registry,{replacedProps:this.facilityScene?.plan.replacedProps,refinedFreight:!!this.facilityScene});
      if(this.facilityScene)this.scene.add(this.facilityScene.root);
      if(this.livingScene){this.scene.add(this.livingScene.root);this.livingScene.decorateCeilings(this.scene);}
      [this.doorVisuals,this.riposteProps]=await Promise.all([buildDoorVisuals(world.doors),world.newLevel?Promise.resolve(null):buildRiposteProps(world)]);
      if(this.presentationDisposed){this.doorVisuals?.dispose();this.riposteProps?.dispose();return;}
      if(this.doorVisuals)this.scene.add(this.doorVisuals.root);if(this.riposteProps)this.scene.add(this.riposteProps.root);
      if(this.riposteProps)freezeStaticTransforms(this.riposteProps.root);
      if(this.livingScene)freezeStaticTransforms(this.livingScene.root);
      if(!this.settings.mobile&&!this.neutralLighting){
      const started=performance.now(),field=await bakeLightfield(world,this.fixtures,{maxSize:96});
      if(this.presentationDisposed)return;
      const texture=new THREE.DataTexture(field.data,field.width,field.height,THREE.RGBAFormat);
      texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
      texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.needsUpdate=true;texture.name='presentation-indirect';
      this.presentationField=texture;
      const patched=new Set();
      this.scene.traverse(object=>{
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          if(!material||patched.has(material))continue;patched.add(material);
          const restore=installField(material,texture,field.bounds);if(restore)this.presentationRestores.push(restore);
        }
      });
      this.focusLighting=installFocusLighting(this.scene,world);
      // Preserve the existing two shadow lights and quality-specific shadow budgets.
      this.presentationReport={kind:'approximate-startup-indirect-field',width:field.width,height:field.height,
        sources:field.sources,visibilityChecks:field.checks,materials:this.presentationRestores.length,
        milliseconds:performance.now()-started,geometryChanged:false,photometricValidation:false};
      }else{this.presentationReport={kind:this.neutralLighting?'neutral-daylight':'mobile-ambient-light',geometryChanged:false,photometricValidation:false};}
      // Prepare the actual rigged models and all first-use world weapon materials.
      // Previously these only existed after Start and compiled during combat.
      const startupActors=[];
      for(const side of ['analysts','counterAnalysts'])for(let i=0;i<5;i++)startupActors.push(this.actorModel({id:`${side}-${i}`,team:side}));
      for(let i=0;i<2;i++)startupActors.push(this.actorModel({id:`hostage-${i}`}));
      this.worldWeaponWarmup=new THREE.Group();this.worldWeaponWarmup.name='world-weapon-preload';
      if(!this.settings.mobile)for(const w of Object.values(WEAPONS))if(!['armor'].includes(w.slot))this.worldWeaponWarmup.add(makeWeapon(w.id,{viewmodel:false}));
      this.scene.add(this.worldWeaponWarmup);
      if(this.neutralLighting){
       const maps=new Set();
       this.projectFurniture.traverse(node=>{for(const material of [].concat(node.material||[]))for(const value of Object.values(material))if(value?.isTexture)maps.add(value);});
       for(const map of maps)this.renderer.initTexture(map);
       await this.renderer.compileAsync(this.scene,this.camera);
      }else if(!this.settings.mobile){
      const visibility=this.lights.map(light=>light.visible),shadows=this.renderer.shadowMap.enabled,previousTarget=this.renderer.getRenderTarget();
      try {
        // Standard renders the world into a linear HDR target. Compiling only
        // the default framebuffer leaves different shader variants cold.
        for(const target of [null,this.visualDepth.target])for(const shadowed of [false,true])for(let count=0;count<=this.lights.length;count++){
          this.renderer.setRenderTarget(target);
          this.renderer.shadowMap.enabled=shadowed;this.lights.forEach((light,i)=>light.visible=i<count);
          await this.renderer.compileAsync(this.scene,this.camera);
        }
      } finally { this.renderer.setRenderTarget(previousTarget);this.renderer.shadowMap.enabled=shadows;this.lights.forEach((light,i)=>light.visible=visibility[i]); }
      // Compile the three new first-person models before Start, not on first weapon switch.
      const depth=this.visualDepth;
      for(const material of [depth.aoMaterial,depth.material]){depth.quad.material=material;await this.renderer.compileAsync(depth.scene,depth.camera);}
      depth.quad.material=depth.material;
      }
      this.worldWeaponWarmup.visible=false;for(const actor of startupActors)actor.visible=false;
      this.kitWarmup=[];this.weaponWarmup=[];
      if(!this.settings.mobile)for(const id of Object.values(WEAPONS).filter(w=>w.slot!=='armor').map(w=>w.id)){
        if(this.presentationDisposed)return;
        const model=makeWeapon(id);this.weaponCache.set(id,model);this.viewScene.add(model);
        try{await this.renderer.compileAsync(this.viewScene,this.viewCamera);this.weaponWarmup.push(id);if(['p9','p12','cr4'].includes(id))this.kitWarmup.push(id);}
        finally{this.viewScene.remove(model);}
      }
    });
  }
  requestInspect(game){
    const p=game.player;if(!p?.alive||game.state.paused||game.phase!=='active'||p.reloadUntil>game.state.time)return false;
    this.inspectAt=game.state.time;this.inspectActor=p.id;this.inspectWeapon=p.weapon;return true;
  }
  updateLights(p,t){
    super.updateLights(p,t);
    for(const light of this.lights){if(!light.visible)continue;const room=this.world.roomAt(light.position.x,light.position.z);light.color.setHex(['I01','I02','I03'].includes(room?.id)?0xeaf4ff:room?.name?.includes('PENTRY')?0xffdfad:0xffefd9);}
  }
  applyInspection(){
    const game=this.presentationGame,p=game?.player,t=game?.state.time??0;
    if(this.weaponModel&&p){
      if(p.id!==this.inspectActor||p.weapon!==this.inspectWeapon||!p.alive||p.reloadUntil>t||(this.shotAt??-Infinity)>=this.inspectAt)this.inspectAt=-Infinity;
      const pose=inspectPose(t-this.inspectAt,{reducedMotion:this.settings.reducedMotion});
      // Show the authored side profile and gripping hands instead of the stock end.
      if(this.weaponModel.userData.heroKit){pose.rotation[1]*=-1.3;pose.rotation[2]*=-.67;}
      this.weaponModel.position.x+=pose.position[0];this.weaponModel.position.y+=pose.position[1];this.weaponModel.position.z+=pose.position[2];this.weaponModel.rotation.x+=pose.rotation[0];this.weaponModel.rotation.y+=pose.rotation[1];this.weaponModel.rotation.z+=pose.rotation[2];
      this.weaponModel.updateMatrixWorld(true);
    }
  }
  materialFor(b){
    const finish=b.id?.startsWith('finish-')&&preparedFloorFinish(this.world.project||{},b.id.slice(7),b.material);
    if(finish){
      this.floor5PatternMaterials||=new Map();const key=finish+':'+(b.studioColor||'');
      if(!this.floor5PatternMaterials.has(key))this.floor5PatternMaterials.set(key,microFinishMaterial(finish,b.studioColor));
      return this.floor5PatternMaterials.get(key);
    }
    if(this.world.newLevel&&b.material==='metal'&&b.studioColor)return this.registry.get('paintedMetal',{color:b.studioColor,side:THREE.DoubleSide});
    if(this.world.newLevel&&b.material==='blue-graphic')return this.registry.get('table',{color:0x7c959d,roughness:.85});
    const pattern=b.studioPattern||b.material;
    if(this.world.newLevel&&!b.studioColor&&hasPattern(pattern)){
      this.floor5PatternMaterials||=new Map();
      if(!this.floor5PatternMaterials.has(pattern))this.floor5PatternMaterials.set(pattern,patternMaterial(pattern));
      return this.floor5PatternMaterials.get(pattern);
    }
    if(this.world.newLevel&&b.studioColor)return this.registry.get(['carpet','office-carpet','vinyl','metal'].includes(b.material)?b.material:'wall',{color:b.studioColor,side:THREE.DoubleSide});
    // Custom projects use the selected floor type; canonical room overrides apply only to the original map.
    if(this.world.newLevel&&b.id?.startsWith('finish-'))return super.materialFor(b);
    if(b.id==='finish-I12')return this.registry.get('vinyl',{color:0x56676d,roughness:.53,normalScale:new THREE.Vector2(.08,.08)});
    if(['finish-I13','finish-I21','finish-I38'].includes(b.id))return this.registry.get('vinyl',{color:b.id==='finish-I12'?0x777f7d:0x8d9998,roughness:.86});
    return super.materialFor(b);
  }
  render(game,viewActor,dt){
    // Door instance culling runs at the world-draw hook, after camera/lights update.
    this.presentationGame=game;this.glassVisuals?.update(game.state.time);this.combatVisuals?.update(game);this.livingScene?.update(game.state.time);this.actionVisuals?.update(game,this.camera);super.render(game,viewActor,dt);
  }
  events(events,game){
    this.glassVisuals?.events(events,game);this.combatVisuals?.events(events,game);
    const playerHit=e=>e.sourceId===game.player?.id && (
      game.actors.some(a=>a.id===e.actorId && a.team!==game.player.team) ||
      game.state.zombies?.some(z=>z.id===e.actorId));
    super.events(events.filter(e=>e.type!=='hit'||playerHit(e)),game);
    this.actionVisuals?.events(events,game);
  }
  resetTransient(){
    super.resetTransient();this.zombieVisuals?.clear();this.inspectAt=-Infinity;this.combatVisuals?.clear();this.actionVisuals?.clear();
    // New rounds must not inherit recoil springs or footsteps from the previous life.
    for(const model of this.weaponCache?.values()||[])if(model.userData.presentationMotion)model.userData.presentationMotion.time=null;
    for(const model of this.actors?.values()||[]){if(model.userData.presentationGait)model.userData.presentationGait.time=null;if(model.userData.avatar){model.userData.avatar.time=-1;model.userData.avatar.death=null;}}
  }
  dispose(){
    if(this.presentationDisposed)return;this.presentationDisposed=true;
    this.zombieVisuals?.dispose();this.floorEnvironment?.dispose();this.glassVisuals?.dispose();this.detailScene?.dispose();this.doorVisuals?.dispose();this.riposteProps?.dispose();
    this.focusLighting?.dispose();this.facilityScene?.dispose();
    for(const restore of this.presentationRestores||[])restore();
     for(const m of this.floor5PatternMaterials?.values()||[])m.dispose();this.floor5PatternMaterials?.clear();
    window.removeEventListener('keydown',this.onInspectKey);this.renderer.render=this.nativeRender;this.visualDepth?.dispose();this.combatVisuals?.dispose();this.actionVisuals?.dispose();disposeCharacterLibrary();this.presentationRestores=[];this.presentationField?.dispose();this.livingScene?.dispose();super.dispose();
  }
}
