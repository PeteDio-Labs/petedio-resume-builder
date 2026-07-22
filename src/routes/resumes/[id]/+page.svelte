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

	// Section counts drive both the rail nav and the collapsed group headers: a
	// count is a completeness signal, so an empty section says so rather than
	// hiding behind a chevron.
	const counts = $derived({
		basics: [resume.basics.name, resume.basics.label, resume.basics.email, resume.basics.phone,
			resume.basics.summary, resume.basics.location?.city].filter((v) => (v ?? '').trim() !== '').length,
		work: resume.work.length,
		skills: resume.skills.length,
		education: resume.education.length,
		projects: resume.projects.length,
		stories: resume.x_petedio.stories?.length ?? 0,
		letter: (resume.x_petedio.coverLetter?.text ?? '').trim() ? 1 : 0
	});

	// Ring geometry — one source of truth for both the rail and the sheet.
	const RING_R = 26;
	const RING_C = 2 * Math.PI * RING_R;
	const ringOffset = $derived(RING_C - (RING_C * (score.scored ? score.total : 0)) / 100);

	let sheetOpen = $state(false);
	let scoreOpen = $state(false);

	// The preview renders the real template at 8.5in and is scaled to the pane,
	// so the pane shows the document rather than a restyled approximation.
	let paneWidth = $state(0);
	const previewScale = $derived(paneWidth ? Math.min(1, paneWidth / 816) : 1);

	// Template choice persists server-side; the segmented control fires the same
	// action the old "switch to B" button did.
	async function setTemplate(next: 'A' | 'B') {
		if (next === template) return;
		template = next;
		const body = new FormData();
		body.set('template', next);
		await fetch('?/template', { method: 'POST', body }).catch(() => {});
	}

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

