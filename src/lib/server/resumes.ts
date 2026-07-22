/**
 * Server-side helpers for tailored resumes — JD intake (T1), tailoring (T2),
 * ATS score + lint, cover letters (T4), version recommendation (T5), revisions,
 * and delete. Keeps the AI provider and the row-scoped repository the single
 * paths.
 */
import { createAiProvider } from './ai/provider';
import { extractKeywordsHeuristic } from './ai/keywords';
import { startJob } from './jobs';
import { isDemoMode } from './config';
import { createRepository } from './db/repository';
import {
	computeAtsScore,
	hasUsableContent,
	lintResume,
	resumeText,
	type AtsScore,
	type LintFinding
} from '../resume/analyze';
import { emptyProfile, normalizeProfile, type ExtractedKeyword, type ResumeDocument } from '../resume/schema';

export interface JobInput {
	title: string;
	company: string;
	url: string;
	jdText: string;
}

export interface ResumeSummary {
	id: string;
	title: string;
	company: string;
	status: string;
	keywordCount: number;
	updatedAt: string;
}

export interface ResumeDetail {
	id: string;
	status: string;
	template: 'A' | 'B';
	updatedAt: string;
	hasProfile: boolean;
	resume: ResumeDocument;
	score: AtsScore;
	lint: LintFinding[];
	coverLetter: string;
	revisions: { rev: number; label: string; savedAt: string }[];
	targetJob: { title: string; company: string; url: string; jdText: string };
	demo: boolean;
}

export class NoProfileError extends Error {}

/* ---------------- JD intake (T1) ---------------- */

export async function extractJobKeywords(
	jdText: string
): Promise<{ keywords: ExtractedKeyword[]; mode: string }> {
	const ai = createAiProvider();
	// `source`, not `ai.mode`: the Ollama lane falls back to the heuristic on
	// failure, and the UI must show what actually ran.
	const { keywords, source } = await ai.extractKeywords(jdText);
	return { keywords, mode: source };
}

/**
 * Instant keywords now, better keywords shortly.
 *
 * The deterministic extractor returns in under a millisecond; the model takes
 * ~5-8s but is far sharper (it finds "CI/CD", "SLOs", "secrets management" where
 * frequency counting finds "improving" and "proven"). Blocking the request on
 * the model made the page sit on a spinner and, when the call timed out, served
 * the heuristic anyway while claiming the model had run.
 *
 * So: answer immediately with the heuristic, and queue the model. `refineJobId`
 * is null when there's no model lane to wait for (demo mode / no OLLAMA_HOST) —
 * the client uses that to decide whether to poll at all.
 */
export function extractJobKeywordsFast(
	email: string,
	jdText: string
): { keywords: ExtractedKeyword[]; mode: string; refineJobId: string | null } {
	const keywords = extractKeywordsHeuristic(jdText);
	const ai = createAiProvider();
	if (ai.mode !== 'ollama') return { keywords, mode: 'heuristic', refineJobId: null };

	const refineJobId = startJob(email, async () => {
		const { keywords: refined, source } = await ai.extractKeywords(jdText);
		// A fallback inside the provider means the model did NOT produce these —
		// don't offer the user a "refined" set that is the same heuristic output.
		if (source !== 'ollama') throw new Error('model unavailable — keeping the offline extraction');
		return { keywords: refined, mode: source };
	});
	return { keywords, mode: 'heuristic', refineJobId };
}

/** T5 — suggest an existing resume to reuse for a JD (before generating fresh). */
export async function recommendForJd(
	email: string,
	jdText: string
): Promise<{ id: string; title: string; company: string; score: number; why: string }[]> {
	if (!jdText.trim()) return [];
	const repo = createRepository(email);
	const resumes = await repo.resumes.list();
	if (resumes.length === 0) return [];
	const ai = createAiProvider();
	const { matches } = await ai.recommendReuse({
		jdText,
		candidates: resumes.map((r) => ({
			id: r.id,
			title: r.x_petedio.targetJob?.title || '(untitled)',
			text: `${r.x_petedio.targetJob?.jdText ?? ''} ${resumeText(r)}`
		}))
	});
	const byId = new Map(resumes.map((r) => [r.id, r]));
	return matches
		.filter((m) => m.score >= 40)
		.slice(0, 3)
		.map((m) => ({
			id: m.id,
			title: m.title,
			company: byId.get(m.id)?.x_petedio.targetJob?.company || '',
			score: m.score,
			why: m.why
		}));
}

export async function createResumeDraft(email: string, job: JobInput, keywords: ExtractedKeyword[]): Promise<string> {
	const doc = emptyProfile();
	doc.x_petedio.targetJob = {
		title: job.title,
		company: job.company,
		url: job.url,
		jdText: job.jdText,
		capturedAt: new Date().toISOString()
	};
	doc.x_petedio.keywords = { extracted: keywords, matched: [], missing: [] };
	doc.x_petedio.status = 'draft';

	const repo = createRepository(email);
	const row = await repo.resumes.create(normalizeProfile(doc));
	return row.id;
}

