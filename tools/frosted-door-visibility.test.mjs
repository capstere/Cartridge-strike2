import assert from 'node:assert/strict';
import test from 'node:test';
import {furnitureVisibility} from '../src/fps/project-visibility.mjs';

const eye = {x:0,y:1.6,z:0};
const sheet = {min:{x:-.5,y:.1,z:49.98},max:{x:.5,y:2.2,z:50.02}};
const wall = (x1,x2,surfaceType='opaque') => ({a:[x1,20],b:[x2,20],height:2.5,surfaceType});
function world(walls) {
  return {data:{walls},doors:{elevators:{progress:1,boxes:[],cabins:[]}}};
}

test('a distant opaque partition can cover the whole sheet; the normal furnishing cutoff remains local',()=>{
  const room=world([wall(-4,4)]);
  const nearby=furnitureVisibility(room),all=furnitureVisibility(room,Infinity);
  nearby.update(eye);all.update(eye);
  assert.equal(nearby.hidden(sheet),false);
  assert.equal(all.hidden(sheet),true);
  all.update({x:0,y:1.6,z:21});
  assert.equal(all.hidden(sheet),false);
});

test('a sheet visible through a real opening, glazing or around a wall edge stays submitted',()=>{
  for(const walls of [[wall(-4,-.1),wall(.1,4)], [wall(-4,4,'glazed')], [wall(-4,.15)]]){
    const visibility=furnitureVisibility(world(walls),Infinity);
    visibility.update(eye);
    assert.equal(visibility.hidden(sheet),false);
  }
});
