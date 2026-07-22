/**
 * Deterministic ATS keyword extraction (task T1).
 *
 * This is the demo/offline implementation of keyword extraction — a heuristic,
 * NOT a model. It's genuinely useful on its own (frequency × position, with a
 * soft/hard split) and doubles as the demo stub so the JD-intake phase is
 * testable with no Ollama. The real Ollama structured-output version can slot
 * in behind the same `AiProvider` interface later; both return the same
 * `ExtractedKeyword[]`.
 *
 * Pure and deterministic — same JD text always yields the same keywords, which
 * is exactly what a demo/test wants.
 */
import type { ExtractedKeyword, KeywordKind } from '../../resume/schema';

// Common English + JD-boilerplate words that are never useful keywords.
export const STOPWORDS = new Set([
	'the', 'and', 'for', 'with', 'you', 'our', 'are', 'will', 'have', 'this', 'that', 'from', 'your',
	'has', 'was', 'were', 'their', 'they', 'them', 'able', 'who', 'all', 'any', 'can', 'may', 'not',
	'but', 'his', 'her', 'she', 'him', 'its', 'out', 'use', 'used', 'using', 'via', 'per', 'etc',
	'a', 'an', 'as', 'at', 'be', 'by', 'do', 'in', 'is', 'it', 'of', 'on', 'or', 'to', 'we', 'up',
	'work', 'working', 'role', 'team', 'teams', 'job', 'company', 'position', 'candidate', 'candidates',
	'experience', 'experienced', 'years', 'year', 'ability', 'strong', 'excellent', 'good', 'great',
	'including', 'include', 'includes', 'well', 'like', 'across', 'within', 'into', 'other', 'more',
	'most', 'such', 'also', 'help', 'helping', 'ensure', 'ensuring', 'provide', 'providing', 'new',
	'looking', 'seeking', 'join', 'plus', 'must', 'should', 'would', 'about', 'what', 'when', 'where',
	'how', 'why', 'been', 'both', 'each', 'some', 'than', 'then', 'there', 'these', 'those', 'while',
	'requirements', 'responsibilities', 'qualifications', 'preferred', 'required', 'nice', 'having',
	'skills', 'skill', 'delivery', 'deliver', 'build', 'building', 'operate', 'designing', 'design'
]);

// Terms we classify as soft skills rather than hard skills.
const SOFT_SKILLS = new Set([
	'communication', 'leadership', 'collaboration', 'collaborative', 'teamwork', 'ownership',
	'organized', 'organization', 'detail', 'oriented', 'analytical', 'creative', 'creativity',
	'problem', 'solving', 'interpersonal', 'adaptable', 'adaptability', 'proactive', 'initiative',
	'mentoring', 'mentorship', 'stakeholder', 'stakeholders', 'cross', 'functional', 'presentation',
	'negotiation', 'empathy', 'curiosity', 'autonomy', 'passionate', 'motivated', 'driven', 'reliable'
]);

// Headers that mark a "must-have" section — terms under these weigh more.
const REQ_HEADER = /(requirements|qualifications|what you.ll bring|what we.re looking for|must have|skills)/i;

const WORD_RE = /[a-z0-9][a-z0-9+#.]*/gi;

function tokenize(line: string): string[] {
	return (line.toLowerCase().match(WORD_RE) ?? []).filter(
		// drop stopwords, single chars, and anything starting with a digit
		// ("5+", "401k", version numbers) — none are useful ATS keywords.
		(w) => w.length >= 2 && !STOPWORDS.has(w) && !/^\d/.test(w)
	);
}

function classify(term: string): KeywordKind {
	if (term.split(' ').some((w) => SOFT_SKILLS.has(w))) return 'soft';
	return 'hard';
}

interface Acc {
	term: string;
	count: number;
	firstAt: number; // 0..1 position of first occurrence
	reqBoost: boolean; // appeared under a requirements-style header
}

/**
 * Extract weighted ATS keywords from a job description.
 *
 * @param jdText  the pasted job-description body
 * @param limit   max keywords to return (default 18)
 */
export function extractKeywordsHeuristic(jdText: string, limit = 18): ExtractedKeyword[] {
	const text = (jdText ?? '').slice(0, 40_000);
	if (!text.trim()) return [];

	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const totalChars = Math.max(text.length, 1);

	const acc = new Map<string, Acc>();
	let inReqSection = false;
	let charsSeen = 0;

	const bump = (term: string, at: number, req: boolean) => {
		const existing = acc.get(term);
		if (existing) {
			existing.count += 1;
			existing.reqBoost = existing.reqBoost || req;
		} else {
			acc.set(term, { term, count: 1, firstAt: at / totalChars, reqBoost: req });
		}
	};

	for (const raw of lines) {
		if (REQ_HEADER.test(raw) && raw.trim().length < 60) inReqSection = true;
		const words = tokenize(raw);

		// unigrams
		for (const w of words) bump(w, charsSeen, inReqSection);
		// bigrams (adjacent non-stopword pairs) — captures "machine learning", "project management"
		for (let i = 0; i < words.length - 1; i++) {
			bump(`${words[i]} ${words[i + 1]}`, charsSeen, inReqSection);
		}

		charsSeen += raw.length + 1;
	}

	// Score: frequency, boosted by early position and requirements-section membership,
	// and a small bump for multi-word phrases (usually more specific/valuable).
	// Only keep bigrams that actually recur (count >= 2) — a bigram seen once is
	// usually adjacency noise ("python go"), and it would otherwise shadow the
	// cleaner standalone keyword ("python").
	const scored = [...acc.values()]
		.filter((a) => (a.term.includes(' ') ? a.count >= 2 : a.count >= 1))
		.map((a) => {
			const positionFactor = 1 + (1 - a.firstAt) * 0.5; // earlier → up to 1.5×
			const reqFactor = a.reqBoost ? 1.4 : 1;
			const phraseFactor = a.term.includes(' ') ? 1.25 : 1;
			// A lone unigram appearing only once is weak signal; phrases/repeats matter.
			const base = a.count;
			return { ...a, score: base * positionFactor * reqFactor * phraseFactor };
		});

	// Drop unigrams that are wholly contained in a higher-scored surviving bigram.
	const bigrams = scored.filter((s) => s.term.includes(' '));
	const keep = scored.filter((s) => {
		if (s.term.includes(' ')) return true;
		const coveredByStrongerPhrase = bigrams.some(
			(b) => b.score >= s.score && b.term.split(' ').includes(s.term)
		);
		return !coveredByStrongerPhrase;
	});

	keep.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
	const top = keep.slice(0, limit);
	if (top.length === 0) return [];

	// Normalize weights to an integer 1..100 scale (max term = 100).
	const maxScore = top[0].score;
	return top.map((t) => ({
		term: t.term,
		aliases: [],
		kind: classify(t.term),
		weight: Math.max(1, Math.round((t.score / maxScore) * 100))
	}));
}
