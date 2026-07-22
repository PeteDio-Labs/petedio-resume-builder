/**
 * Ollama-backed AI provider (the real T1+ implementation).
 *
 * Live on resume-242 against the fast lane. createAiProvider() selects this
 * whenever OLLAMA_HOST is set (never in demo mode). Written runtime-neutral
 * (native fetch, Web-standard) and defensively: validate + coerce the model's
 * JSON, and degrade to the deterministic heuristic on any failure — while
 * reporting WHICH of the two actually produced the answer.
 *
 * Latency notes, measured rather than assumed (qwen3.5:4b, GTX 1660 SUPER):
 *   thinking on, no cap ....... 80s for a one-line prompt  (timed out, always)
 *   think:false, no cap ....... 16.8s cold / 10.8s warm    (536 output tokens)
 *   think:false + tight prompt .. 7.7s warm                (300 output tokens)
 * Which is still slow enough that callers run it as a background job.
 *
 * Env:
 *   OLLAMA_HOST        base URL of the fast lane, e.g. http://192.168.50.12:11435
 *   OLLAMA_FAST_MODEL  model tag (default qwen3.5:4b)
 */
import { env } from '../config';
import { extractKeywordsHeuristic } from './keywords';
import {
	answerQuestionDeterministic,
	coverLetterDeterministic,
	matchStory,
	recommendReuseDeterministic,
	rewriteBulletDeterministic,
	tailorResumeDeterministic
} from './generate';
import type { AiProvider } from './types';
import type { ExtractedKeyword, KeywordKind } from '../../resume/schema';

const KEYWORDS_SCHEMA = {
	type: 'object',
	properties: {
		keywords: {
			type: 'array',
			// Bounded output = bounded latency. Uncapped, the model wrote 536 tokens
			// (8.0s of generation); capped with a tighter prompt it writes ~300 (4.6s)
			// and the extra terms were filler anyway.
			maxItems: 16,
			items: {
				type: 'object',
				properties: {
					term: { type: 'string' },
					aliases: { type: 'array', items: { type: 'string' } },
					kind: { type: 'string', enum: ['hard', 'soft', 'cert', 'title', 'edu'] },
					weight: { type: 'number' }
				},
				required: ['term', 'kind', 'weight']
			}
		}
	},
	required: ['keywords']
};

function coerceKeywords(raw: unknown): ExtractedKeyword[] {
	const arr = (raw as { keywords?: unknown })?.keywords;
	if (!Array.isArray(arr)) return [];
	const kinds: KeywordKind[] = ['hard', 'soft', 'cert', 'title', 'edu'];
	return arr
		.filter((k): k is Record<string, unknown> => typeof k === 'object' && k !== null)
		.map((k) => ({
			term: typeof k.term === 'string' ? k.term.slice(0, 120) : '',
			aliases: Array.isArray(k.aliases) ? k.aliases.filter((a): a is string => typeof a === 'string') : [],
			kind: kinds.includes(k.kind as KeywordKind) ? (k.kind as KeywordKind) : 'hard',
			weight: typeof k.weight === 'number' && isFinite(k.weight) ? Math.round(k.weight) : 1
		}))
		.filter((k) => k.term.trim() !== '')
		.slice(0, 40);
}

export function ollamaAiProvider(): AiProvider {
	const base = (env('OLLAMA_HOST') ?? '').replace(/\/$/, '');
	const model = env('OLLAMA_FAST_MODEL', 'qwen3.5:4b')!;

	return {
		mode: 'ollama',
		async extractKeywords(jdText: string) {
			try {
				const res = await fetch(`${base}/api/chat`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						model,
						stream: false,
						format: KEYWORDS_SCHEMA,
						// think:false — qwen3.x reasons before answering by default. Measured
						// on the fast lane: 80s for a one-line prompt with thinking on, 0.3s
						// of actual generation with it off. The 30s timeout below was firing
						// every time, so extraction silently ran the heuristic instead.
						think: false,
						// Hold the model in VRAM between requests. Each cold call otherwise
						// paid 7.7s of load_duration — more than the generation itself.
						keep_alive: '30m',
						options: { temperature: 0, num_ctx: 8192, num_predict: 500 },
						messages: [
							{
								role: 'system',
								content:
									'Extract the ATS keywords a resume must contain to pass a screen for this job. ' +
									'At most 16, most important first. weight 1-100 (higher = more important). ' +
									'kind one of hard|soft|cert|title|edu. aliases ONLY for a well-known acronym/spelled-out ' +
									'pair (e.g. CI/CD, SRE), otherwise an empty array. Short noun phrases, never sentences. ' +
									'Only JSON matching the schema.'
							},
							{ role: 'user', content: jdText.slice(0, 12_000) }
						]
					}),
					// Generous: this runs in a background job now, so a slow answer costs
					// nobody a spinner. Cold-loading the model alone can take ~7s.
					signal: AbortSignal.timeout(60_000)
				});
				if (!res.ok) throw new Error(`ollama /api/chat → ${res.status}`);
				const data = (await res.json()) as { message?: { content?: string } };
				const parsed = JSON.parse(data.message?.content ?? '{}');
				const keywords = coerceKeywords(parsed);
				if (keywords.length === 0) throw new Error('ollama returned no keywords');
				return { keywords, source: 'ollama' as const };
			} catch (err) {
				// Never fail the request over the AI lane — degrade to the deterministic
				// extractor so the feature still works. But SAY SO: this used to report
				// "Extracted via ollama" while serving heuristic output, which hid a
				// timeout that had been firing on every single request.
				console.error('ollamaAiProvider.extractKeywords fell back to heuristic:', err);
				return { keywords: extractKeywordsHeuristic(jdText), source: 'heuristic' as const };
			}
		},

		// The remaining tasks (T2–T6) don't have real Ollama prompts wired yet —
		// they use the same deterministic generators as demo mode. When the
		// inference host is provisioned, replace these bodies with /api/chat calls
		// (streamed for tailoring/Q&A); the interface stays identical.
		async tailorResume({ profile, job, keywords }) {
			return { doc: tailorResumeDeterministic(profile, job, keywords) };
		},
		async coverLetter({ resume, whyThisCompany }) {
			return { text: coverLetterDeterministic(resume, whyThisCompany) };
		},
		async answerQuestion(input) {
			const story = input.kind === 'behavioral' ? matchStory(input.question, input.stories) : null;
			return { answer: answerQuestionDeterministic({ ...input, story }), storyId: story?.id ?? null };
		},
		async rewriteBullet({ text, comment }) {
			return { rewritten: rewriteBulletDeterministic(text, comment) };
		},
		async recommendReuse({ jdText, candidates }) {
			return { matches: recommendReuseDeterministic(jdText, candidates) };
		}
	};
}
