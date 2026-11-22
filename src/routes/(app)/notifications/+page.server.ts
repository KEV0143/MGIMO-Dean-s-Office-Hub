import { requireUser } from '#modules/auth/server/auth.service.server.ts';
import type { PageServerLoad } from './$types';
import type { Actions } from './$types';
import {
  notifications,
  markAllRead
} from '#modules/notifications/server/notification.repository.server.ts';
import { assessmentReminders } from '#modules/study-plan/server/study-plan.repository.server.ts';

export const load = (async ({ locals }) => {
  const user = requireUser(locals.user);
  const [items, reminders] = await Promise.all([
    notifications(user.id),
    user.role === 'student' ? assessmentReminders(user) : []
  ]);
  return { notifications: items, reminders };
}) satisfies PageServerLoad;
export const actions = {
  read: async ({ locals }) => {
    await markAllRead(requireUser(locals.user).id);
    return { success: true };
  }
} satisfies Actions;
