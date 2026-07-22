import { describe, expect, it } from 'bun:test';
import { parseResumeText } from './parse';

/**
 * Fixtures are 100% synthetic ("Jane Doe" / fake companies) — this repo is
 * public and must never carry real personal data. See CLAUDE.md.
 */
const SYNTHETIC_RESUME = `Jane Doe
Boston, MA • jane.doe@example.com • (555) 123-4567 • linkedin.com/in/janedoe

PROFESSIONAL SUMMARY

Product manager and platform builder with 6+ years across fintech startups.
Shipped zero-to-one products and led cross-functional teams.

WORK EXPERIENCE

**Senior Product Manager**, Acme Corp, Boston, MA — January 2022 - Present
- Led a team of 8 engineers to ship a payments platform serving 2M users.
- Cut checkout latency by 40% through a caching redesign.

**Product Manager**, Globex Inc, Remote — June 2019 - December 2021
- Launched a self-serve onboarding flow that grew activation 25%.
- Owned the roadmap for the analytics suite.

EDUCATION

Bachelor of Science, Computer Science, State University — September 2013 - May 2017

SKILLS

Product: Roadmapping, A/B Testing, User Research, SQL
Technical: TypeScript, Python, PostgreSQL, Docker
Languages: English, Spanish

CERTIFICATIONS

Certified Scrum Master, Scrum Alliance, 2020
`;

describe('parseResumeText — header/basics', () => {
	const { doc } = parseResumeText(SYNTHETIC_RESUME);

	it('extracts the name', () => {
		expect(doc.basics.name).toBe('Jane Doe');
	});

	it('extracts email and phone', () => {
		expect(doc.basics.email).toBe('jane.doe@example.com');
		expect(doc.basics.phone).toContain('555');
	});

	it('extracts the LinkedIn profile', () => {
		const linkedin = doc.basics.profiles?.find((p) => p.network === 'LinkedIn');
		expect(linkedin?.url).toContain('linkedin.com/in/janedoe');
	});

	it('extracts a City, ST location', () => {
		expect(doc.basics.location?.city).toBe('Boston');
		expect(doc.basics.location?.region).toBe('MA');
	});

	it('captures the professional summary', () => {
		expect(doc.basics.summary).toContain('Product manager and platform builder');
	});
});

describe('parseResumeText — work experience', () => {
	const { doc } = parseResumeText(SYNTHETIC_RESUME);

	it('parses two roles in order', () => {
		expect(doc.work).toHaveLength(2);
		expect(doc.work[0].position).toBe('Senior Product Manager');
		expect(doc.work[1].position).toBe('Product Manager');
	});

	it('splits company and location out of the heading', () => {
		expect(doc.work[0].name).toBe('Acme Corp');
		expect(doc.work[0].location).toBe('Boston, MA');
		expect(doc.work[1].name).toBe('Globex Inc');
	});

	it('normalizes the date range (Month YYYY and Present)', () => {
		expect(doc.work[0].startDate).toBe('2022-01');
		expect(doc.work[0].endDate).toBe('Present');
		expect(doc.work[1].startDate).toBe('2019-06');
		expect(doc.work[1].endDate).toBe('2021-12');
	});

	it('collects bullets as highlights', () => {
		expect(doc.work[0].highlights).toHaveLength(2);
		expect(doc.work[0].highlights?.[0]).toContain('Led a team of 8 engineers');
	});
});

describe('parseResumeText — education / skills / certificates', () => {
	const { doc } = parseResumeText(SYNTHETIC_RESUME);

	it('parses the education entry', () => {
		expect(doc.education).toHaveLength(1);
		expect(doc.education[0].institution).toBe('State University');
		expect(doc.education[0].studyType).toMatch(/Bachelor/);
		expect(doc.education[0].area).toBe('Computer Science');
		expect(doc.education[0].startDate).toBe('2013-09');
	});

	it('groups skills by category and routes languages out', () => {
		const product = doc.skills.find((s) => s.name === 'Product');
		expect(product?.keywords).toContain('SQL');
		expect(doc.skills.find((s) => s.name === 'Technical')).toBeDefined();
		expect(doc.languages.map((l) => l.language)).toContain('Spanish');
	});

	it('parses a certificate with a lone trailing year', () => {
		expect(doc.certificates).toHaveLength(1);
		expect(doc.certificates[0].name).toBe('Certified Scrum Master');
		expect(doc.certificates[0].issuer).toBe('Scrum Alliance');
		expect(doc.certificates[0].date).toBe('2020');
	});
});

describe('parseResumeText — robustness', () => {
	it('never throws and warns on empty input', () => {
		const { doc, warnings } = parseResumeText('   ');
		expect(doc.work).toEqual([]);
		expect(warnings.length).toBeGreaterThan(0);
	});

	it('extracts contact info even with no section headers', () => {
		const { doc, warnings } = parseResumeText('Contact: sam@example.com\nSome freeform notes.');
		expect(doc.basics.email).toBe('sam@example.com');
		expect(warnings.some((w) => /no standard sections/i.test(w))).toBe(true);
	});

	it('handles "Position at Company" headings', () => {
		const { doc } = parseResumeText(
			'EXPERIENCE\n\nStaff Engineer at Initech — 2020 - 2023\n- Did the thing.'
		);
		expect(doc.work[0].position).toBe('Staff Engineer');
		expect(doc.work[0].name).toBe('Initech');
		expect(doc.work[0].startDate).toBe('2020');
	});
});

describe('parseResumeText — review-hardening regressions', () => {
	it('does not spawn a phantom role from a prose line with mid-sentence bold', () => {
		const { doc } = parseResumeText(
			`EXPERIENCE

Senior Recruiter, Acme Corp — 2020 - 2022
- Sourced 40 hires
Passionate about **diversity** hiring`
		);
		expect(doc.work).toHaveLength(1);
		expect(doc.work[0].name).toBe('Acme Corp');
		expect(doc.work[0].highlights).toContain('Sourced 40 hires');
		// the bold prose line becomes summary text, not a bogus entry
		expect(doc.work[0].summary).toContain('Passionate about diversity hiring');
	});

	it('does not mistake a dotted tech token ("Node.js Developer") for a website', () => {
		const { doc } = parseResumeText(
			`Jane Smith · Node.js Developer · San Francisco, CA

EXPERIENCE
Engineer, Foo — 2020 - 2021
- built things`
		);
		expect(doc.basics.name).toBe('Jane Smith');
		expect(doc.basics.url).toBe(''); // not "Node.js"
	});

	it('keeps a real website token', () => {
		const { doc } = parseResumeText(
			`Jane Smith · janedoe.dev · Austin, TX

EXPERIENCE
Engineer, Foo — 2020 - 2021
- built things`
		);
		expect(doc.basics.url).toContain('janedoe.dev');
	});

	it('does not drop bullets that appear before the first role heading', () => {
		const { doc } = parseResumeText(
			`EXPERIENCE
- Led a team of 5 recruiters across 3 offices
Senior Recruiter, Acme — 2020-2022
- Ran the pipeline`
		);
		const allHighlights = doc.work.flatMap((w) => w.highlights ?? []);
		expect(allHighlights.join(' | ')).toContain('Led a team of 5 recruiters');
		expect(allHighlights.join(' | ')).toContain('Ran the pipeline');
	});

	it('returns promptly on a pathological single long line (no quadratic stall)', () => {
		const huge = 'a'.repeat(100_000);
		const start = Date.now();
		const { doc } = parseResumeText(huge);
		expect(doc).toBeDefined();
		expect(Date.now() - start).toBeLessThan(1000);
	});
});
