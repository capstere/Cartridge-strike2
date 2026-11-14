/** Browser fullscreen is best-effort and must start inside a user gesture. */
export function createFullscreenController(doc) {
  const root = doc.documentElement;
  let preferred = true;
  const active = () => Boolean(doc.fullscreenElement);
  const supported = () => typeof root?.requestFullscreen === 'function';
  function attempt(action) {
    try {
      Promise.resolve(action()).catch(() => {}); // Never block match input or loading.
      return true;
    } catch { return false; }
  }
  const enter = () => preferred && supported() && !active() && attempt(() => root.requestFullscreen());
  const exit = () => active() && typeof doc.exitFullscreen === 'function' && attempt(() => doc.exitFullscreen());
  return {
    get supported() { return supported(); },
    get active() { return active(); },
    get preferred() { return preferred; },
    start() { preferred = true; return enter(); },
    resume: enter,
    toggle() {
      if (active()) { preferred = false; return exit(); }
      preferred = true;
      return enter();
    },
    exit,
  };
}
