<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Resume Builder</title></svelte:head>

<div class="page">
	<h1>PeteDio Resume Builder</h1>

	{#if data.demo}
		<div class="banner info" style="margin:0.75rem 0">
			🎬 Demo mode — running on an in-memory store with sample data. Nothing is saved to a real
			database; everything resets when the server restarts.
		</div>
	{/if}

	{#if data.user}
		<div class="banner ok" style="margin:0.75rem 0">Signed in as {data.user.email}</div>

		<div class="card" style="margin-top:1rem">
			<div class="section-head"><h2>Master profile</h2></div>
			<p class="muted" style="margin-top:-0.4rem">
				Your “everything I've ever done” record. Build it once; every tailored resume derives from
				it.
			</p>
			<div class="row" style="margin-top:0.75rem">
				<a href="/profile" class="btn btn-primary">Open master profile</a>
				<a href="/profile/import" class="btn">Import from a resume</a>
			</div>
		</div>

		<div class="card" style="margin-top:1rem">
			<div class="section-head"><h2>Tailor a resume</h2></div>
			<p class="muted" style="margin-top:-0.4rem">
				Paste a job description → extract the ATS keywords that matter → save a tailored draft.
			</p>
			<div class="row" style="margin-top:0.75rem">
				<a href="/resumes/new" class="btn btn-primary">New from job description</a>
				<a href="/resumes" class="btn">My resumes</a>
			</div>
		</div>

		<div class="card" style="margin-top:1rem">
			<div class="section-head"><h2>Job tracker</h2></div>
			<p class="muted" style="margin-top:-0.4rem">
				Track jobs by their link, move them through the pipeline, and link the resume you used.
			</p>
			<div class="row" style="margin-top:0.75rem">
				<a href="/applications" class="btn btn-primary">Open job tracker</a>
			</div>
		</div>
	{:else}
		<div class="banner warn" style="margin:0.75rem 0">
			Not provisioned. Sign in via Cloudflare Access.
		</div>
	{/if}

	<p class="dim" style="margin-top:1.5rem; font-size:0.85rem">
		P2 — master profile &amp; import. Resume tailoring, ATS scoring, and export land in later phases.
	</p>
</div>
