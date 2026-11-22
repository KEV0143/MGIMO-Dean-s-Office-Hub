import type { User } from '#modules/auth/auth.types.ts';
import { query } from '#server/database/postgres.ts';
import { WAITING_DAYS, type RequestTriage } from '../request-triage.types.ts';

export async function requestTriage(user: User) {
  const result = await query<RequestTriage>(
    `WITH active AS (
       SELECT r.id,r.number::text,r.kind,r.status,r.created_at,r.student_id,r.awaiting_student,r.due_on,
         greatest(0,floor(extract(epoch FROM (now()-r.created_at))/86400))::integer age_days,
         (now() AT TIME ZONE 'Europe/Moscow')::date today
       FROM requests r WHERE r.faculty_id=$1 AND r.status IN ('new','in_progress','ready')
     ), ranked AS (
       SELECT a.id,a.number,a.kind,a.status,a.age_days,a.due_on,a.awaiting_student,
         coalesce(a.due_on<a.today AND NOT a.awaiting_student,false) overdue,
         u.full_name student_name,g.name group_name,a.created_at,
         CASE
           WHEN a.awaiting_student THEN 5
           WHEN a.due_on<a.today THEN 0
           WHEN a.due_on<=a.today+1 THEN 1
           WHEN a.due_on IS NULL AND a.age_days>=$2 THEN 2
           WHEN a.due_on IS NOT NULL THEN 3 ELSE 4
         END priority
       FROM active a JOIN users u ON u.id=a.student_id JOIN study_groups g ON g.id=u.group_id
       WHERE a.status IN ('new','in_progress')
       ORDER BY priority,a.due_on,a.created_at,a.id LIMIT 30
     )
     SELECT
       count(*) FILTER (WHERE status='new')::int new_count,
       count(*) FILTER (WHERE status='in_progress' AND NOT awaiting_student)::int in_progress_count,
       count(*) FILTER (WHERE status='ready')::int ready_count,
       count(*) FILTER (WHERE awaiting_student)::int awaiting_student_count,
       count(*) FILTER (WHERE status IN ('new','in_progress') AND NOT awaiting_student AND due_on<today)::int overdue_count,
       coalesce((SELECT jsonb_agg(to_jsonb(o)-'created_at'-'priority' ORDER BY o.priority,o.due_on,o.created_at,o.id)
         FROM ranked o),'[]'::jsonb) items
     FROM active`,
    [user.faculty_id, WAITING_DAYS]
  );
  return result.rows[0];
}
