import {BONUSES, BONUS_HZ, bonusTick} from './bonuses.mjs';

// Restrict choices to controls left free by movement, radio, inspection and weapons.
export const BONUS_KEYS = ['KeyH','KeyJ','KeyK','KeyU','KeyI','KeyO','KeyY','KeyP','KeyL'];
export const BONUS_PAD = [12, 15, 13];
const padNames = {12:'D-pad up', 15:'D-pad right', 13:'D-pad down'};

export function bonusBindings(saved, allowed) {
  if (Array.isArray(saved) && saved.length === BONUSES.length &&
      new Set(saved).size === saved.length && saved.every(value => allowed.includes(value))) return [...saved];
  return allowed.slice(0, BONUSES.length);
}

export function bonusPresentation(bonus, item, tick) {
  if (bonus?.active?.id === item.id && bonus.active.endTick > tick) {
    return ['active', Math.ceil((bonus.active.endTick - tick) / BONUS_HZ) + ' s'];
  }
  if (bonus?.charges?.[item.id]) return ['ready','Ready'];
  if (bonus?.earnedMask & (1 << (item.slot - 1))) return ['spent','Used'];
  return ['locked', Math.min(item.threshold, bonus?.progress || 0) + '/' + item.threshold];
}

export class BonusHud {
  constructor(root, settings, activate) {
    this.root = root;
    this.keys = bonusBindings(settings.bonusKeys, BONUS_KEYS);
    this.pad = bonusBindings(settings.bonusPad, BONUS_PAD);
    this.buttons = BONUSES.map(item => {
      const button = document.createElement('button');
      const title = document.createElement('strong');
      const state = document.createElement('span');
      button.type = 'button';
      title.textContent = item.name;
      button.append(title,state);
      button.addEventListener('click', () => activate(item.slot));
      root.append(button);
      return {button,state};
    });
  }
  update(game, blocked) {
    this.root.hidden = blocked || game.phase !== 'active' || !game.player?.alive;
    if (this.root.hidden) return;
    const bonus = game.player.bonus;
    for (const [i,item] of BONUSES.entries()) {
      const {button,state} = this.buttons[i];
      const [kind,text] = bonusPresentation(bonus,item,bonusTick(game.state.time));
      const label = item.name + ', ' + text + ', ' + this.keys[i].slice(3) + ' or ' + padNames[this.pad[i]];
      if (button.getAttribute('aria-label') !== label) {
        button.dataset.state = kind;
        button.setAttribute('aria-label', label);
        button.title = label;
        state.textContent = kind === 'active' ? 'Active · ' + text : text;
      }
      button.disabled = kind !== 'ready' || Boolean(bonus?.active);
    }
  }
  settings(panel, settings, save) {
    for (const [index,item] of BONUSES.entries()) {
      for (const [field, values, options, name] of [
        ['bonusKeys',this.keys,BONUS_KEYS,'key'], ['bonusPad',this.pad,BONUS_PAD,'gamepad']
      ]) {
        const label = document.createElement('label');
        const select = document.createElement('select');
        label.className = 'setting';
        label.append(item.name + ' ' + name,select);
        select.dataset.bonusBinding = field;
        select.dataset.slot = String(index);
        for (const value of options) select.add(new Option(padNames[value] || String(value).slice(3),String(value)));
        select.value = String(values[index]);
        select.addEventListener('change', () => {
          const value = options.find(option => String(option) === select.value);
          if (value === undefined) return;
          const duplicate = values.indexOf(value);
          if (duplicate >= 0) values[duplicate] = values[index];
          values[index] = value;
          settings[field] = [...values];
          for (const control of document.querySelectorAll('select[data-bonus-binding]')) {
            if (control.dataset.bonusBinding === field) control.value = String(values[Number(control.dataset.slot)]);
          }
          save();
        });
        panel.append(label);
      }
    }
  }
}
