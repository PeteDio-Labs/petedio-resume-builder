/**
 * Ollama-backed AI provider (the real T1+ implementation).
 *
 * Not exercised yet — the inference host isn't provisioned, so createAiProvider()
 * only selects this when OLLAMA_HOST is set (never in demo mode). It's written
 * runtime-neutral (native fetch, Web-standard) and defensively (validate +
 * coerce the model's JSON, fall back to the deterministic heuristic on any
 * failure) so turning it on is a config change, not a rewrite.
 *
 * Env:
 *   OLLAMA_HOST        base URL of the fast lane, e.g. http://192.168.50.12:11435
 *   OLLAMA_FAST_MODEL  model tag (default qwen3.5:4b)
 */
import { env } from '../config';
import { extractKeywordsHeuristic } from './keywords';
import type { AiProvider } from './types';
import type { ExtractedKeyword, KeywordKind } from '../../resume/schema';

const KEYWORDS_SCHEMA = {
	type: 'object',
	properties: {
		keywords: {
			type: 'array',
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
						options: { temperature: 0, num_ctx: 8192 },
						messages: [
							{
								role: 'system',
								content:
									'Extract ATS keywords from the job description. Return weighted terms (weight 1-100, ' +
									'higher = more important), kind one of hard|soft|cert|title|edu, and acronym/spelled-out aliases. ' +
									'Only JSON matching the schema.'
							},
							{ role: 'user', content: jdText.slice(0, 12_000) }
						]
					}),
					signal: AbortSignal.timeout(30_000)
				});
				if (!res.ok) throw new Error(`ollama /api/chat → ${res.status}`);
				const data = (await res.json()) as { message?: { content?: string } };
				const parsed = JSON.parse(data.message?.content ?? '{}');
				const keywords = coerceKeywords(parsed);
				if (keywords.length === 0) throw new Error('ollama returned no keywords');
				return { keywords };
			} catch (err) {
				// Never fail the request over the AI lane — degrade to the deterministic
				// extractor so the feature still works.
				console.error('ollamaAiProvider.extractKeywords fell back to heuristic:', err);
				return { keywords: extractKeywordsHeuristic(jdText) };
			}
		}
	};
}
