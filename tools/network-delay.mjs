// Delay a reliable stream without changing its arrival order. Adjacent timers
// can fire out of order even when their requested deadlines increase.
export function orderedDelay(deliver,{setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const pending=[],timers=new Set();let closed=false;
 return {
  push(value,delay){
   if(closed)return;
   const entry={value,ready:false};pending.push(entry);
   const timer=setTimer(()=>{
    timers.delete(timer);if(closed)return;entry.ready=true;
    while(pending[0]?.ready)deliver(pending.shift().value);
   },delay);
   timers.add(timer);
  },
  close(){closed=true;for(const timer of timers)clearTimer(timer);timers.clear();pending.length=0;},
  get pending(){return pending.length;},
 };
}
