<script lang="ts">
  import { portalHref } from '#shared/portal-paths.ts';
  import type { Grade } from '#modules/academics/academic.types.ts';
  import { lessonKinds } from '#modules/academics/academic.labels.ts';
  import { scheduleDay, scheduleHref } from '#modules/academics/schedule-navigation.ts';
  import { roomDirections } from '#modules/campus/campus-links.ts';
  import { requestKinds } from '#modules/requests/request.labels.ts';
  import { DAY_MS, PASSING_SCORE } from '#modules/study-plan/study-plan.policy.ts';
  import { shortDate, time } from '#shared/formatting.ts';
  import Icon from '#shared/ui/Icon.svelte';
  import type { StudentToday } from '../student-today.types.ts';

  interface RowOptions {
    date?: string;
    start?: string;
    end?: string;
    warning?: boolean;
    route?: ReturnType<typeof roomDirections>;
    reason?: string;
  }

  let { home, grades }: { home: StudentToday; grades: Grade[] } = $props();
  const urgent = $derived(
    home.assessments.find(
      (assessment) =>
        !assessment.marked_ready && Date.parse(assessment.starts_at) - home.now <= 7 * DAY_MS
    )
  );
  const lowScores = $derived(
    grades.filter((grade) => grade.points < PASSING_SCORE && grade.subject !== urgent?.subject)
  );
  const changes = $derived(
    home.changes
      .toSorted((a, b) => Number(!!b.overlapping_subject) - Number(!!a.overlapping_subject))
      .slice(0, 2)
  );
  const ready = $derived(home.ready.items[0]);
  const needsReply = $derived(home.ready.needsReply);
  const overdue = $derived(home.ready.overdue);

  function classroom(room: string) {
    return /^\d+$/.test(room) ? 'ауд. ' + room : room;
  }

  function describePrevious(start: string, end: string, room: string, current: string) {
    const date = scheduleDay(start) === scheduleDay(current) ? '' : shortDate(start);
    return [date, time(start) + '–' + time(end), classroom(room)].filter(Boolean).join(', ');
  }
</script>

