<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Resumes · Resume Builder</title></svelte:head>

<div class="page">
	<div class="row" style="margin-bottom:1rem">
		<a href="/" class="btn-ghost">← Home</a>
		<span class="spacer"></span>
		<a href="/resumes/new" class="btn btn-primary">New from job description</a>
	</div>

	<h1 style="font-size:var(--t-display)">Resumes</h1>
	<p class="muted">Tailored drafts, one per job description. Newest first.</p>

	{#if data.demo}
		<div class="banner info" style="margin:1rem 0">
			🎬 Demo mode — drafts live in the in-memory store and reset when the server restarts.
		</div>
	{/if}

	{#if data.dbError}
		<div class="banner warn" style="margin:1rem 0">
			⚠ The database isn't reachable yet, so drafts can't be listed or saved.
		</div>
	{/if}

	{#if data.resumes.length === 0}
		<div class="card" style="margin-top:1rem; text-align:center">
			<p class="muted">No resumes yet.</p>
			<a href="/resumes/new" class="btn btn-primary" style="margin-top:0.5rem">Start from a job description</a>
		</div>
	{:else}
		<div class="stack" style="margin-top:1rem">
			{#each data.resumes as r (r.id)}
				<div class="entry" style="margin:0">
					<div class="row">
						<div>
							<a href={`/resumes/${r.id}`} style="font-weight:600">{r.title}</a>
							<div class="muted">{r.company || '—'}</div>
						</div>
						<span class="spacer"></span>
						<span class="toggle" aria-pressed="false" style="cursor:default">{r.status}</span>
						<span class="dim" style="font-variant-numeric:tabular-nums">{r.keywordCount} kw</span>
					</div>
					<div class="dim" style="font-size:0.8rem; margin-top:0.4rem">
						Updated {new Date(r.updatedAt).toLocaleString()}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
