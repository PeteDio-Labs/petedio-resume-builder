import { redirect } from '@sveltejs/kit';
import { listResumes } from '$lib/server/resumes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/');
	return listResumes(locals.user.email);
};
