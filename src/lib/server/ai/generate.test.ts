import { describe, expect, it } from 'bun:test';
import { cosine, embedText } from './embed';
import {
	answerQuestionDeterministic,
	coverLetterDeterministic,
	matchStory,
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
