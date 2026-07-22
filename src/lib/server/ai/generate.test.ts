import { describe, expect, it } from 'bun:test';
import { cosine, embedText } from './embed';
import {
	answerQuestionDeterministic,
	coverLetterDeterministic,
	matchStory,
	pickDistinctKeywords,
	recommendReuseDeterministic,
	rewriteBulletDeterministic,
	tailorResumeDeterministic
} from './generate';
import { emptyProfile, newStory, type ExtractedKeyword } from '../../resume/schema';

const KW = (term: string, kind: ExtractedKeyword['kind'] = 'hard', weight = 100): ExtractedKeyword => ({
	term,
	aliases: [],
	kind,
	weight
});

describe('tailorResumeDeterministic', () => {
	it('mirrors the title, adds a targeting line, and surfaces keyword bullets', () => {
		const p = emptyProfile();
		p.basics.summary = 'Experienced PM.';
		p.work = [
			{
				name: 'Acme',
				position: 'PM',
				location: '',
				url: '',
				startDate: '',
				endDate: '',
				summary: '',
				highlights: ['Managed the budget', 'Led the kubernetes migration']
			}
		];
		const doc = tailorResumeDeterministic(p, { title: 'Platform PM', company: 'Globex' }, [KW('kubernetes')]);
		expect(doc.basics.label).toBe('Platform PM');
		expect(doc.basics.summary).toContain('Targeting Platform PM at Globex');
		expect(doc.work[0].highlights[0]).toContain('kubernetes'); // reordered to front
		expect(doc.x_petedio.status).toBe('tailored');
		// original profile is untouched (deep clone)
		expect(p.basics.label).not.toBe('Platform PM');
	});
});

describe('tailoring summary — no repeated keywords (regression)', () => {
	// The exported PDF read: "Targeting Director of Product at Initech, bringing
	// platform, product, director product." — "product" three times.
	const KWS = [KW('platform'), KW('product'), KW('director product'), KW('roadmap'), KW('apis')];

	it('does not repeat words the job title already says', () => {
		const doc = tailorResumeDeterministic(emptyProfile(), { title: 'Director of Product', company: 'Initech' }, KWS);
		const summary = doc.basics.summary ?? '';
		const after = summary.slice(summary.indexOf('bringing'));
		expect(after).not.toContain('director product');
		// "Product" appears once — in the title — not again in the keyword list.
		expect((summary.toLowerCase().match(/product/g) ?? []).length).toBe(1);
	});

	it('picks distinct, non-overlapping keywords instead', () => {
		expect(pickDistinctKeywords(KWS, 'Director of Product', 3)).toEqual(['platform', 'roadmap', 'apis']);
	});

	it('falls back cleanly when every keyword is redundant', () => {
		const doc = tailorResumeDeterministic(
			emptyProfile(),
			{ title: 'Product Manager', company: 'Acme' },
			[KW('product'), KW('manager'), KW('product manager')]
		);
		expect(doc.basics.summary).toBe('Targeting Product Manager at Acme.');
		expect(doc.basics.summary).not.toContain('bringing');
	});
});

describe('coverLetterDeterministic', () => {
	it('includes the company + title and the user why-line', () => {
		const r = emptyProfile();
		r.basics.name = 'Jane Doe';
		r.x_petedio.targetJob = { title: 'PM', company: 'Globex' };
		r.work = [
			{ name: 'Acme', position: 'PM', location: '', url: '', startDate: '', endDate: '', summary: '', highlights: ['Grew revenue 30%'] }
		];
		const cl = coverLetterDeterministic(r, 'I love your product');
		expect(cl).toContain('Globex');
		expect(cl).toContain('PM');
		expect(cl).toContain('I love your product');
		expect(cl).toContain('Jane Doe');
	});
});

describe('answerQuestion + matchStory', () => {
	it('behavioral answer uses the matched story and honors the char cap', () => {
		const r = emptyProfile();
		const p = emptyProfile();
		const s = {
			...newStory(),
			title: 'Led ATS migration',
			tags: ['leadership' as const],
			situation: 'The team had a broken ATS.',
			task: 'Fix it.',
			action: 'Led the migration end to end.',
			result: 'Clean cutover.',
			metrics: '0 data loss'
		};
		p.x_petedio.stories = [s];

		const story = matchStory('Tell me about leading a migration', p.x_petedio.stories);
		expect(story?.id).toBe(s.id);

		const capped = answerQuestionDeterministic({
			question: 'q',
			kind: 'behavioral',
			context: '',
			resume: r,
			profile: p,
			story,
			targetChars: 40
		});
		expect(capped.length).toBeLessThanOrEqual(40);
	});
});

describe('rewriteBulletDeterministic', () => {
	it('strips a weak prefix and capitalizes', () => {
		expect(rewriteBulletDeterministic('responsible for managing the team', 'shorter')).toBe('Managing the team');
	});
});

describe('embed + recommendReuse', () => {
	it('scores similar text higher than dissimilar', () => {
		const a = embedText('kubernetes docker platform engineer');
		const b = embedText('kubernetes docker platform team');
		const c = embedText('barista coffee latte customer service');
		expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
	});

	it('recommends the closest candidate first', () => {
		const m = recommendReuseDeterministic('kubernetes platform sre reliability', [
			{ id: '1', title: 'Platform', text: 'kubernetes platform sre reliability oncall' },
			{ id: '2', title: 'Frontend', text: 'react css design typescript' }
		]);
		expect(m[0].id).toBe('1');
	});
});
