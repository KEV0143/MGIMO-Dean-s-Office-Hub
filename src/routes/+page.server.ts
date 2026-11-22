import { portalHref } from '#shared/portal-paths.ts';
import { redirect } from '@sveltejs/kit';
export function load({ locals }: import('./$types').PageServerLoadEvent) {
  redirect(303, portalHref(locals.user ? '/overview' : '/login'));
}
