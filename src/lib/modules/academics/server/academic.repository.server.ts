import { query } from '#server/database/postgres.ts';
import type { Grade, Lesson, LessonChange } from '#modules/academics/academic.types.ts';
import type { User } from '#modules/auth/auth.types.ts';

const lessonColumns = `l.id,s.name subject,s.color,u.full_name teacher,g.name group_name,l.starts_at,l.ends_at,l.room,l.kind,l.note,
  l.cancelled_at,l.rescheduled_at,l.change_reason,l.previous_starts_at,l.previous_ends_at,l.previous_room`;
const lessonTables = `FROM lessons l JOIN subjects s ON s.id=l.subject_id
  JOIN users u ON u.id=l.teacher_id JOIN study_groups g ON g.id=l.group_id`;

function scheduleScope(user: User) {
  switch (user.role) {
    case 'student':
      return { clause: 'l.group_id=$1', value: user.group_id };
    case 'teacher':
      return { clause: 'l.teacher_id=$1', value: user.id };
    case 'dean':
      return { clause: 'g.faculty_id=$1', value: user.faculty_id };
    default:
      return null;
  }
}

export async function lessonById(user: User, lessonId: string) {
  const scope = scheduleScope(user);
  if (!scope) return null;
  const result = await query<Lesson>(
    `SELECT ${lessonColumns} ${lessonTables} WHERE ${scope.clause} AND l.id=$2`,
    [scope.value, lessonId]
  );
  return result.rows[0] ?? null;
}

export async function lessons(
  user: User,
  {
    includeCancelled = false,
    upcomingLimit,
    week
  }: { includeCancelled?: boolean; upcomingLimit?: number; week?: string } = {}
) {
  const scope = scheduleScope(user);
  if (!scope) return [];
  return (
    await query<Lesson>(
      `SELECT ${lessonColumns} ${lessonTables}
    WHERE ${scope.clause} AND ($2 OR l.cancelled_at IS NULL)
      AND l.starts_at >= (coalesce($4::date::timestamp, date_trunc('week', now() AT TIME ZONE 'Europe/Moscow')) AT TIME ZONE 'Europe/Moscow')
      AND l.starts_at < coalesce((($4::date + 7)::timestamp AT TIME ZONE 'Europe/Moscow'), now()+interval '30 days')
      AND ($3::integer IS NULL OR l.ends_at>now())
    ORDER BY l.starts_at,l.id LIMIT COALESCE($3,300)`,
      [scope.value, includeCancelled, upcomingLimit ?? null, week ?? null]
    )
  ).rows;
}
export async function upcomingLessonChanges(user: User) {
  if (user.role !== 'student' || !user.group_id) return [];
  return (
    await query<LessonChange>(
      `SELECT l.id,s.name subject,l.starts_at,l.ends_at,l.room,l.cancelled_at,l.change_reason,
        l.previous_starts_at,l.previous_ends_at,l.previous_room,conflict.subject overlapping_subject,
        previous.room from_room
      FROM lessons l JOIN subjects s ON s.id=l.subject_id
      LEFT JOIN LATERAL (
        SELECT cs.name subject FROM lessons other JOIN subjects cs ON cs.id=other.subject_id
        WHERE l.cancelled_at IS NULL AND other.group_id=l.group_id AND other.id<>l.id
          AND other.cancelled_at IS NULL AND other.starts_at<l.ends_at AND other.ends_at>l.starts_at
        ORDER BY other.starts_at,other.id LIMIT 1
      ) conflict ON true
      LEFT JOIN LATERAL (
        SELECT term.room FROM lessons term
        WHERE l.cancelled_at IS NULL AND term.group_id=l.group_id AND term.cancelled_at IS NULL
          AND term.starts_at >= (date_trunc('day',l.starts_at AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow')
          AND term.starts_at<l.starts_at AND term.ends_at<=l.starts_at
        ORDER BY term.starts_at DESC,term.id LIMIT 1
      ) previous ON true
      WHERE l.group_id=$1 AND l.ends_at>now() AND l.starts_at<now()+interval '7 days'
        AND (l.rescheduled_at IS NOT NULL OR l.cancelled_at IS NOT NULL)
      ORDER BY l.starts_at,l.id LIMIT 4`,
      [user.group_id]
    )
  ).rows;
}

export async function grades(user: User) {
  const scope =
    user.role === 'student'
      ? 'p.student_id=$1'
      : user.role === 'teacher'
        ? 'EXISTS(SELECT 1 FROM teaching_assignments a WHERE a.teacher_id=$1 AND a.subject_id=p.subject_id AND a.group_id=u.group_id)'
        : 'g.faculty_id=$1';
  const value =
    user.role === 'student' ? user.id : user.role === 'teacher' ? user.id : user.faculty_id;
  if (user.role === 'admin') return [];
  return (
    await query<Grade>(
      `SELECT p.student_id,u.full_name student,s.name subject,s.color,t.full_name teacher,g.name group_name,p.points,p.updated_at
    FROM grades p JOIN users u ON u.id=p.student_id JOIN study_groups g ON g.id=u.group_id JOIN subjects s ON s.id=p.subject_id JOIN users t ON t.id=p.teacher_id
    WHERE ${scope} AND g.faculty_id=$2 ORDER BY s.name,u.full_name LIMIT 500`,
      [value, user.faculty_id]
    )
  ).rows;
}
export async function groupRank(user: User) {
  if (user.role !== 'student' || !user.group_id) return null;
  const result = await query<{ position: string; total: string }>(
    `WITH scores AS (SELECT u.id,avg(p.points) average FROM users u JOIN grades p ON p.student_id=u.id WHERE u.group_id=$1 AND u.role='student' AND u.active GROUP BY u.id), ranking AS (SELECT id,rank() OVER (ORDER BY average DESC) position,count(*) OVER () total FROM scores) SELECT position::text,total::text FROM ranking WHERE id=$2`,
    [user.group_id, user.id]
  );
  return result.rows[0] ?? null;
}
