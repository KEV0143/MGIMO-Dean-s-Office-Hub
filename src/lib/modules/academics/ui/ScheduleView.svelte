<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import Icon from '#shared/ui/Icon.svelte';
  import { shortDate, time } from '#shared/formatting.ts';
  import {
    addScheduleDays,
    lessonIdFromHash,
    scheduleDate,
    scheduleDay,
    scheduleHref,
    scheduleWeek
  } from '../schedule-navigation.ts';
  import { lessonKinds } from '#modules/academics/academic.labels.ts';
  import { roomDirections, roomMapHref } from '#modules/campus/campus-links.ts';
  type PageProps = {
    data: {
      lessons: import('../academic.types').Lesson[];
      today: string;
      selectedDate: string | null;
      selectedLesson: string | null;
      outsideWeek: string | null;
      missingLesson: boolean;
    } & import('#application/application.types.ts').ApplicationData;
  };
  let { data }: PageProps = $props();
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' });
  const fullDate = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  });
  afterNavigate(({ to }) => {
    if (!to || to.url.pathname !== '/schedule' || to.url.searchParams.has('lesson')) return;
    const id = lessonIdFromHash(to.url.hash);
    if (id) void goto(scheduleHref(id), { replace: true });
  });
  const firstWeek = $derived(data.outsideWeek ?? scheduleWeek(data.today));
  const lastWeek = $derived(data.outsideWeek ?? scheduleWeek(addScheduleDays(data.today, 30)));
  const initialDay = $derived(
    data.selectedDate &&
      (data.outsideWeek ||
        (data.selectedDate >= firstWeek && data.selectedDate <= addScheduleDays(data.today, 30)))
      ? data.selectedDate
      : data.today
  );
  let weekChoice = $state('');
  let dayChoice = $state('');
  const week = $derived(
    weekChoice >= firstWeek && weekChoice <= lastWeek ? weekChoice : scheduleWeek(initialDay)
  );
  const days = $derived(Array.from({ length: 7 }, (_, index) => addScheduleDays(week, index)));
  const selectedDay = $derived(
    days.includes(dayChoice) ? dayChoice : days.includes(initialDay) ? initialDay : week
  );
  const byDay = $derived.by(() => {
    const grouped: Record<string, typeof data.lessons> = {};
    for (const lesson of data.lessons) {
      const day = scheduleDay(lesson.starts_at);
      (grouped[day] ??= []).push(lesson);
    }
    return grouped;
  });
  const displayed = $derived(byDay[selectedDay] ?? []);
  const activeCount = $derived(displayed.filter((lesson) => !lesson.cancelled_at).length);
  const dayName = (value: string) => weekday.format(scheduleDate(value));
  const dateName = (value: string) => fullDate.format(scheduleDate(value));
  function today() {
    weekChoice = firstWeek;
    dayChoice = data.today;
  }
</script>

