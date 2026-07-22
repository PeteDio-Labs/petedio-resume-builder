import { fail, redirect } from '@sveltejs/kit';
import { InvalidProfileError, loadMasterProfile, saveMasterProfile } from '$lib/server/profile';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// hooks.server.ts lets unauthenticated requests through with user=null;
	// the master profile requires a signed-in identity.
	if (!locals.user) throw redirect(302, '/');
	return loadMasterProfile(locals.user.email);
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const form = await request.formData();
		const docJson = form.get('doc');
		if (typeof docJson !== 'string') {
			return fail(400, { message: 'Missing profile data.' });
		}

		try {
			const updatedAt = await saveMasterProfile(locals.user.email, docJson);
			return { saved: true, updatedAt };
		} catch (err) {
			if (err instanceof InvalidProfileError) {
				return fail(400, { message: err.message });
			}
			console.error('profile save: DB error', err);
			return fail(503, {
				message: 'Could not save — the database is not reachable yet. Your edits are still here; try again once Mongo is provisioned.'
			});
		}
	}
};
