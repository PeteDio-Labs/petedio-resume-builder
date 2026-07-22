/**
 * The AI provider interface. Everything AI in the app goes through this so the
 * backing implementation — deterministic demo stub now, Ollama later — is a
 * one-factory swap (see provider.ts), the exact shape of the data layer's
 * resolveDb / the panel's createApplier.
 *
 * Each task (T1–T6) adds a method here; the demo and Ollama providers implement
 * the same surface, so callers (routes/helpers) never branch on which is live.
 */
import type { ExtractedKeyword } from '../../resume/schema';

export interface AiProvider {
	readonly mode: 'demo' | 'ollama';

	/** T1 — extract weighted ATS keywords from a job description. */
	extractKeywords(jdText: string): Promise<{ keywords: ExtractedKeyword[] }>;
}
