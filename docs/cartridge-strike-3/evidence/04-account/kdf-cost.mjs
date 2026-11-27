// Run once with the Pi measurement slot free. Keep all fixture secrets in memory.
import {randomBytes} from 'node:crypto';
import {AccountStore} from '../../../../server/account-store.mjs';

const store=new AccountStore(':memory:');
const sample=()=>store.hashPassword(randomBytes(24).toString('hex'));
async function elapsed(run){
  const start=performance.now();
  await run();
  return Number((performance.now()-start).toFixed(1));
}
try{
  await sample();
  const singleMs=[];
  for(let i=0;i<5;i++)singleMs.push(await elapsed(sample));
  const pairMs=await elapsed(()=>Promise.all([sample(),sample()]));
  console.log(JSON.stringify({node:process.version,arch:process.arch,N:32768,r:8,p:1,
    maxConcurrent:2,samplesMs:singleMs,twoConcurrentWallMs:pairMs,processPeakRssKiB:process.resourceUsage().maxRSS}));
}finally{store.close();}
