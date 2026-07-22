/**
 * The AI provider interface. Everything AI in the app goes through this so the
 * backing implementation — deterministic demo stubs now, Ollama later — is a
 * one-factory swap (see provider.ts), the exact shape of the data layer's
 * resolveDb / the panel's createApplier. The demo and Ollama providers
 * implement the same surface, so callers never branch on which is live.
 */
import type { ExtractedKeyword, ResumeDocument, Story } from '../../resume/schema';
import type { QaKind, ReuseCandidate, ReuseMatch, TargetJob } from './generate';

export interface AiProvider {
	readonly mode: 'demo' | 'ollama';

	/** T1 — extract weighted ATS keywords from a job description. */
	extractKeywords(jdText: string): Promise<{ keywords: ExtractedKeyword[] }>;

	/** T2 — tailor the master profile to a job. */
	tailorResume(input: {
		profile: ResumeDocument;
		job: TargetJob;
		keywords: ExtractedKeyword[];
	}): Promise<{ doc: ResumeDocument }>;

	/** T4 — draft a cover letter from the resume + a "why this company" line. */
	coverLetter(input: { resume: ResumeDocument; whyThisCompany: string }): Promise<{ text: string }>;

	/** T6 — answer an application question; picks a story for behavioral ones. */
	answerQuestion(input: {
		question: string;
		kind: QaKind;
		context: string;
		targetChars?: number;
		resume: ResumeDocument;
		profile: ResumeDocument;
		stories: Story[];
	}): Promise<{ answer: string; storyId: string | null }>;

	/** T3 — rewrite a single bullet given a freeform instruction. */
	rewriteBullet(input: { text: string; comment: string }): Promise<{ rewritten: string }>;

	/** T5 — recommend an existing resume to reuse/remix for a JD. */
	recommendReuse(input: {
		jdText: string;
		candidates: ReuseCandidate[];
	}): Promise<{ matches: ReuseMatch[] }>;
}
