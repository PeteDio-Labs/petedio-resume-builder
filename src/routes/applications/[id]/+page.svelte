<script lang="ts">
	import { enhance } from '$app/forms';
	import { APPLICATION_STATUSES, QA_PRESETS, STATUS_COLOR, type QaKind } from '$lib/applications';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let question = $state('');
	let kind = $state<QaKind>('custom');
	let context = $state('');
	let targetChars = $state(0);

	// Per-answer editing buffer, keyed by id. Seeded from the server and re-seeded
	// whenever the server sends a different set (new draft, delete) — but NOT on
	// every load, or typing would be overwritten by a stale value.
	let draft = $state<Record<string, string>>({});
	$effect(() => {
		for (const entry of data.qa) {
			if (!(entry.id in draft)) draft[entry.id] = entry.answer;
		}
		for (const id of Object.keys(draft)) {
			if (!data.qa.some((e) => e.id === id)) delete draft[id];
		}
	});
	let asking = $state(false);

	function usePreset(p: { kind: QaKind; question: string }) {
		question = p.question;
		kind = p.kind;
	}
</script>

<svelte:head><title>{data.label} · Job tracker</title></svelte:head>

<div class="page">
	<div class="row" style="margin-bottom:1rem">
		<a href="/applications" class="btn-ghost">← Job tracker</a>
		<span class="spacer"></span>
		<span class="chip" style="border-color:{STATUS_COLOR[data.status]}; color:{STATUS_COLOR[data.status]}">{data.status}</span>
	</div>

	<h1>{data.label}</h1>
	<p class="muted">
		{data.company || '—'} ·
		<a href={data.url} target="_blank" rel="noopener noreferrer">job link ↗</a>
		{#if data.resumeTitle} · resume: <a href={`/resumes/${data.resumeId}`}>{data.resumeTitle}</a>{/if}
	</p>

	{#if data.demo}
		<div class="banner info" style="margin:1rem 0">🎬 Demo mode — answers are drafted by a deterministic stub from your profile + story bank.</div>
	{/if}

	<!-- Status -->
	<form method="POST" action="?/setStatus" class="card" style="margin-top:1rem" use:enhance>
		<div class="row">
			<span class="field-label">Pipeline status</span>
			<select name="status" value={data.status} onchange={(e) => e.currentTarget.form?.requestSubmit()}>
				{#each APPLICATION_STATUSES as s (s)}<option value={s}>{s}</option>{/each}
			</select>
		</div>
	</form>

	<!-- Q&A composer -->
	<div class="card" style="margin-top:1rem">
		<div class="section-head"><h2>Application Q&amp;A</h2></div>
		<p class="muted" style="margin-top:-0.4rem">Draft answers grounded in your profile, this resume, and — for behavioral questions — your story bank.</p>
		{#if !data.hasStories}
			<div class="banner warn" style="margin:0.5rem 0">No stories in your <a href="/profile">story bank</a> yet — behavioral answers will be thinner without them.</div>
		{/if}

		<div class="chips" style="margin:0.5rem 0 0.75rem">
			{#each QA_PRESETS as p (p.label)}
				<button type="button" class="toggle" onclick={() => usePreset(p)}>{p.label}</button>
			{/each}
		</div>

		<form method="POST" action="?/ask" use:enhance={() => {
			asking = true;
			return async ({ update }) => {
				asking = false;
				await update({ reset: false });
				question = '';
				context = '';
			};
		}}>
			<label class="field"><span class="field-label">Question</span>
				<textarea name="question" rows="2" bind:value={question} placeholder="Paste the exact application question…"></textarea>
			</label>
			<div class="grid-2">
				<label class="field"><span class="field-label">Kind</span>
					<select name="kind" bind:value={kind}>
						<option value="why-us">why-us</option>
						<option value="behavioral">behavioral</option>
						<option value="experience">experience</option>
						<option value="logistics">logistics</option>
						<option value="custom">custom</option>
					</select>
				</label>
				<label class="field"><span class="field-label">Char limit (0 = none)</span>
					<input type="number" name="targetChars" bind:value={targetChars} min="0" max="5000" />
				</label>
			</div>
			<label class="field"><span class="field-label">Context (optional — e.g. "they value ownership")</span>
				<input type="text" name="context" bind:value={context} />
			</label>
			<button type="submit" class="btn btn-primary" disabled={asking || question.trim() === ''}>
				{asking ? 'Drafting…' : 'Draft answer'}
			</button>
		</form>
	</div>

	<!-- Saved answers -->
	<div class="section-head" style="margin-top:1.5rem"><h2>Saved answers</h2><span class="count">{data.qa.length}</span></div>
	{#if data.qa.length === 0}
		<div class="card" style="text-align:center"><p class="muted">No answers drafted yet.</p></div>
	{:else}
		<div class="stack">
			{#each data.qa as entry (entry.id)}
				<div class="card qa-item">
					<div style="font-weight:600">{entry.question}</div>
					<div class="dim" style="font-size:0.78rem; margin:0.2rem 0 0.5rem">{entry.kind}{entry.storyId ? ' · from a story' : ''}</div>
					<form method="POST" action="?/saveAnswer" use:enhance>
						<input type="hidden" name="qaId" value={entry.id} />
						<!-- Bound, not static: the counter below reads this value, and an
						     uncontrolled textarea left it frozen at the server-rendered
						     length — misleading on exactly the character-capped forms the
						     counter exists for. -->
						<textarea name="answer" rows="5" bind:value={draft[entry.id]}></textarea>
						<div class="row" style="margin-top:0.5rem">
							<button type="submit" class="btn">Save edit</button>
							<button type="button" class="btn-ghost" onclick={(e) => {
								const ta = (e.currentTarget.closest('.qa-item') as HTMLElement)?.querySelector('textarea');
								if (ta) navigator.clipboard?.writeText(ta.value);
							}}>Copy</button>
							<span class="spacer"></span>
							{#if entry.targetChars > 0}
								<span
									class="dim"
									style="font-size:0.8rem; color:{(draft[entry.id] ?? '').length > entry.targetChars
										? 'var(--red)'
										: 'var(--label-3)'}"
								>
									{(draft[entry.id] ?? '').length}/{entry.targetChars}
								</span>
							{/if}
						</div>
					</form>
					<form method="POST" action="?/deleteAnswer" use:enhance style="margin-top:0.4rem">
						<input type="hidden" name="qaId" value={entry.id} />
						<button type="submit" class="btn-ghost btn-danger">Delete</button>
					</form>
				</div>
			{/each}
		</div>
	{/if}
</div>
