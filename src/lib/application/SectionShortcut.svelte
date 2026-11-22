<script lang="ts">
  import Icon from '#shared/ui/Icon.svelte';

  let { href, label, description }: { href: string; label: string; description: string } = $props();
</script>

<a class="shortcut" {href}>
  <span><strong>{label}</strong><small>{description}</small></span>
  <Icon name="arrow" size={19} />
</a>

<style>
  .shortcut {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 54px;
    margin-block: 16px;
    padding: 8px 15px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: #363e57;
  }
  .shortcut:hover {
    background: #f8f9fc;
  }
  .shortcut strong {
    font-weight: 550;
  }
  .shortcut small {
    display: block;
    color: var(--muted);
    font-size: 12px;
  }
</style>
