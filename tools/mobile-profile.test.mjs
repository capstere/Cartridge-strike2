import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTouchProfile,TOUCH_DEFAULTS} from '../src/fps/mobile-profile.mjs';
import {exportTouchProfile,importTouchProfile,validateLayout} from '../src/fps/mobile-layout.mjs';

test('original saved settings acquire input defaults and retain unrelated player data',()=>{
  const settings={loadout:'rifle',mobileAutoFire:false,volume:.3};
  assert.equal(normalizeTouchProfile(settings),settings);
  assert.deepEqual(settings,{loadout:'rifle',mobileAutoFire:false,volume:.3,...TOUCH_DEFAULTS});
  Object.assign(settings,{touchMode:'stale',touchLookSensitivity:9,fieldOfView:null,touchQuickShot:'false'});
  normalizeTouchProfile(settings);
  assert.equal(settings.touchMode,'auto');assert.equal(settings.touchLookSensitivity,2);
  assert.equal(settings.fieldOfView,76);assert.equal(settings.touchQuickShot,false);
});

test('a portable profile retains only approved settings and control positions',()=>{
  const settings=normalizeTouchProfile({touchQuickShot:true,touchMode:'on',touchStick:'fixed',touchRun:'button',mobileAutoFire:false,privateCharacter:'private data'});
  const layout={fire:{x:.8,y:.6,size:56,opacity:.7},bonuses:{x:.3,y:.2,size:48,opacity:1}};
  const text=exportTouchProfile(settings,layout),result=importTouchProfile(text);
  assert(!text.includes('private'));assert.deepEqual(result.layout,layout);
  assert.equal(result.settings.touchRun,'button');assert.equal(result.settings.mobileAutoFire,false);
  assert.throws(()=>importTouchProfile('x'.repeat(8200)));
  for(const value of [null,[],{version:0,settings:{},layout:{}},{version:1,settings:{secret:true},layout:{}},{version:1,settings:{touchQuickShot:'yes'},layout:{}}])
    assert.throws(()=>importTouchProfile(JSON.stringify(value)));
  for(const bad of [{fire:{...layout.fire,size:10}},{fire:{...layout.fire,x:-1}},{fire:{...layout.fire,opacity:0}},{unknown:layout.fire},JSON.parse('{"__proto__":{}}')])assert.throws(()=>validateLayout(bad));
});

test('30 FPS limits scene submission and retains ordinary frame deltas when disabled',async()=>{
 const {PresentationPacer}=await import('../src/fps/mobile-profile.mjs');
 const clock=new PresentationPacer(),ticks=Array.from({length:121},(_,i)=>i*1000/60);
 assert.equal(ticks.filter(t=>clock.sample(t,true,1/60)!==null).length,61);
 assert.equal(clock.skipped,60);
 for(const t of ticks)assert.equal(clock.sample(t,false,1/60),1/60);
 assert.equal(clock.sample(15,false,.05),.05);assert.equal(clock.sample(16,true,.01),.01);
});

test('dynamic resolution can restore native scale and use a 30 FPS frame-time target',async()=>{
 const {AdaptiveResolution}=await import('../src/fps/adaptive-resolution.mjs');
 const res=new AdaptiveResolution();res.targetMs=1000/30;
 assert.equal(res.update(10,33,60),false);assert.equal(res.scale,1);
 assert(res.update(13,55,60));assert.equal(res.scale,.9);
 res.enabled=false;assert(res.update(14,55,60));assert.equal(res.scale,1);
 assert.equal(res.update(20,55,60),false);
});

test('controller navigation skips unsupported Solo modes and disabled option groups',async()=>{
 const {changePadOption}=await import('../src/fps/gamepad-controls.mjs');
 const make=(disabled=false,group=false)=>({disabled,closest:()=>group?{}:null});
 const select={options:[make(true),make(),make(false,true),make()],selectedIndex:1};
 assert(changePadOption(select,1,false));assert.equal(select.selectedIndex,3);
 assert(!changePadOption(select,1,false));assert(changePadOption(select,1,true));assert.equal(select.selectedIndex,1);
 select.options[3].disabled=true;assert(!changePadOption(select,1,true));
});
