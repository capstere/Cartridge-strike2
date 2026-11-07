// Character Studio workspace shell — presentation only.
// Re-arranges existing studio DOM (ids, listeners and engine untouched) into:
// top bar · category rail · large 3D stage · contextual panel. Drives app.mjs
// only through its existing buttons/selects.
import {loadProject,listProjects,saveProject} from './project-store.mjs?v=53';
import {roleOf} from '../src/fps/character-roles.mjs?v=6.1.2';

const $=id=>document.getElementById(id),q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const h=(tag,props={},...kids)=>{const e=Object.assign(document.createElement(tag),props);for(const k of kids)e.append(k);return e;};
const svg=d=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON={
 library:'M4 5h6v14H4zM14 5h6v6h-6zM14 15h6v4h-6z',
 sculpt:'M12 3c4 0 6 3 6 7s-3 9-6 9-6-5-6-9 2-7 6-7zM9 10h.01M15 10h.01M10 15c1 .7 3 .7 4 0',
 look:'M12 2a4 4 0 110 8 4 4 0 010-8zM5 22c0-5 3-9 7-9s7 4 7 9',
 fashion:'M8 3l-5 4 3 4 2-1v11h8V10l2 1 3-4-5-4c-1 2-2 3-4 3s-3-1-4-3z',
 face:'M6 11c0-5 3-8 6-8s6 3 6 8M6 11c-1 6 2 10 6 10s7-4 6-10M6 11c3 0 5-2 6-5 1 3 3 5 6 5',
 parts:'M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10',
 anim:'M6 4l14 8-14 8z',
 facedetail:'M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3',
 sheet:'M4 4h16v16H4zM4 12h16M12 4v16',
 ideas:'M9 18h6M10 21h4M12 3a6 6 0 014 10.5c-.8.8-1 1.5-1 2.5H9c0-1-.2-1.7-1-2.5A6 6 0 0112 3z',
 export:'M12 3v12M7 10l5 5 5-5M4 21h16',
};
const CATS=[
 {id:'library',label:'Bibliotek',title:'Karaktärsbibliotek',hint:'Öppna, duplicera eller starta en ny design. Välj roll och grundkropp.'},
 {id:'sculpt',label:'Forma',tab:'sculpt',title:'Forma direkt',hint:'Dra direkt i 3D-modellen för ansikte och händer.'},
 {id:'look',label:'Kropp & färg',tab:'look',title:'Kropp, material & färger',hint:'Proportioner, hud, tyg och färgpalett.'},
 {id:'fashion',label:'Kläder',tab:'fashion',title:'Kläder & tryck',hint:'Plaggstil, tryck och egna bilder.'},
 {id:'face',label:'Ansikte & hår',tab:'face',title:'Ansikte & hår',hint:'Frisyr, ögon, näsa, mun och skägg.'},
 {id:'parts',label:'Tillbehör',tab:'parts',title:'Tillbehör & 3D-delar',hint:'Hjälmar, väskor, egna GLB-delar.'},
 {id:'anim',label:'Rörelser',title:'Rörelser',hint:'Prova spelets riktiga animationer på din design.'},
 {id:'facedetail',label:'Rita ansikte',title:'Ansiktsritning',hint:'Rita ansiktsdetaljer direkt på texturen.',wide:true},
 {id:'sheet',label:'Ritark',title:'Referensark',hint:'Fyra vyer att rita på och skriva ut.',wide:true},
 {id:'ideas',label:'Idéer',tab:'ideas',title:'Mina idéer',hint:'Anteckningar och referensbilder.'},
 {id:'export',label:'Export',title:'Till spelet',hint:'Spara för spelet, prova i privat match eller ladda ner spel-ZIP.'},
];

const main=q('main'),body=document.body;body.classList.add('cs-shell');

