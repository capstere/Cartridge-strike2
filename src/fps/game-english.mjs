// Stable purchase outcomes are shared by Solo, the authoritative room and its shop.
export const purchaseReasons = Object.freeze({
  unavailableInMode: 'This equipment is unavailable in this mode.',
  unavailable: 'This equipment cannot be purchased.',
  nextRound: 'You can buy when you enter the next round.',
  buyTime: 'The buy phase is closed.',
  buyZone: 'Return to your team’s buy zone.',
  wrongTeam: 'This weapon belongs to the other team.',
  credits: 'You need more credits.',
  grenadeFull: 'Your grenade slot is full.',
  armorFull: 'Your armor is already full.',
  alreadyOwned: 'You already have this weapon.',
});

export const roundReasons = Object.freeze({
  detonation: 'The bomb detonated.',
  defuse: 'The bomb was defused.',
  rescue: 'Both hostages reached the rescue zone.',
  elimination: 'The opposing team was eliminated.',
  timeout: 'Time expired. The Analysts held the objectives.',
  draw: 'Both teams were eliminated at the same time.',
});

export function purchaseLabel(outcome, itemName, reasonId) {
  if (outcome === 'accepted') return `${itemName} purchased.`;
  if (outcome === 'pending') return 'Waiting for purchase confirmation…';
  return purchaseReasons[reasonId] || purchaseReasons.unavailable;
}
