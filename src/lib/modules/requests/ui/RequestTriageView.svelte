<script lang="ts">
  import { portalHref } from '#shared/portal-paths.ts';
  import { requestKinds } from '../request.labels.ts';
  import { WAITING_DAYS, type RequestTriage } from '../request-triage.types.ts';
  import Status from './RequestStatusBadge.svelte';
  import { shortDate } from '#shared/formatting.ts';

  let { queue, faculty }: { queue: RequestTriage; faculty: string | null } = $props();
  const total = $derived(queue.new_count + queue.in_progress_count + queue.awaiting_student_count);
</script>

<div class="page-head">
  <div>
    <h1>Очередь деканата</h1>
    {#if faculty}<p>{faculty}</p>{/if}
  </div>
  <a class="btn outline" href={portalHref('/requests')}>Все заявления</a>
</div>

<div class="stack">
  <dl class="metrics">
    <div class="panel">
      <dt>Новые</dt>
      <dd>{queue.new_count}</dd>
    </div>
    <div class="panel">
      <dt>В работе</dt>
      <dd>{queue.in_progress_count}</dd>
    </div>
    <div class="panel">
      <dt>К выдаче</dt>
      <dd>{queue.ready_count}</dd>
    </div>
    <div class="panel">
      <dt>Ждут студента</dt>
      <dd>{queue.awaiting_student_count}</dd>
    </div>
    <div class="panel waiting">
      <dt>Срок прошёл</dt>
      <dd>{queue.overdue_count}</dd>
    </div>
  </dl>
  <section class="panel" aria-labelledby="queue-title">
    <div class="panel-head">
      <div>
        <h2 id="queue-title">Порядок обработки</h2>
        <p>Сначала просроченные и ближайшие сроки. Заявления, где нужен ответ студента, в конце.</p>
      </div>
    </div>
    {#if queue.items.length}
      <ul>
        {#each queue.items as item (item.id)}
          <li>
            <div>
              <a class="link" href={portalHref('/requests/' + item.id)}>
                № {item.number} · {requestKinds[item.kind]}
              </a>
              <p>{item.student_name} · {item.group_name}</p>
            </div>
            <div class="row wrap">
              <Status status={item.status} waiting={item.awaiting_student} />
              {#if !item.awaiting_student && item.due_on}
                <time class:late={item.overdue} datetime={item.due_on}>
                  {item.overdue ? 'Срок прошёл · ' : 'Срок — '}{shortDate(item.due_on)}
                </time>
              {:else}
                <span class:late={!item.awaiting_student && item.age_days >= WAITING_DAYS}
                  >{item.age_days} сут.</span
                >
              {/if}
            </div>
          </li>
        {/each}
      </ul>
      {#if queue.items.length < total}
        <p class="muted">Показаны {queue.items.length} из {total}.</p>
      {/if}
    {:else}
      <p class="muted">Новых заявлений и заявлений в работе нет.</p>
    {/if}
  </section>
</div>

<style>
  .metrics {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    margin: 0;
  }
  .metrics .panel {
    padding: 12px 15px;
  }
  dt {
    font-size: 13px;
    color: #525a6b;
  }
  dd {
    font-size: 24px;
    font-weight: 700;
    margin: 0;
  }
  .waiting {
    background: #fff5de;
    border-color: #efdfb8;
  }
  ul {
    list-style: none;
    display: grid;
    padding: 0;
    margin: 0;
  }
  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 9px;
    border-top: 1px solid var(--border);
    padding: 10px 0;
    overflow-wrap: anywhere;
  }
  li p {
    color: #5b6273;
    font-size: 13px;
  }
  li .link {
    min-height: 34px;
    font-size: 14px;
  }
  li span {
    white-space: nowrap;
  }
  .late {
    color: #8d440b;
    font-weight: 600;
  }
  @media (max-width: 680px) {
    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .waiting {
      grid-column: 1 / -1;
    }
    li {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
