<script lang="ts">
  import StaffOverviewView from '#modules/overview/ui/StaffOverviewView.svelte';
  import StudentTodayView from '#modules/overview/ui/StudentTodayView.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

{#if data.studentToday}
  <StudentTodayView {data} home={data.studentToday} />
{:else}
  <StaffOverviewView {data} />
{/if}
