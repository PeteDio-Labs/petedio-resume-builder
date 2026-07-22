import { fail, redirect } from '@sveltejs/kit';
import { parseResumeText } from '$lib/resume/parse';
import { isDemoMode } from '$lib/server/config';
import { InvalidProfileError, loadMasterProfile, saveMasterProfile } from '$lib/server/profile';
import type { Actions, PageServerLoad } from './$types';

const MAX_PASTE = 100_000; // characters — plenty for any resume, bounds abuse.

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/');
	// Only need to know whether saving will replace an existing profile.
	const { exists } = await loadMasterProfile(locals.user.email);
	return { alreadyHasProfile: exists, demo: isDemoMode() };
};

export const actions: Actions = {
	// Parse pasted text into a draft (no DB write). Deterministic, never AI.
	parse: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const form = await request.formData();
		const raw = form.get('raw');
		if (typeof raw !== 'string' || raw.trim() === '') {
			return fail(400, { message: 'Paste some resume text first.' });
		}

		const { doc, warnings } = parseResumeText(raw.slice(0, MAX_PASTE));
		return { parsed: { doc, warnings }, raw };
	},

	// Persist the reviewed draft as the master profile, then go to the editor.
	save: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const form = await request.formData();
		const docJson = form.get('doc');
		if (typeof docJson !== 'string') {
			return fail(400, { message: 'Missing profile data.' });
		}

		try {
			await saveMasterProfile(locals.user.email, docJson);
		} catch (err) {
			if (err instanceof InvalidProfileError) return fail(400, { message: err.message });
			console.error('import save: DB error', err);
			return fail(503, {
				message: 'Could not save — the database is not reachable yet. Try again once Mongo is provisioned.'
			});
		}

		throw redirect(303, '/profile');
	}
};
