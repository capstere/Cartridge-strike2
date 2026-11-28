// Adapt the Riposte install prompt and standalone detection to ordinary Options.
let installed=false;
export function canOfferInstall() {
  return window.isSecureContext && 'serviceWorker' in navigator && !installed &&
    !matchMedia('(display-mode: standalone)').matches && navigator.standalone!==true;
}

export function installAppControls() {
  if (!window.isSecureContext || !('serviceWorker' in navigator))return;
  const register=()=>navigator.serviceWorker.register(new URL('../fps/sw.js',import.meta.url),{updateViaCache:'none'}).catch(()=>{});
  if (document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});
  if (!canOfferInstall())return;
  let prompt=null;
  const panels=()=>document.querySelectorAll('[data-install-game]');
  const update=()=>{for (const panel of panels())panel.hidden=installed;};
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;update();});
  window.addEventListener('appinstalled',()=>{installed=true;prompt=null;update();});
  document.addEventListener('click',async e=>{
    const button=e.target.closest?.('[data-install-game]');
    if (!button)return;
    const status=button.parentElement.querySelector('[data-install-note]');
    if (!prompt){
      const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
      status.textContent=ios?'In Safari, tap Share, then Add to Home Screen.':'Open your browser menu and choose Install app or Add to Home Screen when available.';
      return;
    }
    const event=prompt;prompt=null;
    try {await event.prompt();const result=await event.userChoice;status.textContent=result.outcome==='accepted'?'Installation accepted.':'You can keep playing in the browser.';}
    catch {status.textContent='Use your browser menu to install the game.';}
  });
}