<div class="workspace no-print" data-band={score.band}>
	<!-- ── Rail: nav + the score, always visible while editing (D1/D2) ── -->
	<aside class="rail">
		<div class="row" style="gap:0.5rem">
			<a href="/resumes" class="btn-ghost" style="padding-left:0">← Resumes</a>
			<span class="spacer"></span>
			<span class="chip">{status}</span>
		</div>

		<button type="button" class="score-ring" onclick={() => (scoreOpen = !scoreOpen)}
			aria-expanded={scoreOpen} title="Show the score breakdown">
			<span class="ring">
				<svg width="54" height="54" viewBox="0 0 62 62" aria-hidden="true">
					<circle cx="31" cy="31" r={RING_R} fill="none" stroke="rgba(255,255,255,.1)" stroke-width="6" />
					<circle cx="31" cy="31" r={RING_R} fill="none" stroke={bandColor} stroke-width="6"
						stroke-linecap="round" stroke-dasharray={RING_C} stroke-dashoffset={ringOffset} />
				</svg>
				<b style="color:{bandColor}">{score.scored ? score.total : '—'}</b>
			</span>
			<span class="meta">
				<strong>ATS match</strong>
				<span>{bandNote}</span>
			</span>
		</button>

		<nav class="rail-nav">
			<div class="nav-label">Sections</div>
			<a href="#sec-basics">Basics <span class="count" class:empty={counts.basics === 0}>{counts.basics}/6</span></a>
			<a href="#sec-work">Work experience <span class="count" class:empty={counts.work === 0}>{counts.work}</span></a>
			<a href="#sec-skills">Skills <span class="count" class:empty={counts.skills === 0}>{counts.skills}</span></a>
			<a href="#sec-education">Education <span class="count" class:empty={counts.education === 0}>{counts.education}</span></a>
			<a href="#sec-projects">Projects <span class="count" class:empty={counts.projects === 0}>{counts.projects}</span></a>
			<a href="#sec-stories">Story bank <span class="count" class:empty={counts.stories === 0}>{counts.stories}</span></a>
			<a href="#sec-letter">Cover letter <span class="count" class:empty={counts.letter === 0}>{counts.letter}</span></a>
			<a href="#sec-lint">Lint <span class="count" class:empty={false}>{lint.length}</span></a>
		</nav>
	</aside>

	<!-- ── Editor ── -->
	<main style="min-width:0">
		<div class="row" style="align-items:flex-start; gap:0.75rem">
			<div style="min-width:0">
				<h1 style="font-size:var(--t-display); margin:0">{data.targetJob.title || 'Untitled resume'}</h1>
				<p class="muted" style="margin:0.15rem 0 0">{data.targetJob.company || '—'}{data.targetJob.url ? ' · ' : ''}{#if data.targetJob.url}<a href={data.targetJob.url} target="_blank" rel="noopener noreferrer">job link ↗</a>{/if}</p>
			</div>
		</div>

		<!-- One primary action; the rest step back or move under ⋯ (D4) -->
		<div class="row" style="margin-top:0.9rem; gap:0.5rem">
			<a class="btn btn-primary" href={`/resumes/${data.id}/pdf?template=${template}`} data-sveltekit-reload>
				Download PDF
			</a>

			<form method="POST" action="?/generate" use:confirmSubmit={
				dirty
					? 'Regenerate from your master profile? Your unsaved edits to this resume will be replaced.'
					: 'Regenerate this resume from your master profile?'
			} use:enhance={() => {
				msg = null;
				return async ({ result }) => {
					if (result.type === 'success' && result.data?.resume) {
						resume = hydrate(result.data.resume as ResumeDocument);
						baseline = JSON.stringify(resume);
						revisions = (result.data.revisions as typeof revisions) ?? revisions;
						status = (result.data.status as string) ?? status;
						msg = { kind: 'ok', text: 'Tailored resume generated from your master profile.' };
					} else if (result.type === 'failure') {
						msg = { kind: 'err', text: (result.data?.message as string) ?? 'Generation failed.' };
					}
				};
			}}>
				<button type="submit" class="btn" disabled={!data.hasProfile}>Generate from master profile</button>
			</form>

			<button type="button" class="btn preview-only-mobile" onclick={() => (sheetOpen = true)}>Preview</button>
			<button type="button" class="btn" onclick={downloadJson} title="Download the raw JSON Resume document">JSON</button>
		</div>

		{#if data.demo}
			<div class="banner info" style="margin:1rem 0">🎬 Demo mode — AI runs deterministic stubs; data resets on restart.</div>
		{/if}
		{#if !data.hasProfile}
			<div class="banner warn" style="margin:1rem 0">No master profile yet — <a href="/profile">create one</a> to generate a tailored resume.</div>
		{/if}
		{#if msg}
			<div class={msg.kind === 'ok' ? 'banner ok' : 'banner warn'} style="margin:1rem 0">{msg.text}</div>
		{/if}

		<!-- Keywords: covered reads green, missing is an opportunity with a way to
		     act on it — not a red chip that looks like a mistake (D3). -->
		{#if score.scored}
			<div class="card" style="margin-top:1rem">
				<div class="row" style="align-items:baseline">
					<strong style="font-size:var(--t-head)">Keywords to cover</strong>
					<span class="spacer"></span>
					<span class="dim" style="font-size:var(--t-micro)">
						{score.matched.length} of {score.matched.length + score.missing.length} covered
					</span>
				</div>
				<div class="chips" style="margin-top:0.6rem">
					{#each score.matched.slice(0, 8) as m (m)}
						<span class="kw-chip covered">{m} ✓</span>
					{/each}
					{#each score.missing.slice(0, 12) as m (m)}
						<a class="kw-chip" href="#sec-skills" title="Add “{m}” where it's true — skills or a bullet">
							{m} <span class="plus">+</span>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if scoreOpen}
			<div class="card" style="margin-top:1rem">
				<div class="section-head"><h2>Score breakdown</h2></div>
				<div style="display:flex; flex-direction:column; gap:0.4rem">
					{#each score.components as c (c.label)}
						<div class="row" style="gap:0.6rem; align-items:center; opacity:{c.applicable ? 1 : 0.45}">
							<span class="muted" style="width:10rem; font-size:0.82rem">{c.label}</span>
							<div style="flex:1; min-width:4rem; height:8px; background:var(--surface-3); border-radius:99px; overflow:hidden">
								{#if c.applicable}
									<div style="height:100%; width:{Math.round((c.got / c.max) * 100)}%; background:{bandColor}"></div>
								{/if}
							</div>
							<span class="dim" style="width:4rem; text-align:right; font-variant-numeric:tabular-nums">
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
			</div>
		{/if}

	<!-- Editor -->
	<div style="margin-top:1.25rem"><ProfileEditor bind:profile={resume} /></div>

	<!-- Cover letter -->
	<div class="card" id="sec-letter" style="margin-top:1rem">
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
	<div class="card" id="sec-lint" style="margin-top:1rem">
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
					baseline = JSON.stringify(resume);
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
	</main>

	<!-- ── The document itself, live (D1). Rendered at real width and scaled to
	     the pane, so this is the artefact rather than a restyled copy. ── -->
	<aside class="preview-pane" bind:clientWidth={paneWidth}>
		<div class="seg">
			<button type="button" aria-pressed={template === 'A'} onclick={() => setTemplate('A')}>Template A</button>
			<button type="button" aria-pressed={template === 'B'} onclick={() => setTemplate('B')}>Template B</button>
		</div>
		<div class="preview-scroll">
			<div class="preview-scale" style="transform:scale({previewScale}); height:{previewScale * 1056}px">
				<ResumePreview {resume} {template} />
			</div>
		</div>
	</aside>
</div>

<!-- Mobile: the document opens as a sheet — the panel's pattern, not a new one. -->
{#if sheetOpen}
	<button class="sheet-backdrop" aria-label="Close preview" onclick={() => (sheetOpen = false)}></button>
	<div class="sheet" role="dialog" aria-label="Resume preview">
		<div class="grabber"></div>
		<div class="row">
			<strong>Preview</strong>
			<span class="spacer"></span>
			<button type="button" class="btn-ghost" onclick={() => (sheetOpen = false)}>Done</button>
		</div>
		<div class="seg">
			<button type="button" aria-pressed={template === 'A'} onclick={() => setTemplate('A')}>A</button>
			<button type="button" aria-pressed={template === 'B'} onclick={() => setTemplate('B')}>B</button>
		</div>
		<div class="preview-scroll" style="flex:1">
			<div class="preview-scale" style="transform:scale(0.42); height:444px">
				<ResumePreview {resume} {template} />
			</div>
		</div>
		<a class="btn btn-primary" style="justify-content:center" href={`/resumes/${data.id}/pdf?template=${template}`} data-sveltekit-reload>
			Download PDF
		</a>
	</div>
{/if}

<!-- Print target (browser print still works; the real export is server-side). -->
<div class="page print-area" style="display:none">
	<ResumePreview {resume} {template} />
</div>
