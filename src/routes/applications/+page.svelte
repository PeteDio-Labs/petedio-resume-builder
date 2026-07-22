<script lang="ts">
	import { enhance } from '$app/forms';
	import { APPLICATION_STATUSES, STATUS_COLOR } from '$lib/applications';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Job tracker · Resume Builder</title></svelte:head>

<div class="page">
	<div class="row" style="margin-bottom:1rem">
		<a href="/" class="btn-ghost">← Home</a>
	</div>

	<h1>Job tracker</h1>
	<p class="muted">Track a job by its link, set where it is in the pipeline, and link the resume you used.</p>

	{#if data.demo}
		<div class="banner info" style="margin:1rem 0">
			🎬 Demo mode — tracked jobs live in the in-memory store and reset when the server restarts.
		</div>
	{/if}
	{#if data.dbError}
		<div class="banner warn" style="margin:1rem 0">⚠ The database isn't reachable yet, so jobs can't be tracked.</div>
	{/if}

	<!-- Track a job -->
	<form method="POST" action="?/track" class="card" style="margin-top:1rem" use:enhance>
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

	<!-- Tracked jobs -->
	<div class="section-head" style="margin-top:1.5rem"><h2>Tracked</h2><span class="count">{data.applications.length}</span></div>

	{#if data.applications.length === 0}
		<div class="card" style="text-align:center"><p class="muted">Nothing tracked yet.</p></div>
	{:else}
		<div class="stack">
			{#each data.applications as a (a.id)}
				<div class="entry" style="margin:0">
					<div class="row">
						<div style="min-width:0">
							<div style="font-weight:600">{a.label}</div>
							<a href={a.url} target="_blank" rel="noopener noreferrer" class="dim" style="font-size:0.8rem; word-break:break-all">{a.url} ↗</a>
						</div>
						<span class="spacer"></span>
						<span class="chip" style="border-color:{STATUS_COLOR[a.status]}; color:{STATUS_COLOR[a.status]}">{a.status}</span>
					</div>

					<div class="row" style="margin-top:0.6rem; gap:0.5rem; flex-wrap:wrap">
						<!-- status change -->
						<form method="POST" action="?/setStatus" use:enhance style="display:inline">
							<input type="hidden" name="id" value={a.id} />
							<select name="status" value={a.status} onchange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Status">
								{#each APPLICATION_STATUSES as s (s)}<option value={s}>{s}</option>{/each}
							</select>
						</form>

						<!-- resume link (the relationship) -->
						<form method="POST" action="?/link" use:enhance style="display:inline">
							<input type="hidden" name="id" value={a.id} />
							<select name="resumeId" value={a.resumeId ?? ''} onchange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Linked resume">
								<option value="">— no resume —</option>
								{#each data.resumeOptions as opt (opt.id)}<option value={opt.id}>{opt.label}</option>{/each}
							</select>
						</form>

						<span class="spacer"></span>
						<span class="dim" style="font-size:0.8rem">Updated {new Date(a.updatedAt).toLocaleDateString()}</span>
						<form method="POST" action="?/remove" use:enhance style="display:inline">
							<input type="hidden" name="id" value={a.id} />
							<button type="submit" class="btn-ghost btn-danger">Remove</button>
						</form>
					</div>

					{#if a.resumeId && !a.resumeTitle}
						<div class="dim" style="font-size:0.78rem; margin-top:0.3rem">(linked resume was deleted)</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
