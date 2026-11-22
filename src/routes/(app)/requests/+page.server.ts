import { requireRole } from '#modules/auth/server/auth.service.server.ts';
import { requestListFilters } from '#modules/requests/request.labels.ts';
import { listRequests } from '#modules/requests/server/request.repository.server.ts';
import type { PageServerLoad } from './$types';

const pageSize = 24;

export const load = (async ({ locals, url }) => {
  const user = requireRole(locals.user, 'student', 'dean');
  const filter =
    requestListFilters.find(({ id }) => id === url.searchParams.get('filter'))?.id ?? 'all';
  const term = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  const requested = url.searchParams.get('page') ?? '';
  const page = /^[1-9]\d{0,8}$/.test(requested) ? Number(requested) : 1;
  const rows = await listRequests(user, pageSize + 1, {
    filter,
    term,
    offset: (page - 1) * pageSize
  });
  return { requests: rows.slice(0, pageSize), filter, term, page, hasNext: rows.length > pageSize };
}) satisfies PageServerLoad;
