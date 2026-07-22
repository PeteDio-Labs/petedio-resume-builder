/**
 * Deterministic generators for the demo/offline AI provider: tailoring (T2),
 * cover letters (T4), application Q&A + story matching (T6), inline rewrites
 * (T3), and version recommendation (T5). All pure and reproducible — and
 * honest: they only ever rearrange / assemble facts already in the profile,
 * story bank, or JD. Nothing is invented (the plan's hard rule). The real
 * Ollama lane slots in behind the same AiProvider methods.
 */
import { evidenceText, resumeText, stripTargetingLine } from '../../resume/analyze';
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

/** Does the profile actually back this term? Every word of it must appear. */
function isEvidenced(term: string, evidence: string): boolean {
	const words = term.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
	return words.length > 0 && words.every((w) => evidence.includes(w));
}

/**
 * Tailor the master profile to a job: mirror the title WHERE THE HISTORY SUPPORTS
 * IT, add a targeting line built only from keywords the profile can back, and
 * reorder each role's bullets so the keyword-bearing ones lead.
 *
 * Reorders/annotates — never fabricates. That rule used to leak here: the
 * targeting line appended the JD's top keywords verbatim, so a product manager
 * tailoring to a platform role got "bringing infrastructure, kubernetes,
 * terraform" — three skills she has never had — and `basics.label` was
 * overwritten with the target title, which the ATS scorer then read back as a
 * full title match. The resume asserted a career the profile did not contain.
 */
