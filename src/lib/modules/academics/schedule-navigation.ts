import { isCalendarDate, isUuid } from '#shared/validation.ts';

export { moscowDay as scheduleDay } from '#shared/formatting.ts';

export function parseScheduleDay(value: string | null) {
  return value && isCalendarDate(value) ? value : null;
}

export function scheduleDate(value: string) {
  return new Date(value + 'T00:00:00Z');
}

export function addScheduleDays(value: string, days: number) {
  const date = scheduleDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function scheduleWeek(value: string) {
  return addScheduleDays(value, -((scheduleDate(value).getUTCDay() + 6) % 7));
}

export function scheduleHref(lessonId: string) {
  return '/schedule?lesson=' + lessonId + '#lesson-' + lessonId;
}

export function lessonIdFromHash(hash: string) {
  const id = hash.startsWith('#lesson-') ? hash.slice(8) : '';
  return isUuid(id) ? id : null;
}

export function resolveScheduleNotification(href: string) {
  const match = /^\/schedule\?date=\d{4}-\d{2}-\d{2}(#lesson-.+)$/.exec(href);
  const id = match && lessonIdFromHash(match[1]);
  return id ? scheduleHref(id) : href;
}
