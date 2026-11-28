import {OUTFITS, CHALLENGE_OUTFITS} from './operator-outfits.mjs';

// Each thumbnail gets one view of the real rig on the existing lobby renderer.
export function mountWardrobe({selected, equip, rotate, savedDesign}) {
  const panel = document.querySelector('[data-panel=outfits]');
  const choices = panel.querySelector('[data-outfit-choices]');
  const status = panel.querySelector('[role=status]');
  const buttons = new Map();

  function update() {
    const saved = savedDesign();
    for (const [id, button] of buttons) {
      button.disabled = saved;
      button.setAttribute('aria-pressed', String(!saved && id === selected().id));
    }
    status.textContent = saved ? 'Your saved character supplies its own outfit and sleeves.' : '';
  }

  for (const outfit of OUTFITS) {
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

  const challenges = panel.querySelector('[data-outfit-challenges]');
  for (const [, name, goals] of CHALLENGE_OUTFITS) {
    const item = document.createElement('li');
    const details = document.createElement('details');
    const heading = document.createElement('summary');
    const list = document.createElement('ul');
    heading.textContent = name + ' · Locked';
    for (const goal of goals) {
      const row = document.createElement('li');
      row.textContent = goal;
      list.append(row);
    }
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
  update();
  return buttons;
}
