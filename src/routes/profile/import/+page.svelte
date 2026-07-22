<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import ProfileEditor from '$lib/components/ProfileEditor.svelte';
	import { confirmSubmit } from '$lib/guards.svelte';
	import type { ResumeDocument } from '$lib/resume/schema';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let raw = $state('');
	let parsing = $state(false);
	let parseErr = $state('');
	let reviewDoc = $state<ResumeDocument | null>(null);
	let warnings = $state<string[]>([]);

	let saving = $state(false);
	let saveErr = $state('');

	function startOver() {
		reviewDoc = null;
		warnings = [];
		saveErr = '';
	}
</script>

<svelte:head><title>Import a resume · Resume Builder</title></svelte:head>

<div class="page">
	<div class="row" style="margin-bottom:1rem">
		<a href="/profile" class="btn-ghost">← Master profile</a>
	</div>

	<h1>Import from a resume</h1>
	<p class="muted">
		Paste the text of an existing resume. We'll parse it into a draft you can review and fix before
		saving — nothing is saved until you confirm.
	</p>

	{#if data.demo}
		<div class="banner info" style="margin:1rem 0">
			🎬 Demo mode — saving writes to an in-memory store that resets when the server restarts.
		</div>
	{/if}

	{#if reviewDoc}
		<!-- Step 2: review + save -->
		{#if data.alreadyHasProfile}
			<div class="banner warn" style="margin:1rem 0">
				⚠ You already have a master profile. Saving this will <strong>replace</strong> it.
			</div>
		{/if}

		{#if warnings.length}
			<div class="banner info" style="margin:1rem 0">
				<strong>Review these — the parser wasn't sure:</strong>
				<ul style="margin:0.4rem 0 0; padding-left:1.1rem">
					{#each warnings as w (w)}<li>{w}</li>{/each}
				</ul>
			</div>
		{:else}
			<div class="banner ok" style="margin:1rem 0">Parsed cleanly — give it a look before saving.</div>
		{/if}

		<div style="margin-top:0.5rem">
			<ProfileEditor bind:profile={reviewDoc} />
		</div>

		<form
			method="POST"
			action="?/save"
			use:confirmSubmit={
				data.alreadyHasProfile
					? 'This REPLACES your master profile with the parsed draft. The version it replaces is snapshotted, but everything on screen becomes your profile. Continue?'
					: 'Save this parsed draft as your master profile?'
			}
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
			<input type="hidden" name="doc" value={JSON.stringify(reviewDoc)} />
			<button type="submit" class="btn btn-primary" disabled={saving}>
				{saving ? 'Saving…' : 'Save as master profile'}
			</button>
			<button type="button" class="btn" onclick={startOver}>Start over</button>
			<span class="spacer"></span>
			{#if saveErr}
				<span class="banner warn" style="padding:0.35rem 0.7rem">{saveErr}</span>
			{/if}
		</form>
	{:else}
		<!-- Step 1: paste + parse -->
		<form
			method="POST"
			action="?/parse"
			class="card"
			style="margin-top:1.25rem"
			use:enhance={() => {
				parsing = true;
				parseErr = '';
				return async ({ result }) => {
					parsing = false;
					if (result.type === 'success' && result.data) {
						const d = result.data as { parsed?: { doc: ResumeDocument; warnings: string[] } };
						if (d.parsed) {
							reviewDoc = structuredClone(d.parsed.doc);
							warnings = d.parsed.warnings ?? [];
						}
					} else if (result.type === 'failure') {
						parseErr = (result.data?.message as string) ?? 'Could not parse that.';
					} else if (result.type === 'error') {
						parseErr = 'Something went wrong parsing that.';
					}
				};
			}}
		>
			<div class="field">
				<label for="raw">Resume text</label>
				<textarea
					id="raw"
					name="raw"
					rows="16"
					bind:value={raw}
					placeholder="Paste the full text of a resume here — name, contact, experience, education, skills…"
				></textarea>
			</div>
			{#if parseErr}
				<div class="banner warn" style="margin-bottom:0.75rem">{parseErr}</div>
			{/if}
			<div class="row">
				<button type="submit" class="btn btn-primary" disabled={parsing || raw.trim() === ''}>
					{parsing ? 'Parsing…' : 'Parse resume'}
				</button>
				<span class="muted">Parsing is a local heuristic — no AI, no data leaves the server.</span>
			</div>
		</form>
	{/if}
</div>
