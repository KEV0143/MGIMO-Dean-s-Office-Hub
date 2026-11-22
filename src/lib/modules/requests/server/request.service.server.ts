import { error } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from '#server/database/postgres.ts';
import { newToken } from '#server/security/credentials.mjs';
import { isCalendarDate, isUuid } from '#shared/validation.ts';
import { fullDate, moscowDay } from '#shared/formatting.ts';
import {
  canTransition,
  canIssueDocument,
  canHandleRequest,
  conversationLimit
} from '#modules/requests/request.policy.ts';
import { requestKinds, statusNames } from '#modules/requests/request.labels.ts';
import type { RequestKind, RequestStatus } from '#modules/requests/request.types.ts';
import type { User } from '#modules/auth/auth.types.ts';

async function lockRequest(db: PoolClient, user: User, id: string, version: number) {
  const {
    rows: [request]
  } = await db.query<{
    number: string;
    student_id: string;
    status: RequestStatus;
    kind: RequestKind;
    version: number;
    verification_code: string | null;
    awaiting_student: boolean;
    due_on: string | null;
  }>(
    `SELECT number,student_id,status,kind,version,verification_code,awaiting_student,due_on::text
     FROM requests WHERE id=$1 AND (($2='student' AND student_id=$3) OR ($2='dean' AND faculty_id=$4))
     FOR UPDATE`,
    [id, user.role, user.id, user.faculty_id]
  );
  if (!request) error(404, 'Заявление не найдено.');
  if (request.version !== version) error(409, 'Заявление уже изменилось. Обновите страницу.');
  return request;
}

export async function createRequest(user: User, id: string, kind: string, details: string) {
  if (user.role !== 'student') error(403, 'Создавать заявления могут студенты.');
  if (
    !isUuid(id) ||
    !Object.hasOwn(requestKinds, kind) ||
    details.length < 3 ||
    details.length > 2000
  )
    error(400, 'Выберите тип заявления и укажите цель обращения: от 3 до 2000 символов.');
  return transaction(async (db) => {
    const inserted = await db.query(
      'INSERT INTO requests(id,student_id,faculty_id,kind,details) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING RETURNING number',
      [id, user.id, user.faculty_id, kind as RequestKind, details]
    );
    if (!inserted.rowCount) {
      const own = await db.query('SELECT 1 FROM requests WHERE id=$1 AND student_id=$2', [
        id,
        user.id
      ]);
      if (!own.rowCount) error(409, 'Обновите страницу и повторите отправку.');
      return id;
    }
    await db.query(
      'INSERT INTO request_events(request_id,actor_id,status,note) VALUES($1,$2,$3,$4)',
      [id, user.id, 'new', 'Заявление отправлено в деканат']
    );
    await db.query(
      'INSERT INTO audit_log(actor_id,action,entity_id,metadata) VALUES($1,$2,$3,$4)',
      [user.id, 'request.created', id, JSON.stringify({ kind })]
    );
    await db.query(
      `INSERT INTO notifications(id,user_id,title,body,href)
      SELECT gen_random_uuid(),id,'Новое заявление',$1,$2 FROM users WHERE role='dean' AND active AND faculty_id=$3`,
      [
        `${user.full_name} · ${requestKinds[kind as RequestKind]}`,
        `/requests/${id}`,
        user.faculty_id
      ]
    );
    return id;
  });
}
export async function transitionRequest(
  user: User,
  id: string,
  target: RequestStatus,
  version: number,
  note: string
) {
  if (!isUuid(id) || note.length > 2000 || !Number.isInteger(version))
    error(400, 'Некорректные данные заявления.');
  await transaction(async (db) => {
    const request = await lockRequest(db, user, id, version);
    if (!canTransition(user.role, request.status, target))
      error(409, 'Этот переход статуса недоступен.');
    if (request.awaiting_student && target === 'ready') error(409, 'Дождитесь ответа студента.');
    if (target === 'rejected' && note.trim().length < 5)
      error(400, 'Укажите причину отклонения (минимум 5 символов).');
    const code =
      target === 'ready' && canIssueDocument(request.kind) ? newToken() : request.verification_code;
    await db.query(
      `UPDATE requests SET status=$2,staff_note=$3,version=version+1,updated_at=now(),verification_code=$4,
      awaiting_student=false,
      assigned_to=CASE WHEN $5 THEN $6 ELSE assigned_to END WHERE id=$1`,
      [id, target, note, code, user.role === 'dean', user.id]
    );
    await db.query(
      'INSERT INTO request_events(request_id,actor_id,status,note) VALUES($1,$2,$3,$4)',
      [id, user.id, target, note]
    );
    await db.query(
      'INSERT INTO audit_log(actor_id,action,entity_id,metadata) VALUES($1,$2,$3,$4)',
      [user.id, 'request.status_changed', id, JSON.stringify({ from: request.status, to: target })]
    );
    if (user.role === 'dean')
      await db.query(
        'INSERT INTO notifications(id,user_id,title,body,href) VALUES($1,$2,$3,$4,$5)',
        [
          randomUUID(),
          request.student_id,
          `Заявление №${request.number}: ${statusNames[target].toLowerCase()}`,
          note || 'Откройте заявление, чтобы посмотреть подробности.',
          `/requests/${id}`
        ]
      );
  });
}

