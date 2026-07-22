<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { ExtractedKeyword } from '$lib/resume/schema';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Kw = ExtractedKeyword & { included: boolean };

	let title = $state('');
	let company = $state('');
	let url = $state('');
	let jdText = $state('');

	let extracting = $state(false);
	let extractErr = $state('');
	let mode = $state('');
	let keywords = $state<Kw[]>([]);
	let reviewing = $state(false);

	let saving = $state(false);
	let saveErr = $state('');
	let custom = $state('');

	type Rec = { id: string; title: string; company: string; score: number; why: string };
	let recommendations = $state<Rec[]>([]);

	// Model refinement runs in the background: the heuristic set lands instantly so
	// she can start reviewing, and the model's sharper set is OFFERED when it
	// arrives rather than swapped in — replacing keywords she has already toggled
	// would silently discard her choices.
	let refining = $state(false);
	let refined = $state<ExtractedKeyword[] | null>(null);

	async function pollRefine(jobId: string) {
		refining = true;
		refined = null;
		const deadline = Date.now() + 60_000;
		try {
			while (Date.now() < deadline) {
				await new Promise((r) => setTimeout(r, 900));
				const res = await fetch(`/api/jobs/${jobId}`);
				if (!res.ok) return;
				const job = (await res.json()) as {
					status: string;
					result?: { keywords: ExtractedKeyword[] } | null;
				};
				if (job.status === 'done' && job.result?.keywords?.length) {
					refined = job.result.keywords;
					return;
				}
				// 'failed' means the model didn't answer — the heuristic set on screen
				// is still perfectly usable, so this is quiet, not an error banner.
				if (job.status === 'failed' || job.status === 'gone') return;
			}
		} finally {
			refining = false;
		}
	}

	function useRefined() {
		if (!refined) return;
		keywords = refined.map((k) => ({ ...k, included: true }));
		mode = 'ollama';
		refined = null;
	}

	const includedCount = $derived(keywords.filter((k) => k.included).length);

	function addCustom() {
		const term = custom.trim();
		if (term && !keywords.some((k) => k.term.toLowerCase() === term.toLowerCase())) {
			keywords.push({ term, aliases: [], kind: 'hard', weight: 50, included: true });
		}
		custom = '';
	}

	// Only the kept keywords get saved (drop the `included` UI flag).
	const selectedJson = $derived(
		JSON.stringify(
			keywords.filter((k) => k.included).map(({ included, ...k }) => k)
		)
	);
</script>

<svelte:head><title>New resume · Resume Builder</title></svelte:head>

