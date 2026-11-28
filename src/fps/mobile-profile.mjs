// Preferences shared by both real settings panels and the same gameplay input adapter.
export const TOUCH_DEFAULTS = Object.freeze({
  touchMode:'auto', touchStick:'floating', touchRun:'stick', touchDoubleAim:true,
  touchQuickShot:false, touchLookSensitivity:1, zoomSensitivity:1, invertLookY:false, fieldOfView:76
});

const choices = {touchMode:['auto','on','off'],touchStick:['floating','fixed'],touchRun:['stick','button']};
const ranges = {touchLookSensitivity:[.5,2],zoomSensitivity:[.35,1.5],fieldOfView:[60,100]};

export function normalizeTouchProfile(settings) {
  for (const [key,fallback] of Object.entries(TOUCH_DEFAULTS)) {
    const value=settings[key];
    if (choices[key]) settings[key]=choices[key].includes(value)?value:fallback;
    else if (ranges[key]) {
      const [min,max]=ranges[key];
      settings[key]=Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
    } else settings[key]=typeof value==='boolean'?value:fallback;
  }
  return settings;
}

export function touchHelp(settings) {
  const run=settings.touchRun==='stick'?'Push the stick past its ring to run.':'Tap Run and move forward. Lift the stick to stop.';
  const fire=settings.mobileAutoFire?'Auto-fire follows a visible target.':'Hold Fire and drag to keep looking.';
  const double=settings.touchDoubleAim?' Double-tap the look area to toggle aim.':'';
  const scope=settings.touchQuickShot?' With the scout rifle, hold Fire to scope, drag to aim and release to shoot.':'';
  return run+' Press Crouch while running to slide. '+fire+' Tap Aim to toggle, or hold it for temporary aim.'+double+scope+' Hold Throw to prepare a grenade and release to throw.';
}

export function touchSettingsMarkup(settings) {
  const select=(key,label,values)=>`<label class="setting">${label}<select data-setting="${key}" aria-label="${label}">${values.map(([value,name])=>`<option value="${value}" ${settings[key]===value?'selected':''}>${name}</option>`).join('')}</select></label>`;
  const check=(key,label)=>`<label class="setting">${label}<input type="checkbox" data-setting="${key}" ${settings[key]?'checked':''}></label>`;
  const range=(key,label,step)=>`<label class="setting">${label}<output>${settings[key]}</output><input type="range" aria-label="${label}" data-setting="${key}" min="${ranges[key][0]}" max="${ranges[key][1]}" step="${step}" value="${settings[key]}"></label>`;
  return select('touchMode','Touch controls',[['auto','Automatic'],['on','On'],['off','Off']])+
    select('touchStick','Movement stick',[['floating','Floating'],['fixed','Fixed']])+
    select('touchRun','Run control',[['stick','Push past the ring'],['button','Run button']])+
    check('touchDoubleAim','Double-tap to aim')+check('touchQuickShot','Scout rifle fires on release')+
    range('touchLookSensitivity','Touch look sensitivity',.05)+range('zoomSensitivity','Zoom sensitivity',.05)+
    range('fieldOfView','Field of view (degrees)',1)+check('invertLookY','Invert vertical look')+
    '<button type="button" data-layout-edit>Edit touch layout</button><button type="button" data-look-reset>Reset look settings</button>'+
    `<p class="setting-note" data-touch-help>${touchHelp(settings)}</p>`;
}

// Per-render elapsed time is independent of simulation/input updates at display rate.
export class PresentationPacer {
  constructor(){this.next=0;this.last=null;this.skipped=0;}
  sample(now,limited,dt) {
    if(!limited){this.next=0;this.last=null;return dt;}
    if(limited && this.last!==null && now+.5<this.next){this.skipped++;return null;}
    const elapsed=this.last===null?dt:Math.max(0,Math.min(.1,(now-this.last)/1000));
    const period=1000/30;
    this.next=limited&&this.next>0&&this.next>now-period ? this.next+period : now+period;
    this.last=now;
    return elapsed;
  }
}

export function displaySettingsMarkup(settings) {
 const check=(key,label)=>`<label class="setting">${label}<input type="checkbox" data-setting="${key}" ${settings[key]?'checked':''}></label>`;
 const gain=(key,label)=>`<label class="setting">${label} <output>${Math.round(settings[key]*100)}%</output><input type="range" aria-label="${label}" data-setting="${key}" min="0" max="1" step=".05" value="${settings[key]}"></label>`;
 return check('powerSaving','Power saving · 30 FPS cap')+check('ambientOcclusion','Ambient occlusion')+
   check('dynamicResolution','Dynamic resolution')+'<p class="setting-note" data-quality-help></p>'+
   gain('menuMusicVolume','Menu music volume')+gain('announcementVolume','Announcement volume');
}

export function describeGraphics(panel,renderer,settings) {
 const ao=panel.querySelector('[data-setting=ambientOcclusion]');
 const reason=settings.graphics==='low'?'Low quality uses direct rendering.':renderer?.neutralLighting?'This map uses neutral lighting.':
   renderer && !renderer.visualDepth?.supported?'This device lacks the required color-buffer support.':'';
 ao.disabled=!!reason;
 panel.querySelector('[data-quality-help]').textContent=(reason?'Ambient occlusion is unavailable here. '+reason:
   'Standard quality supports contact shading on compatible maps and devices.')+
   ' Dynamic resolution adjusts the render buffer during play. Sun rays and animated grass are unavailable in this renderer.';
}

export function groupControlSettings(panel) {
 const groups=[
   ['Sound',['volume','menuMusicVolume','announcementVolume','combatSounds','radioVoice']],
   ['Display',['graphics','powerSaving','ambientOcclusion','dynamicResolution','fieldOfView','reducedMotion','reducedFlash']],
   ['Touch and aim',['touchMode','touchStick','touchRun','mobileAutoFire','mobileAimAssist','touchDoubleAim','touchQuickShot','sensitivity','touchLookSensitivity','zoomSensitivity','invertLookY']],
 ];
 for(const [legendText,keys] of groups){
   const group=document.createElement('fieldset'),legend=document.createElement('legend');
   group.className='control-settings-group';legend.textContent=legendText;group.append(legend);
   for(const key of keys){
     const label=panel.querySelector('[data-setting="'+key+'"]')?.closest('label');
     if(label)group.append(label);
   }
   if(legendText==='Display')group.append(panel.querySelector('[data-quality-help]'));
   if(legendText==='Touch and aim'){
     for(const selector of ['[data-mobile-fire-note]','[data-layout-edit]','[data-look-reset]','[data-touch-help]']){
       const el=panel.querySelector(selector);if(el)group.append(el);
     }
     const pad=document.createElement('p');pad.className='setting-note';
     pad.textContent='Gamepad: move with the left stick, look with the right, press L3 to run, B to crouch, LT to aim and RT to fire. Start pauses. Use the D-pad and A to navigate menus. Bonus buttons follow the bindings above.';
     group.append(pad);
   }
   panel.append(group);
 }
}
