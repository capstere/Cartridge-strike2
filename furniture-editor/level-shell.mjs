/**
 * CARTRIDGE-STRIKE // TACTICAL INDUSTRIAL — Level Studio workspace shell.
 * Presentation only: moves EXISTING DOM nodes (by id) into a top bar, a category rail,
 * one contextual panel, a full-bleed stage and a selection inspector.
 * Every button here either IS an original control or clicks one. No project state,
 * engine, collision, snapping or export code is touched.
 */
const $=id=>document.getElementById(id);
const el=(tag,cls,html)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(html!=null)n.innerHTML=html;return n;};
const ico=d=>`<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I={
 build:ico('<path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6"/>'),
 furn:ico('<path d="M5 11V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5M3 11h18v5H3zM5 16v4M19 16v4"/>'),
 mat:ico('<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 2-1 3-1a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="11" r="1"/>'),
 play:ico('<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="2"/>'),
 test:ico('<path d="M5 4l14 8-14 8z"/>'),
 proj:ico('<path d="M4 4h12l4 4v12H4zM8 4v5h7V4M8 20v-6h8v6"/>'),
 undo:ico('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
 redo:ico('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
 save:ico('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
 panel:ico('<rect x="3" y="4" width="18" height="16"/><path d="M9 4v16"/>')
};
const body=document.body;
const tools=$('toolsPanel'),checks=$('savePanel'),work=document.querySelector('.workspace');
if(tools&&checks&&work&&!body.classList.contains('lv-shell')){
 body.classList.add('lv-shell');

 /* ---------- Top bar ---------- */
 const header=document.querySelector('body>header');
 const top=el('div','lv-top');
 const brand=el('a','lv-brand',`<span class="lv-mk"><i></i></span><span>CARTRIDGE<b>·</b>STRIKE</span>`);brand.href='../fps/';brand.title='Till spelet';
 const nav=el('nav','lv-nav');
 for(const [href,label] of [['../studio/','Studior'],['../character-design/','Karaktär'],['new.html?mode=edit-floor5','Floor 5'],['new.html','Ny bana']]){
  const a=el('a','',label);a.href=href;
  const here=location.search.includes('edit-floor5')?href.includes('edit-floor5'):href==='new.html';
  if(here)a.classList.add('is-current');nav.append(a);
 }
 const nameWrap=el('label','lv-namewrap','<span>Bana</span>');
 const name=$('name');name.classList.add('lv-name');name.closest('label')?.classList.add('lv-moved-label');nameWrap.append(name);
 const steps=document.querySelector('.kid-steps');
 const hist=el('div','lv-hist');
 const undo=$('undo'),redo=$('redo');const oldRow=undo.parentElement;
 undo.innerHTML=I.undo+'<span>Ångra</span>';redo.innerHTML=I.redo+'<span>Gör om</span>';
 undo.title='Ångra · Ctrl+Z';redo.title='Gör om · Ctrl+Shift+Z';hist.append(undo,redo);oldRow.remove();
 const saveCta=el('button','lv-cta',I.save+'<span>Spara ZIP</span>');saveCta.type='button';saveCta.title='Samma som SPARA TILL CODEX · ZIP';
 saveCta.addEventListener('click',()=>$('save').click());
 const playCta=el('button','lv-ghost',I.test+'<span>Provspela</span>');playCta.type='button';playCta.title='Spela med bottar';
 playCta.addEventListener('click',()=>$('preview').click());
 top.append(brand,nav,nameWrap);if(steps)top.append(steps);top.append(hist,playCta,saveCta);
 header.replaceWith(top);
 // Keep the existing mode label alive (new.mjs writes to it) inside the name block.
 const modeLabel=header.querySelector('#modeLabel');if(modeLabel){modeLabel.classList.add('lv-mode');nameWrap.append(modeLabel);}

 /* ---------- Rail + contextual panes ---------- */
 const cats=[
  {id:'build',label:'Bygg',icon:I.build,tab:'build',title:'Bygg',sub:'Rum, väggar, dörrar & fönster'},
  {id:'furnish',label:'Möbler',icon:I.furn,tab:'furnish',title:'Möbler',sub:'Sök, välj och placera objekt'},
  {id:'material',label:'Material',icon:I.mat,tab:'build',title:'Material',sub:'Golv, gardiner & ytfärg'},
  {id:'play',label:'Spel',icon:I.play,tab:'play',title:'Spelpunkter',sub:'Spawns, bombmål & gisslan'},
  {id:'project',label:'Testa',icon:I.proj,tab:null,title:'Testa & spara',sub:'Validera, provspela, exportera'}
 ];
 const rail=el('nav','lv-rail');rail.setAttribute('aria-label','Kategorier');
 const panes={};
 const head=el('div','lv-panehead','<div><small></small><h2></h2><p></p></div>');
 const collapse=el('button','lv-collapse',I.panel);collapse.type='button';collapse.title='Dölj panelen · mer plats för 3D';
 collapse.addEventListener('click',()=>$('stageFocus').click());
 head.append(collapse);
 const stack=el('div','lv-panes');
 for(const c of cats){
  const b=el('button','lv-cat',c.icon+`<span>${c.label}</span>`);b.type='button';b.dataset.cat=c.id;b.title=c.title;
  b.addEventListener('click',()=>show(c.id,true));rail.append(b);
  panes[c.id]=el('div','lv-pane');panes[c.id].dataset.pane=c.id;stack.append(panes[c.id]);
 }
 const tabs=tools.querySelector('.tabs');tabs.classList.add('lv-hidden');
 for(const n of [...tools.children]){if(n.matches('.mobile-drawer-top')||n===tabs)continue;n.classList.add('lv-hidden');}
 tools.append(head,stack);
 const sec=s=>tools.querySelector(`section[data-panel="${s}"]`);
 const lab=id=>$(id)?.closest('label')||$(id);
 // Build: guide + build section + walkable spaces.
 const guide=el('div','lv-group');for(const id of ['firstBuild','showGuide'])$(id)&&guide.append($(id));
 panes.build.append(guide,sec('build'),$('spaceTools'));
 for(const n of [guide,sec('build'),$('spaceTools'),sec('furnish'),sec('play'),$('selection')])n?.classList.remove('lv-hidden');
 // Materials: next-floor material, curtain style + presets, sill (all real inputs, moved).
 const mHint=el('p','lv-tip','Markera en <b>vägg</b>, <b>dörr</b> eller <b>golvyta</b> i vyn för att byta färg, mönster och utförande. Inställningarna nedan gäller nästa del du ritar.');
 const mGroup=el('div','lv-group');
 mGroup.append(el('h3','lv-h','Nästa golv'),lab('surface'),lab('floorName'),el('h3','lv-h','Fönster'),lab('sill'),el('h3','lv-h','Gardiner'),tools.querySelector('.curtain-tools'),lab('newCurtainStyle'));
 // Empty "row" wrappers left behind are removed.
 panes.material.append(mHint,mGroup);
 panes.furnish.append(sec('furnish'));sec('furnish').classList.remove('lv-hidden');
 panes.play.append(sec('play'));sec('play').classList.remove('lv-hidden');
 // Project: level size + all save/validate/test controls.
 const size=$('width')?.closest('.row');const sizeG=el('div','lv-group');sizeG.append(el('h3','lv-h','Banans grundyta'));if(size)sizeG.append(size);
 for(const n of [...checks.children])if(!n.classList.contains('mobile-drawer-top'))panes.project.append(n);
 panes.project.append(sizeG);
 // Leftover intro text + tabs stay in the DOM (switchTab needs the tab buttons), but hidden.
 $('modeHelp')?.classList.remove('lv-hidden');$('modeHelp')&&head.querySelector('div').append($('modeHelp'));

 for(const row of tools.querySelectorAll('.row'))if(!row.children.length)row.remove();
 for(const n of stack.querySelectorAll('.lv-hidden'))n.classList.remove('lv-hidden');
 checks.classList.add('lv-hidden-aside');
 tools.parentElement.insertBefore(rail,tools);

 /* ---------- Stage chrome ---------- */
 const tb=work.querySelector('.toolbar');tb.classList.add('lv-camera');tb.setAttribute('aria-label','Kamera och vy');
 const labels={planView:'Plan',threeView:'3D',gameLook:'Spelvy',walkView:'Gå runt',fit:'Visa allt'};
 for(const [id,t] of Object.entries(labels)){const b=$(id);if(b){b.dataset.full=b.textContent.trim();b.title=b.dataset.full;b.textContent=t;}}
 const sep=()=>el('i','lv-sep');
 $('fit')?.before(sep());$('cutaway')?.closest('label')?.before(sep());
 $('stageFocus')?.classList.add('lv-hidden');
 const insp=el('div','lv-inspector');insp.setAttribute('aria-label','Markerat objekt');
 const selection=$('selection');selection.classList.add('lv-card');selection.classList.remove('lv-hidden');
 for(const id of ['clipboardDock','surfaceDock','editDock','editDockReopen'])$(id)&&insp.append($(id));
 insp.prepend(selection);work.append(insp);
 $('surfaceDock')?.classList.add('lv-card');$('editDock')?.classList.add('lv-card');
 $('closeSurface')?.removeAttribute('style');
 const foot=work.querySelector('.foot');foot.classList.add('lv-foot');
 const flatTip=foot.querySelector('span:not(#status)');flatTip?.classList.add('lv-hidden');
 // Short keyboard legend, toggled on demand instead of a permanent status bar.
 const keys=el('details','lv-keys','<summary>?</summary><div><b>Klick</b> välj · <b>Dra</b> flytta · <b>R / högerklick</b> vrid · <b>Ctrl+D</b> duplicera · <b>Ctrl+C/V</b> kopiera · <b>Ctrl+Z</b> ångra · <b>Del</b> radera · <b>Esc</b> avbryt · <b>WASD</b> flytta vyn · <b>Scroll</b> zooma</div>');
 foot.append(keys);

 /* ---------- Category switching (drives existing tabs) ---------- */
 let current='build';
 function syncHead(){const c=cats.find(c=>c.id===current);head.querySelector('small').textContent=String(cats.indexOf(c)+1).padStart(2,'0')+' / '+c.label.toUpperCase();head.querySelector('h2').textContent=c.title;head.querySelector('p').textContent=c.sub;}
 function show(id,user=false){
  const c=cats.find(c=>c.id===id);if(!c)return;current=id;
  if(user&&body.classList.contains('stage-focus'))$('stageFocus').click();
  for(const b of rail.children)b.classList.toggle('active',b.dataset.cat===id),b.setAttribute('aria-pressed',String(b.dataset.cat===id));
  for(const [k,p] of Object.entries(panes))p.hidden=k!==id;
  if(c.tab){const t=tabs.querySelector(`[data-tab="${c.tab}"]`);if(t&&!t.classList.contains('active'))t.click();}
  stack.scrollTop=0;syncHead();
 }
 // When the editor changes tab by itself (kid steps, shortcuts), follow it.
 new MutationObserver(()=>{const active=tabs.querySelector('.active')?.dataset.tab;const c=cats.find(c=>c.id===current);
  if(active&&c.tab&&c.tab!==active)show(cats.find(c=>c.tab===active).id);}).observe(tabs,{subtree:true,attributes:true,attributeFilter:['class']});
 $('kidSave')?.addEventListener('click',()=>show('project'));
 $('mobileSave')?.addEventListener('click',()=>show('project'));
 const initial=tabs.querySelector('.active')?.dataset.tab||'build';
 show(cats.find(c=>c.tab===initial)?.id||'build');
 if(location.search.includes('edit-floor5')&&initial==='build'&&new URLSearchParams(location.search).get('tab')==='furnish')show('furnish',true);

 // Inspector visibility follows the original panels' own [hidden] state.
 const sync=()=>insp.classList.toggle('has-content',[...insp.children].some(n=>!n.hidden&&getComputedStyle(n).display!=='none'));
 new MutationObserver(sync).observe(insp,{subtree:true,attributes:true,attributeFilter:['hidden','disabled']});sync();
 window.__levelShell={show,get current(){return current;}};
}
