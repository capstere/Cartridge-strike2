import assert from 'node:assert/strict';
import fs from 'node:fs';
const [left,right]=process.argv.slice(2);
if(!left||!right)throw Error('Usage: node tools/compare-floor5-profile.mjs before/measurements.json after/measurements.json');
const before=JSON.parse(fs.readFileSync(left)),after=JSON.parse(fs.readFileSync(right));
assert.equal(before.browser,after.browser);assert.equal(before.platform,after.platform);
assert.equal(before.runs.length,after.runs.length);
for(let i=0;i<before.runs.length;i++){
 const a=before.runs[i],b=after.runs[i];
 assert.deepEqual([a.mobile,a.run,a.settings,a.stateHash,a.eventHash,a.shots],[b.mobile,b.run,b.settings,b.stateHash,b.eventHash,b.shots]);
 for(const name of ['lift','c08','combat']){
  assert.deepEqual(a.samples[name].map(v=>[v.tick,v.buffer]),b.samples[name].map(v=>[v.tick,v.buffer]),'same ticks and drawing buffers');
 }
}
const median=values=>{const v=values.sort((a,b)=>a-b);return v[Math.floor(v.length/2)];},rows=[];
for(const mobile of [true,false])for(const scene of ['lift','c08','combat']){
 const row={configuration:mobile?'touch emulation':'desktop',scene};
 for(const key of ['workMedian','workP95','median','p95','p99','over25','over50']){
  row[key]=[before,after].map(r=>Number(median(r.runs.filter(v=>v.mobile===mobile).map(v=>v.summary[scene][key])).toFixed(2)));
 }
 rows.push(row);
}
console.log(JSON.stringify({status:'PASS',identicalReplayPairs:before.runs.length,rows},null,2));
