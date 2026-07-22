import { error, redirect } from '@sveltejs/kit';
import { getResumeDetail } from '$lib/server/resumes';
import { pdfFilename, renderResumePdf, TypstUnavailableError } from '$lib/server/pdf/render';
import type { RequestHandler } from './$types';

/**
 * One-click PDF download. Server-rendered so the output is identical for every
 * user and carries no browser print artefacts (the old print path baked the
 * page URL + a timestamp into the resume's text layer).
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(302, '/');

	const detail = await getResumeDetail(locals.user.email, params.id);
	if (!detail) throw error(404, 'Resume not found');

	// ?template=B overrides the saved choice, for previewing the other layout.
	const override = url.searchParams.get('template');
	const template = override === 'B' || override === 'A' ? override : detail.template;

	let pdf: Uint8Array;
	try {
		pdf = await renderResumePdf(detail.resume, template);
	} catch (err) {
		if (err instanceof TypstUnavailableError) {
			console.error('pdf: typst missing', err);
			throw error(503, 'PDF renderer is not installed on this server yet.');
		}
		console.error('pdf: render failed', err);
		throw error(500, 'Could not render the PDF.');
	}

	// `.buffer` may be a SharedArrayBuffer as far as the type system knows (Uint8Array is
	// generic over ArrayBufferLike since TS 5.7), which isn't a valid BodyInit — slice to a
	// plain ArrayBuffer of exactly this view's bytes.
	const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;

	return new Response(body, {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `attachment; filename="${pdfFilename(detail.resume)}"`,
			'content-length': String(pdf.byteLength),
			// Never let an intermediary cache someone's resume.
			'cache-control': 'private, no-store'
		}
	});
};