export async function updateRequestHandling(
  user: User,
  id: string,
  version: number,
  action: { kind: 'deadline'; day: string } | { kind: 'question'; body: string }
) {
  if (user.role !== 'dean') error(403, 'Заявления обрабатывает деканат.');
  if (!isUuid(id) || !Number.isSafeInteger(version)) error(400, 'Обновите страницу заявления.');
  if (action.kind === 'deadline') {
    if (!isCalendarDate(action.day) || action.day < moscowDay())
      error(400, 'Выберите сегодня или будущую дату.');
  } else if (action.body.length < 2 || action.body.length > 1200) {
    error(400, 'Напишите вопрос от 2 до 1200 символов.');
  }

  await transaction(async (db) => {
    const request = await lockRequest(db, user, id, version);
    if (!canHandleRequest(request.status)) error(409, 'Обработка заявления уже завершена.');
    let title: string;
    let note: string;
    let status = request.status;
    let href = '/requests/' + id;
    if (action.kind === 'deadline') {
      if (request.due_on === action.day) return;
      note = 'Срок ответа — ' + fullDate(action.day);
      title = 'Назначен срок ответа';
      await db.query(
        'UPDATE requests SET due_on=$2,version=version+1,updated_at=now() WHERE id=$1',
        [id, action.day]
      );
    } else {
      if (request.awaiting_student) error(409, 'Вопрос уже отправлен. Ответ появится в переписке.');
      const {
        rows: [messages]
      } = await db.query<{ count: number }>(
        'SELECT count(*)::int count FROM request_messages WHERE request_id=$1',
        [id]
      );
      if (messages.count >= conversationLimit - 1)
        error(409, 'В переписке уже нет места для вопроса и ответа.');
      status = 'in_progress';
      note = 'Деканат попросил уточнить заявление.';
      title = 'Деканат ждёт ответа';
      href += '#request-conversation';
      await db.query(
        `UPDATE requests SET status='in_progress',awaiting_student=true,assigned_to=$2,
         version=version+1,updated_at=now() WHERE id=$1`,
        [id, user.id]
      );
      await db.query(
        'INSERT INTO request_messages(request_id,sender_id,submission_id,body) VALUES($1,$2,$3,$4)',
        [id, user.id, randomUUID(), action.body]
      );
    }
    await db.query(
      'INSERT INTO request_events(request_id,actor_id,status,note) VALUES($1,$2,$3,$4)',
      [id, user.id, status, note]
    );
    await db.query('INSERT INTO audit_log(actor_id,action,entity_id) VALUES($1,$2,$3)', [
      user.id,
      action.kind === 'deadline' ? 'request.deadline_set' : 'request.question_sent',
      id
    ]);
    await db.query('INSERT INTO notifications(id,user_id,title,body,href) VALUES($1,$2,$3,$4,$5)', [
      randomUUID(),
      request.student_id,
      title,
      note,
      href
    ]);
  });
}
