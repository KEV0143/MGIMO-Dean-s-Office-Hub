import identifiers from './room-index.json' with { type: 'json' };
import type { CampusMode, CampusPlace, CampusPlan } from './campus.types.ts';

export const campusPath = '/campus';
export const mainEntrance = 'v-2.go_enter_v2';
export const officialCampusMap = 'https://mgimo.ru/territory/map/';
const rooms: Readonly<Record<string, string>> = identifiers;

export function officialPlanHref(plan: CampusPlan, place?: CampusPlace) {
  const url = new URL(officialCampusMap);
  const room = place?.plan === plan.id ? place.id.slice(plan.id.length + 1) : '';
  if (/^[a-z]\d{3,4}[a-z]?$/.test(room)) {
    url.searchParams.set('room', room);
  } else {
    url.searchParams.set('building', plan.id.split('-')[0]);
    url.searchParams.set('floor', plan.floor);
  }
  return url.href;
}

function roomKey(room: string) {
  return room
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/^(?:ауд(?:итория)?\.?|каб(?:инет)?\.?)\s*/u, '');
}

export function classroomId(room: string) {
  const key = roomKey(room);
  return Object.hasOwn(rooms, key) ? rooms[key] : null;
}

export function mapRouteHref(from = '', to = '', mode: CampusMode = 'standard', plan = '') {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (mode === 'lift') params.set('mode', 'lift');
  if (plan) params.set('plan', plan);
  return params.size ? campusPath + '?' + params : campusPath;
}

export function roomMapHref(room: string, previousRoom?: string) {
  const to = classroomId(room);
  if (!to) return null;
  const from = previousRoom ? classroomId(previousRoom) : null;
  return mapRouteHref(from && from !== to ? from : '', to);
}

export function roomDirections(room: string, previousRoom?: string | null) {
  const to = classroomId(room);
  const from = previousRoom ? classroomId(previousRoom) : null;
  if (!to || from === to) return null;
  const origin = from && previousRoom ? roomKey(previousRoom) : '';
  return {
    href: mapRouteHref(from ?? mainEntrance, to),
    label: origin ? 'Маршрут от ауд. ' + origin : 'Маршрут от входа'
  };
}
