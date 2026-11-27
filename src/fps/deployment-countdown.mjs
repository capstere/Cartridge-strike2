// Riposte 09y-decompte.js: one announcement per observed second, final three
// highlighted, then a short start cue. The caller supplies the match authority's
// remaining time. This presenter never starts the simulation.
export class DeploymentCountdown {
  constructor(render, sound) { this.render=render; this.sound=sound; this.reset(); }
  reset() {
    this.key=null; this.last=0; this.observed=null; this.finishAt=0; this.silent=false;
    this.display('');
  }
  display(value) {
    if(this.value===value)return;
    this.value=value; this.render(value);
  }
  suspend() {
    this.silent=true; this.finishAt=0; this.observed=null; this.display('');
  }
  update(key, remaining, active, now) {
    if(key!==this.key){this.reset();this.key=key;}
    if(remaining>0){
      const digit=Math.ceil(remaining);
      if(!this.last || digit<this.last){
        const nextBeat=this.last ? this.last-digit===1 && now-this.observed<1250 : digit===5;
        if(!this.silent && nextBeat)this.sound(digit);
        this.last=digit;
      }
      this.observed=now; this.silent=false; this.display(this.last); return;
    }
    if(active && this.last){
      if(this.last===1 && !this.silent && this.observed!==null && now-this.observed<1250){this.sound('go');this.finishAt=now+1100;}
      this.last=0; this.silent=false;
    }
    this.display(active && now<this.finishAt ? 'go' : '');
  }
}

export function countdownHud(root, sound) {
  const number=root.querySelector('strong'), kicker=root.querySelector('small');
  return new DeploymentCountdown(value=>{
    root.hidden=!value;
    root.dataset.stage=value==='go'?'go':value && value<=3?'final':'count';
    root.dataset.beat=typeof value==='number' ? String(value%2) : '';
    root.parentElement.classList.toggle('deploy-announcing',!!value);
    kicker.hidden=value==='go';
    number.textContent=value==='go'?'Move out!':String(value || '');
    root.parentElement.classList.toggle('deploy-counting',typeof value==='number');
  }, sound);
}
