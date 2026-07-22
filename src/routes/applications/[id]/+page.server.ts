import { error, fail, redirect } from '@sveltejs/kit';
import { isApplicationStatus, type QaKind } from '$lib/applications';
import {
	addQaAnswer,
	deleteQaAnswer,
	getApplicationDetail,
	saveQaAnswer,
	setApplicationStatus
} from '$lib/server/applications';
import type { Actions, PageServerLoad } from './$types';

const KINDS: QaKind[] = ['why-us', 'behavioral', 'experience', 'logistics', 'custom'];

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/');
	const detail = await getApplicationDetail(locals.user.email, params.id);
	if (!detail) throw error(404, 'Application not found');
	return detail;
};

export const actions: Actions = {
	setStatus: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const form = await request.formData();
		await setApplicationStatus(locals.user.email, params.id, String(form.get('status') ?? ''));
		return { updated: true };
	},

	ask: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const form = await request.formData();
		const question = String(form.get('question') ?? '').trim();
		if (!question) return fail(400, { message: 'Enter a question first.' });
		const kindRaw = String(form.get('kind') ?? 'custom');
		const kind = (KINDS as string[]).includes(kindRaw) ? (kindRaw as QaKind) : 'custom';
		const targetChars = Math.max(0, Math.min(5000, Number(form.get('targetChars') ?? 0) || 0));
		const entry = await addQaAnswer(locals.user.email, params.id, {
			question,
			kind,
			context: String(form.get('context') ?? ''),
			targetChars
		});
		if (!entry) return fail(404, { message: 'Application not found.' });
		return { asked: true };
	},

	saveAnswer: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const form = await request.formData();
		await saveQaAnswer(locals.user.email, params.id, String(form.get('qaId') ?? ''), String(form.get('answer') ?? ''));
		return { saved: true };
	},

	deleteAnswer: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const form = await request.formData();
		await deleteQaAnswer(locals.user.email, params.id, String(form.get('qaId') ?? ''));
		return { removed: true };
	}
};
