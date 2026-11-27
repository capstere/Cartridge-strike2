// Desktop pointer lock needs a real foreground user gesture. The game returns
// to Resume when Chromium denies that gesture and prompts the user to try again.
export async function resumeDesktop(page){
  const resume=page.locator('#resume');
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
