// Desktop pointer lock needs a real foreground user gesture. The game returns
// to Resume when Chromium denies that gesture and prompts the user to try again.
export async function waitForActiveHud(page){
  await page.locator('#hud[data-match-phase="active"]').waitFor();
}

export async function enterTouchMatch(page){
  await waitForActiveHud(page);
  const playing = page.locator('body:has(#pause[hidden]) #mobile-controls:visible');
  const resume = page.locator('#pause:visible #resume:visible');
  // A focus or orientation change can open Pause after the active phase arrives.
  // Wait for the actual player-facing choice before deciding whether to tap.
  const target = playing.or(resume);
  try {
    if (await target.getAttribute('id') === 'resume') {
      await resume.tap();
      await playing.waitFor();
    }
  } catch (error) {
    const state = await page.evaluate(() => ({
      roomPhase:document.querySelector('#hud')?.dataset.matchPhase,
      gamePhase:document.querySelector('#phase')?.textContent,
      pause:document.querySelector('#pause')?.hidden === false,
      shop:document.querySelector('#buy')?.hidden === false,
      touchControls:document.querySelector('#mobile-controls')?.hidden === false,
      touchMode:document.documentElement.classList.contains('touch-fps'),
      coarsePointer:matchMedia('(pointer: coarse)').matches,
      touchPoints:navigator.maxTouchPoints, focused:document.hasFocus(), visible:!document.hidden,
    })).catch(() => null);
    throw new Error('Touch match entry failed '+JSON.stringify(state),{cause:error});
  }
}

export async function resumeDesktop(page){
  const resume=page.locator('#resume:visible, #countdown-look:visible');

  for(let attempts=1;attempts<=2;attempts++){
    await page.bringToFront();
    const box=await resume.boundingBox();
    await resume.click();
    try{
      await page.waitForFunction(()=>document.pointerLockElement?.id==='game'&&document.querySelector('#pause').hidden,null,{timeout:5000});
      return {attempts,point:{x:box.x+box.width/2,y:box.y+box.height/2}};
    }catch(error){
      const denied=await page.locator('#pause').isVisible()&&(await page.locator('#pause').textContent()).includes('Mouse capture failed');
      if(attempts===2||!denied)throw error;
    }
  }
}
