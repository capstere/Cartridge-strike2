// An extra real action after the normal timing window. Chromium's compositor
// trace carries presentation feedback even for frames under the LoAF threshold.
module.exports=async function collectCompositor(page,controls){
  const session=await page.context().newCDPSession(page),events=[];
  session.on('Tracing.dataCollected',batch=>{
    for(const e of batch.value)if(e.name==='AnimationFrame'||e.name==='AnimationFrame::Presentation'||e.name==='cs3-rush-submitted'){
      events.push({name:e.name,ph:e.ph,ts:e.ts,pid:e.pid,tid:e.tid,id:e.args?.id,id2:e.id2,frame:e.args?.animation_frame_timing_info?.begin_frame_id??e.args?.begin_frame_id});
    }
  });
  try{
    await session.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing',transferMode:'ReportEvents'});
    await page.evaluate(()=>{
      for(const key of ['events','steps','renders','activities','compositor'])rushTrace[key]=[];
      rushTrace.markFirstShift=true;cs3Baseline.mode='action';
    });
    await controls(page);
    const action=await page.evaluate(()=>{cs3Baseline.mode='off';return {events:rushTrace.events,renders:rushTrace.renders};});
    const finished=new Promise(resolve=>session.once('Tracing.tracingComplete',resolve));
    await session.send('Tracing.end');await finished;
    return {timingAffectsThisAdditionalAction:true,events,action};
  }finally{await session.detach();}
};