/* ---------- Top bar ---------- */
const top=h('header',{className:'cs-top'});
top.innerHTML=`<a class="cs-brand" href="../fps/"><span class="cs-mk"><i></i></span><span>CARTRIDGE<b>//STRIKE</b></span></a>
<nav class="cs-nav" aria-label="Huvudmeny"><a href="../fps/">Spela</a><a class="is-current" aria-current="page" href="./">Karaktärsstudio</a><a href="../furniture-editor/">Möbelstudio</a></nav>`;
const nameField=$('project-name'),oldNameLabel=nameField.closest('label');nameField.classList.add('cs-name');nameField.title='Designens namn';
const nameWrap=h('label',{className:'cs-namewrap'},h('span',{textContent:'Design'}),nameField);
oldNameLabel?.remove();
const bar=q('.studio-bar');top.append(nameWrap,bar);
const cta=h('button',{type:'button',className:'cs-cta',innerHTML:svg(ICON.export)+'<span>Till spelet</span>'});cta.onclick=()=>setCat('export');
top.append(cta);

/* ---------- Rail ---------- */
const rail=h('nav',{className:'cs-rail',ariaLabel:'Kategorier'});
for(const c of CATS){const b=h('button',{type:'button',innerHTML:svg(ICON[c.id])+`<span>${c.label}</span>`});b.dataset.cat=c.id;b.title=c.title;b.onclick=()=>setCat(c.id);if(c.id==='export')b.classList.add('cs-rail-export');rail.append(b);}

/* ---------- Stage ---------- */
const stage=h('section',{className:'cs-stage'});
const viewport=q('.viewport-panel');stage.append(viewport);
const cam=h('div',{className:'cs-cambar',role:'toolbar',ariaLabel:'Kamera'});
const presets=q('#viewer-tools .view-presets',viewport),actions=q('#viewer-tools .viewer-actions',viewport);cam.append(presets,actions);
stage.append(cam);
const toast=$('status');toast.classList.add('cs-toast');stage.append(toast);

/* ---------- Contextual panel ---------- */
const panel=h('aside',{className:'cs-panel'});
const head=h('header',{className:'cs-panel-head'},h('p',{className:'cs-k',id:'cs-cat-k'}),h('h2',{id:'cs-cat-title'}),h('p',{className:'cs-hint',id:'cs-cat-hint'}));
panel.append(head);
const lib=h('div',{id:'cs-library',className:'cs-sec'});
lib.innerHTML=`<div class="cs-lib-tools"><input id="cs-lib-search" type="search" placeholder="Sök design…" aria-label="Sök design"><div class="cs-lib-filter" role="group" aria-label="Filtrera roll">
<button type="button" data-f="all" aria-pressed="true">Alla</button><button type="button" data-f="player" aria-pressed="false">Spelare</button><button type="button" data-f="hostage" aria-pressed="false">Gisslan</button><button type="button" data-f="dwarf" aria-pressed="false">Dvärgar</button><button type="button" data-f="object" aria-pressed="false">Objekt</button></div></div>
<div id="cs-lib-list" class="cs-lib-list" aria-live="polite"></div>`;
const newBox=h('div',{className:'cs-sec cs-new'},h('p',{className:'cs-sub',textContent:'Ny eller aktuell design'}));
const setup=q('section.setup'),pilot=$('new-match-pilot'),edit=q('.edit-panel'),faceDetail=$('face-detail-section'),sheet=q('section.sheet'),exp=q('section.export');
newBox.append(setup,pilot);
const anim=h('div',{id:'cs-anim',className:'cs-sec'});anim.append(q('#animation-controls',viewport),q('#animation-requests',viewport),q('#rig-hint',viewport));
panel.append(lib,newBox,edit,anim,faceDetail,sheet,exp);

// Old chrome replaced by the shell (kept in DOM, just hidden)
const legacy=h('div',{className:'cs-legacy',hidden:true});
legacy.append(q('.quick-jobs'),q('#viewer-tools',viewport));
main.prepend(top,rail,stage,panel);main.append(legacy);
q('.workspace')?.classList.add('cs-empty');

