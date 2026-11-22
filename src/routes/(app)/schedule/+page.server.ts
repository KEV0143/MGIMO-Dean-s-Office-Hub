import { requireRole } from '#modules/auth/server/auth.service.server.ts';
import { lessonById, lessons } from '#modules/academics/server/academic.repository.server.ts';
import {
  addScheduleDays,
  parseScheduleDay,
  scheduleDay,
  scheduleWeek
} from '#modules/academics/schedule-navigation.ts';
import { isUuid } from '#shared/validation.ts';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals, url }) => {
  const user = requireRole(locals.user, 'student', 'dean', 'teacher');
  const today = scheduleDay(Date.now());
  const lessonId = url.searchParams.get('lesson');
  const linked = lessonId && isUuid(lessonId) ? await lessonById(user, lessonId) : null;
  const linkedDay = linked ? scheduleDay(linked.starts_at) : null;
  const outsideWeek =
    linkedDay && (linkedDay < scheduleWeek(today) || linkedDay > addScheduleDays(today, 30))
      ? scheduleWeek(linkedDay)
      : null;
  const rows = await lessons(user, { includeCancelled: true, week: outsideWeek ?? undefined });
  const current = linked && rows.find((item) => item.id === linked.id);
  if (linked && !current) {
    rows.push(linked);
    rows.sort(
      (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id)
    );
  }
  return {
    lessons: rows,
    today,
    selectedDate: current
      ? scheduleDay(current.starts_at)
      : (linkedDay ?? parseScheduleDay(url.searchParams.get('date'))),
    selectedLesson: linked?.id ?? null,
    outsideWeek,
    missingLesson: lessonId !== null && !linked
  };
}) satisfies PageServerLoad;
