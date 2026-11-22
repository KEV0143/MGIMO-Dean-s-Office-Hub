<script lang="ts">
  import { portalHref } from '#shared/portal-paths.ts';
  import type { ApplicationData } from '#application/application.types.ts';
  import { scheduleDay, scheduleHref } from '#modules/academics/schedule-navigation.ts';
  import { lessonKinds } from '#modules/academics/academic.labels.ts';
  import { roomMapHref } from '#modules/campus/campus-links.ts';
  import { shortDate, time } from '#shared/formatting.ts';
  import Icon from '#shared/ui/Icon.svelte';
  import type { OverviewData } from '../overview.types.ts';
  import type { StudentToday } from '../student-today.types.ts';
  import StudentTodayActions from './StudentTodayActions.svelte';
  import OverviewAnnouncements from './OverviewAnnouncements.svelte';
  import StudentTodayDetails from './StudentTodayDetails.svelte';
  import RecentRequests from './RecentRequests.svelte';
  import UpcomingLessons from './UpcomingLessons.svelte';

  let { data, home }: { data: OverviewData & ApplicationData; home: StudentToday } = $props();

  const moscowDate = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Moscow'
  });
  const date = $derived(moscowDate.format(home.now));
  const next = $derived(data.schedule[0]);
  const happeningNow = $derived(next && Date.parse(next.starts_at) <= home.now);
  const sameDay = $derived(next && scheduleDay(next.starts_at) === scheduleDay(home.now));
  const map = $derived(next && roomMapHref(next.room));
</script>

<svelte:head><title>Сегодня · Дека</title></svelte:head>

<div class="page-head today-heading">
  <div>
    <h1>Сегодня</h1>
    <p>{date}{data.user.group_name ? ' · ' + data.user.group_name : ''}</p>
  </div>
  <a class="btn new-request" href={portalHref('/requests/templates')}>
    <Icon name="plus" size={18} /> Подать заявление
  </a>
</div>

<div class="stack">
  <div class="today-grid">
    <div class="today-column">
      <section class="next-lesson" aria-labelledby="next-lesson-title">
        {#if next}
          <div class="next-meta">
            <span
              ><Icon name="clock" size={17} />
              {happeningNow ? 'Занятие идёт' : 'Следующее занятие'}</span
            >
            <span>{sameDay ? 'Сегодня' : shortDate(next.starts_at)}</span>
          </div>
          <p class="slot">{time(next.starts_at)}–{time(next.ends_at)} <span>МСК</span></p>
          <h2 id="next-lesson-title">{next.subject}</h2>
          <p class="lesson-meta">{lessonKinds[next.kind]} · {next.teacher}</p>
          <div class="lesson-actions">
            {#if map}
              <a
                class="btn lesson-primary"
                href={portalHref(map)}
                aria-label={'Маршрут до аудитории ' + next.room}
                ><Icon name="pin" size={18} /> {next.room}</a
              >
            {:else}
              <span class="lesson-room"><Icon name="pin" size={18} /> {next.room}</span>
            {/if}
            <a class="btn lesson-secondary" href={portalHref(scheduleHref(next.id))}>
              Подробности <Icon name="arrow" size={16} />
            </a>
          </div>
        {:else}
          <div class="next-meta"><span><Icon name="calendar" size={17} /> Расписание</span></div>
          <h2 id="next-lesson-title">Ближайших занятий пока нет</h2>
          <p class="lesson-meta">Новые занятия появятся здесь после публикации расписания.</p>
          <div class="lesson-actions">
            <a class="btn lesson-primary" href={portalHref('/schedule')}
              >Открыть расписание <Icon name="arrow" size={16} /></a
            >
          </div>
        {/if}
      </section>
      {#if data.schedule.length > 1}
        <div class="more-lessons"><UpcomingLessons {data} skipFirst /></div>
      {/if}
    </div>
    <div class="today-column">
      <StudentTodayActions {home} grades={data.grades} />
    </div>
  </div>

  <RecentRequests {data} />
  <StudentTodayDetails {home} />
  <OverviewAnnouncements {data} />
</div>

<style>
  .today-heading h1 {
    font-size: clamp(29px, 4vw, 40px);
    line-height: 1.08;
  }
  .today-heading p {
    text-transform: none;
  }
  .today-heading p::first-letter {
    text-transform: uppercase;
  }
  .today-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.18fr) minmax(0, 1fr);
    gap: 20px;
    align-items: stretch;
  }
  .today-column {
    display: grid;
    gap: 20px;
    min-width: 0;
  }
  .today-column:has(.more-lessons) {
    grid-template-rows: auto 1fr;
  }
  .more-lessons {
    display: grid;
  }
  .today-heading > div {
    min-width: 0;
  }
  .next-lesson {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 280px;
    padding: clamp(20px, 3vw, 35px);
    color: #252a39;
    background: #f9fafc;
    border: 1px solid var(--border);
    border-radius: 16px;
  }
  .next-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px 12px;
    flex-wrap: wrap;
    color: var(--muted);
    font-size: 13px;
  }
  .next-meta span {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .next-lesson h2 {
    font-size: clamp(20px, 3vw, 30px);
    line-height: 1.16;
    overflow-wrap: anywhere;
    margin-top: 5px;
    color: #252a39;
  }
  .slot {
    margin-top: 20px;
    font-size: clamp(26px, 4vw, 42px);
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
  }
  .slot span {
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--muted);
  }
  .lesson-meta {
    color: var(--muted);
    margin-top: 9px;
    line-height: 1.5;
  }
  .lesson-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 20px;
  }
  .lesson-room {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .lesson-actions .btn {
    min-height: 44px;
    overflow-wrap: anywhere;
    white-space: normal;
    text-align: left;
  }
  .lesson-primary {
    background: #edf0f7;
    color: #41496a;
    border-color: #edf0f7;
  }
  .lesson-primary:hover {
    background: #e4e9f3;
    color: #303a56;
  }
  .lesson-secondary {
    background: transparent;
    border-color: transparent;
    color: #41496a;
  }
  .lesson-secondary:hover {
    background: #eef1f6;
    color: #303a56;
  }
  @media (max-width: 1050px) {
    .today-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .today-column:has(.more-lessons) {
      grid-template-rows: auto;
    }
    .more-lessons {
      display: none;
    }
  }
  @media (max-width: 600px) {
    .today-grid,
    .today-column {
      gap: 14px;
    }
    .next-lesson {
      min-height: 0;
    }
    .today-heading .new-request {
      min-height: 44px;
    }
  }
  @media (max-width: 350px) {
    .today-heading {
      display: grid;
      gap: 12px;
    }
    .today-heading .new-request {
      justify-self: start;
    }
  }
</style>
