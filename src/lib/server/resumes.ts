/**
 * Server-side helpers for tailored resumes — JD intake + keyword extraction
 * (task T1). Keeps the AI provider and the row-scoped repository the single
 * paths, and centralises the "DB / AI might be demo or absent" handling so
 * routes stay thin.
 */
import { createAiProvider } from './ai/provider';
import { isDemoMode } from './config';
import { createRepository } from './db/repository';
import { emptyProfile, normalizeProfile, type ExtractedKeyword } from '../resume/schema';

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

/** Run keyword extraction (demo heuristic or Ollama, per the factory). */
export async function extractJobKeywords(
	jdText: string
): Promise<{ keywords: ExtractedKeyword[]; mode: string }> {
	const ai = createAiProvider();
	const { keywords } = await ai.extractKeywords(jdText);
	return { keywords, mode: ai.mode };
}

/**
 * Create a new resume draft from a job description + the user-approved
 * keywords. The doc is passed through `normalizeProfile` (the validation
 * boundary) before it's stored, so client-supplied keywords are sanitized.
 */
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

/** List the user's resume drafts as client-safe summaries. Resilient to no DB. */
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
