import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const origin = process.env.TEST_ORIGIN;
if (!origin || !process.env.TEST_DATABASE_URL)
  throw new Error('Run tests through npm test, which creates an isolated database.');
const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cookies = {};
async function get(path, cookie) {
  return fetch(origin + path, {
    headers: { Accept: 'text/html', ...(cookie ? { cookie } : {}) },
    redirect: 'manual'
  });
}
async function post(path, values, cookie, requestOrigin = origin) {
  return fetch(origin + path, {
    method: 'POST',
    redirect: 'manual',
    headers: { Accept: 'text/html', Origin: requestOrigin, ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams(values)
  });
}
async function login(account) {
  const response = await post('/login', { email: `${account}@deka.test`, password: 'Deka2026!' });
  assert.equal(response.status, 303, account);
  assert.equal(response.headers.get('location'), '/overview');
  return response.headers.get('set-cookie').split(';')[0];
}

test('A general request can be answered without issuing or publicly verifying a certificate', async () => {
  const student = await login('student'),
    dean = await login('dean'),
    requestId = randomUUID();
  assert.equal(
    (
      await post(
        '/requests/new',
        { id: requestId, kind: 'other', details: 'Уточнение порядка консультации.' },
        student
      )
    ).status,
    303
  );
  assert.equal(
    (
      await post(
        '/requests/' + requestId,
        { status: 'in_progress', version: '1', note: 'Обращение принято.' },
        dean
      )
    ).status,
    200
  );
  assert.equal(
    (
      await post(
        '/requests/' + requestId,
        { status: 'ready', version: '2', note: 'Консультацию можно согласовать с преподавателем.' },
        dean
      )
    ).status,
    200
  );
  assert.equal(
    (await db.query('SELECT verification_code FROM requests WHERE id=$1', [requestId])).rows[0]
      .verification_code,
    null
  );
  assert.equal((await get('/requests/' + requestId + '/document', student)).status, 404);
  assert.doesNotMatch(
    await (await get('/requests/' + requestId, student)).text(),
    new RegExp(requestId + '/document')
  );
  const legacy = randomUUID().replaceAll('-', '') + 'B'.repeat(11);
  await db.query('UPDATE requests SET verification_code=$2 WHERE id=$1', [requestId, legacy]);
  assert.equal((await get('/verify/' + legacy)).status, 404);
});
before(async () => {
  await db.connect();
  for (const account of ['student', 'student2', 'dean', 'teacher', 'admin'])
    cookies[account] = await login(account);
  await db.query('INSERT INTO faculties VALUES($1,$2)', [id(90), 'Другой факультет']);
  await db.query(
    `INSERT INTO users(id,email,password_hash,full_name,role,faculty_id) SELECT $1,$2,password_hash,$3,'dean',$4 FROM users WHERE id=$5`,
    [id(91), 'foreign@deka.test', 'Другой сотрудник', id(90), id(11)]
  );
  cookies.foreign = await login('foreign');
});
after(async () => {
  await db.end();
});

test('Only the assigned faculty can set a due date or ask; a single student reply resumes processing', async () => {
  const requestId = randomUUID();
  const path = '/requests/' + requestId;
  const dueOn = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(
    new Date(Date.now() + 7 * 86_400_000)
  );
  assert.equal(
    (
      await post(
        '/requests/new',
        {
          id: requestId,
          kind: 'study',
          details: 'Справка для поездки на конференцию.'
        },
        cookies.student
      )
    ).status,
    303
  );
  const deadline = { intent: 'deadline', version: '1', dueOn };
  assert.equal((await post(path, deadline, cookies.student)).status, 403);
  assert.equal((await post(path, deadline, cookies.foreign)).status, 404);
  assert.equal((await post(path, { ...deadline, dueOn: '2030-02-30' }, cookies.dean)).status, 400);
  assert.equal((await post(path, deadline, cookies.dean)).status, 200);
  assert.match(await (await get(path, cookies.student)).text(), /Срок ответа/);
  assert.equal((await get(path, cookies.student2)).status, 404);

  const question = { intent: 'question', version: '2', question: 'Куда направить оригинал?' };
  const duplicates = await Promise.all([
    post(path, question, cookies.dean),
    post(path, question, cookies.dean)
  ]);
  assert.deepEqual(duplicates.map((response) => response.status).sort(), [200, 409]);
  assert.match(await (await get(path, cookies.student)).text(), /Деканат ждёт вашего ответа/);
  assert.match(await (await get('/overview', cookies.student)).text(), /Деканат ждёт ответа/);
  assert.doesNotMatch(
    await (await get('/overview', cookies.student2)).text(),
    /Деканат ждёт ответа/
  );
  assert.equal((await post(path, { status: 'ready', version: '3' }, cookies.dean)).status, 409);

  const reply = {
    intent: 'message',
    submissionId: randomUUID(),
    body: 'Пришлите справку в кабинет.'
  };
  const replies = await Promise.all([
    post(path, reply, cookies.student),
    post(path, reply, cookies.student)
  ]);
  assert.deepEqual(
    replies.map((response) => response.status),
    [200, 200]
  );
  const {
    rows: [record]
  } = await db.query(
    'SELECT status, version, awaiting_student, due_on::text FROM requests WHERE id=$1',
    [requestId]
  );
  assert.deepEqual(record, {
    status: 'in_progress',
    version: 4,
    awaiting_student: false,
    due_on: dueOn
  });
  const {
    rows: [count]
  } = await db.query('SELECT count(*)::int total FROM request_messages WHERE request_id=$1', [
    requestId
  ]);
  assert.equal(count.total, 2);
  assert.equal((await post(path, { status: 'ready', version: '4' }, cookies.dean)).status, 200);
  assert.equal((await get(path + '/document', cookies.student)).status, 200);
});

test('A request conversation is private, persists replies and notifies each side once', async () => {
  const requestId = randomUUID();
  const path = '/requests/' + requestId;
  const values = {
    intent: 'message',
    submissionId: randomUUID(),
    body: 'Можно получить справку электронно?'
  };
  assert.equal(
    (
      await post(
        '/requests/new',
        { id: requestId, kind: 'study', details: 'Проверка переписки.' },
        cookies.student
      )
    ).status,
    303
  );
  for (const role of ['student2', 'foreign']) {
    assert.equal((await get(path, cookies[role])).status, 404);
    assert.equal((await post(path, values, cookies[role])).status, 404);
  }
  assert.equal((await post(path, values, cookies.teacher)).status, 403);
  assert.equal((await post(path, values, cookies.student, 'https://outside.invalid')).status, 403);
  const sent = await Promise.all([
    post(path, values, cookies.student),
    post(path, values, cookies.student)
  ]);
  assert.deepEqual(
    sent.map((item) => item.status),
    [200, 200]
  );
  const reply = {
    ...values,
    submissionId: randomUUID(),
    body: 'Да, документ появится в этом заявлении.'
  };
  assert.match(await (await get(path, cookies.dean)).text(), /Можно получить справку электронно/);
  assert.equal((await post(path, reply, cookies.dean)).status, 200);
  assert.match(
    await (await get(path, cookies.student)).text(),
    /документ появится в этом заявлении/
  );
  const messages = await db.query('SELECT body FROM request_messages WHERE request_id=$1', [
    requestId
  ]);
  assert.equal(messages.rowCount, 2);
  const notifications = await db.query(
    'SELECT user_id,body FROM notifications WHERE href=$1 ORDER BY user_id',
    [path + '#request-conversation']
  );
  assert.deepEqual(
    notifications.rows.map((row) => row.user_id),
    [id(10), id(11)]
  );
  assert.ok(notifications.rows.every((row) => ![values.body, reply.body].includes(row.body)));
  assert.equal(
    (await post(path, { status: 'cancelled', version: '1' }, cookies.student)).status,
    200
  );
  assert.match(await (await get(path, cookies.student)).text(), /Переписка закрыта/);
  assert.equal(
    (await post(path, { ...values, submissionId: randomUUID() }, cookies.student)).status,
    409
  );
  assert.equal((await post(path, values, cookies.student)).status, 200);
});

test('SSR routes apply role and data boundaries; personal responses cannot be cached', async () => {
  const anonymous = await get('/overview');
  assert.equal(anonymous.status, 303);
  for (const role of ['student', 'dean', 'teacher', 'admin']) {
    const response = await get('/overview', cookies[role]);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  for (const [role, path] of [
    ['student', '/people'],
    ['student', '/audit'],
    ['teacher', '/requests'],
    ['admin', '/schedule']
  ])
    assert.equal((await get(path, cookies[role])).status, 403, `${role} ${path}`);
  const own = await (await get('/grades', cookies.student)).text();
  assert.match(own, /Архитектура информационных систем/);
  assert.doesNotMatch(own, /Яров Егор Аркадьевич/);
  const teacher = await (await get('/grades', cookies.teacher)).text();
  assert.match(teacher, /Базы данных/);
  assert.doesNotMatch(teacher, /Проектирование интерфейсов/);
});

test('A request moves from student submission to issuance with isolation, concurrency and atomic audit', async () => {
  const requestId = randomUUID();
  const create = () =>
    post(
      '/requests/new',
      {
        id: requestId,
        kind: 'study',
        details: 'Тестовая справка для проверки сквозного сценария.'
      },
      cookies.student
    );
  assert.equal((await create()).status, 303);
  assert.equal((await create()).status, 303);
  assert.equal(
    (await db.query('SELECT count(*) FROM requests WHERE id=$1', [requestId])).rows[0].count,
    '1'
  );
  assert.equal((await get('/requests/' + requestId, cookies.student)).status, 200);
  assert.equal((await get('/requests/' + requestId, cookies.student2)).status, 404);
  assert.equal((await get('/requests/' + requestId, cookies.foreign)).status, 404);
  assert.equal((await get('/requests/not-an-id', cookies.student)).status, 404);
  assert.equal(
    (
      await post(
        '/requests/new',
        { id: randomUUID(), kind: 'toString', details: 'Недопустимый тип обращения' },
        cookies.student
      )
    ).status,
    400
  );
  const update = (status, version, note = '', cookie = cookies.dean) =>
    post('/requests/' + requestId, { status, version: String(version), note }, cookie);
  assert.equal((await update('ready', 1)).status, 409);
  assert.equal((await update('in_progress', 1, '', cookies.student)).status, 409);
  assert.equal((await update('in_progress', 1, '', cookies.foreign)).status, 404);
  assert.equal((await get('/requests/' + requestId + '/document', cookies.student)).status, 409);
  const race = await Promise.all([
    update('in_progress', 1, 'Готовим справку'),
    update('in_progress', 1, 'Повторное действие')
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await update('rejected', 2, 'Нет')).status, 400);
  const before = (await db.query('SELECT status,version FROM requests WHERE id=$1', [requestId]))
    .rows[0];
  assert.deepEqual(before, { status: 'in_progress', version: 2 });
  // Simulate a notification write failure and prove the status, history and audit roll back together.
  const counts = async () =>
    (
      await db.query(
        `SELECT (SELECT count(*) FROM request_events WHERE request_id=$1::uuid) events,(SELECT count(*) FROM audit_log WHERE entity_id=$1::text) audits`,
        [requestId]
      )
    ).rows[0];
  const oldCounts = await counts();
  await db.query(`CREATE FUNCTION test_fail_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Simulated notification failure'; END $$;
    CREATE TRIGGER test_notification_failure BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION test_fail_notification();`);
  try {
    assert.equal((await update('ready', 2, 'Готово')).status, 500);
    assert.deepEqual(
      (await db.query('SELECT status,version FROM requests WHERE id=$1', [requestId])).rows[0],
      before
    );
    assert.deepEqual(await counts(), oldCounts);
  } finally {
    await db.query(
      'DROP TRIGGER test_notification_failure ON notifications; DROP FUNCTION test_fail_notification()'
    );
  }
  assert.equal((await update('ready', 2, 'Справка готова. Кабинет 204.')).status, 200);
  const issued = (await db.query('SELECT * FROM requests WHERE id=$1', [requestId])).rows[0];
  assert.equal(issued.status, 'ready');
  assert.equal(issued.verification_code.length, 43);
  const document = await get('/requests/' + requestId + '/document', cookies.student);
  assert.equal(document.status, 200);
  assert.match(await document.text(), /Лазурин Александр Никитич/);
  const verified = await get('/verify/' + issued.verification_code);
  assert.equal(verified.status, 200);
  const publicHtml = await verified.text();
  assert.match(publicHtml, /Документ найден/);
  assert.doesNotMatch(publicHtml, /Лазурин Александр Никитич|ИС-23/);
  assert.equal((await get('/verify/invalid')).status, 404);
  assert.equal((await update('done', 3)).status, 200);
  assert.equal((await update('ready', 3)).status, 409);
  assert.equal((await counts()).events, '4');
  assert.equal((await counts()).audits, '4');
  const notification = await db.query(
    'SELECT count(*) FROM notifications WHERE user_id=$1 AND href=$2',
    [id(10), '/requests/' + requestId]
  );
  assert.equal(notification.rows[0].count, '3');
});

test('Production checks Origin and logout revokes a session on the server', async () => {
  assert.equal(
    (await post('/logout', {}, cookies.student, 'https://untrusted.example')).status,
    403
  );
  const signedIn = await post('/login', { email: 'student@deka.test', password: 'Deka2026!' });
  const header = signedIn.headers.get('set-cookie');
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=Lax/i);
  const cookie = header.split(';')[0];
  assert.equal((await post('/logout', {}, cookie)).status, 303);
  assert.equal((await get('/overview', cookie)).status, 303);
});

test('The request list searches beyond 200 records and preserves ownership and faculty scope', async () => {
  const sample = randomUUID();
  const fixedDate = randomUUID();
  try {
    const {
      rows: [oldest]
    } = await db.query(
      "INSERT INTO requests(id,student_id,faculty_id,kind,details,status,created_at) VALUES($1,$2,$3,'tax',$4,'done',now()-interval '1 year') RETURNING number",
      [sample, id(10), id(1), fixedDate]
    );
    await db.query(
      "INSERT INTO requests(id,student_id,faculty_id,kind,details,status) SELECT gen_random_uuid(),$1,$2,'study',$3,'new' FROM generate_series(1, 205)",
      [id(10), id(1), fixedDate]
    );
    const first = await (await get('/requests', cookies.student)).text();
    assert.match(first, /Страница 1/);
    assert.match(first, /href="\/requests\?page=2"/);
    assert.ok(!first.includes('/requests/' + sample));
    const ninth = await (await get('/requests?page=9', cookies.student)).text();
    assert.ok(ninth.includes('/requests/' + sample));
    const exact = new URLSearchParams({
      q: '№ ' + String(oldest.number).padStart(6, '0'),
      filter: 'done'
    });
    const match = await get('/requests?' + exact, cookies.student);
    assert.equal(match.status, 200);
    assert.ok((await match.text()).includes('/requests/' + sample));
    const title = new URLSearchParams({ q: 'СПРАВКА ДЛЯ НАЛОГОВОЙ', filter: 'done' });
    assert.ok(
      (await (await get('/requests?' + title, cookies.dean)).text()).includes('/requests/' + sample)
    );
    for (const role of ['student2', 'foreign']) {
      const body = await (await get('/requests?' + exact, cookies[role])).text();
      assert.match(body, /Заявлений не найдено/);
      assert.ok(!body.includes('/requests/' + sample));
    }
  } finally {
    await db.query('DELETE FROM requests WHERE details=$1', [fixedDate]);
  }
});
