import {OUTFITS, CHALLENGE_OUTFITS, EARNED_OUTFITS} from './operator-outfits.mjs';

// Each thumbnail gets one view of the real rig on the existing lobby renderer.
export function mountWardrobe({selected, equip, rotate, savedDesign}) {
  const panel = document.querySelector('[data-panel=outfits]');
  const choices = panel.querySelector('[data-outfit-choices]');
  const status = panel.querySelector('[role=status]');
  const buttons = new Map();

  let progression=null;
  const challengeRows=new Map();
  function update() {
    const saved = savedDesign();
    for(const outfit of EARNED_OUTFITS){
      const has=progression?.unlockedOutfits?.includes(outfit.id);
      const button=buttons.get(outfit.id);
      if(has&&!button)addChoice(outfit);
      if(!has&&button){button.remove();buttons.delete(outfit.id);}
    }
    for (const [id, button] of buttons) {
      button.disabled=saved;
      button.setAttribute('aria-pressed', String(!saved && id === selected().id));
    }
    for(const [id,{heading,rows,name}] of challengeRows){
      const earned=progression?.unlockedOutfits?.includes(id);
      heading.textContent=name+(earned?' · Earned':' · Locked');
      const counters=progression?.challenges?.filter(c=>c.outfit===id)||[];
      rows.forEach(({row,goal},i)=>{
        const c=counters[i];
        row.textContent=c ? c.label+' · '+c.count+' / '+c.goal : goal;
      });
    }
    status.textContent = saved ? 'Your saved character supplies its own outfit and sleeves.' : '';
  }

  function addChoice(outfit) {
    const button = document.createElement('button');
    const portrait = document.createElement('canvas');
    const title = document.createElement('strong');
    const role = document.createElement('span');
    portrait.width = 96;
    portrait.height = 112;
    portrait.setAttribute('aria-hidden', 'true');
    button.type = 'button';
    button.dataset.outfit = outfit.id;
    title.textContent = outfit.name;
    role.textContent = outfit.role;
    button.append(portrait, title, role);
    button.addEventListener('click', () => {
      const persisted = equip(outfit.id);
      update();
      status.textContent = outfit.name + (persisted ? ' equipped.' : ' equipped for this session.');
    });
    choices.append(button);
    buttons.set(outfit.id, button);
  }

  OUTFITS.forEach(addChoice);
  const challenges = panel.querySelector('[data-outfit-challenges]');
  for (const [id, name, goals] of CHALLENGE_OUTFITS) {
    const item = document.createElement('li');
    const details = document.createElement('details');
    const heading = document.createElement('summary');
    const list = document.createElement('ul');
    heading.textContent = name + ' · Locked';
    const rows=[];
    for (const goal of goals) {
      const row = document.createElement('li');
      row.textContent = goal;
      list.append(row);rows.push({row,goal});
    }
    challengeRows.set(id,{name,heading,rows});
    details.append(heading,list);
    item.append(details);
    challenges.append(item);
  }
  for (const control of panel.querySelectorAll('[data-rotate]')) {
    control.addEventListener('click', () => rotate(Number(control.dataset.rotate)));
  }
  document.getElementById('menu').addEventListener('cs-menu-screen', event => {
    if (event.detail.screen === 'outfits') update();
  });
  window.addEventListener('cs-wardrobe-progress',event=>{
    progression=event.detail;
    update();
  });
  update();
  return buttons;
}
