<script lang="ts">
  import { portalHref } from '#shared/portal-paths.ts';
  import '#application/styles/global.css';
  import InstallationPrompt from '#application/InstallationPrompt.svelte';
  let { children } = $props();
</script>

<svelte:head
  ><title>Дека · Цифровой деканат</title><meta
    name="description"
    content="Расписание, оценки и обращения в деканат."
  /><link rel="manifest" href={portalHref('/manifest.webmanifest')} /><link
    rel="apple-touch-icon"
    href={portalHref('/brand/app-192.png')}
  /></svelte:head
>
{@render children()}
<InstallationPrompt />
