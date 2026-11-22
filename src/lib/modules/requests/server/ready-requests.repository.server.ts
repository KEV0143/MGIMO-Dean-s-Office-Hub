import type { User } from '#modules/auth/auth.types.ts';
import { query } from '#server/database/postgres.ts';
import type { StudyRequest } from '../request.types.ts';

export async function readyStudentRequests(user: User, includeWaiting = false) {
  const result = await query<
    Pick<
      StudyRequest,
      'id' | 'number' | 'kind' | 'status' | 'updated_at' | 'awaiting_student' | 'due_on'
    > & {
      total: number;
    }
  >(
    `(SELECT id,number,kind,status,updated_at,awaiting_student,due_on::text,count(*) OVER ()::int total
      FROM requests WHERE student_id=$1 AND status='ready' AND kind IN ('study','scholarship','tax')
      ORDER BY updated_at DESC,id LIMIT 3)
     UNION ALL
     (SELECT id,number,kind,status,updated_at,awaiting_student,due_on::text,0 total
      FROM requests WHERE $2 AND student_id=$1 AND awaiting_student
      ORDER BY updated_at DESC,id LIMIT 1)
     UNION ALL
     (SELECT id,number,kind,status,updated_at,awaiting_student,due_on::text,0 total
      FROM requests WHERE $2 AND student_id=$1 AND NOT awaiting_student
        AND status IN ('new','in_progress') AND due_on < (now() AT TIME ZONE 'Europe/Moscow')::date
      ORDER BY requests.due_on,id LIMIT 1)
     ORDER BY updated_at DESC,id`,
    [user.id, includeWaiting]
  );
  const items = result.rows.filter((row) => row.status === 'ready');
  return {
    count: items[0]?.total ?? 0,
    items,
    needsReply: result.rows.find((row) => row.awaiting_student) ?? null,
    overdue: result.rows.find((row) => row.status !== 'ready' && !row.awaiting_student) ?? null
  };
}
