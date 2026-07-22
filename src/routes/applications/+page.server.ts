import { fail, redirect } from '@sveltejs/kit';
import {
	loadApplicationsPage,
	removeApplication,
	setApplicationStatus,
	trackJob,
	linkResume
} from '$lib/server/applications';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/');
	return loadApplicationsPage(locals.user.email);
};

export const actions: Actions = {
	track: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const form = await request.formData();
		const url = String(form.get('url') ?? '');
		if (url.trim() === '') return fail(400, { message: 'Paste a job link to track.' });
		try {
			await trackJob(locals.user.email, {
				url,
				title: String(form.get('title') ?? ''),
				company: String(form.get('company') ?? ''),
				status: String(form.get('status') ?? 'saved'),
				resumeId: String(form.get('resumeId') ?? '')
			});
		} catch (err) {
			console.error('track job: DB error', err);
			return fail(503, { message: 'Could not save — database not reachable yet.' });
		}
		return { tracked: true };
	},

	setStatus: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const form = await request.formData();
		await setApplicationStatus(locals.user.email, String(form.get('id') ?? ''), String(form.get('status') ?? ''));
		return { updated: true };
	},

	link: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const form = await request.formData();
		await linkResume(locals.user.email, String(form.get('id') ?? ''), String(form.get('resumeId') ?? ''));
		return { updated: true };
	},

	remove: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const form = await request.formData();
		await removeApplication(locals.user.email, String(form.get('id') ?? ''));
		return { removed: true };
	}
};
