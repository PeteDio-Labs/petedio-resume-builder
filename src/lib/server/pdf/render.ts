/**
 * Server-side PDF rendering via the Typst CLI.
 *
 * Replaces browser print-to-PDF, which (a) baked the page URL + a timestamp into
 * the resume's text layer whenever the user hadn't unticked "Headers and
 * footers", (b) varied by browser/OS/print settings, and (c) couldn't run
 * headlessly, so nothing could regression-test it. See the PDF export v2 plan.
 *
 * Runtime-neutral: spawns via node:child_process, never `Bun.*`.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { env } from '../config';
import type { ResumeDocument } from '../../resume/schema';
import { TYPST_RESUME_TEMPLATE } from './template';

const run = promisify(execFile);

/** Thrown when the Typst binary isn't installed — the route maps this to a 503. */
export class TypstUnavailableError extends Error {}

const RENDER_TIMEOUT_MS = 15_000;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function typstBin(): string {
	// Explicit path in production (ansible installs a pinned binary); fall back to
	// PATH so a dev machine with `typst` installed just works.
	return env('TYPST_BIN') ?? 'typst';
}

export async function typstAvailable(): Promise<boolean> {
	try {
		await run(typstBin(), ['--version'], { timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

/**
 * Render a resume to PDF bytes.
 *
 * The document is written to `resume.json` and read by the template — resume
 * text is never interpolated into Typst source, so it cannot become code.
 *
 * `--pdf-standard a-1a` is the *accessible* PDF/A conformance level (tagged,
 * with logical structure). Note Typst 0.15 has no `ua-1` option, despite what
 * the original plan said.
 */
export async function renderResumePdf(
	doc: ResumeDocument,
	template: 'A' | 'B' = 'A'
): Promise<Uint8Array> {
	const dir = await mkdtemp(join(tmpdir(), 'resume-pdf-'));
	try {
		await writeFile(join(dir, 'resume.json'), JSON.stringify(doc), 'utf8');
		await writeFile(join(dir, 'resume.typ'), TYPST_RESUME_TEMPLATE, 'utf8');

		try {
			await run(
				typstBin(),
				[
					'compile',
					'resume.typ',
					'out.pdf',
					'--root',
					dir,
					'--input',
					`template=${template === 'B' ? 'B' : 'A'}`,
					'--pdf-standard',
					'a-1a',
					// Bundled Libertinus Serif only — identical output on every host,
					// no dependency on whatever fonts the box happens to have.
					'--ignore-system-fonts'
				],
				{ cwd: dir, timeout: RENDER_TIMEOUT_MS, maxBuffer: 1024 * 1024 }
			);
		} catch (err) {
			const e = err as NodeJS.ErrnoException & { stderr?: string };
			if (e.code === 'ENOENT') {
				throw new TypstUnavailableError(`Typst binary not found at "${typstBin()}".`);
			}
			throw new Error(`Typst compile failed: ${(e.stderr ?? e.message ?? '').slice(0, 400)}`);
		}

		const pdf = await readFile(join(dir, 'out.pdf'));
		if (pdf.byteLength > MAX_PDF_BYTES) throw new Error('Rendered PDF is implausibly large.');
		return new Uint8Array(pdf);
	} finally {
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
}

/** A filesystem-safe download name, e.g. "Jane_Doe_Senior_PM.pdf". */
export function pdfFilename(doc: ResumeDocument): string {
	const parts = [doc.basics.name, doc.x_petedio.targetJob?.company, doc.x_petedio.targetJob?.title]
		.filter((p): p is string => Boolean(p && p.trim()))
		.join('_');
	const safe = (parts || 'resume').replace(/[^\w\-]+/g, '_').replace(/_{2,}/g, '_').slice(0, 80);
	return `${safe}.pdf`;
}
