<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// One line that says where the work stands. Prose about what the app can do
	// belongs in a README, not on the screen she opens every day.
	const summary = $derived.by(() => {
		const s = data.stats;
		if (!s) return '';
		if (!s.profileStarted) return 'Start with your master profile — everything else derives from it.';
		const bits = [`${s.roles} ${s.roles === 1 ? 'role' : 'roles'}`];
		if (s.resumes) bits.push(`${s.resumes} ${s.resumes === 1 ? 'resume' : 'resumes'}`);
		if (s.active) bits.push(`${s.active} in play`);
		return bits.join(' · ');
	});
</script>

<svelte:head><title>Resume Builder</title></svelte:head>

<div class="home">
	<header class="home-head">
		<h1>Resume Builder</h1>
		{#if data.user}
			<p class="dim">{summary || data.user.email}</p>
		{/if}
	</header>

	{#if data.demo}
		<div class="banner info">🎬 Demo mode — in-memory store with sample data, reset on restart.</div>
	{/if}

	{#if !data.user}
		<div class="banner warn">Not provisioned. Sign in via Cloudflare Access.</div>
	{:else}
		<a class="btn btn-primary home-cta" href="/resumes/new">
			<Icon name="sparkles" size={20} /> Tailor a resume for a job
		</a>

		<!-- Inset-grouped rows: destination, what's in it, how much of it there is.
		     The old screen said the same things in three cards, eight buttons and a
		     closing paragraph listing features. -->
		<nav class="inset-group">
			<a class="inset-row" href="/profile">
				<span class="ico"><Icon name="person" /></span>
				<span class="rt">
					<strong>Master profile</strong>
					<small>Everything you've ever done</small>
				</span>
				<span class="val">{data.stats ? data.stats.roles || '—' : ''}</span>
				<span class="chev">›</span>
			</a>

			<a class="inset-row" href="/profile/import">
				<span class="ico"><Icon name="import" /></span>
				<span class="rt">
					<strong>Import from a resume</strong>
					<small>Paste it, check the parse, save</small>
				</span>
				<span class="chev">›</span>
			</a>
		</nav>

		<nav class="inset-group">
			<a class="inset-row" href="/resumes">
				<span class="ico"><Icon name="documents" /></span>
				<span class="rt">
					<strong>My resumes</strong>
					<small>One tailored draft per job</small>
				</span>
				<span class="val">{data.stats ? data.stats.resumes || '—' : ''}</span>
				<span class="chev">›</span>
			</a>

			<a class="inset-row" href="/applications">
				<span class="ico"><Icon name="briefcase" /></span>
				<span class="rt">
					<strong>Job tracker</strong>
					<small>Where each application stands</small>
				</span>
				<span class="val">{data.stats ? data.stats.applications || '—' : ''}</span>
				<span class="chev">›</span>
			</a>
		</nav>

		{#if data.stats === null}
			<p class="dim footnote">Counts unavailable — the database isn't reachable right now.</p>
		{/if}
	{/if}
</div>

<style>
	.home {
		max-width: 34rem;
		margin: 0 auto;
		padding: 2.5rem 1.25rem max(2rem, env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.home-head h1 {
		font-size: var(--t-display);
		margin: 0;
		letter-spacing: -0.02em;
	}
	.home-head p {
		margin: 0.2rem 0 0;
		font-size: var(--t-label);
	}

	.home-cta {
		justify-content: center;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}

	/* iOS inset-grouped list: one surface, hairline separators, no card per row. */
	.inset-group {
		background: var(--surface-1);
		border: 1px solid var(--glass-line);
		border-radius: var(--r-md);
		overflow: hidden;
	}

	.inset-row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		min-height: 60px;
		padding: 0.6rem 0.9rem;
		color: var(--label);
		text-decoration: none;
	}
	.inset-row + .inset-row {
		box-shadow: inset 0 1px 0 var(--glass-line);
	}
	.inset-row:hover {
		background: rgba(255, 255, 255, 0.04);
		text-decoration: none;
	}
	.inset-row:active {
		background: rgba(255, 255, 255, 0.07);
	}

	.ico {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		flex: none;
		border-radius: 9px;
		background: rgba(10, 132, 255, 0.16);
		color: #7abaff;
	}

	.rt {
		display: flex;
		flex-direction: column;
		min-width: 0;
		/* Takes the slack, so the chevron sits in the same column on every row —
		   including the ones with no count to show. */
		flex: 1;
	}
	.rt strong {
		font-size: var(--t-body);
		font-weight: 600;
	}
	.rt small {
		font-size: var(--t-micro);
		color: var(--label-2);
	}

	.val {
		font-size: var(--t-label);
		color: var(--label-2);
		font-variant-numeric: tabular-nums;
	}
	.chev {
		color: var(--label-3);
		font-size: 1.15rem;
		line-height: 1;
	}

	.footnote {
		font-size: var(--t-micro);
		margin: 0;
	}
</style>
