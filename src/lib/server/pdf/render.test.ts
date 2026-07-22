import { describe, expect, it } from 'bun:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pdfFilename, renderResumePdf, typstAvailable } from './render';
import { emptyProfile, type ResumeDocument } from '../../resume/schema';

const run = promisify(execFile);

/**
 * The ATS golden test the export never had. A CSS/template change that breaks
 * text extraction is invisible in code review and in a green build — the only
 * way to catch it is to render a PDF and read it back the way a parser would.
 *
 * Skips when the toolchain is absent so local `bun test` stays green; CI
 * installs both, so it actually runs there.
 */
async function pdftotextAvailable(): Promise<boolean> {
	try {
		await run('pdftotext', ['-v'], { timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

async function extractText(pdf: Uint8Array): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'pdf-golden-'));
	try {
		await writeFile(join(dir, 'out.pdf'), pdf);
		await run('pdftotext', ['-layout', join(dir, 'out.pdf'), join(dir, 'out.txt')], { timeout: 10_000 });
		return await readFile(join(dir, 'out.txt'), 'utf8');
	} finally {
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
}

function fixture(): ResumeDocument {
	const d = emptyProfile();
	d.basics = {
		name: 'Jane Doe',
		label: 'Director of Product',
		email: 'jane.doe@example.com',
		phone: '(555) 123-4567',
		url: '',
		summary: 'Product manager with 7+ years shipping zero-to-one products.',
		location: { city: 'Boston', region: 'MA' },
		profiles: []
	};
	d.work = [
		{
			name: 'Acme Corp', position: 'Senior Product Manager', location: 'Boston, MA', url: '',
			startDate: '2022-01', endDate: 'Present', summary: '',
			highlights: ['Led an 8-engineer team to ship a payments platform serving 2M monthly users.']
		}
	];
	d.education = [
		{ institution: 'State University', area: 'Computer Science', studyType: 'B.S.', startDate: '2013-09', endDate: '2017-05' }
	];
	d.skills = [{ name: 'Product', keywords: ['Roadmapping', 'SQL'] }];
	d.certificates = [{ name: 'Certified Scrum Product Owner', issuer: 'Scrum Alliance', date: '2021' }];
	return d;
}

describe('pdfFilename', () => {
	it('builds a safe download name', () => {
		const d = fixture();
		d.x_petedio.targetJob = { title: 'Director of Product', company: 'Initech' };
		expect(pdfFilename(d)).toBe('Jane_Doe_Initech_Director_of_Product.pdf');
	});

	it('falls back when the doc is empty', () => {
		expect(pdfFilename(emptyProfile())).toBe('resume.pdf');
	});
});

describe('PDF golden test (needs typst + pdftotext)', () => {
	it('renders an ATS-readable PDF with no browser print artefacts', async () => {
		if (!(await typstAvailable()) || !(await pdftotextAvailable())) {
			console.warn('skipping PDF golden test — typst and/or pdftotext not installed');
			return;
		}

		const pdf = await renderResumePdf(fixture(), 'A');
		expect(pdf.byteLength).toBeGreaterThan(1000);
		// %PDF magic
		expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');

		const text = await extractText(pdf);

		// Content survives extraction.
		expect(text).toContain('Jane Doe');
		expect(text).toContain('Acme Corp');
		expect(text).toContain('payments platform');
		expect(text).toContain('jane.doe@example.com'); // contact in the BODY
		expect(text).toContain('2022-01');

        // Standard headings, in reading order.
		const up = text.toUpperCase();
		expect(up).toContain('SUMMARY');
		expect(up).toContain('WORK EXPERIENCE');
		expect(up).toContain('EDUCATION');
		expect(up.indexOf('SUMMARY')).toBeLessThan(up.indexOf('WORK EXPERIENCE'));
		expect(up.indexOf('WORK EXPERIENCE')).toBeLessThan(up.indexOf('EDUCATION'));

		// The defect that started this: no URL, no timestamp, no page counter.
		expect(text).not.toMatch(/https?:\/\/localhost/i);
		expect(text).not.toMatch(/cv\.pdlab\.dev/i);
		expect(text).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}/); // "7/22/26, 1:52 PM"
		expect(text).not.toMatch(/Resume Builder/i); // page title
	}, 60_000);

	it('template B keeps the same extractable text as A', async () => {
		if (!(await typstAvailable()) || !(await pdftotextAvailable())) return;
		const a = await extractText(await renderResumePdf(fixture(), 'A'));
		const b = await extractText(await renderResumePdf(fixture(), 'B'));
		for (const s of ['Jane Doe', 'Acme Corp', 'payments platform', 'State University']) {
			expect(a).toContain(s);
			expect(b).toContain(s);
		}
	}, 60_000);
});
