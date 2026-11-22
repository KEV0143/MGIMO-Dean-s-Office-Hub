import { portalHref, portalPath } from '#shared/portal-paths.ts';
import { requireUser } from '#modules/auth/server/auth.service.server.ts';
import { unreadCount } from '#modules/notifications/server/notification.repository.server.ts';
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { campusPath } from '#modules/campus/campus-links.ts';
export const load = (async ({ locals, url }) => {
  const path = portalPath(url.pathname);
  if (
    !locals.user &&
    (path.startsWith('/student-card/verify/') ||
      path === campusPath ||
      (path === '/schedule' && url.searchParams.has('lesson')))
  ) {
    const next = path + (path === campusPath || path === '/schedule' ? url.search : '');
    redirect(303, portalHref(`/login?next=${encodeURIComponent(next)}`));
  }
  const user = requireUser(locals.user);
  return { user, unread: await unreadCount(user.id) };
}) satisfies LayoutServerLoad;
