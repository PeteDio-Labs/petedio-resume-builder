/**
 * Synthetic sample master profile for demo mode.
 *
 * 100% fabricated ("Jane Doe" / fake companies) — this repo is public and must
 * never carry real personal data (see CLAUDE.md). Its only job is to make the
 * app look alive when shown off with no MongoDB behind it: seeded into the
 * in-memory demo store so the master-profile and import screens have content to
 * edit. Returns a fresh object each call so each seeded user gets an
 * independent copy.
 */
import { emptyProfile, newId, type ResumeDocument } from '../../resume/schema';

export function sampleProfile(): ResumeDocument {
	const p = emptyProfile();

	p.basics = {
		name: 'Jane Doe',
		label: 'Senior Product Manager',
		email: 'jane.doe@example.com',
		phone: '(555) 123-4567',
		url: 'https://janedoe.example.com',
		summary:
			'Product manager with 7+ years shipping zero-to-one products across fintech and ' +
			'developer tools. Built and led cross-functional teams, owned roadmaps end to end, and ' +
			'grew activation and retention with measured, iterative bets.',
		location: { city: 'Boston', region: 'MA' },
		profiles: [{ network: 'LinkedIn', url: 'https://linkedin.com/in/janedoe-example' }]
	};

	p.work = [
		{
			name: 'Acme Corp',
			position: 'Senior Product Manager',
			location: 'Boston, MA',
			url: '',
			startDate: '2022-01',
			endDate: 'Present',
			summary: '',
			highlights: [
				'Led an 8-engineer team to ship a payments platform serving 2M monthly users.',
				'Cut checkout latency 40% via a caching redesign, lifting conversion 6%.',
				'Introduced a weekly discovery cadence that shortened idea-to-ship from 9 to 4 weeks.'
			]
		},
		{
			name: 'Globex Inc',
			position: 'Product Manager',
			location: 'Remote',
			url: '',
			startDate: '2019-06',
			endDate: '2021-12',
			summary: '',
			highlights: [
				'Launched a self-serve onboarding flow that grew activation 25%.',
				'Owned the analytics suite roadmap across three squads.'
			]
		}
	];

	p.education = [
		{
			institution: 'State University',
			area: 'Computer Science',
			studyType: 'B.S.',
			startDate: '2013-09',
			endDate: '2017-05'
		}
	];

	p.skills = [
		{ name: 'Product', keywords: ['Roadmapping', 'Discovery', 'A/B Testing', 'User Research'] },
		{ name: 'Technical', keywords: ['SQL', 'TypeScript', 'Figma', 'Amplitude'] }
	];

	p.certificates = [{ name: 'Certified Scrum Product Owner', issuer: 'Scrum Alliance', date: '2021' }];

	p.languages = [{ language: 'English' }, { language: 'Spanish' }];

	p.x_petedio.stories = [
		{
			id: newId(),
			title: 'Rescued a launch under deadline pressure',
			tags: ['deadline', 'leadership'],
			situation: 'A flagship release was two weeks from the announced date with a broken core flow.',
			task: 'Get the flow shippable without slipping the date.',
			action:
				'Cut scope to the two must-have paths, paired with engineering daily, and ran a 3-day ' +
				'hardening sprint with clear exit criteria.',
			result: 'Shipped on time with zero P0s in the first week.',
			metrics: '0 P0s week one; NPS +11 vs. prior release',
			usedIn: []
		},
		{
			id: newId(),
			title: 'Drove a tooling migration nobody asked for',
			tags: ['initiative', 'teamwork'],
			situation: 'The team tracked work across three disconnected tools, losing status daily.',
			task: 'Consolidate onto one system without a mandate.',
			action: 'Prototyped the workflow, won over two skeptical leads, then rolled it out team-wide.',
			result: 'One source of truth; standup time halved.',
			metrics: 'Standup time 30→15 min',
			usedIn: []
		}
	];

	return p;
}
