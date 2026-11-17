import test from 'node:test';
import assert from 'node:assert/strict';
import {orderedDelay} from './network-delay.mjs';
function clock(){
 const callbacks=new Map();let id=0;
 return {callbacks,setTimer:fn=>{callbacks.set(++id,fn);return id;},clearTimer:key=>callbacks.delete(key),
  fire(key){const fn=callbacks.get(key);callbacks.delete(key);fn();}};
}
test('latency proxy preserves reliable input deltas when adjacent timers fire out of order',()=>{
 const time=clock(),received=[],queue=orderedDelay(value=>received.push(value),time);
 queue.push({forward:.33},50);queue.push({forward:0},51);queue.push({},52);
 time.fire(2);time.fire(3);assert.deepEqual(received,[],'a stop delta cannot overtake earlier movement');
 time.fire(1);assert.deepEqual(received,[{forward:.33},{forward:0},{}]);
 let forward=0;for(const delta of received)forward=delta.forward??forward;
 assert.equal(forward,0,'later bodyless frames retain the intended neutral input');
 assert.equal(queue.pending,0);assert.equal(time.callbacks.size,0);
});
test('closing a delayed stream cancels timers and releases ready and waiting messages',()=>{
 const time=clock(),received=[],queue=orderedDelay(value=>received.push(value),time);
 queue.push('first',50);queue.push('second',51);time.fire(2);
 const alreadyQueued=time.callbacks.get(1);queue.close();queue.close();queue.push('late',0);alreadyQueued();
 assert.deepEqual(received,[]);assert.equal(queue.pending,0);assert.equal(time.callbacks.size,0);
});
