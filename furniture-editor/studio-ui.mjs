/** Optional navigation layer: leaves level project data and engine untouched. */
const $=id=>document.getElementById(id);
const shade=$('mobileBackdrop');
const panelButtons=[...document.querySelectorAll('[data-mobile-tab]')];
const narrow=window.matchMedia('(max-width:700px)');
let sheet='none';

function openSheet(next='none'){
 sheet=next;
 document.body.dataset.studioSheet=sheet;
 shade.hidden=sheet==='none';
 for(const button of panelButtons)button.setAttribute('aria-expanded',String(sheet==='tools'));
 $('mobileSave').setAttribute('aria-expanded',String(sheet==='checks'));
 if(sheet==='tools')$('toolsPanel').scrollTop=0;
 if(sheet==='checks')$('savePanel').scrollTop=0;
}
for(const button of panelButtons){
 button.addEventListener('click',()=>{
  const tab=button.dataset.mobileTab;
  document.querySelector('.tool-panel [data-tab="'+tab+'"]')?.click();
  openSheet('tools');
 });
}
$('mobileSave').addEventListener('click',()=>openSheet('checks'));
$('closeTools').addEventListener('click',()=>openSheet());
$('closeSave').addEventListener('click',()=>openSheet());
shade.addEventListener('click',()=>openSheet());
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&sheet!=='none'&&narrow.matches){
  event.stopImmediatePropagation();
  event.preventDefault();
  openSheet();
  $('mobileSave').focus();
 }
},true);
// Choosing a tool or object returns to the scene on a phone.
// The original click/change event runs first; built-in behavior is preserved.
const tools=$('toolsPanel');
tools.addEventListener('click',event=>{
 if(!narrow.matches)return;
 if(event.target.closest('[data-tool="tape"]')&&$('tool').value==='tape')return; // Choose colour or stripes before closing.
 if(event.target.closest('[data-tool],.catalog-card,#placeFurniture,#doorInWall'))openSheet();
});
tools.querySelector('#tool')?.addEventListener('change',()=>{if(narrow.matches&&$('tool').value!=='tape')openSheet();});
narrow.addEventListener('change',event=>{if(!event.matches)openSheet();});

// A wider desktop scene keeps the palette and a one-click ZIP shortcut.
const focus=$('stageFocus'),quickSave=$('quickSave');
let large=false;
try{large=localStorage.getItem('cartridge-level-wide-scene')==='1';}catch{}
function applyWide(){
 document.body.classList.toggle('stage-focus',large);
 focus.textContent=large?'Visa projektpanelen':'Mer plats';
 focus.setAttribute('aria-pressed',String(large));
 quickSave.hidden=!large;
}
focus.addEventListener('click',()=>{
 large=!large;
 try{localStorage.setItem('cartridge-level-wide-scene',large?'1':'0');}catch{}
 applyWide();
});
quickSave.addEventListener('click',()=>$('save').click());
applyWide();
openSheet();

// Friendly visual category filters; same underlying catalog, no new storage or game state.
const category=$('catalogCategory');
const kidCategories=[...document.querySelectorAll('[data-kid-category]')];
function syncCategories(){
 for(const button of kidCategories)button.setAttribute('aria-pressed',String(button.dataset.kidCategory===category.value));
}
for(const button of kidCategories){
 button.addEventListener('click',()=>{
  category.value=button.dataset.kidCategory;
  category.dispatchEvent(new Event('change',{bubbles:true}));
  syncCategories();
 });
}
category.addEventListener('change',syncCategories);
$('resetCatalog').addEventListener('click',syncCategories);
syncCategories();
