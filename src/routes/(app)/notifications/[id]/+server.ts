import { error, redirect } from '@sveltejs/kit';
import { requireUser } from '#modules/auth/server/auth.service.server.ts';
import { readNotification } from '#modules/notifications/server/notification.repository.server.ts';
import { isUuid } from '#shared/validation.ts';
import { resolveScheduleNotification } from '#modules/academics/schedule-navigation.ts';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ locals, params, url }) => {
  const user = requireUser(locals.user);
  if (!isUuid(params.id)) error(404, 'Уведомление не найдено.');
  const href = await readNotification(user.id, params.id);
  if (!href || !href.startsWith('/') || URL.parse(href, url.origin)?.origin !== url.origin)
    error(404, 'Уведомление не найдено.');
  redirect(303, resolveScheduleNotification(href));
};
