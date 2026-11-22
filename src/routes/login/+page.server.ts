import { portalHref } from '#shared/portal-paths.ts';
import { fail, redirect } from '@sveltejs/kit';
import {
  allowContestLogin,
  signIn,
  quickSignIn,
  isContestDemo,
  isLocalDemo
} from '#modules/auth/server/auth.service.server.ts';
import { previewAccounts } from '#modules/auth/preview-accounts.ts';
import { campusPath } from '#modules/campus/campus-links.ts';
import { scheduleHref } from '#modules/academics/schedule-navigation.ts';
import { isUuid } from '#shared/validation.ts';
import type { Actions, PageServerLoad } from './$types';

function destinationAfterLogin(url: URL) {
  const raw = url.searchParams.get('next');
  if (!raw?.startsWith('/')) return '/overview';
  try {
    const target = new URL(raw, url.origin);
    if (target.origin !== url.origin) return '/overview';
    if (target.pathname === campusPath) return target.pathname + target.search;
    const lessonId = target.searchParams.get('lesson');
    if (target.pathname === '/schedule' && lessonId && isUuid(lessonId))
      return scheduleHref(lessonId);
    if (/^\/student-card\/verify\/[0-9a-f-]{36}$/.test(target.pathname)) return target.pathname;
  } catch {}
  return '/overview';
}

export const load = (({ locals, url, platform }) => {
  if (locals.user) redirect(303, portalHref(destinationAfterLogin(url)));
  const demo = isLocalDemo(url, platform?.browserSession);
  return {
    demo,
    browserDemo: Boolean(platform?.browserSession),
    accounts: demo ? previewAccounts : []
  };
}) satisfies PageServerLoad;
export const actions = {
  default: async ({ request, cookies, url, getClientAddress, platform }) => {
    const form = await request.formData();
    const next = destinationAfterLogin(url);
    if (form.has('account')) {
      if (!(await quickSignIn(String(form.get('account')), cookies, url, platform?.browserSession)))
        return fail(403, { message: 'Быстрый вход недоступен.' });
      redirect(303, portalHref(next));
    }
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    const password = String(form.get('password') ?? '');
    if (!email || email.length > 254 || password.length < 1 || password.length > 128)
      return fail(400, { message: 'Введите почту и пароль.' });
    if (isContestDemo(url) && !(await allowContestLogin(getClientAddress())))
      return fail(429, { message: 'Слишком много попыток входа. Повторите через 15 минут.' });
    if (!(await signIn(email, password, cookies, url, platform?.browserSession)))
      return fail(400, {
        message: 'Не удалось войти. Проверьте почту и пароль или повторите попытку через 15 минут.'
      });
    redirect(303, portalHref(next));
  }
} satisfies Actions;
