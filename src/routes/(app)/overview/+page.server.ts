import { requireUser } from '#modules/auth/server/auth.service.server.ts';
import type { PageServerLoad } from './$types';
import { getOverview } from '#modules/overview/server/overview.service.server.ts';
import { studentToday } from '#modules/overview/server/student-today.service.server.ts';

export const load = (async ({ locals }) => {
  const user = requireUser(locals.user);
  const [overview, home] = await Promise.all([
    getOverview(user),
    user.role === 'student' ? studentToday(user) : null
  ]);
  return { ...overview, studentToday: home };
}) satisfies PageServerLoad;
