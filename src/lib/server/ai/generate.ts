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

/**
 * A visibly-bracketed gap marker. The honesty rule (plan §2) is that drafts
 * assemble only facts already in the profile/stories and never invent
 * experience — so when a fact is missing we say so instead of writing a
 * plausible-sounding claim the user would have to notice and delete.
 */
export function gap(instruction: string): string {
	return `[${instruction}]`;
}

function asClause(sentence: string): string {
	return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}

export function coverLetterDeterministic(
	resume: ResumeDocument,
	whyThisCompany: string
): string {
	const name = resume.basics.name || gap('your name');
	const title = resume.x_petedio.targetJob?.title || 'the role';
	const company = resume.x_petedio.targetJob?.company || 'your company';
	const matched = (resume.x_petedio.keywords?.matched ?? []).slice(0, 3);
	const firstJob = resume.work[0];
	const topBullet = firstJob?.highlights?.[0] ?? '';
	const why = whyThisCompany.trim();

	const lines = [
		`Dear ${company} Hiring Team,`,
		``,
		`I'm excited to apply for ${title} at ${company}. ` +
			(why ? why : gap(`add one line on why ${company} specifically — recruiters check for this`)),
		``,
		// Achievement paragraph — built ONLY from a real bullet. No invented claim.
		topBullet
			? `In my recent work${firstJob?.name ? ' at ' + firstJob.name : ''}, ${asClause(topBullet)}${topBullet.endsWith('.') ? '' : '.'}`
			: gap('add one specific achievement for this role — your profile has no work history to draw from yet'),
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

/**
 * Minimum cosine for a story to count as "about" the question. Hashed
 * bag-of-words gives a small non-zero score to almost any pair, so a bare
 * `> 0` check returned an unrelated anecdote for e.g. a salary question.
 * Below this floor the caller should say it has no match rather than answer
 * from the wrong story.
 */
export const MIN_STORY_SIMILARITY = 0.25;

/** Pick the story that best matches a question, or null if none is relevant. */
export function matchStory(question: string, stories: Story[]): Story | null {
	if (!stories.length) return null;
	const qv = embedText(question);
	let best: { story: Story; score: number } | null = null;
	for (const story of stories) {
		const text = `${story.title} ${story.tags.join(' ')} ${story.situation} ${story.action} ${story.result}`;
		const score = cosine(qv, embedText(text));
		if (!best || score > best.score) best = { story, score };
	}
	return best && best.score >= MIN_STORY_SIMILARITY ? best.story : null;
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

	if (input.kind === 'behavioral') {
		// Never answer a behavioral question without a real story behind it.
		if (!input.story) {
			return gap(
				'no story in your story bank matches this question yet — add a STAR story to your profile, then re-draft'
			);
		}
		const s = input.story;
		ans = `${s.situation} ${s.task} ${s.action} ${s.result}${s.metrics ? ' (' + s.metrics + ')' : ''}`;
	} else if (input.kind === 'why-us') {
		const why = input.context.trim();
		if (!why) {
			return gap(`add one line on why ${company} specifically — a generic answer is what recruiters screen out`);
		}
		ans =
			`I'm drawn to ${company} because ${why}. It aligns with my background` +
			`${input.resume.basics.label ? ' as a ' + input.resume.basics.label : ''}, and I'm eager to contribute.`;
	} else {
		// Assemble only from facts that actually exist.
		const top = input.profile.work[0];
		const summary = (input.profile.basics.summary ?? '').trim();
		const recent = top?.highlights?.[0]
			? `Most recently${top.name ? ' at ' + top.name : ''}, ${asClause(top.highlights[0])}`
			: '';
		const parts = [summary, recent].filter(Boolean);
		if (parts.length === 0) {
			return gap('your profile has no summary or work history to answer from yet — add them, then re-draft');
		}
		ans = parts.join(' ');
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
