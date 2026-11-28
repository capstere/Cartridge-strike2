// Compare ordinary browser delivery with an actively claimed joystick gesture on the same page.
// All inputs still go through Chromium and the game's normal pointer handlers.
const {setTimeout:sleep}=require('node:timers/promises');
module.exports=async function stickTrials(page) {
  const cdp=await page.context().newCDPSession(page);
  const zone=page.locator('[data-mobile-stick-zone]');
  const b=await zone.boundingBox();
  const home={id:1,x:b.x+b.width*.35,y:b.y+b.height*.70};
  const point=dy=>[{...home,y:home.y+dy}];
  const send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  const results=[];
  try {
    for (const claim of [false,true,true,false,false,true]) {
      await page.evaluate(claim=>{
        const zone=document.querySelector('[data-mobile-stick-zone]');
        // CSS already gives gameplay ownership of this area. Some browsers put
        // cancelable touch sequences directly on the renderer's input queue.
        window.rushClaim=e=>e.preventDefault();
        if (claim)zone.addEventListener('touchstart',window.rushClaim,{passive:false});
        window.rushFrom=[rushTrace.events.length,rushTrace.steps.length,rushTrace.renders.length];
        cs3Baseline.mode='action';
      },claim);
      await send('touchStart',point(0)); await send('touchMove',point(-25)); await sleep(160);
      await send('touchMove',point(-76)); await sleep(330);
      await send('touchEnd',[]); await sleep(220);
      results.push(await page.evaluate(claim=>{
        cs3Baseline.mode='off';
        document.querySelector('[data-mobile-stick-zone]').removeEventListener('touchstart',window.rushClaim);
        const [e,s,r]=rushFrom;
        return {claim,events:rushTrace.events.slice(e),steps:rushTrace.steps.slice(s),renders:rushTrace.renders.slice(r)};
      },claim));
      await send('touchStart',point(0));await send('touchMove',point(56));await sleep(520);
      await send('touchEnd',[]);await sleep(220);
    }
  } finally { await cdp.detach(); }
  return results;
};
