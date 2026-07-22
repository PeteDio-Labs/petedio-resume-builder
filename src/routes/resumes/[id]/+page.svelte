<script lang="ts">
	import { enhance } from '$app/forms';
	import ProfileEditor from '$lib/components/ProfileEditor.svelte';
	import ResumePreview from '$lib/components/ResumePreview.svelte';
	import { computeAtsScore, lintResume } from '$lib/resume/analyze';
	import { confirmSubmit, guardUnsavedChanges } from '$lib/guards.svelte';
	import type { ResumeDocument } from '$lib/resume/schema';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function hydrate(r: ResumeDocument): ResumeDocument {
		const c = structuredClone(r);
		c.x_petedio.coverLetter ??= { text: '' };
		return c;
	}

	// svelte-ignore state_referenced_locally
	let resume = $state(hydrate(data.resume));
	// svelte-ignore state_referenced_locally
	let revisions = $state(data.revisions);
	// svelte-ignore state_referenced_locally
	let status = $state(data.status);
	// svelte-ignore state_referenced_locally
	let template = $state<'A' | 'B'>(data.template);

	// svelte-ignore state_referenced_locally
	let baseline = $state(JSON.stringify(hydrate(data.resume)));
	const dirty = $derived(JSON.stringify(resume) !== baseline);
	guardUnsavedChanges(() => dirty, 'resume edits');

	let whyCompany = $state('');
	let msg = $state<{ kind: 'ok' | 'err'; text: string } | null>(null);
	let showPreview = $state(false);

	// Live ATS score + lint — recomputed as she edits (analyze.ts is pure/client-safe).
	const score = $derived(computeAtsScore(resume));
	const lint = $derived(lintResume(resume));
	const bandColor = $derived(
		score.band === 'unscored'
			? 'var(--label-3)'
			: score.band === 'good'
				? 'var(--green)'
				: score.band === 'stuffed'
					? 'var(--orange)'
					: 'var(--red)'
	);
	const bandNote = $derived(
		score.band === 'unscored'
			? 'Not scored yet — extract keywords from a job description first.'
			: score.band === 'good'
				? 'In the target band (75–90).'
				: score.band === 'stuffed'
					? 'Over 90 — reads as keyword stuffing.'
					: 'Below target — cover more keywords.'
	);

	function downloadJson() {
		const blob = new Blob([JSON.stringify(resume, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${(resume.basics.name || 'resume').replace(/\s+/g, '_')}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<svelte:head><title>{data.targetJob.title || 'Resume'} · Resume Builder</title></svelte:head>

<div class="page no-print">
	<div class="row" style="margin-bottom:1rem">
		<a href="/resumes" class="btn-ghost">← Resumes</a>
		<span class="spacer"></span>
		<span class="chip">{status}</span>
	</div>

	<h1>{data.targetJob.title || 'Untitled resume'}</h1>
	<p class="muted">{data.targetJob.company || '—'}{data.targetJob.url ? ' · ' : ''}{#if data.targetJob.url}<a href={data.targetJob.url} target="_blank" rel="noopener noreferrer">job link ↗</a>{/if}</p>

	{#if data.demo}
		<div class="banner info" style="margin:1rem 0">🎬 Demo mode — AI runs deterministic stubs; data resets on restart.</div>
	{/if}
	{#if !data.hasProfile}
		<div class="banner warn" style="margin:1rem 0">No master profile yet — <a href="/profile">create one</a> to generate a tailored resume.</div>
	{/if}
	{#if msg}
		<div class={msg.kind === 'ok' ? 'banner ok' : 'banner warn'} style="margin:1rem 0">{msg.text}</div>
	{/if}

	<!-- ATS score card -->
	<div class="card" style="margin-top:1rem">
		<div class="row" style="align-items:center; gap:1.25rem">
			<div style="font-size:2.6rem; font-weight:700; color:{bandColor}; font-variant-numeric:tabular-nums">
				{score.scored ? score.total : '—'}
			</div>
			<div>
				<div style="font-weight:600">ATS match score</div>
				<div class="muted">{bandNote}</div>
			</div>
		</div>
		<div style="margin-top:0.9rem; display:flex; flex-direction:column; gap:0.4rem">
			{#each score.components as c (c.label)}
				<div class="row" style="gap:0.6rem; align-items:center; opacity:{c.applicable ? 1 : 0.45}">
					<span class="muted" style="width:11rem; font-size:0.82rem">{c.label}</span>
					<div style="flex:1; height:8px; background:var(--surface-3); border-radius:99px; overflow:hidden">
						{#if c.applicable}
							<div style="height:100%; width:{Math.round((c.got / c.max) * 100)}%; background:var(--blue)"></div>
						{/if}
					</div>
					<span class="dim" style="width:5rem; text-align:right; font-variant-numeric:tabular-nums">
						{c.applicable ? `${c.got}/${c.max}` : 'n/a'}
					</span>
				</div>
			{/each}
		</div>
		{#if score.components.some((c) => !c.applicable)}
			<p class="dim" style="font-size:0.78rem; margin:0.5rem 0 0">
				“n/a” components aren't scored against — they're excluded from the total rather than counted as full marks.
			</p>
		{/if}
		{#if score.missing.length}
			<div style="margin-top:0.9rem">
				<div class="muted" style="font-size:0.82rem; margin-bottom:0.35rem">Missing keywords ({score.missing.length}):</div>
				<div class="chips">
					{#each score.missing.slice(0, 20) as m (m)}<span class="chip" style="border-color:var(--red); color:var(--red)">{m}</span>{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- Actions -->
	<div class="card" style="margin-top:1rem">
		<div class="row" style="flex-wrap:wrap; gap:0.6rem">
			<form method="POST" action="?/generate" use:confirmSubmit={
				dirty
					? 'Regenerate from your master profile? Your unsaved edits to this resume will be replaced.'
					: 'Regenerate this resume from your master profile?'
			} use:enhance={() => {
				msg = null;
				return async ({ result }) => {
					if (result.type === 'success' && result.data?.resume) {
						resume = hydrate(result.data.resume as ResumeDocument);
						revisions = (result.data.revisions as typeof revisions) ?? revisions;
						status = (result.data.status as string) ?? status;
						msg = { kind: 'ok', text: 'Tailored resume generated from your master profile.' };
					} else if (result.type === 'failure') {
						msg = { kind: 'err', text: (result.data?.message as string) ?? 'Generation failed.' };
					}
				};
			}}>
				<button type="submit" class="btn btn-primary" disabled={!data.hasProfile}>Generate from master profile</button>
			</form>

			<form method="POST" action="?/template" use:enhance={() => async ({ result }) => {
				if (result.type === 'success' && result.data?.template) template = result.data.template as 'A' | 'B';
			}}>
				<input type="hidden" name="template" value={template === 'A' ? 'B' : 'A'} />
				<button type="submit" class="btn">Template: {template} (switch to {template === 'A' ? 'B' : 'A'})</button>
			</form>

			<button type="button" class="btn" onclick={() => (showPreview = !showPreview)}>{showPreview ? 'Hide' : 'Show'} preview</button>
			<!-- Server-rendered: identical on every browser, and none of the browser
			     print artefacts (the old Print path baked the page URL + a timestamp
			     into the resume's text layer). -->
			<a class="btn btn-primary" href={`/resumes/${data.id}/pdf?template=${template}`} data-sveltekit-reload>
				Download PDF
			</a>
			<button type="button" class="btn" onclick={downloadJson}>Download JSON</button>
		</div>
	</div>

	<!-- Editor -->
	<div style="margin-top:1.25rem"><ProfileEditor bind:profile={resume} /></div>

	<!-- Cover letter -->
	<div class="card" style="margin-top:1rem">
		<div class="section-head"><h2>Cover letter</h2></div>
		<form method="POST" action="?/coverLetter" use:enhance={() => async ({ result }) => {
			if (result.type === 'success' && typeof result.data?.coverLetter === 'string') {
				resume.x_petedio.coverLetter = { text: result.data.coverLetter as string };
			}
		}}>
			<label class="field"><span class="field-label">Why this company? (one line)</span>
				<input type="text" name="why" bind:value={whyCompany} placeholder="e.g. I admire your work on…" />
			</label>
			<button type="submit" class="btn">Draft cover letter</button>
		</form>
		<div class="field" style="margin-top:0.75rem">
			<span class="field-label">Letter (editable — saved with the resume)</span>
			<textarea rows="10" bind:value={resume.x_petedio.coverLetter!.text}></textarea>
		</div>
	</div>

	<!-- Lint -->
	<div class="card" style="margin-top:1rem">
		<div class="section-head"><h2>Lint</h2><span class="count">{lint.length}</span></div>
		{#if lint.length === 0}
			<p class="muted">No issues — reads clean.</p>
		{:else}
			<ul style="margin:0; padding-left:1.1rem">
				{#each lint as f (f.message)}
					<li style="color:{f.severity === 'warn' ? 'var(--orange)' : 'var(--label-2)'}; margin:0.25rem 0">{f.message}</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- Revisions -->
	<div class="card" style="margin-top:1rem">
		<div class="section-head"><h2>Revisions</h2><span class="count">{revisions.length}</span></div>
		{#if revisions.length === 0}
			<p class="muted">No saved revisions yet.</p>
		{:else}
			<ul style="margin:0; padding-left:1.1rem">
				{#each revisions as r (r.rev)}<li class="muted" style="margin:0.2rem 0">rev {r.rev} — {r.label} · {new Date(r.savedAt).toLocaleString()}</li>{/each}
			</ul>
		{/if}
	</div>

	<!-- Save + delete bar (sibling forms — no nesting) -->
	<div class="save-bar">
		<form method="POST" action="?/save" use:enhance={() => {
			msg = null;
			return async ({ result }) => {
				if (result.type === 'success') {
					revisions = (result.data?.revisions as typeof revisions) ?? revisions;
					msg = { kind: 'ok', text: 'Saved.' };
				} else if (result.type === 'failure') {
					msg = { kind: 'err', text: (result.data?.message as string) ?? 'Save failed.' };
				}
			};
		}}>
			<input type="hidden" name="doc" value={JSON.stringify(resume)} />
			<button type="submit" class="btn btn-primary">Save resume</button>
		</form>
		<span class="spacer"></span>
		<form
			method="POST"
			action="?/softDelete"
			use:confirmSubmit={'Archive this resume? It disappears from your list — the data is kept.'}
			use:enhance
		>
			<button type="submit" class="btn-ghost">Archive</button>
		</form>
		<form
			method="POST"
			action="?/hardDelete"
			use:confirmSubmit={`Permanently delete this resume AND all ${revisions.length} of its saved revisions? This cannot be undone.`}
			use:enhance
		>
			<button type="submit" class="btn-ghost btn-danger">Delete</button>
		</form>
	</div>
</div>

<!-- Print / preview area -->
<div class="page print-area" style={showPreview ? '' : 'display:none'}>
	<ResumePreview {resume} {template} />
</div>
