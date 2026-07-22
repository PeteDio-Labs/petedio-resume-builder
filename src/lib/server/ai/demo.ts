/**
 * Demo/offline AI provider — deterministic stand-ins for every AI task, so the
 * app is fully demoable with no Ollama. Selected by createAiProvider() in demo
 * mode (and whenever no Ollama host is configured). Each method is a pure,
 * repeatable heuristic — same input, same output.
 */
import type { AiProvider } from './types';
import { extractKeywordsHeuristic } from './keywords';

export function demoAiProvider(): AiProvider {
	return {
		mode: 'demo',
		async extractKeywords(jdText: string) {
			return { keywords: extractKeywordsHeuristic(jdText) };
		}
	};
}