/* ---------- Category switching ---------- */
let current=null;
const SECTION={library:[lib,newBox],anim:[anim],facedetail:[faceDetail],sheet:[sheet],export:[exp]};
function setCat(id){
 const c=CATS.find(x=>x.id===id)||CATS[1];current=c.id;
 for(const b of qa('button',rail)){const on=b.dataset.cat===c.id;b.classList.toggle('is-on',on);b.setAttribute('aria-current',on?'true':'false');}
 $('cs-cat-k').textContent=String(CATS.indexOf(c)+1).padStart(2,'0')+' / '+c.label;$('cs-cat-title').textContent=c.title;$('cs-cat-hint').textContent=c.hint;
 const show=new Set(c.tab?[edit]:SECTION[c.id]);
 for(const s of [lib,newBox,edit,anim,faceDetail,sheet,exp])s.classList.toggle('cs-off',!show.has(s));
 if(c.tab)q(`.tab-row [data-tab="${c.tab}"]`)?.click();
 body.classList.toggle('cs-wide',!!c.wide);
 if(c.id==='library')renderLibrary();
 try{localStorage.setItem('cs-shell-cat',c.id);}catch{}
 panel.scrollTop=0;requestAnimationFrame(()=>dispatchEvent(new Event('resize')));
}
// Existing in-app shortcuts that scrolled the old long page now switch category.
$('jump-to-face')?.addEventListener('click',()=>setCat('facedetail'));
for(const b of qa('.choice-row [data-mode]'))b.addEventListener('click',()=>setTimeout(syncRail,50));

function syncRail(){
 // The engine hides sculpt/fashion/face/look for object projects; mirror that.
 for(const c of CATS)if(c.tab){const t=q(`.tab-row [data-tab="${c.tab}"]`);const b=q(`[data-cat="${c.id}"]`,rail);if(t&&b)b.hidden=t.hidden;}
 const obj=q('.choice-row [data-mode="object"]')?.classList.contains('active');
 for(const id of ['anim','facedetail'])q(`[data-cat="${id}"]`,rail).hidden=!!obj;
 if(q(`[data-cat="${current}"]`,rail)?.hidden)setCat('library');
}

/* ---------- Visual option chips (drive the real selects) ---------- */
const CHIP_IDS=['actor-role','gender','template','team','dwarf-variant','hair-style','outfit-style','realism-head','realism-fabric','realism-garment','pose'];
const chipSets=[];
function chipify(sel){
 if(!sel||sel.dataset.chips)return;sel.dataset.chips='1';sel.classList.add('cs-chip-src');
 const wrap=h('div',{className:'cs-chips',role:'radiogroup'});sel.after(wrap);
 const build=()=>{wrap.replaceChildren(...[...sel.options].filter(o=>o.value!==''||sel.options.length<3).map(o=>{const b=h('button',{type:'button',textContent:o.textContent.split(' · ')[0]});b.title=o.textContent;b.dataset.v=o.value;b.setAttribute('role','radio');b.onclick=()=>{if(sel.disabled)return;sel.value=o.value;sel.dispatchEvent(new Event('input',{bubbles:true}));sel.dispatchEvent(new Event('change',{bubbles:true}));sync();};return b;}));sync();};
 const sync=()=>{for(const b of wrap.children)b.setAttribute('aria-checked',String(b.dataset.v===sel.value));wrap.hidden=sel.closest('[hidden]')!==null&&!sel.closest('.cs-off');};
 new MutationObserver(build).observe(sel,{childList:true});build();chipSets.push(sync);
}
function chipifyAll(){for(const id of CHIP_IDS)chipify($(id));for(const s of qa('[data-face-field]'))if(s.tagName==='SELECT')chipify(s);}
chipifyAll();setInterval(()=>{for(const s of chipSets)s();syncRail();},500);
document.addEventListener('change',()=>setTimeout(()=>{for(const s of chipSets)s();},0),true);

