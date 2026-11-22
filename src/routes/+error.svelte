<script lang="ts">
  import { portalHref } from '#shared/portal-paths.ts';
  import { page } from '$app/state';
  import Icon from '#shared/ui/Icon.svelte';
</script>

<svelte:head><title>{page.status} · Дека</title></svelte:head>
<main class="error-page">
  <span>{page.status}</span>
  <h1>{page.error?.message ?? 'Что-то пошло не так'}</h1>
  <p>Вернитесь в личный кабинет или попробуйте обновить страницу.</p>
  <a href={portalHref('/')} class="btn">В личный кабинет<Icon name="arrow" size={16} /></a>
</main>
