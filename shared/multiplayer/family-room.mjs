export const FAMILY_ROOM_ALIAS = 'JESPERS-ROOM';
export const FAMILY_ROOM_PATH = '/room/' + FAMILY_ROOM_ALIAS;

export function isFamilyRoomLink(search) {
  const query = new URLSearchParams(search);
  return query.get('network') === 'internet' && query.get('family') === FAMILY_ROOM_ALIAS;
}
