import { fail, redirect } from '@sveltejs/kit';
import { isDemoMode } from '$lib/server/config';
import { createResumeDraft, extractJobKeywords, recommendForJd } from '$lib/server/resumes';
import type { ExtractedKeyword } from '$lib/resume/schema';
import type { Actions, PageServerLoad } from './$types';

const MAX_JD = 40_000;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/');
	return { demo: isDemoMode() };
};

export const actions: Actions = {
	// Extract keywords from the pasted JD (no DB write) — demo heuristic or Ollama.
	extract: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const form = await request.formData();
		const jdText = String(form.get('jdText') ?? '');
		const title = String(form.get('title') ?? '');
		const company = String(form.get('company') ?? '');
		const url = String(form.get('url') ?? '');
		if (jdText.trim() === '') return fail(400, { message: 'Paste a job description first.' });

		const clipped = jdText.slice(0, MAX_JD);
		const [{ keywords, mode }, recommendations] = await Promise.all([
			extractJobKeywords(clipped),
			recommendForJd(locals.user.email, clipped)
		]);
		return { extracted: { keywords, mode, title, company, url, jdText }, recommendations };
	},

	// Persist the reviewed keyword set as a new resume draft.
	save: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const form = await request.formData();
		const title = String(form.get('title') ?? '');
		const company = String(form.get('company') ?? '');
		const url = String(form.get('url') ?? '');
		const jdText = String(form.get('jdText') ?? '');

		let keywords: ExtractedKeyword[] = [];
		const kwJson = form.get('keywords');
		if (typeof kwJson === 'string') {
			try {
				const parsed = JSON.parse(kwJson);
				if (Array.isArray(parsed)) keywords = parsed;
			} catch {
				return fail(400, { message: 'Keyword data was malformed.' });
			}
		}
		if (keywords.length === 0) return fail(400, { message: 'Keep at least one keyword before saving.' });

		let id: string;
		try {
			id = await createResumeDraft(
				locals.user.email,
				{ title, company, url, jdText: jdText.slice(0, MAX_JD) },
				keywords
			);
		} catch (err) {
			console.error('resume draft save: DB error', err);
			return fail(503, {
				message: 'Could not save — the database is not reachable yet. Try again once Mongo is provisioned.'
			});
		}

		// Straight into the tailored-resume editor.
		throw redirect(303, `/resumes/${id}`);
	}
};