/* ---------- Library ---------- */
let filter='all',meta=new Map();
const ROLE_LABEL={player:'Spelare',hostage:'Gisslan',dwarf:'Dvärg',object:'Objekt'};
qa('.cs-lib-filter button',lib).forEach(b=>b.onclick=()=>{filter=b.dataset.f;qa('.cs-lib-filter button',lib).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderLibrary();});
$('cs-lib-search').addEventListener('input',()=>renderLibrary());
async function metaFor(row){
 const key=row.id+row.updated;if(meta.has(key))return meta.get(key);
 let m={role:'player'};try{const item=await loadProject(row.id);const p=item?.project;m={role:p?.kind==='object'?'object':roleOf(p)};}catch{}
 meta.set(key,m);return m;
}
let renderSeq=0;
async function renderLibrary(){
 const seq=++renderSeq,list=$('cs-lib-list');let rows=[];
 try{rows=(await listProjects()).filter(r=>r.id!=='autosave').sort((a,b)=>b.updated.localeCompare(a.updated));}catch(e){list.textContent='Biblioteket kunde inte öppnas: '+e.message;return;}
 const items=await Promise.all(rows.map(async r=>({...r,...await metaFor(r)})));if(seq!==renderSeq)return;
 const term=$('cs-lib-search').value.trim().toLowerCase();
 const shown=items.filter(r=>(filter==='all'||r.role===filter)&&(!term||r.name.toLowerCase().includes(term)));
 const counts=items.reduce((n,r)=>(n[r.role]=(n[r.role]||0)+1,n),{});
 qa('.cs-lib-filter button',lib).forEach(b=>{const n=b.dataset.f==='all'?items.length:counts[b.dataset.f]||0;b.textContent=(b.dataset.f==='all'?'Alla':ROLE_LABEL[b.dataset.f]+(b.dataset.f==='player'?'':''))+' '+n;});
 if(!shown.length){list.innerHTML=`<p class="cs-empty-lib">${items.length?'Inga designer matchar.':'Inga sparade designer ännu. Skapa en nedan och klicka <b>Spara i ateljén</b>.'}</p>`;return;}
 list.replaceChildren(...shown.map(r=>{
  const card=h('article',{className:'cs-card'});card.dataset.role=r.role;
  card.innerHTML=`<span class="cs-card-role">${ROLE_LABEL[r.role]||r.role}</span><strong></strong><small>${new Date(r.updated).toLocaleString('sv-SE',{dateStyle:'short',timeStyle:'short'})}</small>`;
  q('strong',card).textContent=r.name;
  const open=h('button',{type:'button',className:'cs-card-open',textContent:'Öppna'});open.onclick=()=>openProject(r.id);
  const dup=h('button',{type:'button',className:'cs-card-dup',textContent:'Duplicera'});dup.onclick=()=>duplicate(r);
  card.append(h('div',{className:'cs-card-act'},open,dup));return card;
 }));
}
function openProject(id){const sel=$('saved-projects');if(![...sel.options].some(o=>o.value===id))return;sel.value=id;sel.dispatchEvent(new Event('change'));setTimeout(()=>setCat('look'),400);}
async function duplicate(r){
 try{const item=await loadProject(r.id);if(!item)throw Error('Projektet finns inte.');const id=crypto.randomUUID(),copy=structuredClone(item.project);copy.name=(copy.name||r.name)+' (kopia)';await saveProject(id,copy);
  $('saved-projects').append(new Option(copy.name+' · '+new Date().toLocaleDateString('sv-SE'),id));toast.textContent='Kopia skapad: '+copy.name;renderLibrary();
 }catch(e){toast.textContent='Kunde inte duplicera: '+e.message;}
}
new MutationObserver(()=>{if(current==='library')renderLibrary();}).observe($('saved-projects'),{childList:true});

/* ---------- Toast auto-hide ---------- */
let toastTimer;new MutationObserver(()=>{toast.classList.add('is-on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('is-on'),6000);}).observe(toast,{childList:true,characterData:true,subtree:true});

let start='library';try{start=localStorage.getItem('cs-shell-cat')||'library';}catch{}
setCat(start);syncRail();
