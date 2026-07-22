import { error, fail, redirect } from '@sveltejs/kit';
import {
	generateCoverLetter,
	generateTailored,
	getResumeDetail,
	hardDeleteResume,
	NoProfileError,
	saveResume,
	setResumeTemplate,
	softDeleteResume
} from '$lib/server/resumes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/');
	let detail;
	try {
		detail = await getResumeDetail(locals.user.email, params.id);
	} catch (err) {
		console.error('resume detail load: DB error', err);
		throw error(503, 'Database not reachable yet.');
	}
	if (!detail) throw error(404, 'Resume not found');
	return detail;
};

export const actions: Actions = {
	generate: async ({ locals, params }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		try {
			await generateTailored(locals.user.email, params.id);
		} catch (err) {
			if (err instanceof NoProfileError) return fail(400, { message: err.message });
			console.error('generate: error', err);
			return fail(503, { message: 'Generation failed.' });
		}
		const detail = await getResumeDetail(locals.user.email, params.id);
		return { generated: true, resume: detail?.resume, revisions: detail?.revisions, status: detail?.status };
	},

	save: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const form = await request.formData();
		const doc = form.get('doc');
		if (typeof doc !== 'string') return fail(400, { message: 'Missing resume data.' });
		try {
			await saveResume(locals.user.email, params.id, doc);
		} catch (err) {
			console.error('save resume: error', err);
			return fail(503, { message: 'Save failed — database not reachable.' });
		}
		const detail = await getResumeDetail(locals.user.email, params.id);
		return { saved: true, revisions: detail?.revisions };
	},

	coverLetter: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const form = await request.formData();
		const why = String(form.get('why') ?? '');
		const text = await generateCoverLetter(locals.user.email, params.id, why);
		return { coverLetter: text };
	},

	template: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const form = await request.formData();
		const t = String(form.get('template') ?? 'A') === 'B' ? 'B' : 'A';
		await setResumeTemplate(locals.user.email, params.id, t);
		return { template: t };
	},

	softDelete: async ({ locals, params }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		await softDeleteResume(locals.user.email, params.id);
		throw redirect(303, '/resumes');
	},

	hardDelete: async ({ locals, params }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		await hardDeleteResume(locals.user.email, params.id);
		throw redirect(303, '/resumes');
	}
};
