import {accountRequest} from '../account-profile.mjs';

async function paintCode(canvas, value) {
  const {default:qrcode} = await import('../../../vendor/qrcode-generator/qrcode.mjs');
  const qr = qrcode(0,'M');
  qr.addData(value,'Byte'); qr.make();
  const modules = qr.getModuleCount(), quiet = 4, scale = 5;
  canvas.width = canvas.height = (modules + 2*quiet)*scale;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height);
  context.fillStyle = '#111';
  for (let y=0; y<modules; y++) for (let x=0; x<modules; x++) {
    if (qr.isDark(y,x)) context.fillRect((x+quiet)*scale,(y+quiet)*scale,scale,scale);
  }
}

export function roomInvitation(root) {
  const trigger = root.querySelector('#room-invite'), panel = root.querySelector('.room-invitation');
  const status = panel.querySelector('[role=status]'), output = panel.querySelector('[data-invite-output]');
  const link = panel.querySelector('input'), short = panel.querySelector('strong'), until = panel.querySelector('time');
  let room = '', ticket = 0, timeout;
  function clear() {
    ticket++;
    clearTimeout(timeout);
    const old = panel.querySelector('canvas');
    if (old) { old.width = old.height = 0; old.remove(); }
    link.value = ''; short.textContent = ''; until.textContent = '';
    output.hidden = true; status.textContent = '';
    panel.querySelector('[data-invite-confirm]').hidden = true;
    for (const button of panel.querySelectorAll('button')) button.disabled = false;
  }
  function hide() {
    clear(); panel.hidden = true; trigger.setAttribute('aria-expanded','false');
  }
  function update(id) {
    if (room !== id) { hide(); room = id; }
    trigger.hidden = !room;
  }
  trigger.onclick = () => {
    if (!panel.hidden) { hide(); return; }
    panel.hidden = false; trigger.setAttribute('aria-expanded','true');
    panel.querySelector('[data-invite-create]').focus();
  };
  const create = panel.querySelector('[data-invite-create]');
  create.onclick = async () => {
    clear(); const current = ticket;
    create.disabled = true; status.textContent = 'Creating invitation…';
    try {
      const result = await accountRequest('/api/room/invites',{room});
      if (ticket !== current) return;
      const url = new URL('/join',location.origin);
      url.hash = result.token;
      link.value = url.href; short.textContent = result.shortCode;
      until.dateTime = new Date(result.expiresAt).toISOString();
      until.textContent = new Date(result.expiresAt).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'});
      output.hidden = false; status.textContent = 'Ready to share with one player.';
      timeout = setTimeout(() => {
        if (ticket !== current) return;
        clear(); status.textContent = 'Invitation expired. Create another to invite a player.';
      },Math.max(0,result.expiresAt-Date.now()));
      const canvas = document.createElement('canvas');
      canvas.setAttribute('role','img'); canvas.setAttribute('aria-label','QR code for this single-use room invitation');
      try {
        await paintCode(canvas,url.href);
        if (ticket === current) output.append(canvas);
      } catch { if (ticket === current) status.textContent = 'Share the link or code. The QR image is unavailable.'; }
    } catch (e) { if (ticket === current) status.textContent = e.message; }
    finally { if (ticket === current) create.disabled = false; }
  };
  panel.querySelector('[data-invite-share]').onclick = async () => {
    const current = ticket;
    try {
      if (navigator.share) await navigator.share({title:'Join my Cartridge-Strike room',url:link.value});
      else { await navigator.clipboard.writeText(link.value); if (ticket === current) status.textContent = 'Invitation link copied.'; }
    } catch (e) {
      if (ticket !== current || e.name === 'AbortError') return;
      link.focus(); link.select(); status.textContent = 'Copy the selected invitation link.';
    }
  };
  const confirm = panel.querySelector('[data-invite-confirm]');
  panel.querySelector('[data-invite-revoke]').onclick = () => { confirm.hidden = false; confirm.querySelector('button').focus(); };
  confirm.querySelector('[data-cancel]').onclick = () => { confirm.hidden = true; };
  confirm.querySelector('[data-confirm]').onclick = async () => {
    const current = ticket;
    try {
      await accountRequest('/api/room/revoke',{room});
      if (ticket !== current) return;
      clear(); status.textContent = 'Shared access revoked.';
    } catch (e) { if (ticket === current) status.textContent = e.message; }
  };
  addEventListener('pagehide',hide);
  return {update};
}