{#snippet entry(
  href: string,
  label: string,
  title: string,
  details: string[],
  icon: 'file' | 'book' | 'chart' | 'swap' | 'x',
  options: RowOptions = {}
)}
  <li>
    <a
      href={portalHref(href)}
      class="entry"
      class:warning={options.warning}
      class:timed={options.start}
    >
      {#if options.start}
        <span class="action-time">
          <span>{time(options.start)}</span>
          {#if options.end}<small>{time(options.end)}</small>{/if}
        </span>
      {/if}
      <span class="subject-icon blue action-icon"><Icon name={icon} size={19} /></span>
      <span class="action-text">
        <span class="action-title">{title}</span>
        {#each details as detail}
          <span class="action-detail">{detail}</span>
        {/each}
      </span>
      <span class="action-meta">
        {#if options.date}<span>{shortDate(options.date)}</span>{/if}
        <span class="action-label">{label}</span>
      </span>
    </a>
    {#if options.route || options.reason}
      <div class="entry-links">
        {#if options.route}
          <a class="directions" href={portalHref(options.route.href)}>
            <Icon name="pin" size={14} />{options.route.label}
          </a>
        {/if}
        {#if options.reason}
          <details class="change-reason">
            <summary>Причина</summary>
            <p>{options.reason}</p>
          </details>
        {/if}
      </div>
    {/if}
  </li>
{/snippet}

<section
  class="panel actions"
  class:with-times={changes.length > 0 || !!urgent}
  aria-labelledby="today-actions"
>
  <div class="panel-head">
    <h2 id="today-actions">Изменения и сроки</h2>
    <a class="link" href={portalHref('/assistant/study-plan#focus-title')}>
      План подготовки <Icon name="arrow" size={14} />
    </a>
  </div>
  <ul>
    {#each changes as change (change.id)}
      {@const room = classroom(change.room)}
      {@const previous =
        !change.cancelled_at &&
        change.previous_starts_at &&
        change.previous_ends_at &&
        change.previous_room !== null &&
        (change.previous_starts_at !== change.starts_at ||
          change.previous_ends_at !== change.ends_at ||
          change.previous_room !== change.room)
          ? describePrevious(
              change.previous_starts_at,
              change.previous_ends_at,
              change.previous_room,
              change.starts_at
            )
          : null}
      {@render entry(
        scheduleHref(change.id),
        change.cancelled_at
          ? 'Отменено'
          : change.overlapping_subject
            ? 'Пересечение в расписании'
            : 'Расписание изменилось',
        change.subject,
        change.overlapping_subject
          ? [room, 'Пересекается с парой «' + change.overlapping_subject + '»']
          : previous
            ? ['Стало: ' + room, 'Было: ' + previous]
            : [room],
        change.cancelled_at ? 'x' : 'swap',
        {
          date: change.starts_at,
          start: change.starts_at,
          end: change.ends_at,
          warning: !!change.overlapping_subject || !!change.cancelled_at,
          route: change.cancelled_at ? null : roomDirections(change.room, change.from_room),
          reason: change.change_reason
        }
      )}
    {/each}
    {#if needsReply}
      {@render entry(
        '/requests/' + needsReply.id + '#request-conversation',
        'Деканат ждёт ответа',
        requestKinds[needsReply.kind],
        ['Открыть переписку'],
        'file',
        { date: needsReply.updated_at, warning: true }
      )}
    {/if}
    {#if overdue?.due_on}
      {@render entry(
        '/requests/' + overdue.id,
        'Срок ответа прошёл',
        requestKinds[overdue.kind],
        [],
        'file',
        { date: overdue.due_on, warning: true }
      )}
    {/if}
    {#if urgent}
      {@render entry(
        '/assistant/study-plan#assessment-' + urgent.id,
        lessonKinds[urgent.kind],
        urgent.subject,
        [urgent.points === null ? 'Открыть план подготовки' : urgent.points + ' из 100'],
        'book',
        { date: urgent.starts_at, start: urgent.starts_at }
      )}
    {/if}
    {#if ready}
      {@render entry(
        '/requests/' + ready.id + '/document',
        'Документ готов',
        requestKinds[ready.kind],
        ['Открыть справку'],
        'file',
        { date: ready.updated_at }
      )}
    {/if}
    {#if lowScores.length}
      {@render entry(
        '/grades/progress',
        'Успеваемость',
        'Баллы ниже ' + PASSING_SCORE,
        lowScores.slice(0, 2).map((grade) => grade.subject + ' · ' + grade.points + ' из 100'),
        'chart'
      )}
    {/if}
  </ul>
  {#if !changes.length && !urgent && !ready && !lowScores.length && !needsReply && !overdue}
    <p class="action-detail">На этой неделе нет переносов и срочных дел.</p>
  {/if}
</section>

<style>
  .actions {
    container-type: inline-size;
  }
  .panel-head {
    flex-wrap: wrap;
    row-gap: 6px;
  }
  ul {
    display: grid;
    gap: 5px;
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .entry {
    display: grid;
    grid-template-areas: 'icon text meta';
    grid-template-columns: 38px minmax(0, 1fr) minmax(85px, 0.44fr);
    align-items: center;
    gap: 13px;
    min-height: 71px;
    padding: 13px 0;
    color: inherit;
  }
  .with-times .entry {
    grid-template-areas: 'time icon text meta';
    grid-template-columns: 57px 38px minmax(0, 1fr) minmax(85px, 0.48fr);
  }
  .entry:hover .action-title,
  .entry:focus-visible .action-title {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .action-time {
    grid-area: time;
    display: grid;
    align-content: center;
    gap: 4px;
    min-height: 37px;
    border-inline-end: 1px solid #c5bce9;
    font-size: 13px;
    font-weight: 500;
  }
  .action-time small {
    font-size: 11px;
    font-weight: 400;
    color: #686c74;
  }
  .action-icon {
    grid-area: icon;
    width: 38px;
    height: 38px;
  }
  .warning .action-icon {
    color: #852c36;
    background: #fcebee;
  }
  .action-text {
    grid-area: text;
    display: grid;
    gap: 4px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .action-title {
    font-size: 13px;
    font-weight: 500;
    line-height: 1.5;
  }
  .action-detail,
  .action-meta {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.5;
  }
  .action-meta {
    grid-area: meta;
    display: grid;
    gap: 4px;
    text-align: right;
  }
  .action-meta > span:first-child:not(.action-label) {
    font-size: 12px;
  }
  .warning .action-label {
    color: #8a414b;
  }
  .entry-links {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    column-gap: 15px;
    margin: -5px 0 3px 51px;
  }
  .with-times .entry-links {
    margin-inline-start: 121px;
  }
  .directions,
  .change-reason summary {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 44px;
    font-size: 12px;
    color: #4d5270;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .change-reason summary {
    display: list-item;
    cursor: pointer;
    line-height: 44px;
  }
  .change-reason[open] {
    flex-basis: 100%;
  }
  .change-reason p {
    font-size: 12px;
    color: var(--muted);
    padding-bottom: 7px;
  }
  @container (max-width: 410px) {
    .entry,
    .with-times .entry {
      grid-template-areas: 'icon text' 'icon meta';
      grid-template-columns: 34px minmax(0, 1fr);
      column-gap: 12px;
      row-gap: 5px;
    }
    .with-times .entry.timed {
      grid-template-areas: 'icon text' 'icon meta' 'icon time';
    }
    .action-icon {
      align-self: start;
      width: 34px;
      height: 34px;
    }
    .action-time {
      display: flex;
      min-height: 0;
      align-items: baseline;
      border: 0;
      font-size: 11px;
      color: var(--muted);
    }
    .action-time small::before {
      content: '– ';
    }
    .action-meta {
      display: flex;
      flex-wrap: wrap;
      column-gap: 8px;
      text-align: left;
    }
    .with-times .entry-links,
    .entry-links {
      margin-inline-start: 46px;
    }
  }
</style>
