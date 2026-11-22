import { portalHref } from '#shared/portal-paths.ts';
import { redirect } from '@sveltejs/kit';
import { signOut } from '#modules/auth/server/auth.service.server.ts';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ cookies, platform }) => {
  await signOut(cookies, platform?.browserSession);
  redirect(303, portalHref('/login'));
};
