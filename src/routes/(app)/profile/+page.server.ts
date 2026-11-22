import { requireUser } from '#modules/auth/server/auth.service.server.ts';
import { cabinetProfile } from '#modules/cabinet/server/cabinet-profile.service.server.ts';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
  const profile = requireUser(locals.user);
  return { profile, summary: profile.role === 'student' ? await cabinetProfile(profile) : null };
}) satisfies PageServerLoad;
