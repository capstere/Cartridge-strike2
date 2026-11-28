// Adapted from Riposte: Frontline 09qc-manette, MIT, BenDBSS 2026.
// Standard Gamepad layout. The shared Game and NetworkSession consume its input.
function stick(x,y,look){
  const length=Math.hypot(x,y);
  if(!(length>.1))return [0,0];
  const travel=(Math.min(1,length)-.1)/.9;
  const strength=look?.4*travel+.6*travel**2.4:travel**1.15;
  return [x/length*strength,y/length*strength];
}
export class GamepadControls {
  clear(){
    this.sprint=false;this.mask=0;this.neutralRequired=true;
  }
  read(){
    // Sandboxed embeds may expose the API but prohibit access.
    let pads;
    try{pads=navigator.getGamepads?.();}catch{return this.sample(null);}
    return this.sample(Array.from(pads || []).find(p=>p?.connected && p.mapping==='standard'));
  }
  sample(pad){
    if(!pad){if(this.id!=null)this.clear();this.id=null;this.active=false;return null;}
    if(this.id!==pad.id){this.clear();this.id=pad.id;}
    const old=this.mask;
    let mask=0;
    for(let i=0;i<Math.min(17,pad.buttons.length);i++){
      const b=pad.buttons[i],trigger=i===6||i===7;
      if(trigger?b.value>((old&(1<<i))?.15:.25):b.pressed)mask|=1<<i;
    }
    this.mask=mask;
    if(this.neutralRequired){
      this.neutralRequired=mask!==0;
      if(this.neutralRequired)return null;
    }
    if(mask || pad.axes.some(value=>Math.abs(value)>.18))this.active=true;
    const down=i=>!!(mask&(1<<i)),edge=i=>down(i)&&!(old&(1<<i));
    const [strafe,y]=stick(pad.axes[0],pad.axes[1],false),[lookX,lookY]=stick(pad.axes[2],pad.axes[3],true);
    const forward=y===0?0:-y,fire=down(7),aim=down(6);
    this.sprint=(this.sprint||edge(10)) && forward>.3 && !aim && !fire;
    return {pressedEdges:mask & ~old,forward,strafe,lookX,lookY,fire,firePress:edge(7),aim,
      sprint:this.sprint,jump:down(0),crouch:down(1),crouchEdge:edge(1),reload:edge(2),swap:edge(3),
      pause:edge(9),interact:down(4),cartridge:edge(5),inspect:edge(14)};
  }
}

// Directional focus follows Riposte padTarget's aligned-edge and cross-axis scoring.
function nextControl(controls,current,dx,dy) {
  if (!controls.includes(current)) return controls[0];
  const start=current.getBoundingClientRect(),horizontal=dx!==0;
  let best,bestScore=Infinity;
  for(const candidate of controls){
    if(candidate===current)continue;
    const rect=candidate.getBoundingClientRect();
    const along=dx>0?rect.left-start.right:dx<0?start.left-rect.right:dy>0?rect.top-start.bottom:start.top-rect.bottom;
    if(along < -8)continue;
    const cross=horizontal?Math.max(0,rect.top-start.bottom,start.top-rect.bottom):Math.max(0,rect.left-start.right,start.left-rect.right);
    const offset=horizontal?Math.abs(rect.top+rect.bottom-start.top-start.bottom):Math.abs(rect.left+rect.right-start.left-start.right);
    const score=Math.max(0,along)+cross*4+offset*.15;
    if(score<bestScore){bestScore=score;best=candidate;}
  }
  return best;
}

function focusable(el) {
  if(el.tabIndex<0||el.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
  const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
  return rect.width>2 && rect.height>2 && style.visibility==='visible' && Number(style.opacity)>0 && style.pointerEvents!=='none';
}

export function changePadOption(select,direction,wrap) {
  const options=Array.from(select.options),allowed=options.filter(option=>!option.disabled&&!option.closest('optgroup[disabled]'));
  if(!allowed.length)return false;
  const i=allowed.indexOf(options[select.selectedIndex]);
  const next=wrap?(i+direction+allowed.length)%allowed.length:Math.max(0,Math.min(allowed.length-1,i+direction));
  const index=options.indexOf(allowed[next]);
  if(index===select.selectedIndex)return false;
  select.selectedIndex=index;
  return true;
}

export function navigateGamepad(scope,pad,back) {
  if (!scope || !pad?.pressedEdges) return;
  const edge=i=>Boolean(pad.pressedEdges&(1<<i));
  if(edge(1)||edge(9)){back();return;}
  const dx=Number(edge(15))-Number(edge(14)),dy=Number(edge(13))-Number(edge(12));
  if(!dx&&!dy&&!edge(0))return;
  const controls=[...scope.querySelectorAll('button:not(:disabled),a[href],select:not(:disabled),input:not(:disabled),summary,textarea')].filter(focusable);
  const cur=document.activeElement;
  if(dx&&controls.includes(cur)&&(cur.tagName==='SELECT'||cur.type==='range')){
    if(cur.tagName==='SELECT'){if(!changePadOption(cur,dx,false))return;}
    else if(dx>0)cur.stepUp();else cur.stepDown();
    for(const name of ['input','change'])cur.dispatchEvent(new Event(name,{bubbles:true}));
    return;
  }
  if(dx||dy){nextControl(controls,cur,dx,dy)?.focus();return;}
  if(!controls.includes(cur)){controls[0]?.focus();return;}
  if(cur.tagName==='SELECT'){
    if(!changePadOption(cur,1,true))return;
    for(const name of ['input','change'])cur.dispatchEvent(new Event(name,{bubbles:true}));
  }else cur.click();
}

// The lobby mounts independently of the game module graph. Its pad hands over
// held-button history and the polling loop when the simulation becomes ready.
export const sharedGamepad=new GamepadControls();
let earlyFrame=0,gameOwnsController=false,controllerInstalled=false;

export function pollControllerMenu(panel='menu',back) {
  if(document.hidden)return;
  const overlay=document.querySelector('#cs-loading:not([hidden])');
  const dialog=document.querySelector('dialog[open]');
  const target=dialog||overlay||document.getElementById(panel);
  navigateGamepad(target,sharedGamepad.read(),()=>{
    if(dialog){dialog.close();return;}
    if(overlay){
      const leave=overlay.querySelector('#csl-error')?.hidden?'#csl-cancel':'#csl-back';
      overlay.querySelector(leave)?.click();return;
    }
    if(back){back();return;}
    const previous=document.getElementById('route-back');
    if(previous&&!previous.hidden)previous.click();
  });
}

function stopEarlyController() {
  if(earlyFrame)cancelAnimationFrame(earlyFrame);
  earlyFrame=0;
}

export function claimControllerForGame() {
  gameOwnsController=true;
  stopEarlyController();
}

export function installLobbyController() {
  if(gameOwnsController||controllerInstalled)return;
  controllerInstalled=true;
  const poll=()=>{
    pollControllerMenu();
    earlyFrame=requestAnimationFrame(poll);
  };
  const start=()=>{if(!earlyFrame&&!gameOwnsController)earlyFrame=requestAnimationFrame(poll);};
  window.addEventListener('pagehide',stopEarlyController);
  window.addEventListener('pageshow',start);
  start();
}
