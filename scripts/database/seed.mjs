import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { hashPassword, newToken } from '#server/security/credentials.mjs';
import { sampleScenario } from './sample-scenario.mjs';
import { previewAccounts } from '#modules/auth/preview-accounts.ts';

const contest = process.env.CONTEST_MODE === 'true';
const local = process.env.DEMO_MODE === 'true';
if (contest === local) throw new Error('Set exactly one of DEMO_MODE or CONTEST_MODE to true.');

const contestPasswords = new Map(
  ['student', 'student2', 'dean'].map((name) => [
    name,
    process.env['CONTEST_' + name.toUpperCase() + '_PASSWORD']
  ])
);
if (contest) {
  const origin = new URL(process.env.ORIGIN ?? '');
  const passwords = [...contestPasswords.values()];
  if (origin.protocol !== 'https:' || origin.origin !== process.env.ORIGIN)
    throw new Error('Contest seed requires a canonical HTTPS ORIGIN.');
  if (
    passwords.some((password) => !password || !/^[a-fA-F0-9]{40,128}$/.test(password)) ||
    new Set(passwords.map((password) => password?.toLowerCase())).size !== passwords.length
  )
    throw new Error('Generate distinct contest passwords as directed in docs/deployment.md.');
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await db.connect();
try {
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(882705102)');
  if ((await db.query('SELECT 1 FROM users LIMIT 1')).rowCount) {
    if (contest) throw new Error('Contest seed requires a fresh database.');
    console.log('Database already has users. Demo seed skipped; no data changed.');
    await db.query('ROLLBACK');
  } else {
    await db.query('INSERT INTO faculties VALUES($1,$2)', [
      id(1),
      'Факультет информационных технологий'
    ]);
    await db.query('INSERT INTO study_groups VALUES($1,$2,$3,$4,$5)', [
      id(2),
      id(1),
      'ИС-23',
      3,
      'Информационные системы и технологии'
    ]);
    const students = previewAccounts.filter((account) => account.role === 'student');
    const users = [
      [10, students[0].code, students[0].name, students[0].role],
      [11, 'dean', 'Елена Воронцова', 'dean'],
      [12, 'teacher', 'Михаил Соколов', 'teacher'],
      [13, 'admin', 'Ирина Лебедева', 'admin'],
      [14, students[1].code, students[1].name, students[1].role],
      [15, students[2].code, students[2].name, students[2].role],
      [16, 'teacher2', 'Ольга Смирнова', 'teacher']
    ];
    for (const [n, email, name, role] of users)
      await db.query(
        'INSERT INTO users(id,email,password_hash,full_name,role,faculty_id,group_id,contest_access) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          id(n),
          `${email}@deka.test`,
          await hashPassword(local ? 'Deka2026!' : (contestPasswords.get(email) ?? newToken())),
          name,
          role,
          id(1),
          role === 'student' ? id(2) : null,
          contest && contestPasswords.has(email)
        ]
      );
    const subjects = [
      [20, 'Архитектура информационных систем', 'Архитектура ИС', 'violet'],
      [21, 'Базы данных', 'Базы данных', 'blue'],
      [22, 'Проектирование интерфейсов', 'Интерфейсы', 'orange'],
      [23, 'Информационная безопасность', 'Инфобезопасность', 'green']
    ];
    for (const [n, name, short, color] of subjects) {
      await db.query('INSERT INTO subjects VALUES($1,$2,$3,$4)', [id(n), name, short, color]);
      await db.query('INSERT INTO teaching_assignments VALUES($1,$2,$3)', [
        id(n < 22 ? 12 : 16),
        id(n),
        id(2)
      ]);
    }
    for (const [student, points] of [
      [10, [48, 62, 91, 53]],
      [14, [95, 91, 87, 89]],
      [15, [79, 84, 90, 75]]
    ]) {
      for (let i = 0; i < 4; i++)
        await db.query(
          'INSERT INTO grades(student_id,subject_id,teacher_id,points,updated_by) VALUES($1,$2,$3,$4,$5)',
          [id(student), id(20 + i), id(i < 2 ? 12 : 16), points[i], id(11)]
        );
    }
    for (const [n, kind, status, details, days] of [
      [30, 'study', 'in_progress', 'Для предоставления по месту требования.', 2],
      [31, 'scholarship', 'ready', 'Для оформления социальной выплаты.', 5]
    ]) {
      await db.query(
        `INSERT INTO requests(id,student_id,faculty_id,kind,details,status,assigned_to,verification_code,staff_note,created_at,updated_at,due_on)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()-$10::int*interval '1 day',now()-interval '1 hour',
           CASE WHEN $6='in_progress' THEN (now() AT TIME ZONE 'Europe/Moscow')::date+2 END)`,
        [
          id(n),
          id(10),
          id(1),
          kind,
          details,
          status,
          id(11),
          status === 'ready' ? newToken() : null,
          status === 'ready'
            ? 'Справка готова. Можно получить в кабинете 204.'
            : 'Справку можно будет скачать из этого заявления.',
          days
        ]
      );
      await db.query(
        'INSERT INTO request_events(request_id,actor_id,status,note) VALUES($1,$2,$3,$4)',
        [
          id(n),
          id(11),
          status,
          status === 'ready' ? 'Документ подготовлен' : 'Заявление принято в работу'
        ]
      );
    }
    await db.query('INSERT INTO notifications(id,user_id,title,body,href) VALUES($1,$2,$3,$4,$5)', [
      randomUUID(),
      id(10),
      'Ваша справка готова',
      'Справку о стипендии можно получить в деканате или открыть в личном кабинете.',
      `/requests/${id(31)}`
    ]);
    for (const [title, body, tag] of [
      [
        'Открыта запись на проектный интенсив',
        'Соберите команду и предложите решение для университета. Условия участия уточняйте у организаторов.',
        'Возможности'
      ],
      [
        'Опубликовано расписание аттестаций',
        'Проверьте текущие баллы и обсудите задолженности с преподавателями заранее.',
        'Учёба'
      ],
      [
        'Деканат на связи',
        'Мы работаем по будням с 9:00 до 17:00. Кабинет 204, главный корпус.',
        'Деканат'
      ]
    ])
      await db.query('INSERT INTO announcements VALUES($1,$2,$3,$4,$5)', [
        randomUUID(),
        id(1),
        title,
        body,
        tag
      ]);
    await sampleScenario(db, id, contest ? 14 : 15);
    await db.query(
      `INSERT INTO request_messages(request_id,sender_id,submission_id,body,created_at)
       VALUES($1,$2,$3,$4,now()-interval '2 hours'),($1,$5,$6,$7,now()-interval '1 hour')`,
      [
        id(30),
        id(10),
        randomUUID(),
        'Можно будет открыть справку в кабинете, когда она будет готова?',
        id(11),
        randomUUID(),
        'Да. Когда справка будет готова, в заявлении появится кнопка «Открыть документ».'
      ]
    );
    await db.query('COMMIT');
    console.log('Demo data created. Existing data is never reset by this script.');
  }
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
} finally {
  await db.end();
}
