import { describe, expect, it } from 'bun:test';
import { computeAtsScore, lintResume } from './analyze';
import { emptyProfile, type ResumeDocument } from './schema';

function scored(): ResumeDocument {
	const d = emptyProfile();
	d.basics.email = 'a@b.com';
	d.basics.phone = '(555) 111-2222';
	d.basics.label = 'Product Manager';
	d.work = [
		{
			name: 'Acme',
			position: 'PM',
			location: '',
			url: '',
			startDate: '2020-01',
			endDate: '2022-01',
			summary: '',
			highlights: ['Led kubernetes rollout increasing uptime 20%', 'Owned roadmap with stakeholders']
		}
	];
	d.skills = [{ name: 'Core', keywords: ['kubernetes', 'sql'] }];
	d.x_petedio.targetJob = { title: 'Product Manager', company: 'Globex' };
	d.x_petedio.keywords = {
		extracted: [
			{ term: 'kubernetes', aliases: [], kind: 'hard', weight: 100 },
			{ term: 'sql', aliases: [], kind: 'hard', weight: 60 },
			{ term: 'communication', aliases: [], kind: 'soft', weight: 40 },
			{ term: 'terraform', aliases: [], kind: 'hard', weight: 80 }
		],
		matched: [],
		missing: []
	};
	return d;
}

describe('computeAtsScore', () => {
	it('separates matched from missing keywords', () => {
		const s = computeAtsScore(scored());
		expect(s.matched).toContain('kubernetes');
		expect(s.matched).toContain('sql');
		expect(s.missing).toContain('terraform');
	});

	it('produces a bounded total and components summing to 100 max', () => {
		const s = computeAtsScore(scored());
		expect(s.total).toBeGreaterThan(0);
		expect(s.total).toBeLessThanOrEqual(100);
		expect(s.components.reduce((a, c) => a + c.max, 0)).toBe(100);
	});

	it('is deterministic', () => {
		expect(computeAtsScore(scored())).toEqual(computeAtsScore(scored()));
	});
});

describe('lintResume', () => {
	it('flags AI-tell words and first-person bullets', () => {
		const d = emptyProfile();
		d.work = [
			{
				name: 'X',
				position: 'Y',
				location: '',
				url: '',
				startDate: '',
				endDate: '',
				summary: '',
				highlights: ['I leveraged synergy to delve into robust outcomes']
			}
		];
		const f = lintResume(d);
		expect(f.some((x) => /AI-tell/i.test(x.message))).toBe(true);
		expect(f.some((x) => /first person/i.test(x.message))).toBe(true);
	});
});
