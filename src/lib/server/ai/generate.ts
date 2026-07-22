/**
 * Deterministic generators for the demo/offline AI provider: tailoring (T2),
 * cover letters (T4), application Q&A + story matching (T6), inline rewrites
 * (T3), and version recommendation (T5). All pure and reproducible — and
 * honest: they only ever rearrange / assemble facts already in the profile,
 * story bank, or JD. Nothing is invented (the plan's hard rule). The real
 * Ollama lane slots in behind the same AiProvider methods.
 */
import { resumeText } from '../../resume/analyze';
import type { ExtractedKeyword, ResumeDocument, Story } from '../../resume/schema';
import type { QaKind } from '../../applications';
import { cosine, embedText } from './embed';

export type { QaKind };

export interface TargetJob {
	title: string;
	company: string;
	url?: string;
	jdText?: string;
	capturedAt?: string;
}

/* ---------------- T2: tailoring ---------------- */

/**
 * Choose keywords for the summary's targeting line, skipping anything that would
 * read as repetition. Without this you get "Targeting Director of Product at
 * Initech, bringing platform, product, director product." — because the raw top-N
 * repeats words already in the job title AND words shared between overlapping
 * keywords ("product" vs. "director product").
 *
 * Two rules: drop a term whose words the job title already says, and drop a term
 * sharing any word with one already chosen.
 */
export function pickDistinctKeywords(
	keywords: ExtractedKeyword[],
	jobTitle: string,
	limit: number
): string[] {
	const stop = (w: string) => w.length > 2;
	const titleWords = new Set(jobTitle.toLowerCase().split(/\s+/).filter(stop));
	const picked: string[] = [];
	const usedWords = new Set<string>();

	for (const k of keywords) {
		if (picked.length >= limit) break;
		if (k.kind === 'soft') continue;
		const term = k.term.trim();
		if (!term) continue;
		const words = term.toLowerCase().split(/\s+/).filter(stop);
		if (words.length === 0) continue;
		// Already stated by the title we're mirroring.
		if (words.every((w) => titleWords.has(w))) continue;
		// Overlaps something we've already listed.
		if (words.some((w) => usedWords.has(w))) continue;
		picked.push(term);
		for (const w of words) usedWords.add(w);
	}
	return picked;
}

/**
 * Tailor the master profile to a job: mirror the title, add a targeting line to
 * the summary using top hard keywords, and reorder each role's bullets so the
 * keyword-bearing ones lead. Reorders/annotates — never fabricates.
 */
export function tailorResumeDeterministic(
	profile: ResumeDocument,
	job: TargetJob,
	keywords: ExtractedKeyword[]
): ResumeDocument {
	const doc: ResumeDocument = structuredClone(profile);

	doc.basics.label = job.title || doc.basics.label || '';

	const topHard = pickDistinctKeywords(keywords, job.title ?? '', 3);
	const base = (doc.basics.summary ?? '').trim();
	const targetLine =
		`Targeting ${job.title || 'this role'}${job.company ? ' at ' + job.company : ''}` +
		(topHard.length ? `, bringing ${topHard.join(', ')}.` : '.');
	doc.basics.summary = base ? `${base} ${targetLine}` : targetLine;

	const terms = keywords.map((k) => k.term.toLowerCase());
	const bulletScore = (b: string) => terms.reduce((s, t) => s + (b.toLowerCase().includes(t) ? 1 : 0), 0);
	for (const w of doc.work) {
		w.highlights = (w.highlights ?? [])
			.map((b, i) => ({ b, i }))
			.sort((x, y) => bulletScore(y.b) - bulletScore(x.b) || x.i - y.i)
			.map((o) => o.b);
	}

	doc.x_petedio.targetJob = { ...job, capturedAt: job.capturedAt || doc.x_petedio.targetJob?.capturedAt || '' };
	doc.x_petedio.keywords = { extracted: keywords, matched: [], missing: [] };
	doc.x_petedio.status = 'tailored';
	return doc;
}

/* ---------------- T4: cover letter ---------------- */

