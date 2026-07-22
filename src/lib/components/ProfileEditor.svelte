<script lang="ts">
	/**
	 * The master-profile editor. Edits a `ResumeDocument` in place via Svelte 5
	 * deep reactivity — the parent owns the `$state` and binds it here, then
	 * serializes it to JSON for the save action. Used by both `/profile` and the
	 * `/profile/import` review step.
	 */
	import {
		STORY_TAGS,
		newCertificateItem,
		newEducationItem,
		newProjectItem,
		newSkillItem,
		newStory,
		newWorkItem,
		type ResumeDocument,
		type Story,
		type StoryTag
	} from '$lib/resume/schema';
	import KeywordEditor from './KeywordEditor.svelte';
	import BulletList from './BulletList.svelte';

	let {
		profile = $bindable(),
		/**
		 * Start with every section open. The import review step needs this: its
		 * whole promise is "check what we parsed before saving", and collapsing
		 * the parse behind chevrons quietly breaks that.
		 */
		expandAll = false
	}: { profile: ResumeDocument; expandAll?: boolean } = $props();

	/**
	 * Sections collapse (UX plan D6). Every group used to be expanded, always —
	 * a wall of fields with nothing to navigate it by. Basics stays open because
	 * it's where you land; the rest announce what they hold via their count.
	 *
	 * The count doubles as a completeness signal, so an empty section says so in
	 * amber rather than hiding behind a chevron.
	 */
	// svelte-ignore state_referenced_locally
	let open = $state<Record<string, boolean>>({
		basics: true,
		work: expandAll,
		education: expandAll,
		skills: expandAll,
		certificates: expandAll,
		projects: expandAll,
		stories: expandAll
	});

	const filledBasics = $derived(
		[
			profile.basics.name,
			profile.basics.label,
			profile.basics.email,
			profile.basics.phone,
			profile.basics.summary,
			profile.basics.location?.city
		].filter((v) => (v ?? '').trim() !== '').length
	);

	// A rail link points at a collapsed section — open it, or the jump lands on a
	// closed summary and reads as broken.
	function openFromHash() {
		const key = location.hash.replace('#sec-', '');
		if (!key || !(key in open)) return;
		open[key] = true;
		// The browser scrolls to the anchor while it is still collapsed, so the
		// section ends up mid-viewport once it expands. Re-align after the open.
		requestAnimationFrame(() => {
			document.getElementById(`sec-${key}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
		});
	}
	$effect(() => {
		openFromHash();
		window.addEventListener('hashchange', openFromHash);
		return () => window.removeEventListener('hashchange', openFromHash);
	});

	function toggleTag(story: Story, tag: StoryTag) {
		const i = story.tags.indexOf(tag);
		if (i >= 0) story.tags.splice(i, 1);
		else story.tags.push(tag);
	}
</script>

<div class="stack">
	<!-- Basics -->
	<details class="group" id="sec-basics" bind:open={open.basics}>
		<summary><h2>Basics</h2><span class="count" class:empty={filledBasics === 0}>{filledBasics}/6</span></summary>
		<div class="group-body">
		<div class="grid-2">
			<label class="field"><span class="field-label">Name</span>
				<input type="text" bind:value={profile.basics.name} />
			</label>
			<label class="field"><span class="field-label">Headline / target title</span>
				<input type="text" bind:value={profile.basics.label} placeholder="e.g. Talent Acquisition Partner" />
			</label>
			<label class="field"><span class="field-label">Email</span>
				<input type="email" bind:value={profile.basics.email} />
			</label>
			<label class="field"><span class="field-label">Phone</span>
				<input type="tel" bind:value={profile.basics.phone} />
			</label>
			<label class="field"><span class="field-label">City</span>
				<input
					type="text"
					value={profile.basics.location?.city ?? ''}
					oninput={(e) => {
						profile.basics.location ??= {};
						profile.basics.location.city = e.currentTarget.value;
					}}
				/>
			</label>
			<label class="field"><span class="field-label">Region / State</span>
				<input
					type="text"
					value={profile.basics.location?.region ?? ''}
					oninput={(e) => {
						profile.basics.location ??= {};
						profile.basics.location.region = e.currentTarget.value;
					}}
				/>
			</label>
			<label class="field"><span class="field-label">Website</span>
				<input type="url" bind:value={profile.basics.url} />
			</label>
		</div>
		<label class="field"><span class="field-label">Professional summary</span>
			<textarea rows="4" bind:value={profile.basics.summary}></textarea>
		</label>

		<div class="field">
			<span class="field-label">Profiles (LinkedIn, GitHub, …)</span>
			{#each profile.basics.profiles ?? [] as prof, i (prof)}
				<div class="row">
					<input type="text" style="max-width:9rem" placeholder="Network" bind:value={prof.network} aria-label="Network" />
					<input type="url" style="flex:1" placeholder="URL" bind:value={prof.url} aria-label="Profile URL" />
					<button type="button" class="icon-btn" aria-label="Remove profile" onclick={() => (profile.basics.profiles ?? []).splice(i, 1)}>×</button>
				</div>
			{/each}
			<button type="button" class="btn-ghost" onclick={() => (profile.basics.profiles ??= []).push({ network: '', url: '' })}>+ Add profile</button>
		</div>
		</div>
	</details>

	<!-- Work -->
	<details class="group" id="sec-work" bind:open={open.work}>
		<summary><h2>Work experience</h2><span class="count" class:empty={profile.work.length === 0}>{profile.work.length}</span></summary>
		<div class="group-body">
		{#each profile.work as w, i (w)}
			<div class="entry">
				<div class="entry-head">
					<span class="title">Role {i + 1}</span>
					<span class="spacer"></span>
					<button type="button" class="btn-ghost btn-danger" onclick={() => profile.work.splice(i, 1)}>Remove</button>
				</div>
				<div class="grid-2">
					<label class="field"><span class="field-label">Position</span><input type="text" bind:value={w.position} /></label>
					<label class="field"><span class="field-label">Company</span><input type="text" bind:value={w.name} /></label>
					<label class="field"><span class="field-label">Location</span><input type="text" bind:value={w.location} /></label>
					<label class="field"><span class="field-label">URL</span><input type="url" bind:value={w.url} /></label>
					<label class="field"><span class="field-label">Start (YYYY-MM)</span><input type="text" bind:value={w.startDate} placeholder="2022-06" /></label>
					<label class="field"><span class="field-label">End (YYYY-MM or Present)</span><input type="text" bind:value={w.endDate} placeholder="Present" /></label>
				</div>
				<label class="field"><span class="field-label">Summary (optional)</span><textarea rows="2" bind:value={w.summary}></textarea></label>
				<div class="field">
					<span class="field-label">Highlights</span>
					<BulletList bind:items={w.highlights} placeholder="Action + context + quantified result" />
				</div>
			</div>
		{/each}
		<button type="button" class="btn" onclick={() => profile.work.push(newWorkItem())}>+ Add role</button>
		</div>
	</details>

	<!-- Education -->
	<details class="group" id="sec-education" bind:open={open.education}>
		<summary><h2>Education</h2><span class="count" class:empty={profile.education.length === 0}>{profile.education.length}</span></summary>
		<div class="group-body">
		{#each profile.education as e, i (e)}
			<div class="entry">
				<div class="entry-head">
					<span class="title">Education {i + 1}</span>
					<span class="spacer"></span>
					<button type="button" class="btn-ghost btn-danger" onclick={() => profile.education.splice(i, 1)}>Remove</button>
				</div>
				<div class="grid-2">
					<label class="field"><span class="field-label">Institution</span><input type="text" bind:value={e.institution} /></label>
					<label class="field"><span class="field-label">Degree / study type</span><input type="text" bind:value={e.studyType} /></label>
					<label class="field"><span class="field-label">Area / field</span><input type="text" bind:value={e.area} /></label>
					<label class="field"><span class="field-label">Score (optional)</span><input type="text" bind:value={e.score} /></label>
					<label class="field"><span class="field-label">Start (YYYY-MM)</span><input type="text" bind:value={e.startDate} /></label>
					<label class="field"><span class="field-label">End (YYYY-MM)</span><input type="text" bind:value={e.endDate} /></label>
				</div>
			</div>
		{/each}
		<button type="button" class="btn" onclick={() => profile.education.push(newEducationItem())}>+ Add education</button>
		</div>
	</details>

	<!-- Skills -->
	<details class="group" id="sec-skills" bind:open={open.skills}>
		<summary><h2>Skills</h2><span class="count" class:empty={profile.skills.length === 0}>{profile.skills.length}</span></summary>
		<div class="group-body">
		{#each profile.skills as s, i (s)}
			<div class="entry">
				<div class="entry-head">
					<input type="text" style="max-width:16rem" placeholder="Group name (e.g. Recruiting Stack)" bind:value={s.name} aria-label="Skill group name" />
					<span class="spacer"></span>
					<button type="button" class="btn-ghost btn-danger" onclick={() => profile.skills.splice(i, 1)}>Remove</button>
				</div>
				<KeywordEditor bind:keywords={s.keywords} placeholder="Add a skill…" />
			</div>
		{/each}
		<button type="button" class="btn" onclick={() => profile.skills.push(newSkillItem())}>+ Add skill group</button>
		</div>
	</details>

	<!-- Certificates -->
	<details class="group" id="sec-certificates" bind:open={open.certificates}>
		<summary><h2>Certifications</h2><span class="count" class:empty={profile.certificates.length === 0}>{profile.certificates.length}</span></summary>
		<div class="group-body">
		{#each profile.certificates as c, i (c)}
			<div class="entry">
				<div class="entry-head">
					<span class="title">Certificate {i + 1}</span>
					<span class="spacer"></span>
					<button type="button" class="btn-ghost btn-danger" onclick={() => profile.certificates.splice(i, 1)}>Remove</button>
				</div>
				<div class="grid-2">
					<label class="field"><span class="field-label">Name</span><input type="text" bind:value={c.name} /></label>
					<label class="field"><span class="field-label">Issuer</span><input type="text" bind:value={c.issuer} /></label>
					<label class="field"><span class="field-label">Date</span><input type="text" bind:value={c.date} placeholder="2024 or 2024-03" /></label>
				</div>
			</div>
		{/each}
		<button type="button" class="btn" onclick={() => profile.certificates.push(newCertificateItem())}>+ Add certificate</button>
		</div>
	</details>

	<!-- Projects -->
	<details class="group" id="sec-projects" bind:open={open.projects}>
		<summary><h2>Projects</h2><span class="count" class:empty={profile.projects.length === 0}>{profile.projects.length}</span></summary>
		<div class="group-body">
		{#each profile.projects as p, i (p)}
			<div class="entry">
				<div class="entry-head">
					<span class="title">Project {i + 1}</span>
					<span class="spacer"></span>
					<button type="button" class="btn-ghost btn-danger" onclick={() => profile.projects.splice(i, 1)}>Remove</button>
				</div>
				<div class="grid-2">
					<label class="field"><span class="field-label">Name</span><input type="text" bind:value={p.name} /></label>
					<label class="field"><span class="field-label">URL</span><input type="url" bind:value={p.url} /></label>
				</div>
				<label class="field"><span class="field-label">Description</span><textarea rows="2" bind:value={p.description}></textarea></label>
				<div class="field"><span class="field-label">Highlights</span><BulletList bind:items={p.highlights} /></div>
				<div class="field"><span class="field-label">Keywords</span><KeywordEditor bind:keywords={p.keywords} /></div>
			</div>
		{/each}
		<button type="button" class="btn" onclick={() => profile.projects.push(newProjectItem())}>+ Add project</button>
		</div>
	</details>

	<!-- Story bank -->
	<details class="group" id="sec-stories" bind:open={open.stories}>
		<summary><h2>Story bank</h2><span class="count" class:empty={(profile.x_petedio.stories?.length ?? 0) === 0}>{profile.x_petedio.stories?.length ?? 0}</span></summary>
		<div class="group-body">
		<p class="muted" style="margin-top:-0.4rem">
			Reusable STAR anecdotes — these power application Q&amp;A answers later. Aim for 4–6, tagged so
			behavioral questions can auto-match.
		</p>
		{#each profile.x_petedio.stories ?? [] as story, i (story)}
			<div class="entry">
				<div class="entry-head">
					<input type="text" style="flex:1" placeholder="Short title (e.g. Led the ATS migration)" bind:value={story.title} aria-label="Story title" />
					<button type="button" class="btn-ghost btn-danger" onclick={() => (profile.x_petedio.stories ?? []).splice(i, 1)}>Remove</button>
				</div>
				<div class="field">
					<span class="field-label">Tags</span>
					<div class="chips">
						{#each STORY_TAGS as tag (tag)}
							<button
								type="button"
								class="toggle"
								aria-pressed={story.tags.includes(tag)}
								onclick={() => toggleTag(story, tag)}
							>
								{tag}
							</button>
						{/each}
					</div>
				</div>
				<label class="field"><span class="field-label">Situation</span><textarea rows="2" bind:value={story.situation}></textarea></label>
				<label class="field"><span class="field-label">Task</span><textarea rows="2" bind:value={story.task}></textarea></label>
				<label class="field"><span class="field-label">Action</span><textarea rows="2" bind:value={story.action}></textarea></label>
				<label class="field"><span class="field-label">Result</span><textarea rows="2" bind:value={story.result}></textarea></label>
				<label class="field"><span class="field-label">Metrics (optional)</span><input type="text" bind:value={story.metrics} placeholder="e.g. cut time-to-hire 30%" /></label>
			</div>
		{/each}
		<button type="button" class="btn" onclick={() => (profile.x_petedio.stories ??= []).push(newStory())}>+ Add story</button>
		</div>
	</details>
</div>
