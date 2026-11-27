import test from 'node:test';
import assert from 'node:assert/strict';
import {MobileControls} from '../src/fps/mobile-controls.mjs';
function fixture({coarse=true,points=5,onModeChange}={}){
 const saved=Object.fromEntries(['window','document','navigator'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 class Element extends EventTarget{constructor(action){super();this.dataset={mobileAction:action};this.classes=new Set();this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),toggle:()=>{}};this.style={};this.clientHeight=200;}setPointerCapture(){}getBoundingClientRect(){return {left:0,right:250,top:0,bottom:200};}}
 const zone=new Element(),stick=new Element(),nub=new Element(),look=new Element(),fire=new Element('fire'),root=new Element();
 const nodes={'[data-mobile-stick-zone]':zone,'[data-mobile-stick]':stick,'[data-mobile-nub]':nub,'[data-mobile-look]':look};root.querySelector=k=>nodes[k];root.querySelectorAll=()=>[fire];root.contains=node=>node===root||node===fire;
 Object.defineProperty(globalThis,'window',{configurable:true,value:Object.assign(new EventTarget(),{matchMedia:()=>({matches:coarse})})});
 Object.defineProperty(globalThis,'document',{configurable:true,value:Object.assign(new EventTarget(),{documentElement:new Element()})});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{maxTouchPoints:points}});
 const mobile=new MobileControls({root,onLook(){},onAction(){},onModeChange});mobile.show(true);
 const send=(node,type,id,x=100,y=100)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:id,pointerType:'touch',clientX:x,clientY:y});node.dispatchEvent(e);};
 return {mobile,zone,fire,look,send,restore(){for(const [k,d]of Object.entries(saved)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}};
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
