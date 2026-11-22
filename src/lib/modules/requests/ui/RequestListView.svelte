<script lang="ts">
  import { portalHref } from '#shared/portal-paths.ts';
  import Icon from '#shared/ui/Icon.svelte';
  import Status from '#modules/requests/ui/RequestStatusBadge.svelte';
  import {
    requestKinds,
    requestListFilters,
    type RequestListFilter
  } from '#modules/requests/request.labels.ts';
  import { shortDate } from '#shared/formatting.ts';
  type PageProps = {
    data: {
      requests: import('../request.types').RequestListItem[];
      filter: RequestListFilter;
      term: string;
      page: number;
      hasNext: boolean;
    } & import('#application/application.types.ts').ApplicationData;
  };
  let { data }: PageProps = $props();
  function listHref(filter: RequestListFilter, page = 1) {
    const query = new URLSearchParams();
    if (filter !== 'all') query.set('filter', filter);
    if (data.term) query.set('q', data.term);
    if (page > 1) query.set('page', String(page));
    return '/requests' + (query.size ? '?' + query : '');
  }
</script>

<svelte:head><title>Заявления · Дека</title></svelte:head>
<div class="page-head">
  <div>
    <h1>{data.user.role === 'student' ? 'Мои заявления' : 'Заявления студентов'}</h1>
    <p>
      {data.user.role === 'student'
        ? 'Обращайтесь в деканат и следите за результатом онлайн.'
        : 'Все обращения вашего факультета в одном месте.'}
    </p>
  </div>
  {#if data.user.role === 'student'}<a class="btn" href={portalHref('/requests/new')}
      ><Icon name="plus" size={17} />Новое заявление</a
    >{/if}
</div>
<section class="panel">
  <div class="toolbar">
    <nav class="tabs" aria-label="Фильтр заявлений">
      {#each requestListFilters as tab (tab.id)}
        <a
          class:chosen={data.filter === tab.id}
          aria-current={data.filter === tab.id ? 'page' : undefined}
          href={portalHref(listHref(tab.id))}>{tab.name}</a
        >
      {/each}
    </nav>
    <form class="search" method="get" action={portalHref('/requests')} role="search">
      {#if data.filter !== 'all'}<input type="hidden" name="filter" value={data.filter} />{/if}
      <label>
        <Icon name="search" size={17} />
        <input
          aria-label="Найти заявление"
          type="search"
          name="q"
          value={data.term}
          maxlength="100"
          placeholder="Номер, название или имя"
        />
      </label>
      <button class="btn outline" type="submit">Найти</button>
    </form>
  </div>
  {#if data.requests.length}<div class="table-wrap">
      <table class="data-table">
        <thead
          ><tr
            ><th>№ / Тип заявления</th>{#if data.user.role === 'dean'}<th>Студент</th>{/if}<th
              >Подано</th
            ><th>Статус</th><th></th></tr
          ></thead
        ><tbody
          >{#each data.requests as request (request.id)}<tr
              ><td
                ><a href={portalHref(`/requests/${request.id}`)}
                  ><strong>{requestKinds[request.kind]}</strong><small
                    >№ {String(request.number).padStart(4, '0')}</small
                  ></a
                ></td
              >{#if data.user.role === 'dean'}<td
                  >{request.student_name}<small>{request.group_name}</small></td
                >{/if}<td class="muted">{shortDate(request.created_at)}</td><td
                ><Status status={request.status} waiting={request.awaiting_student} /></td
              ><td
                ><a
                  class="icon-btn"
                  aria-label={`Открыть заявление №${request.number}`}
                  href={portalHref(`/requests/${request.id}`)}><Icon name="arrow" size={17} /></a
                ></td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>{:else}<div class="empty">
      <Icon name="inbox" size={32} />
      <h3>Заявлений не найдено</h3>
      <p>Уточните запрос или выберите другой фильтр.</p>
      {#if data.page > 1}<a href={portalHref(listHref(data.filter))}>К первой странице</a>{/if}
    </div>{/if}
  {#if data.page > 1 || data.hasNext}
    <nav class="pagination" aria-label="Страницы заявлений">
      {#if data.page > 1}<a href={portalHref(listHref(data.filter, data.page - 1))}>Назад</a>{/if}
      <span>Страница {data.page}</span>
      {#if data.hasNext}<a href={portalHref(listHref(data.filter, data.page + 1))}>Вперёд</a>{/if}
    </nav>
  {/if}
</section>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 25px;
    flex-wrap: wrap;
  }
  .tabs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .tabs a {
    background: transparent;
    color: #676c78;
    border-radius: 8px;
    padding: 9px 12px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    font-size: 13px;
    text-decoration: none;
  }
  .tabs a.chosen {
    background: #efedfc;
    color: #6c60a9;
  }
  .search {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .search label {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
    min-width: 0;
  }
  .search :global(svg) {
    position: absolute;
    left: 12px;
    color: #686c74;
  }
  .search input {
    font-size: 12px;
    padding-left: 37px;
    min-height: 44px;
    width: 15rem;
  }
  .pagination {
    border-top: 1px solid var(--border);
    padding-top: 6px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 16px;
    color: var(--muted);
    font-size: 13px;
  }
  .pagination a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  @media (max-width: 600px) {
    .search {
      width: 100%;
    }
    .search input {
      width: 100%;
    }
    .tabs a {
      font-size: 11px;
      padding: 8px 10px;
    }
    .toolbar {
      gap: 15px;
    }
    .page-head {
      flex-direction: column;
    }
  }
</style>
