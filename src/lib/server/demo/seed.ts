/**
 * Demo seed data — builds a populated, realistic-looking workspace so the app
 * has content the moment you open it in demo mode: a master profile, two
 * tailored resumes (with revisions + a cover letter), and a pipeline of tracked
 * jobs (some linked to those resumes, one with saved Q&A answers).
 *
 * 100% synthetic (public-repo rule): fake person, fake companies, fake postings.
 *
 * The resumes are built by running the SAME deterministic generators the app
 * uses (keyword extraction + tailoring + scoring), so the seeded data is
 * internally consistent — the ATS scores and matched keywords are real, not
 * hand-waved numbers.
 *
 * Types are imported type-only, so this never creates a runtime import cycle
 * with the repository (repository → provider → memory → seed).
 */
import { computeAtsScore } from '../../resume/analyze';
import { newId, type ResumeDocument } from '../../resume/schema';
import type { ApplicationStatus, QaEntry } from '../../applications';
import { extractKeywordsHeuristic } from '../ai/keywords';
import {
	answerQuestionDeterministic,
	coverLetterDeterministic,
	matchStory,
	tailorResumeDeterministic
} from '../ai/generate';
import { sampleProfile } from './sample-profile';
import type { ApplicationDoc, ResumeDoc, RevisionDoc } from '../db/repository';

interface SampleJob {
	title: string;
	company: string;
	url: string;
	jdText: string;
}

const SAMPLE_JOBS: SampleJob[] = [
	{
		title: 'Senior Product Manager',
		company: 'Northwind',
		url: 'https://boards.example.com/northwind/senior-product-manager',
		jdText: `Senior Product Manager — Payments

We're hiring a Senior Product Manager to own our payments platform roadmap.

Requirements:
- 5+ years of product management, ideally in fintech or payments
- Strong experience with A/B testing, SQL, and product analytics
- Track record shipping checkout or payments products at scale
- Excellent communication and stakeholder management

Responsibilities:
- Own the payments roadmap and drive experimentation
- Partner closely with engineering and design on checkout
- Mentor junior product managers`
	},
	{
		title: 'Director of Product',
		company: 'Initech',
		url: 'https://boards.example.com/initech/director-of-product',
		jdText: `Director of Product — Platform

Initech is looking for a Director of Product to lead our platform group.

Requirements:
- 8+ years in product, including people leadership
- Experience with developer tools, APIs, and platform roadmaps
- Strong analytics background; comfortable with SQL
- Proven cross-functional leadership and stakeholder management

Responsibilities:
- Set the platform vision and roadmap
- Grow and mentor a team of product managers
- Drive adoption and reliability of core APIs`
	}
];

export interface DemoSeed {
	profile: ResumeDocument;
	resumes: ResumeDoc[];
	revisions: RevisionDoc[];
	applications: ApplicationDoc[];
}

function daysAgo(n: number): Date {
	return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** Build a fully-populated demo workspace for one user. */
export function buildDemoSeed(userEmail: string): DemoSeed {
	const profile = sampleProfile();
	const resumes: ResumeDoc[] = [];
	const revisions: RevisionDoc[] = [];

	SAMPLE_JOBS.forEach((job, i) => {
		const keywords = extractKeywordsHeuristic(job.jdText);
		const doc = tailorResumeDeterministic(
			profile,
			{ title: job.title, company: job.company, url: job.url, jdText: job.jdText, capturedAt: daysAgo(9 - i * 4).toISOString() },
			keywords
		);

		// Fill in matched/missing from the real scorer so the card is consistent.
		const score = computeAtsScore(doc);
		doc.x_petedio.keywords = { extracted: keywords, matched: score.matched, missing: score.missing };
		doc.x_petedio.template = 'A';

		// The first resume also carries a drafted cover letter.
		if (i === 0) {
			doc.x_petedio.coverLetter = {
				text: coverLetterDeterministic(doc, 'I admire how Northwind is rethinking checkout for small merchants'),
				generatedFrom: 'demo'
			};
		}

		const id = newId();
		const created = daysAgo(9 - i * 4);
		resumes.push({
			...doc,
			id,
			userEmail,
			createdAt: created,
			updatedAt: daysAgo(2 - i),
			deletedAt: null
		});

		revisions.push({
			id: newId(),
			resumeId: id,
			userEmail,
			rev: 1,
			doc,
			label: 'Generated from master profile',
			savedAt: created
		});
		if (i === 0) {
			revisions.push({
				id: newId(),
				resumeId: id,
				userEmail,
				rev: 2,
				doc,
				label: 'Manual edit — tightened bullets',
				savedAt: daysAgo(2)
			});
		}
	});

	// A behavioral answer drafted from the story bank, for the first application.
	const stories = profile.x_petedio.stories ?? [];
	const behavioralQ = 'Tell me about a time you shipped under deadline pressure.';
	const story = matchStory(behavioralQ, stories);
	const qa: QaEntry[] = [
		{
			id: newId(),
			question: 'Why do you want to work here?',
			kind: 'why-us',
			context: 'they emphasise merchant empathy',
			targetChars: 300,
			storyId: null,
			answer: answerQuestionDeterministic({
				question: 'Why do you want to work here?',
				kind: 'why-us',
				context: 'they emphasise merchant empathy',
				resume: resumes[0],
				profile,
				story: null,
				targetChars: 300
			}),
			updatedAt: daysAgo(3).toISOString()
		},
		{
			id: newId(),
			question: behavioralQ,
			kind: 'behavioral',
			context: '',
			targetChars: 600,
			storyId: story?.id ?? null,
			answer: answerQuestionDeterministic({
				question: behavioralQ,
				kind: 'behavioral',
				context: '',
				resume: resumes[0],
				profile,
				story,
				targetChars: 600
			}),
			updatedAt: daysAgo(3).toISOString()
		}
	];

	const app = (
		url: string,
		title: string,
		company: string,
		status: ApplicationStatus,
		resumeId: string | null,
		ageDays: number,
		entries: QaEntry[] = []
	): ApplicationDoc => ({
		id: newId(),
		url,
		title,
		company,
		status,
		resumeId,
		notes: '',
		qa: entries,
		userEmail,
		createdAt: daysAgo(ageDays),
		updatedAt: daysAgo(Math.max(0, ageDays - 2)),
		deletedAt: null
	});

	const applications: ApplicationDoc[] = [
		app(SAMPLE_JOBS[0].url, SAMPLE_JOBS[0].title, SAMPLE_JOBS[0].company, 'interviewing', resumes[0].id, 9, qa),
		app(SAMPLE_JOBS[1].url, SAMPLE_JOBS[1].title, SAMPLE_JOBS[1].company, 'applied', resumes[1].id, 5),
		app('https://boards.example.com/globex/product-manager', 'Product Manager', 'Globex', 'saved', null, 2),
		app('https://boards.example.com/umbrella/senior-pm', 'Senior PM, Growth', 'Umbrella', 'rejected', resumes[0].id, 21),
		app('https://boards.example.com/soylent/principal-pm', 'Principal PM', 'Soylent', 'ghosted', null, 30)
	];

	return { profile, resumes, revisions, applications };
}
