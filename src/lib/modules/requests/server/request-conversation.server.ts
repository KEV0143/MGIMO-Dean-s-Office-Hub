import { error } from '@sveltejs/kit';
import { query, transaction } from '#server/database/postgres.ts';
import type { User } from '#modules/auth/auth.types.ts';
import { isUuid } from '#shared/validation.ts';
import { conversationLimit, conversationOpen } from '../request.policy.ts';
import type { RequestMessage, RequestStatus } from '../request.types.ts';

export async function requestMessages(user: User, requestId: string) {
  return (
    await query<RequestMessage>(
      `SELECT m.submission_id, u.full_name AS sender_name, m.sender_id=$1 AS mine, m.body, m.created_at
    FROM request_messages m JOIN requests r ON r.id=m.request_id JOIN users u ON u.id=m.sender_id
    WHERE m.request_id=$2 AND (($3='student' AND r.student_id=$1) OR ($3='dean' AND r.faculty_id=$4))
    ORDER BY m.created_at, m.submission_id`,
      [user.id, requestId, user.role, user.faculty_id]
    )
  ).rows;
}

export async function postRequestMessage(
  user: User,
  requestId: string,
  submissionId: string,
  body: string
) {
  if (!isUuid(requestId)) error(404, 'Заявление не найдено.');
  if (!isUuid(submissionId) || body.length < 2 || body.length > 1200)
    error(400, 'Напишите от 2 до 1200 символов.');
  await transaction(async (db) => {
    const {
      rows: [request]
    } = await db.query<{
      student_id: string;
      faculty_id: string;
      number: string;
      status: RequestStatus;
      awaiting_student: boolean;
    }>(
      `SELECT student_id, faculty_id, number, status, awaiting_student FROM requests
      WHERE id=$1 AND (($2='student' AND student_id=$3) OR ($2='dean' AND faculty_id=$4)) FOR UPDATE`,
      [requestId, user.role, user.id, user.faculty_id]
    );
    if (!request) error(404, 'Заявление не найдено.');
    const previous = await db.query(
      'SELECT 1 FROM request_messages WHERE request_id=$1 AND sender_id=$2 AND submission_id=$3',
      [requestId, user.id, submissionId]
    );
    if (previous.rowCount) return;
    if (!conversationOpen(request.status))
      error(409, 'Переписка закрыта. При необходимости создайте новое обращение.');
    const {
      rows: [limits]
    } = await db.query<{ total: number; recent: number }>(
      `SELECT count(*)::int AS total,
        count(*) FILTER (WHERE sender_id=$2 AND created_at>now()-interval '1 minute')::int AS recent
       FROM request_messages WHERE request_id=$1`,
      [requestId, user.id]
    );
    const answering = user.role === 'student' && request.awaiting_student;
    const reserved = user.role === 'dean' && request.awaiting_student ? 1 : 0;
    if (limits.total >= conversationLimit - reserved)
      error(409, 'Переписка заполнена. Создайте новое обращение.');
    if (limits.recent >= 6) error(429, 'Подождите минуту перед следующим сообщением.');

    await db.query(
      'INSERT INTO request_messages(request_id,sender_id,submission_id,body) VALUES($1,$2,$3,$4)',
      [requestId, user.id, submissionId, body]
    );
    if (answering) {
      await db.query(
        'UPDATE requests SET awaiting_student=false,version=version+1,updated_at=now() WHERE id=$1',
        [requestId]
      );
      await db.query(
        "INSERT INTO request_events(request_id,actor_id,status,note) VALUES($1,$2,'in_progress','Студент ответил на вопрос деканата.')",
        [requestId, user.id]
      );
      await db.query(
        "INSERT INTO audit_log(actor_id,action,entity_id) VALUES($1,'request.question_answered',$2)",
        [user.id, requestId]
      );
    }
    await db.query(
      `INSERT INTO notifications(id,user_id,title,body,href)
       SELECT gen_random_uuid(),u.id,$1,$2,$3 FROM users u WHERE u.active
         AND (($4='dean' AND u.id=$5) OR ($4='student' AND u.role='dean' AND u.faculty_id=$6))`,
      [
        `Новое сообщение · Заявление №${request.number}`,
        user.role === 'dean' ? 'Ответ деканата в заявлении.' : 'Студент дополнил заявление.',
        `/requests/${requestId}#request-conversation`,
        user.role,
        request.student_id,
        request.faculty_id
      ]
    );
  });
}
