<script lang="ts">
	/**
	 * Editor for a `string[]` where each entry is a full line (work highlights,
	 * education courses, project highlights). Each bullet is its own textarea so
	 * long sentences wrap; add/remove operate on the bound array in place.
	 */
	let {
		items = $bindable([]),
		placeholder = 'Add a bullet…',
		addLabel = '+ Add bullet'
	}: { items: string[]; placeholder?: string; addLabel?: string } = $props();

	function add() {
		items.push('');
	}
	function remove(i: number) {
		items.splice(i, 1);
	}
</script>

<div class="bullets">
	{#each items as _item, i (i)}
		<div class="bullet-row">
			<textarea rows="2" bind:value={items[i]} {placeholder}></textarea>
			<button type="button" class="icon-btn" onclick={() => remove(i)} aria-label="Remove bullet">
				×
			</button>
		</div>
	{/each}
	<button type="button" class="btn-ghost" onclick={add}>{addLabel}</button>
</div>
