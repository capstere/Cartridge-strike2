/** Best-effort resolution governor fed only live match frame intervals. */
export class AdaptiveResolution {
  constructor({minimum=.55,stepDown=.1,stepUp=.05,interval=2,samples=40}={}){
    this.minimum=minimum;this.stepDown=stepDown;this.stepUp=stepUp;
    this.enabled=true;this.targetMs=1000/60;
    this.interval=interval;this.samples=samples;this.scale=1;this.lastCheck=-Infinity;
  }
  arm(t){this.lastCheck=t;}
  update(t,meanMs,count){
    if(!this.enabled){
      const changed=this.scale!==1;
      this.scale=1;this.arm(t);return changed;
    }
    if(!Number.isFinite(t)||!Number.isFinite(meanMs)||meanMs<=0||
      count<this.samples||t-this.lastCheck<this.interval)return false;
    this.lastCheck=t;const before=this.scale;
    if(meanMs>this.targetMs*1.29)this.scale=Math.max(this.minimum,Math.round((this.scale-this.stepDown)*100)/100);
    else if(meanMs<this.targetMs*1.038)this.scale=Math.min(1,Math.round((this.scale+this.stepUp)*100)/100);
    return before!==this.scale;
  }
}
