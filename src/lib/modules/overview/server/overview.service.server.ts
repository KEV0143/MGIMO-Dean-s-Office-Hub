import type { User } from '#modules/auth/auth.types.ts';
import { lessons, grades } from '#modules/academics/server/academic.repository.server.ts';
import { announcements } from '#modules/announcements/server/announcement.repository.server.ts';
import { systemStats } from '#modules/administration/server/administration.repository.server.ts';
import { listRequests, requestStats } from '#modules/requests/server/request.repository.server.ts';

export async function getOverview(user: User) {
  const [schedule, results, news, requests, stats, admin] = await Promise.all([
    lessons(user, { upcomingLimit: 3 }),
    user.role === 'dean' ? Promise.resolve([]) : grades(user),
    announcements(user),
    ['student', 'dean'].includes(user.role) ? listRequests(user, 4) : Promise.resolve([]),
    ['student', 'dean'].includes(user.role)
      ? requestStats(user)
      : Promise.resolve({ active: '0', new: '0' }),
    user.role === 'admin' ? systemStats() : Promise.resolve(null)
  ]);
  return {
    schedule,
    grades: results,
    news: news.slice(0, 3),
    requests,
    requestStats: stats,
    admin
  };
}