export function coverLetterDeterministic(
	resume: ResumeDocument,
	whyThisCompany: string
): string {
	const name = resume.basics.name || 'Candidate';
	const title = resume.x_petedio.targetJob?.title || 'the role';
	const company = resume.x_petedio.targetJob?.company || 'your company';
	const matched = (resume.x_petedio.keywords?.matched ?? []).slice(0, 3);
	const firstJob = resume.work[0];
	const topBullet = firstJob?.highlights?.[0] ?? '';
	const why = whyThisCompany.trim() || `I admire ${company}'s work and the impact of this role.`;

	const lines = [
		`Dear ${company} Hiring Team,`,
		``,
		`I'm excited to apply for ${title} at ${company}. ${why}`,
		``,
		`In my recent work${firstJob?.name ? ' at ' + firstJob.name : ''}, ${
			topBullet ? topBullet.charAt(0).toLowerCase() + topBullet.slice(1) : 'I delivered measurable results across the team'
		}${topBullet.endsWith('.') ? '' : '.'}`,
		matched.length ? `My background maps closely to what you're looking for — ${matched.join(', ')}.` : '',
		``,
		`I'd welcome the chance to discuss how I can help ${company}. Thank you for your consideration.`,
		``,
		`Best regards,`,
		name
	];
	return lines.filter((l) => l !== '').join('\n').replace(/\n(?=Best regards,)/, '\n\n');
}

/* ---------------- T6: Q&A + story matching ---------------- */

/** Pick the story that best matches a question by embedding cosine. */
export function matchStory(question: string, stories: Story[]): Story | null {
	if (!stories.length) return null;
	const qv = embedText(question);
	let best: { story: Story; score: number } | null = null;
	for (const story of stories) {
		const text = `${story.title} ${story.tags.join(' ')} ${story.situation} ${story.action} ${story.result}`;
		const score = cosine(qv, embedText(text));
		if (!best || score > best.score) best = { story, score };
	}
	return best && best.score > 0 ? best.story : null;
}

export function answerQuestionDeterministic(input: {
	question: string;
	kind: QaKind;
	context: string;
	resume: ResumeDocument;
	profile: ResumeDocument;
	story: Story | null;
	targetChars?: number;
}): string {
	const company = input.resume.x_petedio.targetJob?.company || 'your team';
	let ans: string;

	if (input.kind === 'behavioral' && input.story) {
		const s = input.story;
		ans = `${s.situation} ${s.task} ${s.action} ${s.result}${s.metrics ? ' (' + s.metrics + ')' : ''}`;
	} else if (input.kind === 'why-us') {
		const why = input.context.trim() || `${company}'s mission and the scope of this role resonate with me`;
		ans =
			`I'm drawn to ${company} because ${why}. It aligns with my background` +
			`${input.resume.basics.label ? ' as a ' + input.resume.basics.label : ''}, and I'm eager to contribute.`;
	} else {
		const top = input.profile.work[0];
		ans =
			`${input.profile.basics.summary ?? ''} Most recently${top?.name ? ' at ' + top.name : ''}, ` +
			`${top?.highlights?.[0] ?? 'I delivered strong, measurable results'}.`;
	}

	ans = ans.replace(/\s+/g, ' ').trim();
	if (input.targetChars && input.targetChars > 0 && ans.length > input.targetChars) {
		ans = ans.slice(0, input.targetChars - 1).trimEnd() + '…';
	}
	return ans;
}

/* ---------------- T3: inline rewrite ---------------- */

const WEAK_PREFIX = /^(responsible for|tasked with|helped to|worked on|duties included)\s+/i;
const FILLER = /\b(various|several|a number of|successfully|in order to)\b/gi;

export function rewriteBulletDeterministic(text: string, comment: string): string {
	let out = text.trim().replace(WEAK_PREFIX, '');
	const c = comment.toLowerCase();
	if (/short|tight|concise|brief/.test(c)) out = out.replace(FILLER, '').replace(/\s+/g, ' ').trim();
	if (/corporate|simpl|plain|human/.test(c)) out = out.replace(FILLER, '').replace(/\butilize/gi, 'use');
	// Capitalize the first letter.
	out = out.charAt(0).toUpperCase() + out.slice(1);
	return out.replace(/\s+/g, ' ').trim();
}

/* ---------------- T5: version recommendation ---------------- */

export interface ReuseCandidate {
	id: string;
	title: string;
	text: string;
}
export interface ReuseMatch {
	id: string;
	title: string;
	score: number;
	why: string;
}

export function recommendReuseDeterministic(jdText: string, candidates: ReuseCandidate[]): ReuseMatch[] {
	const jv = embedText(jdText);
	return candidates
		.map((c) => {
			const score = Math.round(cosine(jv, embedText(c.text)) * 100);
			return {
				id: c.id,
				title: c.title,
				score,
				why:
					score >= 60
						? `Strong overlap with "${c.title}" — reuse or remix it instead of starting fresh.`
						: `Some overlap with "${c.title}".`
			};
		})
		.filter((m) => m.score > 0)
		.sort((a, b) => b.score - a.score);
}

// Re-export so callers can build the resume text for recommendation candidates.
export { resumeText };
