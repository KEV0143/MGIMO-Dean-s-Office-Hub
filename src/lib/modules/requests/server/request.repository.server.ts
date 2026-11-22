import { error } from '@sveltejs/kit';
import { query } from '#server/database/postgres.ts';
import { isUuid } from '#shared/validation.ts';
import type {
  StudyRequest,
  RequestListItem,
  RequestStatus,
  DocumentVerification
} from '../request.types';
import type { User } from '#modules/auth/auth.types.ts';
import { requestKinds, type RequestListFilter } from '../request.labels.ts';
const withStudent = `FROM requests r JOIN users u ON u.id=r.student_id
  JOIN study_groups g ON g.id=u.group_id`;
function scope(user: User) {
  if (user.role === 'student') return { sql: 'r.student_id=$1', value: user.id };
  if (user.role === 'dean') return { sql: 'r.faculty_id=$1', value: user.faculty_id };
  error(403, 'Заявления доступны студентам и сотрудникам деканата.');
}
const cyrillicUpper = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
const cyrillicLower = cyrillicUpper.toLowerCase();

interface RequestListOptions {
  filter: RequestListFilter;
  term: string;
  offset: number;
}

export async function listRequests(user: User, limit: number, options?: RequestListOptions) {
  const access = scope(user);
  const predicates = [access.sql];
  const parameters: unknown[] = [access.value, limit];
  if (options && options.filter !== 'all') {
    parameters.push(
      options.filter === 'active' ? ['new', 'in_progress', 'ready'] : [options.filter]
    );
    predicates.push('r.status=ANY($' + parameters.length + '::text[])');
  }
  if (options?.term) {
    const number = /^(?:№\s*)?(\d+)$/.exec(options.term);
    if (number) {
      const target = BigInt(number[1]);
      if (target <= 9_223_372_036_854_775_807n) {
        parameters.push(target.toString());
        predicates.push('r.number=$' + parameters.length + '::bigint');
      } else {
        predicates.push('false');
      }
    } else {
      const i = parameters.length;
      // The native Windows demo initializes PostgreSQL with the C locale.
      parameters.push(requestKinds, cyrillicUpper, cyrillicLower, options.term.toLowerCase());
      predicates.push(
        `strpos(translate(lower(concat_ws(' ', $${i + 1}::jsonb ->> r.kind, r.number, u.full_name)),
                 $${i + 2}, $${i + 3}), $${i + 4}) > 0`
      );
    }
  }
  parameters.push(options?.offset ?? 0);
  return (
    await query<RequestListItem>(
      `SELECT r.id,r.number,u.full_name student_name,g.name group_name,r.kind,r.status,r.created_at,r.updated_at,r.awaiting_student
       ${withStudent} WHERE ${predicates.join(' AND ')}
       ORDER BY r.created_at DESC,r.id LIMIT $2 OFFSET $${parameters.length}`,
      parameters
    )
  ).rows;
}
export async function recentRequestUpdates(studentId: string) {
  return (
    await query<Pick<StudyRequest, 'number' | 'kind' | 'status' | 'staff_note'>>(
      `SELECT number,kind,status,staff_note FROM requests WHERE student_id=$1
       ORDER BY created_at DESC,id LIMIT 6`,
      [studentId]
    )
  ).rows;
}

export async function getRequest(user: User, id: string) {
  if (!isUuid(id)) error(404, 'Заявление не найдено.');
  const access = scope(user);
  const result = await query<StudyRequest>(
    `SELECT r.*,r.due_on::text due_on,u.full_name student_name,g.name group_name
      ${withStudent} WHERE ${access.sql} AND r.id=$2`,
    [access.value, id]
  );
  if (!result.rowCount) error(404, 'Заявление не найдено.');
  return result.rows[0];
}
export async function requestEvents(requestId: string) {
  return (
    await query<{
      id: string;
      status: RequestStatus;
      note: string;
      created_at: string;
      actor: string;
    }>(
      `SELECT e.id,e.status,e.note,e.created_at,u.full_name actor FROM request_events e JOIN users u ON u.id=e.actor_id WHERE request_id=$1 ORDER BY e.created_at,e.id`,
      [requestId]
    )
  ).rows;
}

export async function requestStats(user: User) {
  const access = scope(user);
  return (
    await query<{ active: string; new: string }>(
      `SELECT count(*) FILTER (WHERE status IN ('new','in_progress','ready')) active,count(*) FILTER (WHERE status='new') new FROM requests r WHERE ${access.sql}`,
      [access.value]
    )
  ).rows[0];
}

export async function verifyDocument(code: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) error(404, 'Документ не найден.');
  const result = await query<DocumentVerification>(
    `SELECT number,kind,updated_at FROM requests WHERE verification_code=$1 AND status IN ('ready','done') AND kind IN ('study','scholarship','tax')`,
    [code]
  );
  if (!result.rowCount) error(404, 'Документ не найден или недействителен.');
  return result.rows[0];
}
