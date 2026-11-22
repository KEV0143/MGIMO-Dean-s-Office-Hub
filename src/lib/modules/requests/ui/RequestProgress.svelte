<script lang="ts">
  import { canHandleRequest, canIssueDocument } from '../request.policy.ts';
  import { fullDate } from '#shared/formatting.ts';
  import type { RequestStatus, StudyRequest } from '../request.types.ts';
  import { statusNames } from '../request.labels.ts';
  let { request, today }: { request: StudyRequest; today: string } = $props();
  const { status, kind, awaiting_student: awaiting, due_on: due } = $derived(request);
  const issuesDocument = $derived(canIssueDocument(kind));
  const steps = ['new', 'in_progress', 'ready', 'done'] as const;
  const active = $derived(steps.findIndex((step) => step === status));
  const titles: Record<RequestStatus, string> = {
    new: 'Подано',
    in_progress: 'В работе',
    ready: 'К выдаче',
    done: 'Завершено',
    rejected: 'Отклонено',
    cancelled: 'Отменено'
  };
  const guidance: Record<RequestStatus, string> = {
    new: 'Заявление поступило в деканат.',
    in_progress: 'Деканат рассматривает заявление.',
    ready: 'Ответ деканата ниже.',
    done: 'Заявление закрыто.',
    rejected: 'Причина отказа в комментарии деканата.',
    cancelled: 'Заявление отозвано.'
  };
</script>

<section class="progress-panel" aria-label="Этап обработки">
  {#if active >= 0}
    <ol>
      {#each steps as step, index (step)}
        <li class:reached={index <= active} aria-current={index === active ? 'step' : undefined}>
          <span aria-hidden="true">{index < active ? '✓' : index + 1}</span>
          <strong>{titles[step]}</strong>
        </li>
      {/each}
    </ol>
  {:else}
    <strong>{statusNames[status]}</strong>
  {/if}
  {#if awaiting}
    <p>
      <strong>Деканат ждёт вашего ответа.</strong>
      <a class="link" href="#request-conversation">Ответить</a>
    </p>
  {:else if canHandleRequest(status) && due}
    {#if due < today}
      <p class="late">
        <strong>Срок ответа прошёл <time datetime={due}>{fullDate(due)}</time></strong>
        <a class="link" href="#request-conversation">Написать в деканат</a>
      </p>
    {:else}
      <p><strong>Срок ответа — <time datetime={due}>{fullDate(due)}</time></strong></p>
    {/if}
  {:else if status === 'ready' && issuesDocument}
    <p><strong>Справка готова.</strong></p>
  {:else}
    <p>{guidance[status]}</p>
  {/if}
</section>

<style>
  .progress-panel {
    margin-bottom: 15px;
    padding: 11px 14px;
    border: 1px solid #e5dff6;
    border-radius: 12px;
    background: #f7f4ff;
    color: #4b3a80;
  }
  ol {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 5px;
    list-style: none;
    margin: 0 0 7px;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #5f596c;
  }
  li span {
    display: grid;
    place-items: center;
    width: 23px;
    height: 23px;
    border-radius: 50%;
    background: #ece8f5;
    flex-shrink: 0;
  }
  li.reached span {
    background: #ddd3f9;
    color: #4d3191;
  }
  li[aria-current] span {
    background: #5140aa;
    color: white;
  }
  p {
    font-size: 12px;
    color: #55506a;
  }
  .late {
    color: #8d440b;
  }
  @media (max-width: 550px) {
    li {
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
      font-size: 11px;
    }
  }
</style>