<div class="page">
	<div class="row" style="margin-bottom:1rem">
		<a href="/resumes" class="btn-ghost">← Resumes</a>
	</div>

	<h1>Tailor a resume for a job</h1>
	<p class="muted">
		Paste a job description. We extract the ATS keywords that matter, you review them, then save a
		draft to tailor.
	</p>

	{#if data.demo}
		<div class="banner info" style="margin:1rem 0">
			🎬 Demo mode — keyword extraction runs a local deterministic heuristic (no Ollama), and the
			draft saves to the in-memory store.
		</div>
	{/if}

	<!-- Step 1: the job description -->
	<form
		method="POST"
		action="?/extract"
		class="card"
		style="margin-top:1rem"
		use:enhance={() => {
			extracting = true;
			extractErr = '';
			return async ({ result }) => {
				extracting = false;
				if (result.type === 'success' && result.data) {
					const ex = (
						result.data as {
							extracted?: { keywords: ExtractedKeyword[]; mode: string; refineJobId: string | null };
						}
					).extracted;
					if (ex) {
						keywords = ex.keywords.map((k) => ({ ...k, included: true }));
						mode = ex.mode;
						reviewing = true;
						if (ex.refineJobId) pollRefine(ex.refineJobId);
					}
					recommendations = (result.data as { recommendations?: Rec[] }).recommendations ?? [];
				} else if (result.type === 'failure') {
					extractErr = (result.data?.message as string) ?? 'Could not extract keywords.';
				} else if (result.type === 'error') {
					extractErr = 'Something went wrong extracting keywords.';
				}
			};
		}}
	>
		<div class="grid-2">
			<label class="field"><span class="field-label">Job title</span>
				<input type="text" name="title" bind:value={title} placeholder="e.g. Senior Recruiter" />
			</label>
			<label class="field"><span class="field-label">Company</span>
				<input type="text" name="company" bind:value={company} placeholder="e.g. Acme" />
			</label>
		</div>
		<label class="field"><span class="field-label">Job URL (optional)</span>
			<input type="url" name="url" bind:value={url} placeholder="https://…" />
		</label>
		<label class="field"><span class="field-label">Job description</span>
			<textarea name="jdText" rows="12" bind:value={jdText} placeholder="Paste the full job description here…"></textarea>
		</label>
		{#if extractErr}
			<div class="banner warn" style="margin-bottom:0.75rem">{extractErr}</div>
		{/if}
		<div class="row">
			<button type="submit" class="btn btn-primary" disabled={extracting || jdText.trim() === ''}>
				{extracting ? 'Extracting…' : reviewing ? 'Re-extract keywords' : 'Extract keywords'}
			</button>
		</div>
	</form>

	<!-- Reuse/remix recommendation (T5) -->
	{#if reviewing && recommendations.length}
		<div class="banner info" style="margin:1rem 0">
			<strong>You already have a similar resume:</strong>
			<ul style="margin:0.4rem 0 0; padding-left:1.1rem">
				{#each recommendations as r (r.id)}
					<li>
						<a href={`/resumes/${r.id}`}>{r.title}{r.company ? ` — ${r.company}` : ''}</a>
						<span class="dim">({r.score}% match) — reuse it instead of starting fresh.</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Step 2: review keywords -->
	{#if reviewing}
		<div class="card" style="margin-top:1rem">
			<div class="section-head">
				<h2>Keywords</h2>
				<span class="count">{includedCount} kept</span>
			</div>
			{#if refining}
				<p class="dim" style="margin-top:-0.4rem">⏳ Refining with the model in the background — these are usable now.</p>
			{:else if refined}
				<div class="banner info" style="margin:0 0 0.75rem">
					The model finished — {refined.length} sharper keywords are ready.
					<button type="button" class="btn" style="margin-left:0.5rem" onclick={useRefined}>
						Use them
					</button>
					<button type="button" class="btn-ghost" onclick={() => (refined = null)}>Keep mine</button>
				</div>
			{/if}
			<p class="muted" style="margin-top:-0.4rem">
				Tap to toggle. Ranked by weight; <span style="color:var(--blue)">hard</span> vs
				<span style="color:var(--orange)">soft</span> shown. Extracted via <strong>{mode}</strong>.
				{#if mode === 'heuristic' && !refining && !refined}
					<span class="dim">— the offline extractor. The model either isn't configured or didn't answer.</span>
				{/if}
			</p>

			<div class="chips" style="margin-top:0.75rem">
				{#each keywords as kw, i (kw.term + i)}
					<button
						type="button"
						class="toggle kw-chip"
						aria-pressed={kw.included}
						style={kw.included ? '' : 'opacity:0.4; text-decoration:line-through'}
						onclick={() => (keywords[i].included = !keywords[i].included)}
						title={`${kw.kind} · weight ${kw.weight}`}
					>
						<span style={kw.kind === 'soft' ? 'color:var(--orange)' : 'color:var(--blue)'}>●</span>
						{kw.term}
						<span class="dim" style="font-variant-numeric:tabular-nums">{kw.weight}</span>
					</button>
				{/each}
			</div>

			<div class="row" style="margin-top:0.9rem">
				<input
					type="text"
					style="max-width:16rem"
					placeholder="Add a keyword…"
					bind:value={custom}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							addCustom();
						}
					}}
				/>
				<button type="button" class="btn-ghost" onclick={addCustom}>+ Add</button>
			</div>
		</div>

		<form
			method="POST"
			action="?/save"
			class="save-bar"
			use:enhance={() => {
				saving = true;
				saveErr = '';
				return async ({ result }) => {
					saving = false;
					if (result.type === 'redirect') {
						await goto(result.location);
					} else if (result.type === 'failure') {
						saveErr = (result.data?.message as string) ?? 'Save failed.';
					} else if (result.type === 'error') {
						saveErr = 'Save failed — network error.';
					}
				};
			}}
		>
			<input type="hidden" name="title" value={title} />
			<input type="hidden" name="company" value={company} />
			<input type="hidden" name="url" value={url} />
			<input type="hidden" name="jdText" value={jdText} />
			<input type="hidden" name="keywords" value={selectedJson} />
			<button type="submit" class="btn btn-primary" disabled={saving || includedCount === 0}>
				{saving ? 'Saving…' : 'Save draft'}
			</button>
			<span class="muted">{includedCount} keyword{includedCount === 1 ? '' : 's'}</span>
			<span class="spacer"></span>
			{#if saveErr}
				<span class="banner warn" style="padding:0.35rem 0.7rem">{saveErr}</span>
			{/if}
		</form>
	{/if}
</div>

<style>
	.kw-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
</style>
