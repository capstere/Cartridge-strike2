import test from 'node:test';
import assert from 'node:assert/strict';
import {makePoster,locatePoster,validatePoster,parsePosters,serializePosters} from './posters.mjs';
const wall={id:'WALL-001',kind:'wall',a:[2,3],b:[6,3],height:2.85,thickness:.1};
const wall2={id:'WALL-002',kind:'wall',a:[6,3],b:[6,7],height:2.85,thickness:.1};
test('wall poster is centered in correct orientation, at wall-safe height',()=>{
 const p=makePoster(wall,[]);
 assert.equal(p.wallId,'WALL-001');assert.equal(p.t,.5);
 const at=locatePoster(p,[wall]);
 assert(Math.abs(at.x-4)<.001);
 assert(at.z>3&&at.z<3.2);
 assert.equal(at.angle,0);
 assert(validatePoster(p,[wall]));
});
test('back-side poster faces outward and serializes without losing dimensions',()=>{
 const p=makePoster(wall,[],.77,-1,{text:'TEAMWORK',subtitle:'Tillsammans',width:.8});
 assert.equal(p.side,-1);
 assert(Math.abs(locatePoster(p,[wall]).angle-Math.PI)<1e-6);
 assert.deepEqual(parsePosters(JSON.parse(JSON.stringify(serializePosters([p]))),[wall]),[p]);
});
test('poster attaches to an upright world-Z wall correctly',()=>{
 const p=makePoster(wall2,[],.5,1);
 const at=locatePoster(p,[wall2]);
 assert(at.x<6&&at.z===5);
 assert(Math.abs(at.angle+Math.PI/2)<1e-6);
});
test('legacy architecture JSON without posters is still compatible',()=>{
 assert.deepEqual(parsePosters(undefined,[wall]),[]);
 assert.deepEqual(parsePosters(null,[wall]),[]);
});
test('missing/removed wall, invalid image format, oversized image and duplicate IDs reject',()=>{
 const p=makePoster(wall,[]);
 assert.throws(()=>parsePosters([p],[]),/vägg/);
 assert.throws(()=>parsePosters([p,p],[wall]),/Dubbelt/);
 assert.throws(()=>validatePoster({...p,image:'javascript:alert(1)'},[wall]),/affischbild/i);
 assert.throws(()=>validatePoster({...p,image:'data:image/svg+xml;base64,AAAA'},[wall]),/affischbild/i);
 assert.throws(()=>validatePoster({...p,image:'data:image/jpeg;base64,'+'A'.repeat(100001)},[wall]),/affischbild/i);
 assert.throws(()=>validatePoster({...p,width:4.3},[wall]),/mått/);
 assert.throws(()=>validatePoster({...p,t:0},[wall]),/hörn/);
});
test('cannot attach poster to doors or beyond wall top',()=>{
 assert.throws(()=>makePoster({...wall,kind:'door'},[]),/vägg/);
 const p=makePoster(wall,[]);
 assert.throws(()=>validatePoster({...p,y:2.8},[wall]),/få plats/);
 assert.throws(()=>validatePoster({...p,wallId:'D99'},[wall]),/vägg/);
});
test('safe base64 JPEG and PNG/WEBP payloads persist and optional text stays editable',()=>{
 const p=makePoster(wall,[],.5,1,{text:'Respekt',subtitle:'Vi hjälps åt',image:'data:image/png;base64,AAAA'});
 assert.equal(parsePosters([p],[wall])[0].image,p.image);
 assert.equal(parsePosters([{...p,image:'data:image/webp;base64,AAAA'}],[wall])[0].text,'Respekt');
});
