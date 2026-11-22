import type { User } from '#modules/auth/auth.types.ts';
import { lessons } from '#modules/academics/server/academic.repository.server.ts';
import { studentAttendance } from '#modules/academics/server/attendance.repository.server.ts';
import { countAttendance } from '#modules/academics/student-progress.policy.ts';
import { readyStudentRequests } from '#modules/requests/server/ready-requests.repository.server.ts';
import { suggestRequestTemplate } from '#modules/requests/request-templates.labels.ts';
import { requestKinds } from '#modules/requests/request.labels.ts';
import { fullDate, time } from '#shared/formatting.ts';
import {
  studyGrades,
  studyAssessments
} from '#modules/study-plan/server/study-plan.repository.server.ts';
import { DAY_MS, PASSING_SCORE } from '#modules/study-plan/study-plan.policy.ts';
import type { ChatSource } from '../assistant.types.ts';

const schedule = { id: 'schedule', title: 'Расписание', href: '/schedule' };

export async function cabinetFact(
  user: User,
  question: string
): Promise<{ text: string; sources: ChatSource[] } | null> {
  if (user.role !== 'student') return null;
  const draft = suggestRequestTemplate(question.trim());
  if (draft) {
    return {
      text: draft.template
        ? 'Черновик готов. Проверьте текст, добавьте детали и подтвердите отправку в форме.'
        : 'Выберите вид справки. Кабинет заполнит черновик на основе шаблона.',
      sources: [
        {
          id: 'request-draft',
          title: draft.selected ? 'Открыть черновик' : 'Выбрать справку',
          href: draft.selected
            ? '/requests/templates?type=' + draft.selected
            : '/requests/templates'
        }
      ]
    };
  }
  const text = question
    .toLocaleLowerCase('ru-RU')
    .trim()
    .replace(/[.!?]+$/, '')
    .trim();
  if (
    /^что у меня (?:важного|срочного) на ближайшую неделю(?:[.?!]\s*(?:помоги составить план подготовки)?)?$/u.test(
      text
    )
  ) {
    const now = Date.now();
    const [grades, assessments] = await Promise.all([studyGrades(user), studyAssessments(user)]);
    const deadlines = assessments
      .filter((item) => Date.parse(item.starts_at) <= now + 7 * DAY_MS)
      .slice(0, 4)
      .map((item) => {
        const status = item.marked_ready ? ' · готовность отмечена' : '';
        return `${item.subject}: ${item.kind === 'exam' ? 'экзамен' : 'зачёт'} ${fullDate(item.starts_at)}${status}`;
      });
    const low = grades
      .filter((item) => item.points < PASSING_SCORE)
      .slice(0, 4)
      .map((item) => `${item.subject} (${item.points} из 100)`);
    const lines = [
      'План на ближайшие семь дней:',
      ...deadlines,
      ...(deadlines.length ? [] : ['Аттестаций на ближайшие семь дней пока нет.']),
      ...(low.length ? [`Сверьте работы и уточните, как добрать баллы: ${low.join(', ')}.`] : [])
    ];
    return {
      text: lines.join('\n'),
      sources: [{ id: 'preparation', title: 'План подготовки', href: '/assistant/study-plan' }]
    };
  }
  const exam =
    /^(?:когда|во сколько) (?:у меня )?ближайший экзамен(?: и по какой дисциплине)?$/u.test(text);
  const upcoming = /^какие (?:у меня )?(?:ближайшие|следующие) (?:занятия|пары)(?: у меня)?$/u.test(
    text
  );
  if (exam || upcoming) {
    const now = Date.now();
    const records = (await lessons(user))
      .filter((lesson) => Date.parse(lesson.ends_at) > now && (!exam || lesson.kind === 'exam'))
      .slice(0, exam ? 1 : 3);
    if (!records.length)
      return {
        text: exam
          ? 'Ближайший экзамен пока не указан в расписании.'
          : 'Ближайших занятий пока нет в расписании.',
        sources: [schedule]
      };
    const lines = records.map(
      (lesson) =>
        `${lesson.subject}: ${fullDate(lesson.starts_at)}, ${time(lesson.starts_at)}–${time(lesson.ends_at)} (МСК), ${lesson.room}.`
    );
    return {
      text: (exam ? 'Ближайший экзамен:\n' : 'Ближайшие занятия:\n') + lines.join('\n'),
      sources: [schedule]
    };
  }
  if (/^какие (?:мои )?(?:документы|справки) готовы(?: к выдаче)?$/u.test(text)) {
    const ready = await readyStudentRequests(user);
    const lines = ready.items.map(
      (item) => `${requestKinds[item.kind]}, заявление №${item.number}.`
    );
    return {
      text: ready.count
        ? [
            'К выдаче:',
            ...lines,
            ...(ready.count > ready.items.length
              ? ['Остальные справки есть в списке заявлений.']
              : [])
          ].join('\n')
        : 'Готовых к выдаче документов пока нет.',
      sources: [{ id: 'requests', title: 'Мои заявления', href: '/requests' }]
    };
  }
  if (/^есть ли у меня пропуски(?: занятий)?$/u.test(text)) {
    const counts = countAttendance(await studentAttendance(user));
    return {
      text: `Посещаемость за последние 30 дней. Пропуски: ${counts.absent}. По уважительной причине: ${counts.excused}. Занятий без отметки: ${counts.unmarked}.`,
      sources: [{ id: 'attendance', title: 'Посещаемость', href: '/schedule/attendance' }]
    };
  }
  return null;
}
