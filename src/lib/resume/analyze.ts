/**
 * Deterministic resume analysis — ATS score (task T7's score half) and the lint
 * panel. Pure functions of a `ResumeDocument`; no AI, no I/O. The LLM only ever
 * supplies keyword *extraction* and advice — scoring itself is reproducible so
 * the same resume always gets the same number.
 */
import type { ResumeDocument } from './schema';

/** Concatenate everything searchable in a resume into one lowercased blob. */
export function resumeText(doc: ResumeDocument): string {
	const parts: string[] = [
		doc.basics.name ?? '',
		doc.basics.label ?? '',
		doc.basics.summary ?? ''
	];
	for (const w of doc.work) {
		parts.push(w.position ?? '', w.name ?? '', w.summary ?? '', ...(w.highlights ?? []));
	}
	for (const e of doc.education) parts.push(e.institution ?? '', e.area ?? '', e.studyType ?? '');
	for (const s of doc.skills) parts.push(s.name ?? '', ...(s.keywords ?? []));
	for (const c of doc.certificates) parts.push(c.name ?? '', c.issuer ?? '');
	for (const p of doc.projects) parts.push(p.name ?? '', p.description ?? '', ...(p.highlights ?? []), ...(p.keywords ?? []));
	return parts.join(' \n ').toLowerCase();
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------ *
 * ATS score
 * ------------------------------------------------------------------ */

export interface AtsComponent {
	label: string;
	got: number;
	max: number;
	/**
	 * False when there's nothing to score this against (e.g. the JD names no
	 * certification). Inapplicable components are excluded from the total
	 * rather than silently awarded full marks — "absent" is not "perfect".
	 */
	applicable: boolean;
}

export interface AtsScore {
	/**
	 * False when the resume has no extracted keywords at all. An ATS *match*
	 * score is meaningless with nothing to match against, so the UI must show
	 * "not scored" instead of a number.
	 */
	scored: boolean;
	total: number;
	components: AtsComponent[];
	matched: string[];
	missing: string[];
	/** Advisory band for the UI. */
	band: 'unscored' | 'low' | 'good' | 'stuffed';
}

/**
 * Score a resume against its extracted keywords (from x_petedio.keywords).
 * Weights per the plan: hard 50 · title 15 · soft 15 · edu/cert 10 · search 10.
 */
export function computeAtsScore(doc: ResumeDocument): AtsScore {
	const kws = doc.x_petedio.keywords?.extracted ?? [];
	const text = resumeText(doc);
	const has = (t?: string): boolean => !!t && text.includes(t.toLowerCase());
	const matches = (k: { term: string; aliases?: string[] }) =>
		has(k.term) || (k.aliases ?? []).some(has);

	const matched: string[] = [];
	const missing: string[] = [];
	for (const k of kws) (matches(k) ? matched : missing).push(k.term);

	const hard = kws.filter((k) => k.kind !== 'soft');
	const soft = kws.filter((k) => k.kind === 'soft');
	const wsum = (arr: typeof kws) => arr.reduce((s, k) => s + Math.max(k.weight, 1), 0);
	const wmatch = (arr: typeof kws) =>
		arr.filter(matches).reduce((s, k) => s + Math.max(k.weight, 1), 0);

	const hardMax = 50;
	const hardGot = hard.length ? Math.round((wmatch(hard) / wsum(hard)) * hardMax) : 0;

	const softMax = 15;
	const softGot = soft.length ? Math.round((wmatch(soft) / wsum(soft)) * softMax) : 0;

	// Title match — does the resume label/text reflect the target job title?
	const titleMax = 15;
	const jobTitle = (doc.x_petedio.targetJob?.title ?? '').toLowerCase();
	const label = (doc.basics.label ?? '').toLowerCase();
	const titleWords = jobTitle.split(/\s+/).filter((w) => w.length > 2);
	const titleGot = titleWords.length
		? Math.round((titleWords.filter((w) => label.includes(w) || text.includes(w)).length / titleWords.length) * titleMax)
		: 0;

	// Education / certs — only scored when the JD actually names one.
	const eduMax = 10;
	const eduKws = kws.filter((k) => k.kind === 'cert' || k.kind === 'edu');
	const eduGot = eduKws.length ? Math.round((eduKws.filter(matches).length / eduKws.length) * eduMax) : 0;

	// Searchability checklist — always applicable; it's about the resume itself.
	const searchMax = 10;
	let s = 0;
	if (doc.basics.email) s += 2;
	if (doc.basics.phone) s += 2;
	if (doc.work.length) s += 2;
	if (doc.work.some((w) => w.startDate)) s += 2;
	if (doc.skills.length) s += 2;
	const searchGot = Math.min(searchMax, s);

	const components: AtsComponent[] = [
		{ label: 'Hard-skill coverage', got: hardGot, max: hardMax, applicable: hard.length > 0 },
		{ label: 'Title match', got: titleGot, max: titleMax, applicable: titleWords.length > 0 },
		{ label: 'Soft skills', got: softGot, max: softMax, applicable: soft.length > 0 },
		{ label: 'Education / certs', got: eduGot, max: eduMax, applicable: eduKws.length > 0 },
		{ label: 'Searchability', got: searchGot, max: searchMax, applicable: true }
	];

	// A match score needs something to match against. With no keywords the number
	// would be meaningless (previously it read 90/100 "good" for a blank resume).
	const scored = kws.length > 0;
	const live = components.filter((c) => c.applicable);
	const maxSum = live.reduce((a, c) => a + c.max, 0);
	const gotSum = live.reduce((a, c) => a + c.got, 0);
	const total = scored && maxSum > 0 ? Math.max(0, Math.min(100, Math.round((gotSum / maxSum) * 100))) : 0;
	const band: AtsScore['band'] = !scored ? 'unscored' : total > 90 ? 'stuffed' : total >= 70 ? 'good' : 'low';

	return { scored, total, components, matched, missing, band };
}

/* ------------------------------------------------------------------ *
 * Lint
 * ------------------------------------------------------------------ */

export interface LintFinding {
	severity: 'warn' | 'info';
	message: string;
}

// "Generic — not AI — is what recruiters reject": flag the tell-tale vocabulary.
const AI_TELLS = [
	'delve', 'leverage', 'spearheaded', 'synergy', 'utilize', 'tapestry', 'testament',
	'realm', 'landscape', 'robust', 'seamless', 'pivotal', 'showcasing', 'underscore'
];
const FIRST_PERSON = /\b(i|me|my|myself|we|our)\b/i;

export function lintResume(doc: ResumeDocument): LintFinding[] {
	const findings: LintFinding[] = [];
	const bullets = [
		...doc.work.flatMap((w) => w.highlights ?? []),
		...doc.projects.flatMap((p) => p.highlights ?? [])
	].filter(Boolean);

	const quantified = bullets.filter((b) => /\d/.test(b)).length;
	if (bullets.length > 0 && quantified < Math.min(5, bullets.length)) {
		findings.push({
			severity: 'warn',
			message: `Only ${quantified} of ${bullets.length} bullets are quantified — add numbers to most.`
		});
	}

	for (const b of bullets) {
		if (b.length > 240) {
			findings.push({ severity: 'info', message: `Long bullet — tighten: "${b.slice(0, 48)}…"` });
		}
		if (FIRST_PERSON.test(b)) {
			findings.push({ severity: 'info', message: `Drop first person ("I/we"): "${b.slice(0, 48)}…"` });
		}
		const tell = AI_TELLS.find((t) => new RegExp(`\\b${t}\\b`, 'i').test(b));
		if (tell) {
			findings.push({ severity: 'warn', message: `AI-tell word "${tell}": "${b.slice(0, 48)}…"` });
		}
	}

	const text = resumeText(doc);
	for (const k of doc.x_petedio.keywords?.extracted ?? []) {
		const n = (text.match(new RegExp(escapeRe(k.term.toLowerCase()), 'g')) ?? []).length;
		if (n > 3) {
			findings.push({ severity: 'warn', message: `"${k.term}" appears ${n}× — over 3 reads as stuffing.` });
		}
	}

	return findings.slice(0, 40);
}
