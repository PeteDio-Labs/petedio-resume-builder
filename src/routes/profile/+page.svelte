<script lang="ts">
	import { enhance } from '$app/forms';
	import ProfileEditor from '$lib/components/ProfileEditor.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Editable working copy — a deliberate one-time snapshot of the loaded doc
	// so re-runs of `load` don't clobber in-progress edits.
	// svelte-ignore state_referenced_locally
	let profile = $state(structuredClone(data.profile));
	// svelte-ignore state_referenced_locally
	let savedAt = $state(data.updatedAt);
	let saving = $state(false);
	let status = $state<{ kind: 'ok' | 'err'; text: string } | null>(null);

	const savedLabel = $derived(
		savedAt ? `Last saved ${new Date(savedAt).toLocaleString()}` : 'Not saved yet'
	);
</script>

<svelte:head><title>Master profile · Resume Builder</title></svelte:head>

<div class="page">
	<div class="row" style="margin-bottom:1rem">
		<a href="/" class="btn-ghost">← Home</a>
		<span class="spacer"></span>
		<a href="/profile/import" class="btn">Import from a resume</a>
	</div>

	<h1>Master profile</h1>
	<p class="muted">
		Your “everything I've ever done” record — every tailored resume derives from it. Edit any
		section; changes are saved as one document.
	</p>

	{#if data.demo}
		<div class="banner info" style="margin:1rem 0">
			🎬 Demo mode — in-memory store with sample data. Edits persist until the server restarts, then
			reset.
		</div>
	{/if}

	{#if data.dbError}
		<div class="banner warn" style="margin:1rem 0">
			⚠ The database isn't reachable yet, so saving is disabled. You can still edit — nothing will
			persist until Mongo is provisioned.
		</div>
	{/if}

	<div style="margin-top:1.25rem">
		<ProfileEditor bind:profile />
	</div>

	<form
		method="POST"
		action="?/save"
		class="save-bar"
		use:enhance={() => {
			saving = true;
			status = null;
			return async ({ result }) => {
				saving = false;
				if (result.type === 'success') {
					savedAt = (result.data?.updatedAt as string) ?? savedAt;
					status = { kind: 'ok', text: 'Saved' };
				} else if (result.type === 'failure') {
					status = { kind: 'err', text: (result.data?.message as string) ?? 'Save failed.' };
				} else if (result.type === 'error') {
					status = { kind: 'err', text: 'Save failed — network error.' };
				}
			};
		}}
	>
		<input type="hidden" name="doc" value={JSON.stringify(profile)} />
		<button type="submit" class="btn btn-primary" disabled={saving}>
			{saving ? 'Saving…' : 'Save profile'}
		</button>
		<span class="muted">{savedLabel}</span>
		<span class="spacer"></span>
		{#if status}
			<span class={status.kind === 'ok' ? 'banner ok' : 'banner warn'} style="padding:0.35rem 0.7rem">
				{status.text}
			</span>
		{/if}
	</form>
</div>
