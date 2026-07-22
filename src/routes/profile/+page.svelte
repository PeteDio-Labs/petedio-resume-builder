<script lang="ts">
	import { enhance } from '$app/forms';
	import ProfileEditor from '$lib/components/ProfileEditor.svelte';
	import { confirmSubmit, guardUnsavedChanges } from '$lib/guards.svelte';
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

	// Dirty tracking is a serialised comparison against the last persisted state —
	// cheap enough for a document this size, and it can't drift out of sync the
	// way a manual "touched" flag does.
	// svelte-ignore state_referenced_locally
	let baseline = $state(JSON.stringify(data.profile));
	const dirty = $derived(JSON.stringify(profile) !== baseline);
	guardUnsavedChanges(() => dirty, 'profile edits');
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

	<!-- Version history — the undo path for a bad save or an import that replaced everything -->
	<div class="card" style="margin-top:1rem">
		<div class="section-head"><h2>Version history</h2><span class="count">{data.revisions.length}</span></div>
		{#if data.revisions.length === 0}
			<p class="muted">No earlier versions yet. Each save keeps a snapshot of what it replaced.</p>
		{:else}
			<p class="muted" style="margin-top:-0.4rem">
				Each save snapshots the version it replaced, so a bad edit or import can be rolled back.
				Restoring also snapshots the current version first.
			</p>
			<div class="stack" style="margin-top:0.6rem">
				{#each data.revisions as r (r.rev)}
					<div class="row" style="gap:0.6rem">
						<span class="muted" style="min-width:3.5rem">rev {r.rev}</span>
						<span>{r.label}</span>
						<span class="dim" style="font-size:0.8rem">{new Date(r.savedAt).toLocaleString()}</span>
						<span class="spacer"></span>
						<form
							method="POST"
							action="?/restore"
							use:confirmSubmit={`Restore version ${r.rev}? Your current profile is snapshotted first, but any UNSAVED edits on screen are lost.`}
							use:enhance={() => {
								status = null;
								return async ({ result, update }) => {
									if (result.type === 'success') {
										await update({ reset: false });
										profile = structuredClone(data.profile);
										baseline = JSON.stringify(profile);
										status = { kind: 'ok', text: `Restored version ${r.rev}.` };
									} else if (result.type === 'failure') {
										status = { kind: 'err', text: (result.data?.message as string) ?? 'Restore failed.' };
									}
								};
							}}
						>
							<input type="hidden" name="rev" value={r.rev} />
							<button type="submit" class="btn-ghost">Restore</button>
						</form>
					</div>
				{/each}
			</div>
		{/if}
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
					baseline = JSON.stringify(profile);
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