export async function listResumes(
	email: string
): Promise<{ resumes: ResumeSummary[]; demo: boolean; dbError: boolean }> {
	const repo = createRepository(email);
	try {
		const rows = await repo.resumes.list();
		return {
			resumes: rows.map((r) => ({
				id: r.id,
				title: r.x_petedio.targetJob?.title || '(untitled role)',
				company: r.x_petedio.targetJob?.company || '',
				status: r.x_petedio.status || 'draft',
				keywordCount: r.x_petedio.keywords?.extracted?.length ?? 0,
				updatedAt: new Date(r.updatedAt).toISOString()
			})),
			demo: isDemoMode(),
			dbError: false
		};
	} catch (err) {
		console.error('listResumes: MongoDB unavailable', err);
		return { resumes: [], demo: isDemoMode(), dbError: true };
	}
}

/* ---------------- detail / editor ---------------- */

export async function getResumeDetail(email: string, id: string): Promise<ResumeDetail | null> {
	const repo = createRepository(email);
	const [row, profile, revisions] = await Promise.all([
		repo.resumes.get(id),
		repo.profiles.get(),
		repo.resumes.listRevisions(id)
	]);
	if (!row) return null;
	const resume = normalizeProfile(row);
	return {
		id: row.id,
		status: resume.x_petedio.status ?? 'draft',
		template: resume.x_petedio.template ?? 'A',
		updatedAt: new Date(row.updatedAt).toISOString(),
		hasProfile: Boolean(profile),
		resume,
		score: computeAtsScore(resume),
		lint: lintResume(resume),
		coverLetter: resume.x_petedio.coverLetter?.text ?? '',
		revisions: revisions.map((r) => ({
			rev: r.rev,
			label: r.label,
			savedAt: new Date(r.savedAt).toISOString()
		})),
		targetJob: {
			title: resume.x_petedio.targetJob?.title ?? '',
			company: resume.x_petedio.targetJob?.company ?? '',
			url: resume.x_petedio.targetJob?.url ?? '',
			jdText: resume.x_petedio.targetJob?.jdText ?? ''
		},
		demo: isDemoMode()
	};
}

/** T2 — generate a tailored resume from the master profile + this JD/keywords. */
export async function generateTailored(email: string, id: string): Promise<void> {
	const repo = createRepository(email);
	const [row, profileRow] = await Promise.all([repo.resumes.get(id), repo.profiles.get()]);
	if (!row) return;
	if (!profileRow) throw new NoProfileError('Create a master profile first.');

	// Existing ≠ usable. The guard only checked that a profile row was there, so
	// an empty profile produced a resume marked "tailored" with zero entries —
	// a document that looks finished and contains nothing.
	const source = normalizeProfile(profileRow);
	if (!hasUsableContent(source)) {
		throw new NoProfileError(
			'Your master profile is empty — add your experience there first, or a tailored resume has nothing to draw from.'
		);
	}

	const resume = normalizeProfile(row);
	const ai = createAiProvider();
	const tj = resume.x_petedio.targetJob;
	const { doc } = await ai.tailorResume({
		profile: source,
		job: {
			title: tj?.title ?? '',
			company: tj?.company ?? '',
			url: tj?.url,
			jdText: tj?.jdText,
			capturedAt: tj?.capturedAt
		},
		keywords: resume.x_petedio.keywords?.extracted ?? []
	});
	const clean = normalizeProfile(doc);
	await repo.resumes.update(id, clean);
	await repo.resumes.saveRevision(id, clean, 'Generated from master profile');
}

/** Persist an edited resume + snapshot a revision. */
export async function saveResume(email: string, id: string, docJson: string, label = 'Manual edit'): Promise<void> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(docJson);
	} catch {
		throw new Error('Malformed resume JSON.');
	}
	const clean = normalizeProfile(parsed);
	const repo = createRepository(email);
	const updated = await repo.resumes.update(id, clean);
	if (updated) await repo.resumes.saveRevision(id, clean, label);
}

/** T4 — draft a cover letter and store it on the resume. */
export async function generateCoverLetter(email: string, id: string, whyThisCompany: string): Promise<string> {
	const repo = createRepository(email);
	const row = await repo.resumes.get(id);
	if (!row) return '';
	const resume = normalizeProfile(row);
	const ai = createAiProvider();
	const { text } = await ai.coverLetter({ resume, whyThisCompany });
	resume.x_petedio.coverLetter = { text, generatedFrom: ai.mode };
	await repo.resumes.update(id, normalizeProfile(resume));
	return text;
}

export async function setResumeTemplate(email: string, id: string, template: 'A' | 'B'): Promise<void> {
	const repo = createRepository(email);
	const row = await repo.resumes.get(id);
	if (!row) return;
	const resume = normalizeProfile(row);
	resume.x_petedio.template = template;
	await repo.resumes.update(id, normalizeProfile(resume));
}

export async function softDeleteResume(email: string, id: string): Promise<void> {
	await createRepository(email).resumes.softDelete(id);
}

export async function hardDeleteResume(email: string, id: string): Promise<void> {
	await createRepository(email).resumes.hardDelete(id);
}
