<script lang="ts">
	/**
	 * Chip-style editor for a free-form `string[]` (skill keywords, project
	 * keywords, …). Enter or comma commits the draft; Backspace on an empty
	 * input removes the last chip.
	 */
	let {
		keywords = $bindable([]),
		placeholder = 'Add keyword…'
	}: { keywords: string[]; placeholder?: string } = $props();

	let draft = $state('');

	function add() {
		const value = draft.replace(/,+$/, '').trim();
		if (value && !keywords.includes(value)) keywords.push(value);
		draft = '';
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			add();
		} else if (e.key === 'Backspace' && draft === '' && keywords.length > 0) {
			keywords.pop();
		}
	}

	function remove(i: number) {
		keywords.splice(i, 1);
	}
</script>

<div class="chips">
	{#each keywords as kw, i (kw + i)}
		<span class="chip">
			{kw}
			<button type="button" class="chip-x" onclick={() => remove(i)} aria-label={`Remove ${kw}`}>
				×
			</button>
		</span>
	{/each}
	<input class="chip-input" bind:value={draft} {placeholder} {onkeydown} onblur={add} />
</div>