<svelte:head><title>Расписание · Дека</title></svelte:head>
<div class="page-head">
  <div>
    <h1>Расписание</h1>
    <p>
      {data.user.role === 'student'
        ? [data.user.group_name, data.user.program].filter(Boolean).join(' · ')
        : data.user.role === 'teacher'
          ? 'Ваши занятия и закреплённые группы'
          : 'Занятия вашего факультета'}
    </p>
  </div>
  <div class="row wrap">
    <a class="btn secondary" href="/schedule/calendar"
      ><Icon name="download" size={16} />В календарь</a
    >{#if data.user.role === 'dean'}<a class="btn" href="/academics/manage?tab=schedule"
        ><Icon name="settings" size={16} />Управление</a
      >{/if}
  </div>
</div>
<div class="stack">
  {#if data.missingLesson}
    <p class="panel muted" role="status">Занятие из ссылки недоступно.</p>
  {/if}
  <section class="panel day-picker">
    <div class="panel-head">
      <div>
        <h2>Неделя</h2>
        <p>{dateName(week)} – {dateName(days[6])}</p>
      </div>
      <div class="row week-navigation">
        {#if data.outsideWeek}
          <a class="btn secondary" href="/schedule">Сегодня</a>
        {:else}
          <button class="btn secondary" onclick={today}>Сегодня</button>
        {/if}
        <button
          class="icon-btn"
          aria-label="Предыдущая неделя"
          disabled={week <= firstWeek}
          onclick={() => (weekChoice = addScheduleDays(week, -7))}>‹</button
        >
        <button
          class="icon-btn"
          aria-label="Следующая неделя"
          disabled={week >= lastWeek}
          onclick={() => (weekChoice = addScheduleDays(week, 7))}>›</button
        >
      </div>
    </div>
    <div class="days">
      {#each days as day (day)}
        <button
          class:chosen={selectedDay === day}
          aria-pressed={selectedDay === day}
          aria-current={day === data.today ? 'date' : undefined}
          aria-label={dateName(day)}
          data-has-lessons={!!byDay[day]?.length}
          onclick={() => (dayChoice = day)}
        >
          <span>{dayName(day)}</span><strong>{Number(day.slice(-2))}</strong>
          <small>{byDay[day]?.length ? byDay[day].length + ' зан.' : '—'}</small>
        </button>
      {/each}
    </div>
  </section>
  {#if selectedDay}<section class="panel">
      <div class="panel-head">
        <h2 class="day-heading">{dayName(selectedDay)}, {dateName(selectedDay)}</h2>
        <span class="pill">Занятий: {activeCount}</span>
      </div>
      {#if !displayed.length}
        <div class="empty">
          <Icon name="calendar" size={30} />
          <h3>На этот день занятий нет</h3>
        </div>
      {/if}
      <div class="lessons">
        {#each displayed as lesson, i (lesson.id)}
          {@const previousRoom = displayed
            .slice(0, i)
            .findLast(
              (item) =>
                !item.cancelled_at && Date.parse(item.ends_at) <= Date.parse(lesson.starts_at)
            )?.room}
          {@const route = lesson.cancelled_at ? null : roomMapHref(lesson.room, previousRoom)}
          {@const directions =
            route && lesson.rescheduled_at ? roomDirections(lesson.room, previousRoom) : null}
          <article
            id={'lesson-' + lesson.id}
            class="lesson"
            class:cancelled={!!lesson.cancelled_at}
            class:linked={data.selectedLesson === lesson.id}
          >
            <div class="times">
              <strong>{time(lesson.starts_at)}</strong><span>{time(lesson.ends_at)}</span><small
                >{i + 1} пара</small
              >
            </div>
            <div class="lesson-card {lesson.color}">
              <div class="row between wrap">
                <div class="row wrap">
                  <span class="pill">{lessonKinds[lesson.kind]}</span>
                  {#if lesson.cancelled_at}<span class="lesson-change cancelled-label"
                      >Отменено</span
                    >
                  {:else if lesson.rescheduled_at}<span class="lesson-change">Перенос</span>{/if}
                </div>
                {#if route}<a
                    class="room room-link"
                    href={route}
                    aria-label={'Маршрут до ' + lesson.room}
                    ><Icon name="pin" size={15} />{lesson.room}</a
                  >
                {:else}<span class="room"><Icon name="building" size={15} />{lesson.room}</span
                  >{/if}
              </div>
              <h3>{lesson.subject}</h3>
              <p>{lesson.teacher}</p>
              {#if !lesson.cancelled_at && lesson.previous_starts_at && lesson.previous_ends_at && lesson.previous_room}
                <p class="lesson-note">
                  Было: {shortDate(lesson.previous_starts_at)}, {time(
                    lesson.previous_starts_at
                  )}–{time(lesson.previous_ends_at)}, {lesson.previous_room}
                </p>
              {/if}
              {#if lesson.change_reason && lesson.rescheduled_at && !lesson.cancelled_at}
                <p class="lesson-note">{lesson.change_reason}</p>
              {/if}
              <div class="row between wrap">
                <span class="group"><Icon name="users" size={14} />{lesson.group_name}</span
                >{#if lesson.note}<span class="lesson-note">{lesson.note}</span>{/if}
              </div>
              {#if directions}
                <a class="room-link moved-directions" href={directions.href}>
                  <Icon name="pin" size={15} />
                  {directions.label}
                </a>
              {/if}
            </div>
          </article>{/each}
      </div>
    </section>{/if}
</div>

<style>
  .week-navigation {
    gap: 5px;
  }
  .week-navigation .icon-btn {
    min-width: 44px;
    min-height: 44px;
    font-size: 22px;
  }
  .week-navigation .icon-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .lesson-change {
    color: #704318;
    background: #fff0da;
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 650;
  }
  .cancelled-label {
    color: #8d3240;
    background: #fbe9ed;
  }
  .cancelled .lesson-card {
    border-left-color: #d88793;
  }
  .cancelled .times strong {
    text-decoration: line-through;
  }
  .days {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding: 3px 3px 8px;
  }
  .days button {
    min-width: 85px;
    display: grid;
    gap: 4px;
    text-align: center;
    justify-items: center;
    background: #f7f8fb;
    padding: 13px 18px;
    border-radius: 12px;
    color: #686c77;
    border: 1px solid transparent;
  }
  .days button.chosen {
    background: #f0ecfc;
    border-color: #d9d0f2;
    color: #64549f;
  }
  .days button span {
    text-transform: uppercase;
    font-size: 12px;
  }
  .days button strong {
    font-family: Manrope, sans-serif;
    font-size: 23px;
    font-weight: 600;
    color: #65657c;
  }
  .days button small {
    font-size: 12px;
  }
  .day-heading::first-letter {
    text-transform: uppercase;
  }
  .lessons {
    display: grid;
    gap: 20px;
  }
  .lesson {
    display: flex;
    gap: 26px;
    scroll-margin-top: 92px;
  }
  .lesson.linked .lesson-card,
  .lesson:target .lesson-card {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
  }
  .times {
    width: 52px;
    flex-shrink: 0;
    display: grid;
    align-content: start;
    gap: 5px;
    padding-top: 20px;
  }
  .times strong {
    font-size: 15px;
    font-weight: 500;
  }
  .times span {
    font-size: 13px;
    color: #676c76;
  }
  .times small {
    font-size: 12px;
    color: #6a6c73;
    margin-top: 10px;
  }
  .lesson-card {
    border: 1px solid #e7e2f3;
    border-left: 3px solid #b4a4dd;
    background: #fcfbff;
    border-radius: 12px;
    flex: 1;
    padding: 19px 23px;
    min-width: 0;
  }
  .lesson-card.blue {
    border-color: #e1e9f5;
    border-left-color: #a1badf;
    background: #fbfdff;
  }
  .lesson-card.orange {
    border-color: #f1e5d8;
    border-left-color: #dcb793;
    background: #fffdfa;
  }
  .lesson-card.green {
    border-color: #e1ece5;
    border-left-color: #9cbfa9;
    background: #fbfefc;
  }
  .lesson-card h3 {
    font-size: 16px;
    margin: 16px 0 6px;
  }
  .lesson-card p {
    font-size: 13px;
    color: #656a75;
    margin-bottom: 18px;
  }
  .lesson-card .pill {
    font-size: 12px;
    background: #eeebf6;
    color: #6e677d;
  }
  .room,
  .group {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    color: #686a75;
  }
  .lesson-note {
    font-size: 12px;
    color: #786851;
  }
  .room-link {
    color: var(--primary);
    min-height: 28px;
  }
  .moved-directions {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 44px;
  }
  .room-link:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .day-picker {
    padding-bottom: 16px;
  }
  @media (max-width: 600px) {
    .lesson {
      gap: 13px;
    }
    .lesson-card {
      padding: 15px;
    }
    .lesson-card h3 {
      font-size: 14px;
    }
    .times {
      width: 43px;
    }
    .times strong {
      font-size: 13px;
    }
    .room {
      font-size: 12px;
    }
    .room-link {
      min-height: 44px;
    }
    .days {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 4px;
      overflow: visible;
      padding-inline: 0;
    }
    .days button {
      min-width: 0;
      min-height: 66px;
      padding: 6px 1px;
    }
    .days button span,
    .days button small {
      font-size: 10px;
    }
    .days button strong {
      font-size: 18px;
    }
    .page-head .pill {
      display: none;
    }
  }
</style>
