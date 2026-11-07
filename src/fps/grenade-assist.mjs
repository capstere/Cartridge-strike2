import { TrajectoryCache } from './trajectory-cache.mjs';
import * as THREE from '../../vendor/three/three.module.js';
import { GRENADE_TYPES, grenadeThreat } from './grenade-physics.mjs';

const COLORS = {he:0xffb16e, flash:0xffe6a0, smoke:0x87e5cc};
const NAMES = {he:'HE', flash:'FLASH', smoke:'RÖK'};
const MAX_POINTS = 602;

export function grenadeSettingsMarkup(settings) {
  return `<label class="setting">Visa granatens kastbana <input type="checkbox" data-setting="grenadeGuide" aria-label="Visa granatens kastbana" ${settings.grenadeGuide!==false?'checked':''}></label>`+
    `<label class="setting">Varning för granater <input type="checkbox" data-setting="grenadeWarning" aria-label="Varning för granater" ${settings.grenadeWarning!==false?'checked':''}></label>`;
}

/** Presentation only. The shared physics module owns the prediction.
 * One persistent path + one marker; capped updates, no per-frame GPU allocation.
 */
export class GrenadeAssist {
  constructor(renderer, settings) {
    this.renderer=renderer;this.settings=settings;this.predictionCache=new TrajectoryCache();this.game=null;this.weapon=null;
    this.preview=null;this.threat=null;this.pathAt=-Infinity;this.warningAt=-Infinity;
    this.positions=new Float32Array(MAX_POINTS*3);this.distances=new Float32Array(MAX_POINTS);
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('lineDistance',new THREE.BufferAttribute(this.distances,1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0,0);
    this.material=new THREE.LineDashedMaterial({color:COLORS.he,dashSize:.15,gapSize:.1,transparent:true,opacity:.9,depthTest:true,depthWrite:false});
    this.path=new THREE.Line(this.geometry,this.material);this.path.frustumCulled=false;
    this.path.name='grenade-predicted-path';
    this.markerGeometry=new THREE.RingGeometry(.12,.18,32);
    this.markerMaterial=new THREE.MeshBasicMaterial({color:COLORS.he,side:THREE.DoubleSide,transparent:true,opacity:.95,depthTest:true,depthWrite:false});
    this.marker=new THREE.Mesh(this.markerGeometry,this.markerMaterial);
    this.marker.name='grenade-predicted-detonation';
    this.group=new THREE.Group();this.group.name='grenade-assist';this.group.add(this.path,this.marker);
    this.group.visible=false;renderer.scene.add(this.group);
    this.hud=document.createElement('div');this.hud.id='grenade-assist-hud';
    this.hud.innerHTML='<div id="grenade-preview-note" hidden><strong></strong><span></span></div><div id="grenade-danger" hidden><i aria-hidden="true">↑</i><div><strong></strong><span></span></div></div>';
    document.body.append(this.hud);
    this.note=this.hud.querySelector('#grenade-preview-note');this.danger=this.hud.querySelector('#grenade-danger');
    this.arrow=this.danger.querySelector('i');
    this.noteTitle=this.note.querySelector('strong');this.noteDetail=this.note.querySelector('span');
    this.dangerTitle=this.danger.querySelector('strong');this.dangerDetail=this.danger.querySelector('span');
  }

  reset() {
    this.predictionCache.clear();
    this.group.visible=false;this.note.hidden=true;this.danger.hidden=true;
    this.preview=null;this.threat=null;this.weapon=null;this.pathAt=this.warningAt=-Infinity;
  }

  update(game, view, modal) {
    const p=game?.player;
    if (!p?.alive || view?.id!==p.id || modal || game.state.paused || game.phase!=='active' || document.hidden) {this.reset();return;}
    if (this.game!==game) {this.reset();this.game=game;}
    const time=game.state.time;
    const previewOn=this.settings.grenadeGuide!==false && GRENADE_TYPES.includes(p.weapon) && p.inventory[p.weapon]>0 && !p.action && p.flash<.8;
    if (!previewOn) {
      this.group.visible=false;this.note.hidden=true;this.preview=null;this.weapon=null;this.predictionCache.clear();
    } else {
      // At most 12.5 predictions/s. A weapon change is shown immediately.
      if (!this.preview || this.weapon!==p.weapon || time<this.pathAt || time-this.pathAt>=.08) {
        if(time<this.pathAt)this.predictionCache.clear();
        this.pathAt=time;this.weapon=p.weapon;
        const previous=this.preview;
        this.preview=this.predictionCache.read(p,game.config,game.world);
        if (this.preview && this.preview!==previous) this.drawPreview(p);
      }
      this.group.visible=!!this.preview;this.note.hidden=!this.preview;
      if (this.preview) this.marker.lookAt(p.x,p.y+p.height-.12,p.z);
    }
    if (this.settings.grenadeWarning===false) {this.threat=null;this.danger.hidden=true;this.warningAt=-Infinity;}
    else {
      if (time<this.warningAt || time-this.warningAt>=.08) {
        this.warningAt=time;this.threat=grenadeThreat(game,p);
      }
      this.danger.hidden=!this.threat;
      if (this.threat) {
        const left=Math.max(0,this.threat.left-(time-this.warningAt));
        this.danger.dataset.kind=this.threat.type;
        this.danger.classList.toggle('urgent',left<.6);
        this.arrow.style.transform=`rotate(${this.threat.angle}rad)`;
        this.text(this.dangerTitle,this.threat.type==='he'?'GRANAT NÄRA':'FLASH NÄRA');
        this.text(this.dangerDetail,`${this.threat.distance.toFixed(1)} m · ${left.toFixed(1)} s`);
      }
    }
  }

  drawPreview(p) {
    const result=this.preview,count=Math.min(MAX_POINTS,result.points.length);
    let distance=0;
    for(let i=0;i<count;i++){
      const q=result.points[i],prev=result.points[i-1];
      if(prev)distance+=Math.hypot(q.x-prev.x,q.y-prev.y,q.z-prev.z);
      const offset=i*3;this.positions[offset]=q.x;this.positions[offset+1]=q.y;this.positions[offset+2]=q.z;this.distances[i]=distance;
    }
    this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.lineDistance.needsUpdate=true;
    this.geometry.setDrawRange(0,count);
    this.material.color.setHex(COLORS[p.weapon]);this.markerMaterial.color.setHex(COLORS[p.weapon]);
    this.marker.position.set(result.endpoint.x,result.endpoint.y,result.endpoint.z);
    const range=Math.hypot(result.endpoint.x-p.x,result.endpoint.z-p.z);
    this.text(this.noteTitle,`KASTBANA · ${NAMES[p.weapon]} · ${range.toFixed(1)} m`);
    this.text(this.noteDetail,'Ringen visar beräknad detonation');
  }

  text(node,value){if(node.textContent!==value)node.textContent=value;}

  dispose() {
    this.predictionCache.clear();
    this.renderer.scene.remove(this.group);this.geometry.dispose();this.material.dispose();
    this.markerGeometry.dispose();this.markerMaterial.dispose();this.hud.remove();
  }
}
