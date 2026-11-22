<script lang="ts">
  import ScheduleView from '#modules/academics/ui/ScheduleView.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

{#key (data.selectedLesson ?? '') + ':' + (data.selectedDate ?? '')}
  <ScheduleView {data} />
{/key}
