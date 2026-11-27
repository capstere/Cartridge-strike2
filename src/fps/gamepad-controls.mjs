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
    try{return this.sample(Array.from(navigator.getGamepads?.() || []).find(p=>p?.connected && p.mapping==='standard'));}
    catch{return this.sample(null);}
  }
  sample(pad){
    if(!pad){if(this.id!=null)this.clear();this.id=null;return null;}
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
    const down=i=>!!(mask&(1<<i)),edge=i=>down(i)&&!(old&(1<<i));
    const [strafe,y]=stick(pad.axes[0],pad.axes[1],false),[lookX,lookY]=stick(pad.axes[2],pad.axes[3],true);
    const forward=y===0?0:-y,fire=down(7),aim=down(6);
    this.sprint=(this.sprint||edge(10)) && forward>.3 && !aim && !fire;
    return {forward,strafe,lookX,lookY,fire,firePress:edge(7),aim,
      sprint:this.sprint,jump:down(0),crouch:down(1),crouchEdge:edge(1),reload:edge(2),swap:edge(3),
      interact:down(4),cartridge:edge(5),inspect:edge(14)};
  }
}
