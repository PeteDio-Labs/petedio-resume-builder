<script lang="ts">
	import { enhance } from '$app/forms';
	import { confirmSubmit } from '$lib/guards.svelte';
	import { APPLICATION_STATUSES, STATUS_COLOR } from '$lib/applications';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Action failures had nowhere to render — the page never read `form`, so a
	// rejected job link failed silently and looked like nothing had happened.
	let error = $state('');

	const initial = (s: string) => (s || '?').trim().charAt(0).toUpperCase();

	/** A date in a tracker is a recency — "3d ago" answers the question a timestamp
	 *  makes you compute. */
	function ago(iso: string): string {
		const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
		if (days <= 0) return 'today';
		if (days === 1) return 'yesterday';
		if (days < 30) return `${days}d ago`;
		return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
	}

	const apps = $derived(data.applications);
	const inPlay = $derived(
		apps.filter((a) => a.status === 'applied' || a.status === 'interviewing').length
	);
	const interviewing = $derived(apps.filter((a) => a.status === 'interviewing').length);
	const lastTouched = $derived(
		apps.length
			? apps.reduce((m, a) => (new Date(a.updatedAt) > new Date(m.updatedAt) ? a : m)).updatedAt
			: null
	);
	// Only stages with something in them — an empty bar says nothing worth a row.
	const byStatus = $derived(
		APPLICATION_STATUSES.map((status) => ({
			status,
			count: apps.filter((a) => a.status === status).length
		})).filter((s) => s.count > 0)
	);
</script>

<svelte:head><title>Job tracker · Resume Builder</title></svelte:head>

