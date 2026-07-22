/**
 * AI provider factory — the single place that decides demo vs real, from the
 * environment. Mirrors db/provider.ts's resolveDb and the panel's createApplier:
 * callers just `createAiProvider()` and use the interface.
 *
 * Demo mode, OR no Ollama host configured yet, → the deterministic demo
 * provider. Only a real, configured `OLLAMA_HOST` (and not demo mode) selects
 * the Ollama provider.
 */
import { env, isDemoMode } from '../config';
import { demoAiProvider } from './demo';
import { ollamaAiProvider } from './ollama';
import type { AiProvider } from './types';

export function createAiProvider(): AiProvider {
	if (isDemoMode() || !env('OLLAMA_HOST')) return demoAiProvider();
	return ollamaAiProvider();
}
