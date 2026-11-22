import type { User } from '#modules/auth/auth.types.ts';
import { studyAssessments } from '#modules/study-plan/server/study-plan.repository.server.ts';
import { unreadPreview } from '#modules/notifications/server/unread-preview.repository.server.ts';
import { readyStudentRequests } from '#modules/requests/server/ready-requests.repository.server.ts';
import { upcomingLessonChanges } from '#modules/academics/server/academic.repository.server.ts';

export async function studentToday(user: User) {
  const [assessments, alerts, ready, changes] = await Promise.all([
    studyAssessments(user),
    unreadPreview(user.id),
    readyStudentRequests(user, true),
    upcomingLessonChanges(user)
  ]);
  return {
    assessments: assessments.slice(0, 4),
    alerts,
    changes,
    ready,
    now: Date.now()
  };
}