<div class="wide">
	<div class="row" style="margin-bottom:1rem">
		<a href="/" class="btn-ghost">← Home</a>
	</div>

	<h1 style="font-size:var(--t-display)">Job tracker</h1>
	<p class="muted">Track a job by its link, set where it is in the pipeline, and link the resume you used.</p>

	{#if data.demo}
		<div class="banner info" style="margin:1rem 0">
			🎬 Demo mode — tracked jobs live in the in-memory store and reset when the server restarts.
		</div>
	{/if}
	{#if data.dbError}
		<div class="banner warn" style="margin:1rem 0">⚠ The database isn't reachable yet, so jobs can't be tracked.</div>
	{/if}

	{#if error}
		<div class="banner warn" style="margin:1rem 0">{error}</div>
	{/if}

	<!-- Where the pipeline stands, before the controls to change it. -->
	{#if apps.length}
		<section class="stat-tiles" style="margin-top:1rem" aria-label="At a glance">
			<div class="stat-tile">
				<span class="stat-k">Tracked</span>
				<span class="stat-v">{apps.length}</span>
				<span class="stat-sub">jobs in the tracker</span>
			</div>
			<div class="stat-tile">
				<span class="stat-k">In play</span>
				<span class="stat-v" class:muted-v={!inPlay}>{inPlay || '—'}</span>
				<span class="stat-sub">applied or interviewing</span>
			</div>
			<div class="stat-tile">
				<span class="stat-k">Interviewing</span>
				<span class="stat-v" class:muted-v={!interviewing}>{interviewing || '—'}</span>
				<span class="stat-sub">furthest along</span>
			</div>
			<div class="stat-tile">
				<span class="stat-k">Last touched</span>
				<span class="stat-v">{lastTouched ? ago(lastTouched) : '—'}</span>
				<span class="stat-sub">any tracked job</span>
			</div>
		</section>
	{/if}

	<div class="dash-grid" style="margin-top:0.75rem">
	<!-- Track a job -->
	<form
		method="POST"
		action="?/track"
		class="dash-card"
		use:enhance={() => {
			error = '';
			return async ({ result, update }) => {
				if (result.type === 'failure') {
					error = (result.data?.message as string) ?? 'Could not track that job.';
					// reset:false keeps what she typed so she can fix the link rather
					// than retype the title and company.
					await update({ reset: false });
				} else {
					await update();
				}
			};
		}}
	>
		<div class="section-head"><h2>Track a job</h2></div>
		<label class="field"><span class="field-label">Job link</span>
			<input type="text" name="url" placeholder="https://… (paste the posting URL)" required />
		</label>
		<div class="grid-2">
			<label class="field"><span class="field-label">Title (optional)</span>
				<input type="text" name="title" placeholder="e.g. Senior Recruiter" />
			</label>
			<label class="field"><span class="field-label">Company (optional)</span>
				<input type="text" name="company" placeholder="e.g. Acme" />
			</label>
			<label class="field"><span class="field-label">Status</span>
				<select name="status">
					{#each APPLICATION_STATUSES as s (s)}<option value={s}>{s}</option>{/each}
				</select>
			</label>
			<label class="field"><span class="field-label">Resume used (optional)</span>
				<select name="resumeId">
					<option value="">— none yet —</option>
					{#each data.resumeOptions as opt (opt.id)}<option value={opt.id}>{opt.label}</option>{/each}
				</select>
			</label>
		</div>
		<div class="row">
			<button type="submit" class="btn btn-primary">Track job</button>
			{#if data.resumeOptions.length === 0}
				<span class="muted">No resumes yet — <a href="/resumes/new">create one</a> to link it.</span>
			{/if}
		</div>
	</form>

		<!-- Proportions per stage, the same shape the home screen uses. -->
		{#if byStatus.length}
			<section class="dash-card">
				<div class="dash-head">
					<h2>Pipeline</h2>
					<span class="dash-note">{apps.length} tracked</span>
				</div>
				{#each byStatus as s (s.status)}
					<div class="bar-row">
						<div class="bar-top">
							<span class="bar-name">{s.status}</span>
							<span class="bar-val">{s.count}</span>
						</div>
						<div class="bar-track">
							<div
								class="bar-fill"
								style="width: {(s.count / apps.length) * 100}%; --bar-color: {STATUS_COLOR[
									s.status
								]}"
							></div>
						</div>
					</div>
				{/each}
			</section>
		{/if}
	</div>

	<!-- Tracked jobs: one hairline row each, with the status editable in place. The
	     old layout spent a whole card per job, so four filled the screen. -->
	{#if data.applications.length === 0}
		<div class="dash-card" style="margin-top:0.75rem; text-align:center">
			<p class="muted" style="margin:0">Nothing tracked yet.</p>
		</div>
	{:else}
		<section class="dash-card" style="margin-top:0.75rem">
			<div class="dash-head">
				<h2>Tracked</h2>
				<span class="dash-note">{data.applications.length}</span>
			</div>
			<ul class="thin-rows">
				{#each data.applications as a (a.id)}
					<li class="thin-row interactive">
						<span class="disc" style="background: {STATUS_COLOR[a.status]}"
							>{initial(a.company || a.title || a.url)}</span
						>

						<span class="thin-name">
							<a href={`/applications/${a.id}`} class="job-link">{a.label}</a>
							<a
								href={a.url}
								target="_blank"
								rel="noopener noreferrer"
								class="sub-link"
								title={a.url}>{a.url} ↗</a
							>
							{#if a.resumeId && !a.resumeTitle}
								<span class="sub-link">(linked resume was deleted)</span>
							{/if}
						</span>

						<!-- The status chip IS the control — no separate indicator and picker. -->
						<span class="chip-wrap" style="color: {STATUS_COLOR[a.status]}">
							<form method="POST" action="?/setStatus" use:enhance>
								<input type="hidden" name="id" value={a.id} />
								<select
									class="chip-select"
									name="status"
									value={a.status}
									onchange={(e) => e.currentTarget.form?.requestSubmit()}
									aria-label="Status for {a.label}"
								>
									{#each APPLICATION_STATUSES as st (st)}<option value={st}>{st}</option>{/each}
								</select>
							</form>
						</span>

						<form method="POST" action="?/link" use:enhance>
							<input type="hidden" name="id" value={a.id} />
							<select
								class="mini-select"
								name="resumeId"
								value={a.resumeId ?? ''}
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
								aria-label="Linked resume for {a.label}"
							>
								<option value="">— no resume —</option>
								{#each data.resumeOptions as opt (opt.id)}<option value={opt.id}
										>{opt.label}</option
									>{/each}
							</select>
						</form>

						<span class="thin-meta">{ago(a.updatedAt)}</span>

						<form
							method="POST"
							action="?/remove"
							use:confirmSubmit={`Remove "${a.title || a.url}" from the tracker?`}
							use:enhance
						>
							<input type="hidden" name="id" value={a.id} />
							<button type="submit" class="btn-ghost btn-danger remove-btn">Remove</button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.job-link {
		font-weight: 600;
		color: var(--label);
		text-decoration: none;
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.job-link:hover {
		color: var(--blue);
	}

	/* The title column takes the slack so every row's controls line up, and a long
	   posting URL truncates instead of pushing them off the row. */
	.thin-row.interactive .thin-name {
		flex: 1 1 16rem;
		min-width: 0;
		white-space: normal;
	}

	.remove-btn {
		font-size: var(--t-micro);
		padding: 0.2rem 0.5rem;
	}
</style>
