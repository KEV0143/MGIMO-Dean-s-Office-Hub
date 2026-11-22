<script lang="ts">
  import { statusNames } from '#modules/requests/request.labels.ts';
  import type { RequestStatus } from '#modules/requests/request.types.ts';
  let { status, waiting = false }: { status: RequestStatus; waiting?: boolean } = $props();
</script>

<span class="status {status}">{waiting ? 'Нужен ответ' : statusNames[status]}</span>
