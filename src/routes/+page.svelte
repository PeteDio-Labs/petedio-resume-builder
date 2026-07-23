<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { STATUS_COLOR } from '$lib/applications';
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

	/** A date on a dashboard is a recency, not a timestamp. */
	function ago(iso: string | null): string {
		if (!iso) return '—';
		const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
		if (days <= 0) return 'today';
		if (days === 1) return 'yesterday';
		if (days < 30) return `${days}d ago`;
		return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
	}

	const initial = (s: string) => (s || '?').trim().charAt(0).toUpperCase();

	const pipelineTotal = $derived(
		data.stats?.byStatus.reduce((a: number, s: { count: number }) => a + s.count, 0) ?? 0
	);
</script>

<svelte:head><title>Resume Builder</title></svelte:head>

<div class="wide home">
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
		<!-- Where the work stands, as four numbers you can read without stopping —
		     the job the dim summary sentence above was doing in prose. -->
		{#if data.stats}
			<section class="stat-tiles" aria-label="At a glance">
				<div class="stat-tile">
					<span class="stat-k"><Icon name="person" size={13} /> Roles</span>
					<span class="stat-v" class:muted-v={!data.stats.roles}>{data.stats.roles || '—'}</span>
					<span class="stat-sub"
						>{data.stats.stories
							? `${data.stats.stories} ${data.stats.stories === 1 ? 'story' : 'stories'}`
							: 'in your master profile'}</span
					>
				</div>
				<div class="stat-tile">
					<span class="stat-k"><Icon name="documents" size={13} /> Resumes</span>
					<span class="stat-v" class:muted-v={!data.stats.resumes}>{data.stats.resumes || '—'}</span>
					<span class="stat-sub">one tailored draft per job</span>
				</div>
				<div class="stat-tile">
					<span class="stat-k"><Icon name="briefcase" size={13} /> In play</span>
					<span class="stat-v" class:muted-v={!data.stats.active}>{data.stats.active || '—'}</span>
					<span class="stat-sub"
						>{data.stats.applications
							? `of ${data.stats.applications} tracked`
							: 'nothing tracked yet'}</span
					>
				</div>
				<div class="stat-tile">
					<span class="stat-k"><Icon name="clock" size={13} /> Last touched</span>
					<span class="stat-v" class:muted-v={!data.stats.lastActivity}
						>{ago(data.stats.lastActivity)}</span
					>
					<span class="stat-sub"
						>{data.stats.recent[0]
							? data.stats.recent[0].company || 'a tracked job'
							: 'no activity yet'}</span
					>
				</div>
			</section>
		{/if}

		<a class="btn btn-primary home-cta" href="/resumes/new">
			<Icon name="sparkles" size={20} /> Tailor a resume for a job
		</a>

		<!-- Inset-grouped rows: destination, what's in it, how much of it there is.
		     The old screen said the same things in three cards, eight buttons and a
		     closing paragraph listing features. -->
		<div class="dash-grid">
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

			<!-- Recent activity: the hairline-row shape the panel uses for sessions. Six fit
			     where one card per job would show one. -->
			{#if data.stats && data.stats.recent.length}
				<section class="dash-card">
					<div class="dash-head">
						<h2>Recent activity</h2>
						<a class="dash-note" href="/applications">All {data.stats.applications} ›</a>
					</div>
					<ul class="thin-rows">
						{#each data.stats.recent as app (app.id)}
							<li>
								<a class="thin-row" href="/applications/{app.id}">
									<span class="disc" style="background: {STATUS_COLOR[app.status]}"
										>{initial(app.company || app.title)}</span
									>
									<span class="thin-name"
										>{app.title || 'Untitled role'}{#if app.company}<span class="at">
												· {app.company}</span
											>{/if}</span
									>
									<span class="thin-meta">{ago(app.updatedAt)}</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<!-- Pipeline: proportions, not another count. Only stages with something in them
			     are drawn — an empty bar says nothing worth the row. -->
			{#if data.stats && data.stats.byStatus.length}
				<section class="dash-card">
					<div class="dash-head">
						<h2>Pipeline</h2>
						<span class="dash-note">{pipelineTotal} tracked</span>
					</div>
					{#each data.stats.byStatus as s (s.status)}
						<div class="bar-row">
							<div class="bar-top">
								<span class="bar-name">{s.status}</span>
								<span class="bar-val">{s.count}</span>
							</div>
							<div class="bar-track">
								<div
									class="bar-fill"
									style="width: {(s.count / pipelineTotal) *
										100}%; --bar-color: {STATUS_COLOR[s.status]}"
								></div>
							</div>
						</div>
					{/each}
				</section>
			{/if}
		</div>

		{#if data.stats === null}
			<p class="dim footnote">Counts unavailable — the database isn't reachable right now.</p>
		{/if}
	{/if}
</div>

<style>
	/* Width now comes from .wide — a dashboard read across, not a form filled in. */
	.home {
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

	/* At full width a stretched pill reads as a banner, not a button. */
	@media (min-width: 901px) {
		.home-cta {
			max-width: 26rem;
		}
	}

	/* iOS inset-grouped list: one surface, hairline separators, no card per row. */
	/* Glass rather than a flat surface, so it sits in the same material as the tiles
	   and cards beside it. */
	.inset-group {
		background: var(--glass-fill);
		border: 1px solid var(--glass-line);
		border-radius: var(--r-md);
		overflow: hidden;
		backdrop-filter: blur(16px) saturate(160%);
		-webkit-backdrop-filter: blur(16px) saturate(160%);
		box-shadow: inset 0 1px 1px var(--glass-rim);
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

	.at {
		color: var(--label-2);
		font-weight: 400;
	}

	.footnote {
		font-size: var(--t-micro);
		margin: 0;
	}
</style>
