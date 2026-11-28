// Keep the old master default and full category levels for existing profiles.
function level(value, fallback) {
  if (value == null || (typeof value !== 'number' && typeof value !== 'string')) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

export function soundLevels(settings = {}) {
  const master = level(settings?.volume, .55);
  return {
    master,
    menuMusic: master * level(settings?.menuMusicVolume, 1),
    announcements: level(settings?.announcementVolume, 1),
  };
}
