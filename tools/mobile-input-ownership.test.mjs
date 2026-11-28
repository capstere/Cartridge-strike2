import test from 'node:test';
import assert from 'node:assert/strict';
import {MobileControls} from '../src/fps/mobile-controls.mjs';
function fixture({coarse=true,points=5,onModeChange,...overrides}={}){
 const saved=Object.fromEntries(['window','document','navigator'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 class Element extends EventTarget{constructor(action){super();this.dataset={mobileAction:action};this.classes=new Set();this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),toggle:()=>{}};this.style={};this.clientHeight=200;}setPointerCapture(){}getBoundingClientRect(){return {left:0,right:250,top:0,bottom:200};}}
 const zone=new Element(),stick=new Element(),nub=new Element(),look=new Element(),fire=new Element('fire'),run=new Element('run'),root=new Element();
 const nodes={'[data-mobile-stick-zone]':zone,'[data-mobile-stick]':stick,'[data-mobile-nub]':nub,'[data-mobile-look]':look};root.querySelector=k=>nodes[k];root.querySelectorAll=()=>[fire,run];root.contains=node=>node===root||node===fire;
 Object.defineProperty(globalThis,'window',{configurable:true,value:Object.assign(new EventTarget(),{matchMedia:()=>({matches:coarse})})});
 Object.defineProperty(globalThis,'document',{configurable:true,value:Object.assign(new EventTarget(),{documentElement:new Element()})});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{maxTouchPoints:points}});
 const mobile=new MobileControls({root,onLook(){},onAction(){},onModeChange,...overrides});mobile.show(true);
 const send=(node,type,id,x=100,y=100)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:id,pointerType:'touch',clientX:x,clientY:y});node.dispatchEvent(e);};
 return {mobile,zone,fire,look,run,send,restore(){for(const [k,d]of Object.entries(saved)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}};
}
test('one finger cancellation keeps another owner firing until its final release',()=>{
 const f=fixture();try{for(const type of ['pointerup','pointercancel','lostpointercapture']){
 f.send(f.fire,'pointerdown',1);f.send(f.fire,'pointerdown',2);f.send(f.fire,type,1);assert.equal(f.mobile.state.fire,true);assert(f.fire.classes.has('pressed'));
 f.send(f.fire,type,2);assert.equal(f.mobile.state.fire,false);assert(!f.fire.classes.has('pressed'));
 }}finally{f.restore();}
});
test('weapon action reset preserves active movement/look but full reset releases them',()=>{
 const f=fixture();try{f.send(f.zone,'pointerdown',1);f.send(f.zone,'pointermove',1,100,60);f.send(f.look,'pointerdown',2);f.send(f.fire,'pointerdown',3);
 f.mobile.clearActions();assert(f.mobile.state.forward>.2);assert.equal(f.mobile.stickId,1);assert.equal(f.mobile.lookId,2);assert.equal(f.mobile.state.fire,false);
 f.mobile.clear();assert.equal(f.mobile.state.forward,0);assert.equal(f.mobile.stickId,null);assert.equal(f.mobile.lookId,null);f.send(f.fire,'pointerup',3);assert.equal(f.mobile.state.fire,false);
 }finally{f.restore();}
});

test('a fine-primary touchscreen activates on its first touch and returns to mouse on an outside click',()=>{
 const changes=[];
 const f=fixture({coarse:false,onModeChange:touch=>changes.push(touch)});
 try{
  assert(f.mobile.touchCapable);
  assert.equal(f.mobile.enabled,false);
  f.send(document,'pointerdown',1);
  assert(f.mobile.enabled);
  f.mobile.show(true);
  f.send(f.fire,'pointerdown',2);
  assert(f.mobile.input().fire);
  document.dispatchEvent(Object.assign(new Event('pointerdown'),{pointerType:'mouse'}));
  assert.equal(f.mobile.enabled,false);
  assert.equal(f.mobile.input().fire,false);
  assert.equal(f.mobile.root.hidden,true);
  assert.deepEqual(changes,[true,false]);
 }finally{f.restore();}
});

test('desktop without a digitizer keeps its normal input',()=>{
 const f=fixture({coarse:false,points:0});
 try{
  assert.equal(f.mobile.touchCapable,false);
  assert.equal(f.mobile.enabled,false);
 }finally{f.restore();}
});

test('fixed stick and selected Run button require forward travel, release and can run again',()=>{
 const f=fixture({settings:{touchRun:'button',touchStick:'fixed'}});
 try {
  f.send(f.zone,'pointerdown',1,0,0);assert.equal(f.mobile.stickId,null);
  f.send(f.zone,'pointerdown',1,125,110);f.send(f.zone,'pointermove',1,125,30);
  assert.equal(f.mobile.input().sprint,false);f.send(f.run,'pointerdown',3);assert.equal(f.mobile.input().sprint,true);
  f.send(f.run,'pointerup',3);f.send(f.zone,'pointercancel',1);assert.equal(f.mobile.input().sprint,false);
  f.send(f.zone,'pointerdown',1,125,110);f.send(f.zone,'pointermove',1,125,25);assert.equal(f.mobile.input().sprint,false);
 }finally{f.restore();}
});

test('dragging Fire aims while the movement and ordinary look owners stay independent',()=>{
 const look=[];const f=fixture({onLook:(x,y)=>look.push([x,y])});
 try{
  f.send(f.zone,'pointerdown',1);f.send(f.zone,'pointermove',1,100,30);
  f.send(f.look,'pointerdown',2);f.send(f.fire,'pointerdown',3);f.send(f.fire,'pointermove',3,113,97);
  f.send(f.look,'pointermove',2,94,107);
  assert.deepEqual(look,[[13,-3],[-6,7]]);assert(f.mobile.input().fire&&f.mobile.input().sprint);
  f.send(f.fire,'pointercancel',3);assert(!f.mobile.input().fire&&f.mobile.input().sprint);assert.equal(f.mobile.lookId,2);
 }finally{f.restore();}
});

test('a held scoped trigger emits one shot on release and cancels across a lost pointer or weapon change',()=>{
 let shots=0;const phases=[],f=fixture({scopeTrigger(p){phases.push(p);return p!=='cancel';},onFirePress(){shots++;}});
 try{
  f.send(f.fire,'pointerdown',1);f.send(f.fire,'pointerdown',2);assert(!f.mobile.input().fire);
  f.send(f.fire,'pointerup',2);assert.equal(shots,0);f.send(f.fire,'pointerup',1);
  assert.equal(shots,1);assert(f.mobile.input().fire);assert(!f.mobile.input().fire);
  f.send(f.fire,'pointerdown',3);f.send(f.fire,'lostpointercapture',3);
  f.send(f.fire,'pointerdown',4);f.mobile.clearActions();f.send(f.fire,'pointerup',4);
  assert.equal(shots,1);assert.deepEqual(phases,['press','release','press','cancel','press','cancel']);
 }finally{f.restore();}
});

test('saved touch On and Off override automatic pointer detection on the same page',()=>{
 const f=fixture({coarse:false,points:0,settings:{touchMode:'on'}});
 try{
  assert(f.mobile.enabled);f.send(f.fire,'pointerdown',1);f.mobile.settings.touchMode='off';f.mobile.applyProfile();
  assert(!f.mobile.enabled);assert(!f.mobile.input().fire);f.send(document,'pointerdown',3);assert(!f.mobile.enabled);
  f.mobile.settings.touchMode='on';f.mobile.applyProfile();assert(f.mobile.enabled);
 }finally{f.restore();}
});
