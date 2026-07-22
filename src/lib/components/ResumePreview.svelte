<script lang="ts">
	/**
	 * Renders a ResumeDocument as a clean, black-on-white resume — Template A
	 * (ATS-safe single column) or Template B (styled banner header, same body).
	 * This is the browser print-to-PDF export path for now; Typst (a real tagged
	 * PDF) is the eventual replacement, same JSON in.
	 */
	import type { ResumeDocument } from '$lib/resume/schema';

	let { resume, template = 'A' }: { resume: ResumeDocument; template?: 'A' | 'B' } = $props();

	function dateRange(a?: string, b?: string): string {
		if (!a && !b) return '';
		return [a, b].filter(Boolean).join(' – ');
	}
	const contact = $derived(
		[
			resume.basics.email,
			resume.basics.phone,
			resume.basics.location?.city && resume.basics.location?.region
				? `${resume.basics.location.city}, ${resume.basics.location.region}`
				: resume.basics.location?.city,
			resume.basics.url,
			...(resume.basics.profiles ?? []).map((p) => p.url)
		]
			.filter(Boolean)
			.join('  •  ')
	);
</script>

<article class="resume-preview" class:banner={template === 'B'}>
	<header class="rp-head">
		<h1>{resume.basics.name || 'Your Name'}</h1>
		{#if resume.basics.label}<div class="rp-label">{resume.basics.label}</div>{/if}
		{#if contact}<div class="rp-contact">{contact}</div>{/if}
	</header>

	{#if resume.basics.summary}
		<section><h2>Summary</h2><p>{resume.basics.summary}</p></section>
	{/if}

	{#if resume.work.length}
		<section>
			<h2>Work Experience</h2>
			{#each resume.work as w (w)}
				<div class="rp-entry">
					<div class="rp-entry-head">
						<strong>{w.position}{w.name ? `, ${w.name}` : ''}</strong>
						<span class="rp-dates">{dateRange(w.startDate, w.endDate)}</span>
					</div>
					{#if w.location}<div class="rp-sub">{w.location}</div>{/if}
					{#if w.summary}<p>{w.summary}</p>{/if}
					{#if w.highlights?.length}
						<ul>{#each w.highlights as h (h)}<li>{h}</li>{/each}</ul>
					{/if}
				</div>
			{/each}
		</section>
	{/if}

	{#if resume.education.length}
		<section>
			<h2>Education</h2>
			{#each resume.education as e (e)}
				<div class="rp-entry">
					<div class="rp-entry-head">
						<strong>{e.studyType}{e.area ? `, ${e.area}` : ''}</strong>
						<span class="rp-dates">{dateRange(e.startDate, e.endDate)}</span>
					</div>
					{#if e.institution}<div class="rp-sub">{e.institution}</div>{/if}
				</div>
			{/each}
		</section>
	{/if}

	{#if resume.skills.length}
		<section>
			<h2>Skills</h2>
			{#each resume.skills as s (s)}
				<div class="rp-skill"><strong>{s.name}:</strong> {(s.keywords ?? []).join(', ')}</div>
			{/each}
		</section>
	{/if}

	{#if resume.certificates.length}
		<section>
			<h2>Certifications</h2>
			{#each resume.certificates as c (c)}
				<div class="rp-skill">{c.name}{c.issuer ? ` — ${c.issuer}` : ''}{c.date ? ` (${c.date})` : ''}</div>
			{/each}
		</section>
	{/if}

	{#if resume.projects.length}
		<section>
			<h2>Projects</h2>
			{#each resume.projects as p (p)}
				<div class="rp-entry">
					<strong>{p.name}</strong>
					{#if p.description}<p>{p.description}</p>{/if}
					{#if p.highlights?.length}<ul>{#each p.highlights as h (h)}<li>{h}</li>{/each}</ul>{/if}
				</div>
			{/each}
		</section>
	{/if}
</article>

<style>
	.resume-preview {
		background: #fff;
		color: #111;
		border-radius: 12px;
		padding: 2.2rem 2.4rem;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 12px;
		line-height: 1.5;
		max-width: 8.5in;
	}
	.rp-head { margin-bottom: 1rem; }
	.rp-head h1 { font-size: 22px; margin: 0; color: #111; letter-spacing: normal; }
	.rp-label { font-size: 13px; color: #333; margin-top: 2px; }
	.rp-contact { font-size: 11px; color: #444; margin-top: 6px; }
	.resume-preview h2 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border-bottom: 1px solid #999;
		padding-bottom: 2px;
		margin: 1.1rem 0 0.5rem;
		color: #111;
	}
	.resume-preview p { margin: 0.25rem 0; }
	.rp-entry { margin-bottom: 0.7rem; }
	.rp-entry-head { display: flex; justify-content: space-between; gap: 1rem; }
	.rp-dates { color: #555; white-space: nowrap; font-size: 11px; }
	.rp-sub { color: #444; font-style: italic; font-size: 11px; }
	.resume-preview ul { margin: 0.3rem 0 0.3rem 1.1rem; padding: 0; }
	.resume-preview li { margin: 0.15rem 0; }
	.rp-skill { margin: 0.2rem 0; }

	/* Template B — banner header on a tinted band (dark text on light tint). */
	.banner .rp-head {
		background: #eef2f7;
		border-left: 4px solid #2f6feb;
		padding: 1rem 1.2rem;
		border-radius: 8px;
		margin: -0.6rem -0.8rem 1rem;
	}
	.banner h2 { border-bottom-color: #2f6feb; color: #1a3c7a; }
</style>