export function tailorResumeDeterministic(
	profile: ResumeDocument,
	job: TargetJob,
	keywords: ExtractedKeyword[]
): ResumeDocument {
	const doc: ResumeDocument = structuredClone(profile);
	const evidence = evidenceText(doc);

	// Mirror the target title only if the history shows that kind of work;
	// otherwise keep her own headline rather than claiming the new one.
	const titleEvidenced = job.title ? isEvidenced(job.title, evidence) : false;
	doc.basics.label = titleEvidenced ? job.title : doc.basics.label || '';

	const candidates = pickDistinctKeywords(keywords, job.title ?? '', 6);
	const backed = candidates.filter((t) => isEvidenced(t, evidence)).slice(0, 3);
	const unbacked = candidates.filter((t) => !isEvidenced(t, evidence)).slice(0, 3);

	const base = stripTargetingLine(doc.basics.summary ?? '');
	const targetLine =
		`Targeting ${job.title || 'this role'}${job.company ? ' at ' + job.company : ''}` +
		(backed.length ? `, bringing ${backed.join(', ')}.` : '.');
	const gapNote =
		!backed.length && unbacked.length
			? ' ' +
				gap(
					`this job asks for ${unbacked.join(', ')} — nothing in your profile covers that yet; ` +
						`add real experience or drop this application`
				)
			: '';
	doc.basics.summary = (base ? `${base} ${targetLine}` : targetLine) + gapNote;

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

/** Free-text the user typed mid-sentence — give it terminal punctuation. */
function endSentence(s: string): string {
	const t = s.trim();
	return /[.!?]$/.test(t) ? t : `${t}.`;
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
			(why ? endSentence(why) : gap(`add one line on why ${company} specifically — recruiters check for this`)),
		``,
		// Achievement paragraph — built ONLY from a real bullet. No invented claim.
		// The "I" is load-bearing: bullets are written subjectless ("Led an
		// 8-engineer team"), so splicing one in raw produced "In my recent work at
		// Acme Corp, led an 8-engineer team" — a sentence with no subject.
		topBullet
			? `In my recent work${firstJob?.name ? ' at ' + firstJob.name : ''}, I ${asClause(topBullet)}${topBullet.endsWith('.') ? '' : '.'}`
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

/**
 * Work out what KIND of question this is from its text.
 *
 * The behavioral guard below ("never answer without a real story") is keyed on
 * `kind`, and `kind` came straight from a dropdown that defaults to `custom` —
 * so "Tell me about a time you had to let a teammate go" sailed past the guard
 * and got answered with a generic profile blurb. A protection that only works
 * when the user classifies their own question correctly is not a protection.
 */
export function classifyQuestion(question: string): QaKind {
	const q = question.toLowerCase();

	// Behavioral first: it carries the strongest honesty constraint, so when a
	// question could read either way, prefer the branch that refuses to invent.
	if (
		/\btell me about a time\b|\bdescribe a (time|situation)\b|\bgive (me )?an example\b|\ba time when\b|\bwalk me through a\b|\bhow did you (handle|deal with|respond)\b|\bhave you ever had to\b/.test(q)
	) {
		return 'behavioral';
	}
	if (/\bwhy (do you want to |would you like to )?(work|join)\b|\bwhy (us|this company|here)\b|\bwhat (draws|attracts) you\b/.test(q)) {
		return 'why-us';
	}
	if (/\bhow many years\b|\bexperience (with|in)\b|\bhave you (used|worked with)\b|\bare you familiar with\b|\brate your\b/.test(q)) {
		return 'experience';
	}
	if (/\bnotice period\b|\bsalary\b|\bcompensation\b|\brelocat|\bstart date\b|\bvisa\b|\bwork authoriz|\bsponsorship\b|\bavailable to start\b|\bremote or\b/.test(q)) {
		return 'logistics';
	}
	return 'custom';
}

/**
 * The kind to actually generate with. An explicit pick wins; `custom` is the
 * form default, so treat it as "not chosen" and read the question instead.
 */
export function resolveQaKind(explicit: QaKind, question: string): QaKind {
	return explicit === 'custom' ? classifyQuestion(question) : explicit;
}

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
		// Assemble only from facts that actually exist. This branch answers with a
		// profile digest, which is a reasonable fallback for an open-ended prompt
		// and a NON-ANSWER for anything specific — so say what it is rather than
		// letting a digest pass as a reply to a question it never addressed.
		const top = input.profile.work[0];
		const summary = stripTargetingLine(input.profile.basics.summary ?? '');
		const recent = top?.highlights?.[0]
			? `Most recently${top.name ? ' at ' + top.name : ''}, I ${asClause(top.highlights[0])}`
			: '';
		const parts = [summary, recent].filter(Boolean);
		if (parts.length === 0) {
			return gap('your profile has no summary or work history to answer from yet — add them, then re-draft');
		}
		ans =
			gap('generic draft — this is your background, not an answer to the question; edit it to actually respond') +
			' ' +
			parts.join(' ');
	}

	ans = ans.replace(/\s+/g, ' ').trim();
	if (input.targetChars && input.targetChars > 0 && ans.length > input.targetChars) {
		// Below a usable width, truncation produces "…" or "T…" — punctuation
		// pretending to be an answer. Return the untruncated text and let the live
		// counter show it's over; a too-long answer she can cut is worth more than
		// an ellipsis she can't.
		const MIN_USEFUL_CHARS = 40;
		if (input.targetChars >= MIN_USEFUL_CHARS) {
			// Cut at a word boundary where one is close, so the tail isn't a
			// half-word.
			const hard = ans.slice(0, input.targetChars - 1);
			const lastSpace = hard.lastIndexOf(' ');
			const body = lastSpace > input.targetChars * 0.6 ? hard.slice(0, lastSpace) : hard;
			ans = body.trimEnd() + '…';
		}
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

/**
 * Floor for suggesting an existing resume. Below this the overlap is noise, and
 * a wrong suggestion is worse than none — it invites reusing a resume aimed at
 * a different career.
 */
export const MIN_REUSE_SCORE = 55;

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
					score >= 70
						? `Strong overlap with "${c.title}" — reuse or remix it instead of starting fresh.`
						: `Some overlap with "${c.title}".`
			};
		})
		// Only surface a candidate worth actually reusing. At `> 0` a platform
		// engineering JD offered a Director of Product resume at 41% "reuse it
		// instead of starting fresh" — bag-of-words gives almost any two
		// documents a non-trivial score, so a low bar reads as a confident
		// recommendation for an irrelevant resume.
		.filter((m) => m.score >= MIN_REUSE_SCORE)
		.sort((a, b) => b.score - a.score);
}

// Re-export so callers can build the resume text for recommendation candidates.
export { resumeText };
