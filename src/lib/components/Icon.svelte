<script lang="ts">
	/**
	 * Inline SF-flavoured glyphs: 24px grid, 1.6 stroke, round caps and joins,
	 * `currentColor`, no fills.
	 *
	 * Hand-drawn rather than pulled from an icon set — the artifact CSP blocks
	 * external assets, and a five-glyph set doesn't justify shipping a library.
	 * They're decorative: every row they sit in carries its own text label, so
	 * they're hidden from assistive tech.
	 */
	type Name = 'person' | 'import' | 'sparkles' | 'documents' | 'briefcase' | 'clock';

	let { name, size = 22 }: { name: Name; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#if name === 'person'}
		<!-- master profile: a person on a card -->
		<rect x="3" y="4.5" width="18" height="15" rx="3.5" />
		<circle cx="9" cy="10.5" r="2.2" />
		<path d="M5.8 16.2c.5-1.6 1.7-2.5 3.2-2.5s2.7.9 3.2 2.5" />
		<path d="M15 10h3.2M15 13.4h3.2" />
	{:else if name === 'import'}
		<!-- paste-import: text arriving into a document -->
		<path d="M14.5 3.5H6.5A2.5 2.5 0 0 0 4 6v12a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 18v-7" />
		<path d="M17.5 2.5v7M17.5 9.5 15 7M17.5 9.5 20 7" />
		<path d="M7.5 13h6M7.5 16.5h4" />
	{:else if name === 'sparkles'}
		<!-- tailoring: the generated thing -->
		<path d="M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.7 10.4 11.2 6 9.6 10.4 8Z" />
		<path d="M18.5 15.5 19.2 17.3 21 18l-1.8.7-.7 1.8-.7-1.8L16 18l1.8-.7Z" />
	{:else if name === 'documents'}
		<!-- saved drafts: stacked pages -->
		<path d="M8 3.5h6.5L19 8v9.5A2.5 2.5 0 0 1 16.5 20h-8A2.5 2.5 0 0 1 6 17.5V6A2.5 2.5 0 0 1 8 3.5Z" />
		<path d="M14 3.7V8h4.3" />
		<path d="M9 12.5h6M9 16h4" />
	{:else if name === 'briefcase'}
		<!-- job tracker -->
		<rect x="3" y="7.5" width="18" height="12.5" rx="3" />
		<path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
		<path d="M3 12.5h18" />
	{:else if name === 'clock'}
		<!-- recency: when a thing was last touched -->
		<circle cx="12" cy="12" r="8.5" />
		<path d="M12 7.2V12l3.2 1.9" />
	{/if}
</svg>
