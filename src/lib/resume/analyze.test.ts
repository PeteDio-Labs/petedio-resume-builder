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

describe('computeAtsScore — absent data must not score as perfect (UAT H1)', () => {
	it('an empty resume with no keywords is NOT scored (was 90/100 "good")', () => {
		const s = computeAtsScore(emptyProfile());
		expect(s.scored).toBe(false);
		expect(s.band).toBe('unscored');
		expect(s.total).toBe(0);
	});

	it('marks keyword-less components inapplicable rather than full marks', () => {
		const s = computeAtsScore(emptyProfile());
		const byLabel = Object.fromEntries(s.components.map((c) => [c.label, c]));
		expect(byLabel['Hard-skill coverage'].applicable).toBe(false);
		expect(byLabel['Hard-skill coverage'].got).toBe(0);
		expect(byLabel['Soft skills'].applicable).toBe(false);
		expect(byLabel['Education / certs'].applicable).toBe(false);
		// Searchability is about the resume itself, so it always applies.
		expect(byLabel['Searchability'].applicable).toBe(true);
	});

	it('excludes inapplicable components from the denominator', () => {
		// Only hard keywords present, all matched, plus full searchability.
		const d = scored();
		d.x_petedio.keywords = {
			extracted: [{ term: 'kubernetes', aliases: [], kind: 'hard', weight: 100 }],
			matched: [],
			missing: []
		};
		const s = computeAtsScore(d);
		// hard(50) + title(15) + search(10) apply; soft + edu do not.
		const live = s.components.filter((c) => c.applicable).map((c) => c.label);
		expect(live).not.toContain('Soft skills');
		expect(live).not.toContain('Education / certs');
		expect(s.scored).toBe(true);
		expect(s.total).toBeGreaterThan(0);
		expect(s.total).toBeLessThanOrEqual(100);
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

describe('Title match must not score its own output (UAT)', () => {
	// Live defect: tailoring wrote the target title into basics.label, and the
	// scorer read basics.label back as evidence — a product manager scored a full
	// 15/15 "Title match" against a Staff Platform Engineer posting, taking the
	// total from 0 to 64 on a resume with no platform experience anywhere.
	const pmResume = () => {
		const d = emptyProfile();
		d.basics.summary = 'Product manager with 7+ years shipping zero-to-one products.';
		d.work = [
			{
				name: 'Acme', position: 'Senior Product Manager', location: '', url: '', startDate: '', endDate: '',
				summary: '', highlights: ['Led an 8-engineer team to ship a payments platform.']
			}
		];
		d.x_petedio.targetJob = { title: 'Staff Platform Engineer', company: 'Vertex' };
		d.x_petedio.keywords = { extracted: [{ term: 'kubernetes', aliases: [], kind: 'hard', weight: 100 }], matched: [], missing: [] };
		return d;
	};

	it('does not award a full title match for a label the tailorer wrote', () => {
		const d = pmResume();
		d.basics.label = 'Staff Platform Engineer'; // what tailoring used to force
		const title = computeAtsScore(d).components.find((c) => c.label === 'Title match')!;
		expect(title.got).toBeLessThan(title.max);
	});

	it('ignores the generated targeting sentence as evidence', () => {
		const d = pmResume();
		d.basics.summary += ' Targeting Staff Platform Engineer at Vertex, bringing infrastructure.';
		const withLine = computeAtsScore(d).components.find((c) => c.label === 'Title match')!.got;
		const bare = pmResume();
		const without = computeAtsScore(bare).components.find((c) => c.label === 'Title match')!.got;
		expect(withLine).toBe(without);
	});

	it('still credits a title the work history actually shows', () => {
		const d = emptyProfile();
		d.work = [
			{
				name: 'Vertex', position: 'Staff Platform Engineer', location: '', url: '', startDate: '', endDate: '',
				summary: '', highlights: ['Ran the Kubernetes migration.']
			}
		];
		d.x_petedio.targetJob = { title: 'Staff Platform Engineer', company: 'Other' };
		d.x_petedio.keywords = { extracted: [{ term: 'kubernetes', aliases: [], kind: 'hard', weight: 100 }], matched: [], missing: [] };
		const title = computeAtsScore(d).components.find((c) => c.label === 'Title match')!;
		expect(title.got).toBe(title.max);
	});
});
