/**
 * Demo/offline AI provider — deterministic stand-ins for every AI task, so the
 * app is fully demoable with no Ollama. Selected by createAiProvider() in demo
 * mode (and whenever no Ollama host is configured). Every method is a pure,
 * repeatable heuristic — same input, same output.
 */
import type { AiProvider } from './types';
import { extractKeywordsHeuristic } from './keywords';
import {
	answerQuestionDeterministic,
	coverLetterDeterministic,
	matchStory,
	recommendReuseDeterministic,
	rewriteBulletDeterministic,
	tailorResumeDeterministic
} from './generate';

export function demoAiProvider(): AiProvider {
	return {
		mode: 'demo',
		async extractKeywords(jdText) {
			return { keywords: extractKeywordsHeuristic(jdText), source: 'heuristic' as const };
		},
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
