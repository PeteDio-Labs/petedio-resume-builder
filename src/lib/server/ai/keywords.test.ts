import { describe, expect, it } from 'bun:test';
import { extractKeywordsHeuristic } from './keywords';

// Synthetic JD (public-repo rule): fake role, real-shaped structure.
const JD = `Senior Backend Engineer

We are looking for a Senior Backend Engineer to join our platform team.

Requirements:
- 5+ years of experience with Python and Go
- Strong experience with Kubernetes and Docker
- Experience designing REST APIs and microservices
- Excellent communication and collaboration skills

Responsibilities:
- Build and operate microservices on Kubernetes
- Mentor junior engineers and own delivery`;

describe('extractKeywordsHeuristic', () => {
	it('is deterministic', () => {
		expect(extractKeywordsHeuristic(JD)).toEqual(extractKeywordsHeuristic(JD));
	});

	it('surfaces hard skills and classifies soft skills', () => {
		const kw = extractKeywordsHeuristic(JD);
		const terms = kw.map((k) => k.term);
		expect(terms).toContain('kubernetes');
		expect(terms).toContain('python');
		expect(kw.find((k) => k.term === 'kubernetes')?.kind).toBe('hard');
		expect(kw.find((k) => k.term === 'communication')?.kind).toBe('soft');
	});

	it('weights are 1..100 and sorted descending', () => {
		const kw = extractKeywordsHeuristic(JD);
		expect(kw[0].weight).toBe(100);
		for (let i = 1; i < kw.length; i++) {
			expect(kw[i].weight).toBeLessThanOrEqual(kw[i - 1].weight);
		}
		for (const k of kw) {
			expect(k.weight).toBeGreaterThanOrEqual(1);
			expect(k.weight).toBeLessThanOrEqual(100);
		}
	});

	it('ranks a repeated term at least as high as a once-mentioned one', () => {
		const kw = extractKeywordsHeuristic(JD);
		const kube = kw.find((k) => k.term === 'kubernetes'); // appears twice
		const docker = kw.find((k) => k.term === 'docker'); // once
		expect(kube).toBeDefined();
		if (docker) expect(kube!.weight).toBeGreaterThanOrEqual(docker.weight);
	});

	it('drops digit-leading noise tokens like "5+"', () => {
		const kw = extractKeywordsHeuristic(JD);
		expect(kw.some((k) => /^\d/.test(k.term))).toBe(false);
	});

	it('returns empty for empty input', () => {
		expect(extractKeywordsHeuristic('')).toEqual([]);
		expect(extractKeywordsHeuristic('   ')).toEqual([]);
	});
});

describe('keyword hygiene (UAT)', () => {
	// Live extraction returned "Level.", "Experience." and "Tooling." as distinct
	// keywords — sentence-final words with the full stop attached — plus filler
	// like "Proven" and "Deep". They then read as missing on every resume, since
	// nobody writes a full stop inside a skill.
	const JD = `Requirements:
- 8+ years in infrastructure or platform engineering, including 2+ years at staff level.
- Deep Terraform and Kubernetes experience. Go or Python for tooling.
- Proven track record improving reliability.`;

	const terms = () => extractKeywordsHeuristic(JD).map((k) => k.term);

	it('strips sentence-final punctuation from terms', () => {
		for (const t of terms()) expect(t.endsWith('.')).toBe(false);
	});

	it('drops resume-speak filler', () => {
		const t = terms();
		for (const junk of ['proven', 'deep', 'level', 'experience', 'track', 'record']) {
			expect(t).not.toContain(junk);
		}
	});

	it('still keeps the real skills', () => {
		const t = terms();
		for (const kw of ['terraform', 'kubernetes', 'infrastructure']) expect(t).toContain(kw);
	});
});
